/**
 * Cálculos da página Casa: contas vinculadas à casa no mês (Moradia e as
 * categorias marcadas, ou lançamentos vinculados um a um), comparação com os
 * meses anteriores e manutenção da casa (lembretes por tempo).
 */
import type { Cents, Installment, ISODate, RecurringCost, Transaction, YearMonth } from '@/types/finance'
import { costKindOf, DEFAULT_HOME_CATEGORIES, isHome } from './areas'
import { lastNMonths, monthOf, shiftMonth } from './dates'
import { resolveStatus } from './finance'

/** Categorias da casa (Configurações); padrão: só Moradia. */
export type HomeCats = ReadonlySet<string>
const DEFAULT_CATS: HomeCats = new Set(DEFAULT_HOME_CATEGORIES)

export const HOME_CATEGORY_ID = 'cat-moradia'
export const HOME_MAINTENANCE_SUBCATEGORY_ID = 'sub-casa-manutencao'

/** Ordem das contas na tela (as que não estão aqui vêm depois, por valor). */
export const BILL_ORDER = ['sub-aluguel', 'sub-condominio', 'sub-energia', 'sub-agua', 'sub-gas', 'sub-internet', 'sub-iptu']

export const RENT_SUBCATEGORY_ID = 'sub-aluguel'
export const FINANCING_SUBCATEGORY_ID = 'sub-casa-financiamento'
export const IPTU_SUBCATEGORY_ID = 'sub-iptu'

/** Coisas compradas para a casa (não contas): limpeza, utensílios, eletro, móveis, reparos. */
export const PURCHASE_SUBCATEGORIES = [
  'sub-casa-limpeza',
  'sub-casa-utensilios',
  'sub-casa-eletro',
  'sub-casa-moveis',
  HOME_MAINTENANCE_SUBCATEGORY_ID,
]
const purchaseSet = new Set(PURCHASE_SUBCATEGORIES)
export const isHomePurchase = (t: Pick<Transaction, 'subcategoryId'>) => !!t.subcategoryId && purchaseSet.has(t.subcategoryId)

/**
 * Vai para "Compras" da casa: subcategoria de compra da Moradia, ou gasto
 * variável de outra categoria vinculado à casa (ex.: mercado da casa).
 * O resto (contas e fixos de qualquer categoria) fica em "Contas do mês".
 */
export const isHomePurchaseTx = (t: Transaction) =>
  isHomePurchase(t) || (t.categoryId !== HOME_CATEGORY_ID && costKindOf(t) === 'variavel')

export const homeExpenses = (transactions: Transaction[], cats: HomeCats = DEFAULT_CATS) =>
  transactions.filter((t) => t.type === 'despesa' && isHome(t, cats))

/** Contas da casa (aluguel, luz, água... e o que mais estiver vinculado), sem as compras. */
export const homeBills = (transactions: Transaction[], cats: HomeCats = DEFAULT_CATS) => homeExpenses(transactions, cats).filter((t) => !isHomePurchaseTx(t))

export interface HomeMonth {
  items: Transaction[]
  total: Cents
  paid: Cents
  open: Cents
  overdue: Cents
}

export function homeMonth(
  transactions: Transaction[],
  month: YearMonth,
  today: ISODate,
  only: 'contas' | 'tudo' = 'tudo',
  cats: HomeCats = DEFAULT_CATS,
): HomeMonth {
  const items = (only === 'contas' ? homeBills(transactions, cats) : homeExpenses(transactions, cats))
    .filter((t) => monthOf(t.dueDate) === month)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  let paid = 0
  let overdue = 0
  for (const t of items) {
    const s = resolveStatus(t, today)
    if (s === 'pago') paid += t.amount
    if (s === 'atrasado') overdue += t.amount
  }
  const total = items.reduce((a, t) => a + t.amount, 0)
  return { items, total, paid, open: total - paid, overdue }
}

export interface BillComparison {
  subcategoryId: string | null
  /** Categoria quando não há subcategoria (conta vinculada de outra categoria) */
  categoryId: string
  total: Cents
  /** Média dos meses anteriores com essa conta; `null` sem histórico */
  average: Cents | null
  /** Variação contra a média (0.12 = 12% mais caro) */
  change: number | null
}

/** Cada tipo de conta no mês contra a média dos `n` meses anteriores em que apareceu. */
export function compareBills(transactions: Transaction[], month: YearMonth, n = 3, cats: HomeCats = DEFAULT_CATS): BillComparison[] {
  const previous = new Set(Array.from({ length: n }, (_, i) => shiftMonth(month, -(i + 1))))
  // Agrupa por subcategoria; sem subcategoria, pela categoria (não mistura categorias diferentes).
  const keyOf = (t: Transaction) => t.subcategoryId ?? `cat:${t.categoryId}`
  const meta = new Map<string, { subcategoryId: string | null; categoryId: string }>()
  const current = new Map<string, Cents>()
  const history = new Map<string, Map<YearMonth, Cents>>()

  for (const t of homeBills(transactions, cats)) {
    const key = keyOf(t)
    meta.set(key, { subcategoryId: t.subcategoryId, categoryId: t.categoryId })
    const m = monthOf(t.dueDate)
    if (m === month) current.set(key, (current.get(key) ?? 0) + t.amount)
    else if (previous.has(m)) {
      const byMonth = history.get(key) ?? new Map<YearMonth, Cents>()
      byMonth.set(m, (byMonth.get(m) ?? 0) + t.amount)
      history.set(key, byMonth)
    }
  }

  const order = (id: string | null) => {
    const i = id ? BILL_ORDER.indexOf(id) : -1
    return i === -1 ? BILL_ORDER.length : i
  }
  return [...current]
    .map(([key, total]) => {
      const months = [...(history.get(key)?.values() ?? [])]
      const average = months.length ? Math.round(months.reduce((a, v) => a + v, 0) / months.length) : null
      return { ...meta.get(key)!, total, average, change: average ? (total - average) / average : null }
    })
    .sort((a, b) => order(a.subcategoryId) - order(b.subcategoryId) || b.total - a.total)
}

/** Cuidados comuns de uma casa; a pessoa ajusta o intervalo ao cadastrar. */
export const HOME_REMINDERS: { name: string; intervalMonths: number }[] = [
  { name: "Limpeza da caixa d'água", intervalMonths: 6 },
  { name: 'Troca do filtro de água', intervalMonths: 6 },
  { name: 'Limpeza do ar-condicionado', intervalMonths: 6 },
  { name: 'Dedetização', intervalMonths: 12 },
  { name: 'Troca da mangueira do gás', intervalMonths: 60 },
]

// ---------------------------------------------------------------------------
// Compras da casa
// ---------------------------------------------------------------------------

export interface PurchaseSummary {
  thisMonth: Cents
  /** Total dos últimos 12 meses (custo anual) */
  year: Cents
  /** Média por mês nos últimos 12 meses */
  monthlyAverage: Cents
  /** Por subcategoria; sem subcategoria, pela categoria */
  bySubcategory: { subcategoryId: string | null; categoryId: string; total: Cents }[]
  /** Todas as compras, das mais novas para as mais antigas */
  items: Transaction[]
}

export function purchaseSummary(transactions: Transaction[], endMonth: YearMonth, cats: HomeCats = DEFAULT_CATS): PurchaseSummary {
  const window = new Set(lastNMonths(endMonth, 12))
  const items = homeExpenses(transactions, cats)
    .filter(isHomePurchaseTx)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const inYear = items.filter((t) => window.has(monthOf(t.dueDate)))
  const bySub = new Map<string, { subcategoryId: string | null; categoryId: string; total: Cents }>()
  for (const t of inYear) {
    const key = t.subcategoryId ?? `cat:${t.categoryId}`
    const cur = bySub.get(key) ?? { subcategoryId: t.subcategoryId, categoryId: t.categoryId, total: 0 }
    bySub.set(key, { ...cur, total: cur.total + t.amount })
  }
  const year = inYear.reduce((a, t) => a + t.amount, 0)
  return {
    thisMonth: items.filter((t) => monthOf(t.dueDate) === endMonth).reduce((a, t) => a + t.amount, 0),
    year,
    monthlyAverage: Math.round(year / 12),
    bySubcategory: [...bySub.values()].sort((a, b) => b.total - a.total),
    items,
  }
}

// ---------------------------------------------------------------------------
// Moradia (aluguel, financiamento, IPTU)
// ---------------------------------------------------------------------------

/** Conta da moradia dividida com outra pessoa: só a minha parte, das parcelas que faltam. */
export interface SharedHousing {
  billId: string
  next: Transaction
  remaining: number
}

export interface HousingStatus {
  rent: RecurringCost | null
  financing: { installment: Installment; remaining: number; monthly: Cents; nextDue: ISODate | null } | null
  iptu: { recurring: RecurringCost | null; installment: Installment | null }
  /** Aluguel, financiamento e IPTU que vieram de conta compartilhada aceita */
  shared: { rent: SharedHousing | null; financing: SharedHousing | null; iptu: SharedHousing | null }
}

function sharedHousing(transactions: Transaction[], sub: string): SharedHousing | null {
  const pending = transactions
    .filter((t) => t.sharedBillId && t.categoryId === HOME_CATEGORY_ID && t.subcategoryId === sub && t.status !== 'pago' && !t.sharedSuspended)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const next = pending[0]
  if (!next?.sharedBillId) return null
  return { billId: next.sharedBillId, next, remaining: pending.filter((t) => t.sharedBillId === next.sharedBillId).length }
}

/** O que já está cadastrado sobre a moradia, lido dos fixos e parcelamentos. */
export function housingStatus(recurring: RecurringCost[], installments: Installment[], transactions: Transaction[]): HousingStatus {
  const activeRc = (sub: string) => recurring.find((r) => r.active && r.categoryId === HOME_CATEGORY_ID && r.subcategoryId === sub) ?? null
  const pendingOf = (id: string) =>
    transactions
      .filter((t) => t.installment?.installmentId === id && t.status !== 'pago')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const withPending = (sub: string) => installments.find((i) => i.subcategoryId === sub && pendingOf(i.id).length > 0) ?? null

  const fin = withPending(FINANCING_SUBCATEGORY_ID)
  const finPending = fin ? pendingOf(fin.id) : []
  return {
    rent: activeRc(RENT_SUBCATEGORY_ID),
    financing: fin
      ? { installment: fin, remaining: finPending.length, monthly: finPending[0]?.amount ?? fin.installmentAmount, nextDue: finPending[0]?.dueDate ?? null }
      : null,
    iptu: { recurring: activeRc(IPTU_SUBCATEGORY_ID), installment: withPending(IPTU_SUBCATEGORY_ID) },
    shared: {
      rent: sharedHousing(transactions, RENT_SUBCATEGORY_ID),
      financing: sharedHousing(transactions, FINANCING_SUBCATEGORY_ID),
      iptu: sharedHousing(transactions, IPTU_SUBCATEGORY_ID),
    },
  }
}
