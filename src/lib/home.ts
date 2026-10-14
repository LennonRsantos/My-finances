/**
 * Cálculos da página Casa: contas da categoria Moradia no mês, comparação
 * com os meses anteriores e manutenção da casa (lembretes por tempo).
 */
import type { Cents, Installment, ISODate, RecurringCost, Transaction, YearMonth } from '@/types/finance'
import { lastNMonths, monthOf, shiftMonth } from './dates'
import { resolveStatus } from './finance'

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

export const homeExpenses = (transactions: Transaction[]) =>
  transactions.filter((t) => t.categoryId === HOME_CATEGORY_ID && t.type === 'despesa')

/** Contas da casa (aluguel, luz, água...), sem as compras. */
export const homeBills = (transactions: Transaction[]) => homeExpenses(transactions).filter((t) => !isHomePurchase(t))

export interface HomeMonth {
  items: Transaction[]
  total: Cents
  paid: Cents
  open: Cents
  overdue: Cents
}

export function homeMonth(transactions: Transaction[], month: YearMonth, today: ISODate, only: 'contas' | 'tudo' = 'tudo'): HomeMonth {
  const items = (only === 'contas' ? homeBills(transactions) : homeExpenses(transactions))
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
  total: Cents
  /** Média dos meses anteriores com essa conta; `null` sem histórico */
  average: Cents | null
  /** Variação contra a média (0.12 = 12% mais caro) */
  change: number | null
}

/** Cada tipo de conta no mês contra a média dos `n` meses anteriores em que apareceu. */
export function compareBills(transactions: Transaction[], month: YearMonth, n = 3): BillComparison[] {
  const previous = new Set(Array.from({ length: n }, (_, i) => shiftMonth(month, -(i + 1))))
  const current = new Map<string | null, Cents>()
  const history = new Map<string | null, Map<YearMonth, Cents>>()

  for (const t of homeBills(transactions)) {
    const m = monthOf(t.dueDate)
    if (m === month) current.set(t.subcategoryId, (current.get(t.subcategoryId) ?? 0) + t.amount)
    else if (previous.has(m)) {
      const byMonth = history.get(t.subcategoryId) ?? new Map<YearMonth, Cents>()
      byMonth.set(m, (byMonth.get(m) ?? 0) + t.amount)
      history.set(t.subcategoryId, byMonth)
    }
  }

  const order = (id: string | null) => {
    const i = id ? BILL_ORDER.indexOf(id) : -1
    return i === -1 ? BILL_ORDER.length : i
  }
  return [...current]
    .map(([subcategoryId, total]) => {
      const months = [...(history.get(subcategoryId)?.values() ?? [])]
      const average = months.length ? Math.round(months.reduce((a, v) => a + v, 0) / months.length) : null
      return { subcategoryId, total, average, change: average ? (total - average) / average : null }
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
  bySubcategory: { subcategoryId: string; total: Cents }[]
  /** Todas as compras, das mais novas para as mais antigas */
  items: Transaction[]
}

export function purchaseSummary(transactions: Transaction[], endMonth: YearMonth): PurchaseSummary {
  const window = new Set(lastNMonths(endMonth, 12))
  const items = homeExpenses(transactions)
    .filter(isHomePurchase)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const inYear = items.filter((t) => window.has(monthOf(t.dueDate)))
  const bySub = new Map<string, Cents>()
  for (const t of inYear) bySub.set(t.subcategoryId!, (bySub.get(t.subcategoryId!) ?? 0) + t.amount)
  const year = inYear.reduce((a, t) => a + t.amount, 0)
  return {
    thisMonth: items.filter((t) => monthOf(t.dueDate) === endMonth).reduce((a, t) => a + t.amount, 0),
    year,
    monthlyAverage: Math.round(year / 12),
    bySubcategory: [...bySub].map(([subcategoryId, total]) => ({ subcategoryId, total })).sort((a, b) => b.total - a.total),
    items,
  }
}

// ---------------------------------------------------------------------------
// Moradia (aluguel, financiamento, IPTU)
// ---------------------------------------------------------------------------

export interface HousingStatus {
  rent: RecurringCost | null
  financing: { installment: Installment; remaining: number; monthly: Cents; nextDue: ISODate | null } | null
  iptu: { recurring: RecurringCost | null; installment: Installment | null }
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
  }
}
