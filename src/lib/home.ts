/**
 * Cálculos da página Casa: contas da categoria Moradia no mês, comparação
 * com os meses anteriores e manutenção da casa (lembretes por tempo).
 */
import type { Cents, ISODate, Transaction, YearMonth } from '@/types/finance'
import { monthOf, shiftMonth } from './dates'
import { resolveStatus } from './finance'

export const HOME_CATEGORY_ID = 'cat-moradia'
export const HOME_MAINTENANCE_SUBCATEGORY_ID = 'sub-casa-manutencao'

/** Ordem das contas na tela (as que não estão aqui vêm depois, por valor). */
export const BILL_ORDER = ['sub-aluguel', 'sub-condominio', 'sub-energia', 'sub-agua', 'sub-gas', 'sub-internet', 'sub-iptu']

export const homeExpenses = (transactions: Transaction[]) =>
  transactions.filter((t) => t.categoryId === HOME_CATEGORY_ID && t.type === 'despesa')

export interface HomeMonth {
  items: Transaction[]
  total: Cents
  paid: Cents
  open: Cents
  overdue: Cents
}

export function homeMonth(transactions: Transaction[], month: YearMonth, today: ISODate): HomeMonth {
  const items = homeExpenses(transactions)
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

  for (const t of homeExpenses(transactions)) {
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
