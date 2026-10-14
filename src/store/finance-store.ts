import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Category, Debt, Installment, RecurringCost, Subcategory, Transaction } from '@/types/finance'
import { buildMockTransactions, missingDefaults, mockCategories, mockSubcategories } from '@/data/mock'
import * as cloud from '@/lib/cloud'
import { generateInstallments, type InstallmentPurchaseInput } from '@/lib/finance'
import { addDaysISO, todayISO } from '@/lib/dates'
import { pendingOccurrences } from '@/lib/recurring'
import { currentUid, reportSyncError } from './auth-store'

export type EditScope = 'one' | 'future'

export type TransactionEdit = Pick<
  Transaction,
  'description' | 'amount' | 'categoryId' | 'subcategoryId' | 'dueDate' | 'paymentMethod' | 'status' | 'paymentDate' | 'payTo' | 'notes'
>

/** Campos que se propagam para as próximas ocorrências da série. */
const SERIES_FIELDS = ['amount', 'categoryId', 'subcategoryId', 'paymentMethod', 'payTo', 'notes'] as const

/** Remove o sufixo "(3/10)" de parcelas. */
export const baseDescription = (t: Pick<Transaction, 'description' | 'installment'>) =>
  t.installment ? t.description.replace(/\s*\(\d+\/\d+\)$/, '') : t.description

const withSuffix = (base: string, t: Pick<Transaction, 'installment'>) =>
  t.installment ? `${base} (${t.installment.number}/${t.installment.total})` : base

const pick = <T extends object, K extends keyof T>(obj: T, keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, obj[k]])) as Pick<T, K>

interface FinanceData {
  categories: Category[]
  subcategories: Subcategory[]
  transactions: Transaction[]
  installments: Installment[]
  recurringCosts: RecurringCost[]
  debts: Debt[]
}

interface FinanceState extends FinanceData {
  addTransaction: (t: Transaction) => void
  addInstallmentPurchase: (input: InstallmentPurchaseInput) => Installment
  /** Cadastra gasto/receita fixo e lança os próximos meses. */
  addRecurringCost: (rc: RecurringCost, firstPaid: boolean) => void
  /** Lança meses novos dos fixos ativos (rodar ao abrir o app). */
  materializeRecurring: () => void
  /** Encerra o fixo e apaga ocorrências futuras ainda pendentes. */
  endRecurringCost: (id: RecurringCost['id']) => void
  togglePaid: (id: Transaction['id']) => void
  removeTransaction: (id: Transaction['id']) => void
  /**
   * Edita um lançamento. Com `scope: 'future'` em parcela ou fixo, aplica
   * descrição, valor, categoria, pagamento e pessoa também às próximas
   * ocorrências pendentes (data e status só mudam neste).
   */
  updateTransaction: (id: Transaction['id'], patch: TransactionEdit, scope: EditScope) => void
  /** Exclui este lançamento ou este e os próximos da mesma série. */
  deleteTransactionScoped: (id: Transaction['id'], scope: EditScope) => void
  /** Apaga lançamentos, parcelamentos e fixos; mantém categorias. */
  clearTransactions: () => void
  loadExampleData: () => void
  /** Cria ou atualiza categoria. */
  saveCategory: (c: Category) => void
  /**
   * Exclui categoria e suas subcategorias. Lançamentos, fixos e parcelamentos
   * que usavam a categoria passam para `moveTo`.
   */
  deleteCategory: (id: Category['id'], moveTo: Category['id'] | null) => void
  saveSubcategory: (s: Subcategory) => void
  /** Exclui subcategoria; quem usava fica só com a categoria. */
  deleteSubcategory: (id: Subcategory['id']) => void
  /** Cria ou atualiza dívida do plano de quitação. */
  saveDebt: (d: Debt) => void
  removeDebt: (id: Debt['id']) => void
}

/** Começa vazio, só com as categorias padrão. */
export const initialFinanceData = (): FinanceData => ({
  categories: mockCategories,
  subcategories: mockSubcategories,
  transactions: [],
  installments: [],
  recurringCosts: [],
  debts: [],
})

type Mutable = keyof FinanceData

interface Changes {
  upserts?: cloud.DocWrite[]
  deletes?: cloud.DocRef[]
}

/** Aplica mudanças no estado local (substitui por id ou acrescenta; remove). */
function applyLocal(state: FinanceData, { upserts = [], deletes = [] }: Changes): Partial<FinanceData> {
  const next: Partial<FinanceData> = {}
  const names = new Set<Mutable>([...upserts, ...deletes].map((c) => c.name as Mutable))
  for (const name of names) {
    const removed = new Set(deletes.filter((d) => d.name === name).map((d) => d.id))
    const incoming = new Map(upserts.filter((u) => u.name === name).map((u) => [u.data.id, u.data]))
    const current = state[name] as { id: string }[]
    const kept = current.filter((x) => !removed.has(x.id)).map((x) => incoming.get(x.id) ?? x)
    const keptIds = new Set(kept.map((x) => x.id))
    const added = [...incoming.values()].filter((x) => !keptIds.has(x.id) && !removed.has(x.id))
    ;(next as Record<Mutable, unknown[]>)[name] = [...kept, ...added]
  }
  return next
}

/**
 * Logado: grava no Firestore e o `onSnapshot` atualiza o estado (o SDK aplica
 * a escrita localmente na hora, então a UI não espera a rede).
 * Modo local: atualiza o estado direto, persistido em localStorage.
 */
export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => {
      const commit = (changes: Changes) => {
        const uid = currentUid()
        if (!uid) {
          set((s) => applyLocal(s, changes))
          return
        }
        const ops: Promise<unknown>[] = []
        if (changes.upserts?.length) ops.push(cloud.saveDocs(uid, changes.upserts))
        if (changes.deletes?.length) ops.push(cloud.deleteDocs(uid, changes.deletes))
        Promise.all(ops).catch(reportSyncError)
      }

      const txWrites = (transactions: Transaction[]): cloud.DocWrite[] =>
        transactions.map((data) => ({ name: 'transactions', data }))

      return {
        ...initialFinanceData(),

        addTransaction: (t) => commit({ upserts: txWrites([t]) }),

        addInstallmentPurchase: (input) => {
          const { installment, transactions } = generateInstallments(input)
          commit({ upserts: [{ name: 'installments', data: installment }, ...txWrites(transactions)] })
          return installment
        },

        addRecurringCost: (rc, firstPaid) => {
          const { transactions, lastGeneratedMonth } = pendingOccurrences(rc)
          const [first, ...rest] = transactions
          const occurrences =
            first && firstPaid ? [{ ...first, status: 'pago' as const, paymentDate: first.dueDate }, ...rest] : transactions
          commit({
            upserts: [{ name: 'recurringCosts', data: { ...rc, lastGeneratedMonth } }, ...txWrites(occurrences)],
          })
        },

        materializeRecurring: () => {
          const upserts: cloud.DocWrite[] = []
          for (const rc of get().recurringCosts) {
            const { transactions, lastGeneratedMonth } = pendingOccurrences(rc)
            if (lastGeneratedMonth === rc.lastGeneratedMonth) continue
            upserts.push({ name: 'recurringCosts', data: { ...rc, lastGeneratedMonth } }, ...txWrites(transactions))
          }
          if (upserts.length) commit({ upserts })
        },

        endRecurringCost: (id) => {
          const rc = get().recurringCosts.find((x) => x.id === id)
          if (!rc) return
          const today = todayISO()
          const futurePending = get().transactions.filter(
            (t) => t.recurringCostId === id && t.status !== 'pago' && t.dueDate > today,
          )
          commit({
            upserts: [{ name: 'recurringCosts', data: { ...rc, active: false, endDate: today } }],
            deletes: futurePending.map((t) => ({ name: 'transactions', id: t.id })),
          })
        },

        togglePaid: (id) => {
          const t = get().transactions.find((x) => x.id === id)
          if (!t) return
          const patch: Pick<Transaction, 'status' | 'paymentDate'> =
            t.status === 'pago' ? { status: 'pendente', paymentDate: null } : { status: 'pago', paymentDate: todayISO() }
          commit({ upserts: txWrites([{ ...t, ...patch }]) })
        },

        removeTransaction: (id) => commit({ deletes: [{ name: 'transactions', id }] }),

        updateTransaction: (id, patch, scope) => {
          const { transactions, installments, recurringCosts } = get()
          const t = transactions.find((x) => x.id === id)
          if (!t) return
          const base = patch.description
          const upserts: cloud.DocWrite[] = [{ name: 'transactions', data: { ...t, ...patch, description: withSuffix(base, t) } }]

          if (scope === 'future') {
            const series = pick(patch, SERIES_FIELDS)
            const siblings = transactions.filter(
              (x) =>
                x.id !== t.id &&
                x.status !== 'pago' &&
                x.dueDate >= t.dueDate &&
                ((t.installment && x.installment?.installmentId === t.installment.installmentId) ||
                  (t.recurringCostId && x.recurringCostId === t.recurringCostId)),
            )
            for (const x of siblings) {
              upserts.push({ name: 'transactions', data: { ...x, ...series, description: withSuffix(base, x) } })
            }
            const inst = t.installment && installments.find((i) => i.id === t.installment?.installmentId)
            if (inst) {
              upserts.push({
                name: 'installments',
                data: { ...inst, description: base, categoryId: patch.categoryId, subcategoryId: patch.subcategoryId, paymentMethod: patch.paymentMethod ?? inst.paymentMethod, payTo: patch.payTo ?? null },
              })
            }
            const rc = t.recurringCostId && recurringCosts.find((r) => r.id === t.recurringCostId)
            if (rc) {
              // Meses ainda não gerados usam o modelo atualizado.
              upserts.push({ name: 'recurringCosts', data: { ...rc, ...series, description: base } })
            }
          }
          commit({ upserts })
        },

        deleteTransactionScoped: (id, scope) => {
          const { transactions, recurringCosts } = get()
          const t = transactions.find((x) => x.id === id)
          if (!t) return
          if (scope === 'one') {
            commit({ deletes: [{ name: 'transactions', id }] })
            return
          }
          const targets = transactions.filter(
            (x) =>
              x.id === t.id ||
              (x.status !== 'pago' &&
                x.dueDate >= t.dueDate &&
                ((t.installment && x.installment?.installmentId === t.installment.installmentId) ||
                  (t.recurringCostId && x.recurringCostId === t.recurringCostId))),
          )
          const rc = t.recurringCostId && recurringCosts.find((r) => r.id === t.recurringCostId)
          commit({
            // Fixo: encerra para não gerar meses novos depois deste.
            upserts: rc ? [{ name: 'recurringCosts', data: { ...rc, active: false, endDate: addDaysISO(t.dueDate, -1) } }] : [],
            deletes: targets.map((x) => ({ name: 'transactions' as const, id: x.id })),
          })
        },

        clearTransactions: () => {
          const { transactions, installments, recurringCosts } = get()
          commit({
            deletes: [
              ...transactions.map((t) => ({ name: 'transactions' as const, id: t.id })),
              ...installments.map((i) => ({ name: 'installments' as const, id: i.id })),
              ...recurringCosts.map((r) => ({ name: 'recurringCosts' as const, id: r.id })),
            ],
          })
        },

        loadExampleData: () => commit({ upserts: txWrites(buildMockTransactions()) }),

        saveCategory: (data) => commit({ upserts: [{ name: 'categories', data }] }),

        deleteCategory: (id, moveTo) => {
          const { subcategories, transactions, recurringCosts, installments } = get()
          const reassign = <T extends { categoryId: string; subcategoryId: string | null }>(x: T): T => ({
            ...x,
            categoryId: moveTo ?? x.categoryId,
            subcategoryId: null,
          })
          const upserts: cloud.DocWrite[] = moveTo
            ? [
                ...txWrites(transactions.filter((t) => t.categoryId === id).map(reassign)),
                ...recurringCosts
                  .filter((r) => r.categoryId === id)
                  .map((r) => ({ name: 'recurringCosts' as const, data: reassign(r) })),
                ...installments
                  .filter((i) => i.categoryId === id)
                  .map((i) => ({ name: 'installments' as const, data: reassign(i) })),
              ]
            : []
          commit({
            upserts,
            deletes: [
              { name: 'categories', id },
              ...subcategories.filter((sc) => sc.categoryId === id).map((sc) => ({ name: 'subcategories' as const, id: sc.id })),
            ],
          })
        },

        saveSubcategory: (data) => commit({ upserts: [{ name: 'subcategories', data }] }),

        deleteSubcategory: (id) => {
          const { transactions, recurringCosts, installments } = get()
          const clear = <T extends { subcategoryId: string | null }>(x: T): T => ({ ...x, subcategoryId: null })
          commit({
            upserts: [
              ...txWrites(transactions.filter((t) => t.subcategoryId === id).map(clear)),
              ...recurringCosts
                .filter((r) => r.subcategoryId === id)
                .map((r) => ({ name: 'recurringCosts' as const, data: clear(r) })),
              ...installments
                .filter((i) => i.subcategoryId === id)
                .map((i) => ({ name: 'installments' as const, data: clear(i) })),
            ],
            deletes: [{ name: 'subcategories', id }],
          })
        },

        saveDebt: (data) => commit({ upserts: [{ name: 'debts', data }] }),

        removeDebt: (id) => commit({ deletes: [{ name: 'debts', id }] }),
      }
    },
    {
      name: 'financas-data',
      // v2: remove os dados de exemplo que a v1 gravava por padrão.
      // v3: inclui categorias padrão novas (Veículo, Empréstimos).
      // v4: gastos fixos (recurringCosts).
      // v5: dívidas do plano Sair do vermelho.
      version: 5,
      migrate: (persisted, version) => {
        let state = persisted as FinanceData
        if (version < 2) {
          state = {
            ...state,
            categories: state.categories?.length ? state.categories : mockCategories,
            subcategories: state.subcategories ?? mockSubcategories,
            transactions: [],
            installments: [],
          }
        }
        if (version < 3) {
          const missing = missingDefaults(state.categories, state.subcategories)
          state = {
            ...state,
            categories: [...state.categories, ...missing.categories],
            subcategories: [...state.subcategories, ...missing.subcategories],
          }
        }
        if (version < 4) state = { ...state, recurringCosts: [] }
        if (version < 5) state = { ...state, debts: [] }
        return state
      },
      storage: createJSONStorage(() => localStorage),
      partialize: ({ categories, subcategories, transactions, installments, recurringCosts, debts }) => ({
        categories,
        subcategories,
        transactions,
        installments,
        recurringCosts,
        debts,
      }),
    },
  ),
)
