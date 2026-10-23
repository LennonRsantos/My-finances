/**
 * Relatórios: totais de um período (um mês ou 12 meses), divisão por área
 * (Casa, Veículo, resto), por categoria, maiores gastos e exportação CSV.
 */
import { differenceInCalendarDays, getDaysInMonth } from 'date-fns'
import type { Category, Cents, ISODate, PaymentMethod, Subcategory, Transaction, Vehicle, YearMonth } from '@/types/finance'
import { PAYMENT_METHOD_LABELS, STATUS_LABELS } from '@/types/finance'
import { lastNMonths, monthEnd, monthOf, parseDate, yearMonthToDate } from './dates'
import { resolveStatus } from './finance'
import { areaOf as areaOfTx, DEFAULT_HOME_CATEGORIES, type Area as LinkArea } from './areas'

export type ReportPeriod = 'mes' | 'ano'

/** Meses do período terminando em `end`. */
export const periodMonths = (end: YearMonth, period: ReportPeriod): YearMonth[] => (period === 'mes' ? [end] : lastNMonths(end, 12))

/** Mesmo tamanho de período, imediatamente antes (para comparação). */
export const previousPeriodEnd = (end: YearMonth, period: ReportPeriod): YearMonth =>
  lastNMonths(end, period === 'mes' ? 2 : 13)[0]!

export type Area = 'casa' | 'veiculo' | 'outros'

/** Área do lançamento pela regra de vínculo (`lib/areas.ts`); `homeCats` vem das Configurações. */
const DEFAULT_CATS: ReadonlySet<string> = new Set(DEFAULT_HOME_CATEGORIES)
export const areaOf = (t: Transaction, homeCats: ReadonlySet<string> = DEFAULT_CATS): Area => areaOfTx(t, homeCats) satisfies LinkArea

export interface Report {
  months: YearMonth[]
  items: Transaction[]
  income: Cents
  expenses: Cents
  balance: Cents
  /** Gasto médio por dia (só dias já passados no mês atual) */
  dailyAverage: Cents
  days: number
  byArea: Record<Area, Cents>
  byCategory: { categoryId: string; total: Cents; share: number; previous: Cents }[]
  byPayment: { method: PaymentMethod | null; total: Cents }[]
  top: Transaction[]
}

/** Dias que contam para a média: mês já encerrado = todos; mês corrente = até hoje. */
function countDays(months: YearMonth[], today: ISODate): number {
  return months.reduce((acc, m) => {
    if (monthEnd(m) < today) return acc + getDaysInMonth(yearMonthToDate(m))
    if (monthOf(today) === m) return acc + differenceInCalendarDays(parseDate(today), yearMonthToDate(m)) + 1
    return acc
  }, 0)
}

export function buildReport(transactions: Transaction[], end: YearMonth, period: ReportPeriod, today: ISODate, homeCats: ReadonlySet<string> = DEFAULT_CATS): Report {
  const months = periodMonths(end, period)
  const inPeriod = new Set(months)
  const previous = new Set(periodMonths(previousPeriodEnd(end, period), period))
  const items = transactions.filter((t) => inPeriod.has(monthOf(t.dueDate)))
  const expenses = items.filter((t) => t.type === 'despesa')
  const sum = (list: Transaction[]) => list.reduce((a, t) => a + t.amount, 0)

  const byArea: Record<Area, Cents> = { casa: 0, veiculo: 0, outros: 0 }
  const byCategory = new Map<string, Cents>()
  const byPayment = new Map<PaymentMethod | null, Cents>()
  for (const t of expenses) {
    byArea[areaOf(t, homeCats)] += t.amount
    byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + t.amount)
    byPayment.set(t.paymentMethod, (byPayment.get(t.paymentMethod) ?? 0) + t.amount)
  }
  const previousByCategory = new Map<string, Cents>()
  for (const t of transactions)
    if (t.type === 'despesa' && previous.has(monthOf(t.dueDate)))
      previousByCategory.set(t.categoryId, (previousByCategory.get(t.categoryId) ?? 0) + t.amount)

  const totalExpenses = sum(expenses)
  // Despesas que ainda vão vencer não entram na média diária.
  const spentSoFar = sum(expenses.filter((t) => t.dueDate <= today))
  const days = countDays(months, today)

  return {
    months,
    items,
    income: sum(items.filter((t) => t.type === 'receita')),
    expenses: totalExpenses,
    balance: sum(items.filter((t) => t.type === 'receita')) - totalExpenses,
    dailyAverage: days > 0 ? Math.round(spentSoFar / days) : 0,
    days,
    byArea,
    byCategory: [...byCategory]
      .map(([categoryId, total]) => ({
        categoryId,
        total,
        share: totalExpenses ? total / totalExpenses : 0,
        previous: previousByCategory.get(categoryId) ?? 0,
      }))
      .sort((a, b) => b.total - a.total),
    byPayment: [...byPayment].map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total),
    top: [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 8),
  }
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const csvCell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const csvMoney = (v: Cents) => (v / 100).toFixed(2).replace('.', ',')

/**
 * CSV no padrão do Excel em português: separador `;`, vírgula decimal e BOM
 * para os acentos abrirem certo.
 */
export function toCSV(
  items: Transaction[],
  lookups: { categories: Category[]; subcategories: Subcategory[]; vehicles: Vehicle[] },
  today: ISODate,
  homeCats: ReadonlySet<string> = DEFAULT_CATS,
): string {
  const cat = new Map(lookups.categories.map((c) => [c.id, c.name]))
  const sub = new Map(lookups.subcategories.map((s) => [s.id, s.name]))
  const veh = new Map(lookups.vehicles.map((v) => [v.id, v.name]))
  const header = ['Vencimento', 'Descrição', 'Tipo', 'Área', 'Categoria', 'Subcategoria', 'Valor', 'Status', 'Pago em', 'Pagamento', 'Veículo']
  const areaLabel: Record<Area, string> = { casa: 'Casa', veiculo: 'Veículo', outros: 'Outros' }
  const rows = [...items]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((t) =>
      [
        t.dueDate,
        t.description,
        t.type === 'receita' ? 'Receita' : 'Despesa',
        t.type === 'despesa' ? areaLabel[areaOf(t, homeCats)] : '',
        cat.get(t.categoryId) ?? '',
        (t.subcategoryId && sub.get(t.subcategoryId)) ?? '',
        csvMoney(t.type === 'receita' ? t.amount : -t.amount),
        STATUS_LABELS[resolveStatus(t, today)],
        t.paymentDate ?? '',
        t.paymentMethod ? PAYMENT_METHOD_LABELS[t.paymentMethod] : '',
        (t.vehicleId && veh.get(t.vehicleId)) ?? '',
      ]
        .map((v) => csvCell(String(v)))
        .join(';'),
    )
  return '﻿' + [header.join(';'), ...rows].join('\r\n')
}
