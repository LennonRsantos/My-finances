import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Category, Cents, CreditCard, Debt, Goal, GoalDeposit, Installment, ISODate, MaintenanceQuote, MaintenanceReminder, MaintenanceUndo, RecurringCost, Subcategory, Transaction, Vehicle, YearMonth } from '@/types/finance'
import type { BackupData } from '@/lib/backup'
import { buildMockTransactions, missingDefaults, mockCategories, mockSubcategories } from '@/data/mock'
import * as cloud from '@/lib/cloud'
import { generateInstallments, type InstallmentPurchaseInput } from '@/lib/finance'
import { addDaysISO, addMonthsISO, monthOf, shiftMonth, todayISO } from '@/lib/dates'
import { createId } from '@/lib/utils'
import { occurrenceFor, pendingOccurrences } from '@/lib/recurring'
import { currentUid, reportSyncError } from './auth-store'
import { localOnlyStorage } from './local-storage'
import { useSettingsStore } from './settings-store'

export type EditScope = 'one' | 'future'

export type TransactionEdit = Pick<
  Transaction,
  | 'description'
  | 'amount'
  | 'categoryId'
  | 'subcategoryId'
  | 'dueDate'
  | 'paymentMethod'
  | 'status'
  | 'paymentDate'
  | 'payTo'
  | 'payToUid'
  | 'payToHandle'
  | 'notes'
  | 'homeLink'
  | 'costKind'
  | 'vehicleId'
  | 'cardId'
> &
  Partial<Pick<Transaction, 'roomId'>>

/** Campos que se propagam para as próximas ocorrências da série. */
const SERIES_FIELDS = ['amount', 'categoryId', 'subcategoryId', 'paymentMethod', 'payTo', 'payToUid', 'payToHandle', 'notes', 'homeLink', 'costKind', 'vehicleId', 'cardId', 'roomId'] as const
/** Vínculo com Casa/Veículo e cômodo: passa para a série inteira, inclusive o que já passou. */
const LINK_FIELDS = ['homeLink', 'costKind', 'vehicleId', 'roomId'] as const

/** Remove o sufixo "(3/10)" de parcelas. */
export const baseDescription = (t: Pick<Transaction, 'description' | 'installment'>) =>
  t.installment ? t.description.replace(/\s*\(\d+\/\d+\)$/, '') : t.description

/** Parcelamento marcado como conta fixa: aparece sem o "(n/N)". */
const isFixedSeries = (t: Pick<Transaction, 'installment'>) =>
  !!t.installment && (useSettingsStore.getState().settings.fixedSeries ?? []).includes(t.installment.installmentId)

const withSuffix = (base: string, t: Pick<Transaction, 'installment'>) =>
  t.installment && !isFixedSeries(t) ? `${base} (${t.installment.number}/${t.installment.total})` : base

/** Descrições de uma série com ou sem "(n/N)"; conta dividida tem a própria numeração e fica de fora. */
function seriesLabelWrites(transactions: Transaction[], ids: ReadonlySet<string>, fixed: boolean): cloud.DocWrite[] {
  return transactions
    .filter((t) => t.installment && ids.has(t.installment.installmentId) && !t.sharedBillId)
    .map((t) => {
      const base = baseDescription(t)
      return { t, description: fixed ? base : `${base} (${t.installment!.number}/${t.installment!.total})` }
    })
    .filter(({ t, description }) => t.description !== description)
    .map(({ t, description }) => ({ name: 'transactions' as const, data: { ...t, description } }))
}

const pick = <T extends object, K extends keyof T>(obj: T, keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, obj[k]])) as Pick<T, K>

interface FinanceData {
  categories: Category[]
  subcategories: Subcategory[]
  transactions: Transaction[]
  installments: Installment[]
  recurringCosts: RecurringCost[]
  debts: Debt[]
  vehicles: Vehicle[]
  maintenance: MaintenanceReminder[]
  goals: Goal[]
  cards: CreditCard[]
}

/** Uma linha do extrato já revisada: liga a um lançamento existente ou cria um novo. */
export type StatementImport =
  | { kind: 'link'; transactionId: Transaction['id']; cardId: string; importKey: string }
  | { kind: 'new'; transaction: Transaction }
  | { kind: 'installments'; purchase: { installment: Installment; transactions: Transaction[] } }

interface FinanceState extends FinanceData {
  addTransaction: (t: Transaction) => void
  addInstallmentPurchase: (input: InstallmentPurchaseInput) => Installment
  /** Grava parcelamento já gerado por `generateInstallments` (ids conhecidos antes, ex.: convite de divisão). */
  saveInstallmentPurchase: (generated: { installment: Installment; transactions: Transaction[] }) => void
  /** Cadastra gasto/receita fixo e lança os próximos meses. */
  addRecurringCost: (rc: RecurringCost, firstPaid: boolean) => void
  /** Lança meses novos dos fixos ativos (rodar ao abrir o app). */
  materializeRecurring: () => void
  /** Lança de novo o mês de um fixo que ficou sem lançamento (ex.: excluído sem querer). */
  restoreOccurrence: (id: RecurringCost['id'], month: YearMonth) => void
  /**
   * Encerra o fixo e apaga ocorrências futuras ainda pendentes. Com `from`,
   * o último mês é o anterior a essa data (ocorrências pendentes desde ela somem).
   */
  endRecurringCost: (id: RecurringCost['id'], from?: ISODate) => void
  /**
   * Edita um fixo. Os meses ainda não pagos (do atual em diante) são
   * refeitos com os novos dados; meses pagos e passados ficam como estão.
   */
  updateRecurringCost: (rc: RecurringCost) => void
  /** Grava um lançamento inteiro (edição de abastecimento e gasto do veículo). */
  saveTransaction: (t: Transaction) => void
  /**
   * Ajusta um parcelamento: valor da parcela, qual é a próxima a pagar e
   * quantas são no total. Pagas ficam como estão (só a numeração acompanha);
   * as pendentes são refeitas, uma por mês a partir da primeira pendente.
   */
  adjustInstallments: (installmentId: string, adjust: { amount?: Cents; next: number; total: number }) => void
  /** Marca/desmarca parcelamento como conta fixa (fora do saldo devedor, sem "(n/N)" na descrição). */
  toggleFixedSeries: (installmentId: string) => void
  /** Tira o "(n/N)" das séries já marcadas como conta fixa (ex.: marcadas antes desta regra). */
  syncFixedSeriesLabels: () => void
  /** Parcelas geradas/suspensas/apagadas por contas compartilhadas. */
  applySharedChanges: (upserts: Transaction[], deletes: Transaction['id'][]) => void
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
  saveCard: (c: CreditCard) => void
  /** Exclui o cartão; com compras lançadas, só desativa (o histórico fica). */
  removeCard: (id: CreditCard['id']) => void
  /** Marca como pagas as compras ainda abertas desta fatura (não cria outra despesa). */
  payInvoice: (cardId: CreditCard['id'], ids: Transaction['id'][], date: ISODate) => void
  /** Escolhe o cartão das compras (e do resto da série e do fixo, se ainda sem cartão). */
  assignCard: (ids: Transaction['id'][], cardId: CreditCard['id']) => void
  /** Grava o extrato revisado de uma vez. */
  importStatement: (lines: StatementImport[]) => void
  /** Cria ou atualiza meta (nome, alvo, prazo; depósitos vão junto). */
  saveGoal: (g: Goal) => void
  removeGoal: (id: Goal['id']) => void
  /** Guardar (valor positivo) ou retirar (negativo) dinheiro da meta. */
  addGoalDeposit: (goalId: Goal['id'], deposit: GoalDeposit) => void
  removeGoalDeposit: (goalId: Goal['id'], depositId: GoalDeposit['id']) => void
  /** Importa backup: cria ou substitui por id; não apaga o que já existe. */
  importData: (data: BackupData) => void
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
  saveVehicle: (v: Vehicle) => void
  /** Exclui o veículo e os lembretes; com gastos lançados, só desativa (o histórico fica). */
  removeVehicle: (id: Vehicle['id']) => void
  /** Lançamento ligado a veículo; recria a categoria Veículo se o usuário a apagou. */
  addVehicleExpense: (t: Transaction) => void
  saveReminder: (r: MaintenanceReminder) => void
  removeReminder: (id: MaintenanceReminder['id']) => void
  /**
   * Marca a manutenção como feita; com `expense`, lança o gasto também.
   * `sharedBillId`: convite de divisão enviado junto (cancelado ao desfazer).
   */
  completeReminder: (id: MaintenanceReminder['id'], km: number | null, date: ISODate, expense?: Transaction, sharedBillId?: string) => void
  /** Volta a última marcação de feita: km e data anteriores, sem o gasto lançado junto. */
  undoReminder: (id: MaintenanceReminder['id']) => void
  /** Grava (ou apaga, com `null`) o orçamento da manutenção. */
  saveQuote: (id: MaintenanceReminder['id'], quote: MaintenanceQuote | null) => void
  /**
   * Conclui a manutenção no dia em que ficou pronta: registra data e km (base
   * do próximo aviso), guarda no histórico, limpa vencimento direto e
   * orçamento, e lança o gasto (avulso ou parcelado).
   */
  finishMaintenance: (id: MaintenanceReminder['id'], done: FinishMaintenance) => void
}

export interface FinishMaintenance {
  date: ISODate
  km: number | null
  expense?: Transaction
  purchase?: { installment: Installment; transactions: Transaction[] }
  sharedBillId?: string | null
}

/** Começa vazio, só com as categorias padrão. */
export const initialFinanceData = (): FinanceData => ({
  categories: mockCategories,
  subcategories: mockSubcategories,
  transactions: [],
  installments: [],
  recurringCosts: [],
  debts: [],
  vehicles: [],
  maintenance: [],
  goals: [],
  cards: [],
})

type Mutable = keyof FinanceData

interface Changes {
  upserts?: cloud.DocWrite[]
  deletes?: cloud.DocRef[]
}

/** Categoria Veículo e subcategorias padrão que o usuário tenha apagado. */
function vehicleCategoryWrites(state: FinanceData): cloud.DocWrite[] {
  const missing = missingDefaults(state.categories, state.subcategories)
  return [
    ...missing.categories.filter((c) => c.id === 'cat-veiculo').map((data) => ({ name: 'categories' as const, data })),
    ...missing.subcategories.filter((sc) => sc.categoryId === 'cat-veiculo').map((data) => ({ name: 'subcategories' as const, data })),
  ]
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
          const generated = generateInstallments(input)
          get().saveInstallmentPurchase(generated)
          return generated.installment
        },

        saveInstallmentPurchase: ({ installment, transactions }) =>
          commit({ upserts: [{ name: 'installments', data: installment }, ...txWrites(transactions)] }),

        addRecurringCost: (rc, firstPaid) => {
          const { transactions, lastGeneratedMonth } = pendingOccurrences(rc)
          const [first, ...rest] = transactions
          const occurrences =
            first && firstPaid ? [{ ...first, status: 'pago' as const, paymentDate: first.dueDate }, ...rest] : transactions
          commit({
            upserts: [{ name: 'recurringCosts', data: { ...rc, lastGeneratedMonth } }, ...txWrites(occurrences)],
          })
        },

        restoreOccurrence: (id, month) => {
          const rc = get().recurringCosts.find((x) => x.id === id)
          const t = rc && occurrenceFor(rc, month)
          if (t) commit({ upserts: txWrites([t]) })
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

        endRecurringCost: (id, from) => {
          const rc = get().recurringCosts.find((x) => x.id === id)
          if (!rc) return
          const today = todayISO()
          const futurePending = get().transactions.filter(
            (t) => t.recurringCostId === id && t.status !== 'pago' && (from ? t.dueDate >= from : t.dueDate > today),
          )
          const endDate = from ? addDaysISO(from, -1) : today
          commit({
            upserts: [{ name: 'recurringCosts', data: { ...rc, active: false, endDate } }],
            deletes: futurePending.map((t) => ({ name: 'transactions', id: t.id })),
          })
        },

        updateRecurringCost: (rc) => {
          const { transactions } = get()
          const month = monthOf(todayISO())
          const occurrences = transactions.filter((t) => t.recurringCostId === rc.id)
          const paidMonths = new Set(occurrences.filter((t) => t.status === 'pago').map((t) => monthOf(t.dueDate)))
          // Gera de novo a partir do mês atual, sem tocar nos meses já pagos.
          const { transactions: fresh, lastGeneratedMonth } = pendingOccurrences({ ...rc, lastGeneratedMonth: shiftMonth(month, -1) })
          const regenerated = fresh.filter((t) => !paidMonths.has(monthOf(t.dueDate)))
          const keep = new Set(regenerated.map((t) => t.id))
          const stale = occurrences.filter((t) => t.status !== 'pago' && monthOf(t.dueDate) >= month && !keep.has(t.id))
          commit({
            upserts: [
              { name: 'recurringCosts', data: { ...rc, lastGeneratedMonth: lastGeneratedMonth ?? rc.lastGeneratedMonth } },
              ...txWrites(regenerated),
            ],
            deletes: stale.map((t) => ({ name: 'transactions' as const, id: t.id })),
          })
        },

        saveTransaction: (t) => commit({ upserts: txWrites([t]) }),

        adjustInstallments: (installmentId, { amount, next, total }) => {
          const { transactions, installments } = get()
          const series = transactions
            .filter((t) => t.installment?.installmentId === installmentId && !t.sharedBillId)
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.installment!.number - b.installment!.number)
          const sample = series[0]
          if (!sample) return
          const paid = series.filter((t) => t.status === 'pago')
          const open = series.filter((t) => t.status !== 'pago')
          const remaining = Math.max(0, total - next + 1)
          const base = baseDescription(sample)
          const fixed = isFixedSeries(sample)
          const ref = (n: number) => ({ installmentId, number: n, total })
          const label = (n: number) => (fixed ? base : `${base} (${n}/${total})`)
          // Pagas: numeradas logo antes da próxima, na ordem das datas.
          const paidWrites = paid.map((t, i) => {
            const n = Math.max(1, next - paid.length + i)
            return { ...t, description: label(n), installment: ref(n) }
          })
          const last = paid[paid.length - 1]
          const start = open[0]?.dueDate ?? (last ? addMonthsISO(last.dueDate, 1) : sample.dueDate)
          const template = open[0] ?? sample
          const now = new Date().toISOString()
          const openWrites: Transaction[] = Array.from({ length: remaining }, (_, i) => {
            const n = next + i
            const current = open[i] ?? { ...template, id: createId(), status: 'pendente' as const, paymentDate: null, odometer: null, createdAt: now }
            // Sem `amount`: cada parcela mantém o próprio valor; as novas usam o da última pendente.
            const value = amount ?? open[i]?.amount ?? open[open.length - 1]?.amount ?? template.amount
            return { ...current, amount: value, dueDate: addMonthsISO(start, i), description: label(n), installment: ref(n) }
          })
          const inst = installments.find((i) => i.id === installmentId)
          commit({
            upserts: [
              ...txWrites([...paidWrites, ...openWrites]),
              ...(inst
                ? [{ name: 'installments' as const, data: { ...inst, totalInstallments: total, currentInstallment: next, installmentAmount: amount ?? inst.installmentAmount, totalAmount: (amount ?? inst.installmentAmount) * total } }]
                : []),
            ],
            // Pendentes que sobraram (agora são menos parcelas).
            deletes: open.slice(remaining).map((t) => ({ name: 'transactions' as const, id: t.id })),
          })
        },

        toggleFixedSeries: (id) => {
          const settings = useSettingsStore.getState()
          const fixed = !(settings.settings.fixedSeries ?? []).includes(id)
          settings.toggleFixedSeries(id)
          const upserts = seriesLabelWrites(get().transactions, new Set([id]), fixed)
          if (upserts.length) commit({ upserts })
        },

        syncFixedSeriesLabels: () => {
          const ids = new Set(useSettingsStore.getState().settings.fixedSeries ?? [])
          if (!ids.size) return
          const upserts = seriesLabelWrites(get().transactions, ids, true)
          if (upserts.length) commit({ upserts })
        },

        applySharedChanges: (upserts, deletes) =>
          commit({ upserts: txWrites(upserts), deletes: deletes.map((id) => ({ name: 'transactions' as const, id })) }),

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
            // Vínculo Casa/Veículo é da compra toda: vale também para parcelas/meses anteriores e pagos.
            const link = 'vehicleId' in patch ? pick(patch, LINK_FIELDS) : null
            const siblings = transactions.filter(
              (x) =>
                x.id !== t.id &&
                ((t.installment && x.installment?.installmentId === t.installment.installmentId) ||
                  (t.recurringCostId && x.recurringCostId === t.recurringCostId)),
            )
            for (const x of siblings) {
              if (x.status !== 'pago' && x.dueDate >= t.dueDate) {
                upserts.push({ name: 'transactions', data: { ...x, ...series, description: withSuffix(base, x) } })
              } else if (link && LINK_FIELDS.some((k) => (x[k] ?? null) !== (link[k] ?? null))) {
                upserts.push({ name: 'transactions', data: { ...x, ...link } })
              }
            }
            const inst = t.installment && installments.find((i) => i.id === t.installment?.installmentId)
            if (inst) {
              upserts.push({
                name: 'installments',
                data: { ...inst, description: base, categoryId: patch.categoryId, subcategoryId: patch.subcategoryId, paymentMethod: patch.paymentMethod ?? inst.paymentMethod, payTo: patch.payTo ?? null, payToUid: patch.payToUid ?? null, payToHandle: patch.payToHandle ?? null },
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

        saveCard: (data) => commit({ upserts: [{ name: 'cards', data }] }),

        removeCard: (id) => {
          const { cards, transactions } = get()
          const c = cards.find((x) => x.id === id)
          if (!c) return
          const used = transactions.some((t) => t.cardId === id)
          commit(used ? { upserts: [{ name: 'cards', data: { ...c, active: false } }] } : { deletes: [{ name: 'cards', id }] })
        },

        payInvoice: (cardId, ids, date) => {
          const set = new Set(ids)
          const items = get().transactions.filter((t) => set.has(t.id) && t.status !== 'pago')
          // Compra contada no cartão sem escolha (cartão único) passa a guardar o cartão.
          if (items.length) commit({ upserts: txWrites(items.map((t) => ({ ...t, cardId: t.cardId ?? cardId, status: 'pago' as const, paymentDate: date }))) })
        },

        assignCard: (ids, cardId) => {
          const { transactions, recurringCosts } = get()
          const chosen = transactions.filter((t) => ids.includes(t.id))
          const series = new Set(chosen.flatMap((t) => [t.installment?.installmentId, t.recurringCostId].filter((x): x is string => !!x)))
          const txs = transactions.filter(
            (t) => ids.includes(t.id) || (!t.cardId && ((t.installment && series.has(t.installment.installmentId)) || (t.recurringCostId && series.has(t.recurringCostId)))),
          )
          // Fixo: os próximos meses já nascem com o cartão.
          const rcs = recurringCosts.filter((r) => series.has(r.id) && !r.cardId)
          commit({
            upserts: [
              ...txWrites(txs.map((t) => ({ ...t, cardId }))),
              ...rcs.map((r) => ({ name: 'recurringCosts' as const, data: { ...r, cardId } })),
            ],
          })
        },

        importStatement: (lines) => {
          const { transactions } = get()
          const byId = new Map(transactions.map((t) => [t.id, t]))
          const upserts: cloud.DocWrite[] = []
          for (const l of lines) {
            if (l.kind === 'link') {
              const t = byId.get(l.transactionId)
              if (!t) continue
              // Mantém a chave da primeira importação (outro arquivo da mesma fatura continua reconhecido pela compra).
              upserts.push(...txWrites([{ ...t, cardId: l.cardId, importKey: t.importKey ?? l.importKey, paymentMethod: 'cartao_credito' }]))
              // Parcela ou conta fixa: o resto da série (ainda sem cartão) passa a ser deste cartão.
              const series = transactions.filter(
                (x) =>
                  x.id !== t.id &&
                  !x.cardId &&
                  ((t.installment && x.installment?.installmentId === t.installment.installmentId) || (t.recurringCostId && x.recurringCostId === t.recurringCostId)),
              )
              if (series.length) upserts.push(...txWrites(series.map((x) => ({ ...x, cardId: l.cardId, paymentMethod: 'cartao_credito' as const }))))
            } else if (l.kind === 'new') upserts.push(...txWrites([l.transaction]))
            else upserts.push({ name: 'installments', data: l.purchase.installment }, ...txWrites(l.purchase.transactions))
          }
          if (upserts.length) commit({ upserts })
        },

        saveGoal: (data) => commit({ upserts: [{ name: 'goals', data }] }),

        removeGoal: (id) => commit({ deletes: [{ name: 'goals', id }] }),

        addGoalDeposit: (goalId, deposit) => {
          const g = get().goals.find((x) => x.id === goalId)
          if (g) commit({ upserts: [{ name: 'goals', data: { ...g, deposits: [...g.deposits, deposit] } }] })
        },

        removeGoalDeposit: (goalId, depositId) => {
          const g = get().goals.find((x) => x.id === goalId)
          if (g) commit({ upserts: [{ name: 'goals', data: { ...g, deposits: g.deposits.filter((d) => d.id !== depositId) } }] })
        },

        importData: (data) =>
          commit({
            upserts: [
              ...data.categories.map((d) => ({ name: 'categories' as const, data: d })),
              ...data.subcategories.map((d) => ({ name: 'subcategories' as const, data: d })),
              ...data.installments.map((d) => ({ name: 'installments' as const, data: d })),
              ...data.recurringCosts.map((d) => ({ name: 'recurringCosts' as const, data: d })),
              ...data.debts.map((d) => ({ name: 'debts' as const, data: d })),
              ...data.vehicles.map((d) => ({ name: 'vehicles' as const, data: d })),
              ...data.maintenance.map((d) => ({ name: 'maintenance' as const, data: d })),
              ...data.goals.map((d) => ({ name: 'goals' as const, data: d })),
              ...data.cards.map((d) => ({ name: 'cards' as const, data: d })),
              ...txWrites(data.transactions),
            ],
          }),

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

        saveVehicle: (data) => commit({ upserts: [{ name: 'vehicles', data }] }),

        removeVehicle: (id) => {
          const { vehicles, maintenance, transactions } = get()
          const v = vehicles.find((x) => x.id === id)
          if (!v) return
          const reminders = maintenance.filter((r) => r.vehicleId === id).map((r) => ({ name: 'maintenance' as const, id: r.id }))
          const used = transactions.some((t) => t.vehicleId === id)
          commit(
            used
              ? { upserts: [{ name: 'vehicles', data: { ...v, active: false } }], deletes: reminders }
              : { deletes: [{ name: 'vehicles', id }, ...reminders] },
          )
        },

        addVehicleExpense: (t) => commit({ upserts: [...vehicleCategoryWrites(get()), ...txWrites([t])] }),

        saveReminder: (data) => commit({ upserts: [{ name: 'maintenance', data }] }),

        removeReminder: (id) => commit({ deletes: [{ name: 'maintenance', id }] }),

        completeReminder: (id, km, date, expense, sharedBillId) => {
          const r = get().maintenance.find((x) => x.id === id)
          if (!r) return
          const undo = { lastKm: r.lastKm, lastDate: r.lastDate, transactionId: expense?.id ?? null, sharedBillId: sharedBillId ?? null }
          const history = [{ date, km, amount: expense?.amount ?? null, installments: 1 }, ...(r.history ?? [])]
          commit({
            upserts: [
              { name: 'maintenance', data: { ...r, lastKm: km ?? r.lastKm, lastDate: date, history, undo } },
              ...(expense ? [...vehicleCategoryWrites(get()), ...txWrites([expense])] : []),
            ],
          })
        },

        undoReminder: (id) => {
          const { maintenance, transactions } = get()
          const r = maintenance.find((x) => x.id === id)
          if (!r?.undo) return
          const { lastKm, lastDate, transactionId, transactionIds = [], installmentId } = r.undo
          const ids = new Set([transactionId, ...transactionIds].filter((x): x is string => !!x))
          const deletes: cloud.DocRef[] = transactions.filter((t) => ids.has(t.id)).map((t) => ({ name: 'transactions', id: t.id }))
          if (installmentId) deletes.push({ name: 'installments', id: installmentId })
          const restored: MaintenanceReminder = {
            ...r,
            lastKm,
            lastDate,
            // Conclusão nova (com histórico): devolve vencimento e orçamento de antes.
            ...('quote' in r.undo ? { dueKm: r.undo.dueKm ?? null, dueDate: r.undo.dueDate ?? null, quote: r.undo.quote ?? null } : {}),
            history: (r.history ?? []).slice(1),
            undo: null,
          }
          commit({ upserts: [{ name: 'maintenance', data: restored }], deletes })
        },

        saveQuote: (id, quote) => {
          const r = get().maintenance.find((x) => x.id === id)
          if (r) commit({ upserts: [{ name: 'maintenance', data: { ...r, quote } }] })
        },

        finishMaintenance: (id, done) => {
          const state = get()
          const r = state.maintenance.find((x) => x.id === id)
          if (!r) return
          const generated = done.purchase?.transactions ?? (done.expense ? [done.expense] : [])
          const amount = generated.length ? generated.reduce((a, t) => a + t.amount, 0) : null
          const undo: MaintenanceUndo = {
            lastKm: r.lastKm,
            lastDate: r.lastDate,
            transactionId: null,
            sharedBillId: done.sharedBillId ?? null,
            transactionIds: generated.map((t) => t.id),
            installmentId: done.purchase?.installment.id ?? null,
            dueKm: r.dueKm ?? null,
            dueDate: r.dueDate ?? null,
            quote: r.quote ?? null,
          }
          const next: MaintenanceReminder = {
            ...r,
            lastKm: done.km ?? r.lastKm,
            lastDate: done.date,
            dueKm: null,
            dueDate: null,
            quote: null,
            history: [{ date: done.date, km: done.km, amount, installments: done.purchase?.installment.totalInstallments ?? 1 }, ...(r.history ?? [])],
            undo,
          }
          commit({
            upserts: [
              { name: 'maintenance', data: next },
              ...(generated.length ? vehicleCategoryWrites(state) : []),
              ...(done.purchase ? [{ name: 'installments' as const, data: done.purchase.installment }] : []),
              ...txWrites(generated),
            ],
          })
        },
      }
    },
    {
      name: 'financas-data',
      // v2: remove os dados de exemplo que a v1 gravava por padrão.
      // v3: inclui categorias padrão novas (Veículo, Empréstimos).
      // v4: gastos fixos (recurringCosts).
      // v5: dívidas do plano Sair do vermelho.
      // v6: veículos e lembretes de manutenção.
      // v7: subcategorias da casa (água, gás, condomínio, IPTU, manutenção).
      // v8: financiamento do imóvel e compras da casa.
      // v9: metas (caixinhas).
      // v10: cartões de crédito.
      version: 10,
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
        if (version < 6) state = { ...state, vehicles: [], maintenance: [] }
        if (version < 7) {
          const missing = missingDefaults(state.categories, state.subcategories, 2)
          state = { ...state, subcategories: [...state.subcategories, ...missing.subcategories] }
        }
        if (version < 8) {
          const missing = missingDefaults(state.categories, state.subcategories, 3)
          state = { ...state, subcategories: [...state.subcategories, ...missing.subcategories] }
        }
        if (version < 9) state = { ...state, goals: [] }
        if (version < 10) state = { ...state, cards: [] }
        return state
      },
      // Logado, o Firestore é a fonte; o navegador só guarda o modo sem login.
      storage: localOnlyStorage,
      partialize: ({ categories, subcategories, transactions, installments, recurringCosts, debts, vehicles, maintenance, goals, cards }) => ({
        categories,
        subcategories,
        transactions,
        installments,
        recurringCosts,
        debts,
        vehicles,
        maintenance,
        goals,
        cards,
      }),
    },
  ),
)
