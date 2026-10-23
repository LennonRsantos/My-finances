import type {
  BudgetUsage,
  Category,
  CategorySpending,
  Cents,
  CostKind,
  DueAlerts,
  FinancialHealth,
  Installment,
  ISODate,
  MonthlyPoint,
  MonthSummary,
  PayeeBalance,
  PaymentMethod,
  Subcategory,
  Transaction,
  TransactionStatus,
  YearMonth,
} from '@/types/finance'
import { addDaysISO, addMonthsISO, formatMonthLabel, lastNMonths, monthEnd, monthOf } from './dates'
import { splitCents } from './money'
import { createId } from './utils'

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Pendente com vencimento passado é tratado como atrasado. */
export function resolveStatus(t: Transaction, today: ISODate): TransactionStatus {
  if (t.status === 'pago') return 'pago'
  return t.dueDate < today ? 'atrasado' : 'pendente'
}

const signed = (t: Transaction): Cents => (t.type === 'receita' ? t.amount : -t.amount)
const sum = (values: Cents[]): Cents => values.reduce((acc, v) => acc + v, 0)

// ---------------------------------------------------------------------------
// Resumo do mês
// ---------------------------------------------------------------------------

export function transactionsInMonth(transactions: Transaction[], month: YearMonth) {
  return transactions.filter((t) => monthOf(t.dueDate) === month)
}

export function computeHealth(params: {
  projectedEndBalance: Cents
  monthIncome: Cents
  monthExpenses: Cents
  overdueCount: number
}): FinancialHealth {
  const { projectedEndBalance, monthIncome, monthExpenses, overdueCount } = params
  if (projectedEndBalance < 0) return 'no_vermelho'
  const commitment = monthIncome > 0 ? monthExpenses / monthIncome : monthExpenses > 0 ? Infinity : 0
  if (commitment > 0.9 || overdueCount > 0) return 'em_risco'
  return 'saudavel'
}

export function computeMonthSummary(
  transactions: Transaction[],
  month: YearMonth,
  openingBalance: Cents,
  today: ISODate,
): MonthSummary {
  const inMonth = transactionsInMonth(transactions, month)
  const monthIncome = sum(inMonth.filter((t) => t.type === 'receita').map((t) => t.amount))
  const monthExpenses = sum(inMonth.filter((t) => t.type === 'despesa').map((t) => t.amount))

  // Saldo real: só o que já foi efetivamente pago/recebido.
  const currentBalance =
    openingBalance +
    sum(transactions.filter((t) => t.status === 'pago' && (t.paymentDate ?? t.dueDate) <= today).map(signed))

  // Previsto: assume que tudo com vencimento até o fim do mês será liquidado.
  const end = monthEnd(month)
  const projectedEndBalance = openingBalance + sum(transactions.filter((t) => t.dueDate <= end).map(signed))

  // Atrasos acumulados de meses anteriores também comprometem o mês.
  const overdueCount = transactions.filter((t) => t.dueDate <= end && resolveStatus(t, today) === 'atrasado').length

  return {
    month,
    currentBalance,
    monthIncome,
    monthExpenses,
    projectedEndBalance,
    health: computeHealth({ projectedEndBalance, monthIncome, monthExpenses, overdueCount }),
  }
}

// ---------------------------------------------------------------------------
// Alertas de vencimento
// ---------------------------------------------------------------------------

export function computeDueAlerts(transactions: Transaction[], today: ISODate, soonDays = 7): DueAlerts {
  const limit = addDaysISO(today, soonDays)
  const pending = transactions
    .filter((t) => t.type === 'despesa' && t.status !== 'pago')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  return {
    dueToday: pending.filter((t) => t.dueDate === today),
    dueSoon: pending.filter((t) => t.dueDate > today && t.dueDate <= limit),
    overdue: pending.filter((t) => t.dueDate < today),
  }
}

// ---------------------------------------------------------------------------
// Valores a enviar para outras pessoas
// ---------------------------------------------------------------------------

/** Nome normalizado para agrupar "isadora" e "Isadora " juntos. */
export const payeeKey = (name: string) => name.trim().toLocaleLowerCase('pt-BR')

export function computePayeeBalances(transactions: Transaction[], month: YearMonth, today: ISODate): PayeeBalance[] {
  const end = monthEnd(month)
  const groups = new Map<string, PayeeBalance>()
  for (const t of transactions) {
    if (t.type !== 'despesa' || t.status === 'pago' || !t.payTo?.trim()) continue
    // Usuário do app agrupa pelo uid (mesmo que o nome mude); nome livre, pelo nome.
    const key = t.payToUid ? `uid:${t.payToUid}` : payeeKey(t.payTo)
    const g = groups.get(key) ?? { name: t.payTo.trim(), handle: t.payToHandle ?? null, dueThisMonth: 0, totalRemaining: 0, overdueCount: 0, items: [] }
    g.totalRemaining += t.amount
    if (t.dueDate <= end) {
      g.dueThisMonth += t.amount
      g.items.push(t)
      if (t.dueDate < today) g.overdueCount += 1
    }
    groups.set(key, g)
  }
  return [...groups.values()]
    .map((g) => ({ ...g, items: g.items.sort((a, b) => a.dueDate.localeCompare(b.dueDate)) }))
    .sort((a, b) => b.dueThisMonth - a.dueThisMonth || b.totalRemaining - a.totalRemaining)
}

// ---------------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------------

export function computeCategorySpending(
  transactions: Transaction[],
  categories: Category[],
  month: YearMonth,
): CategorySpending[] {
  const totals = new Map<string, Cents>()
  for (const t of transactionsInMonth(transactions, month)) {
    if (t.type !== 'despesa') continue
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount)
  }
  const grand = sum([...totals.values()])
  return categories
    .filter((c) => totals.has(c.id))
    .map((category) => {
      const total = totals.get(category.id) ?? 0
      return { category, total, share: grand > 0 ? total / grand : 0 }
    })
    .sort((a, b) => b.total - a.total)
}

export function computeBudgetUsage(
  transactions: Transaction[],
  categories: Category[],
  month: YearMonth,
): BudgetUsage[] {
  const spending = new Map(computeCategorySpending(transactions, categories, month).map((s) => [s.category.id, s.total]))
  return categories
    .filter((c): c is Category & { monthlyBudget: Cents } => c.type === 'despesa' && c.monthlyBudget !== null)
    .map((category) => {
      const spent = spending.get(category.id) ?? 0
      return { category, spent, budget: category.monthlyBudget, ratio: spent / category.monthlyBudget }
    })
    .sort((a, b) => b.ratio - a.ratio)
}

export function computeMonthlySeries(transactions: Transaction[], endMonth: YearMonth, months = 12): MonthlyPoint[] {
  const buckets = new Map<YearMonth, { income: Cents; expenses: Cents }>(
    lastNMonths(endMonth, months).map((m) => [m, { income: 0, expenses: 0 }]),
  )
  for (const t of transactions) {
    const bucket = buckets.get(monthOf(t.dueDate))
    if (!bucket) continue
    if (t.type === 'receita') bucket.income += t.amount
    else bucket.expenses += t.amount
  }
  return [...buckets].map(([month, v]) => ({ month, label: formatMonthLabel(month, 'short'), ...v }))
}

// ---------------------------------------------------------------------------
// Parcelamentos
// ---------------------------------------------------------------------------

export interface InstallmentPurchaseInput {
  description: string
  totalAmount: Cents
  totalInstallments: number
  /** Parcela inicial (1-based). Ex.: 11 para um empréstimo já na 11ª de 36. */
  startAt?: number
  /** Vencimento da parcela `startAt` */
  firstDueDate: ISODate
  categoryId: Category['id']
  subcategoryId: Subcategory['id'] | null
  paymentMethod: PaymentMethod
  accountName: string
  payTo?: string | null
  payToUid?: string | null
  payToHandle?: string | null
  /** Marca a parcela `startAt` como paga */
  firstPaid?: boolean
  notes?: string
  /** Financiamento/empréstimo do veículo: as parcelas entram na aba Veículo */
  vehicleId?: string | null
  /** Vínculo com a Casa e fixo/variável (ver `Transaction`) */
  homeLink?: boolean | null
  costKind?: CostKind | null
  /** Cartão de crédito das parcelas (aba Cartão) */
  cardId?: string | null
  /** Chave da linha do extrato importado (fica na 1ª parcela) */
  importKey?: string | null
}

/**
 * Cria o registro de parcelamento e gera uma transação por parcela restante,
 * uma por mês a partir de `firstDueDate`. Parcelas antes de `startAt` (já
 * pagas fora do app) não são geradas. A soma de todas as N parcelas é
 * exatamente o total.
 */
export function generateInstallments(input: InstallmentPurchaseInput): {
  installment: Installment
  transactions: Transaction[]
} {
  const startAt = Math.min(Math.max(input.startAt ?? 1, 1), input.totalInstallments)
  const amounts = splitCents(input.totalAmount, input.totalInstallments)
  const installment: Installment = {
    id: createId(),
    description: input.description,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    totalInstallments: input.totalInstallments,
    currentInstallment: startAt + (input.firstPaid ? 1 : 0),
    totalAmount: input.totalAmount,
    installmentAmount: amounts[0] ?? input.totalAmount,
    startDate: input.firstDueDate,
    paymentMethod: input.paymentMethod,
    accountName: input.accountName,
    payTo: input.payTo ?? null,
    payToUid: input.payToUid ?? null,
    payToHandle: input.payToHandle ?? null,
  }

  const createdAt = new Date().toISOString()
  const transactions = amounts.slice(startAt - 1).map((amount, offset): Transaction => {
    const i = startAt - 1 + offset
    const paid = offset === 0 && !!input.firstPaid
    const dueDate = addMonthsISO(input.firstDueDate, offset)
    return {
      id: createId(),
      description: `${input.description} (${i + 1}/${input.totalInstallments})`,
      amount,
      type: 'despesa',
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      dueDate,
      paymentDate: paid ? dueDate : null,
      status: paid ? 'pago' : 'pendente',
      paymentMethod: input.paymentMethod,
      installment: { installmentId: installment.id, number: i + 1, total: input.totalInstallments },
      recurringCostId: null,
      payTo: input.payTo ?? null,
      payToUid: input.payToUid ?? null,
      payToHandle: input.payToHandle ?? null,
      notes: input.notes,
      vehicleId: input.vehicleId ?? null,
      ...(input.homeLink != null ? { homeLink: input.homeLink } : {}),
      ...(input.costKind ? { costKind: input.costKind } : {}),
      ...(input.cardId ? { cardId: input.cardId } : {}),
      ...(offset === 0 && input.importKey ? { importKey: input.importKey } : {}),
      createdAt,
    }
  })

  return { installment, transactions }
}
