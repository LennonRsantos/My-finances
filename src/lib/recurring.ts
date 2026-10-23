import type { ISODate, RecurringCost, Transaction, YearMonth } from '@/types/finance'
import { currentYearMonth, dateInMonth, monthOf, shiftMonth } from './dates'

/** Quantos meses à frente os gastos fixos ficam lançados (inclui o atual). */
export const RECURRING_HORIZON_MONTHS = 12

export function recurringHorizon(): YearMonth {
  return shiftMonth(currentYearMonth(), RECURRING_HORIZON_MONTHS - 1)
}

/** Id determinístico: gerar o mesmo mês duas vezes (outro aparelho, StrictMode) não duplica. */
export function occurrenceId(rc: RecurringCost, month: YearMonth) {
  return `${rc.id}_${month}`
}

export function occursIn(rc: RecurringCost, month: YearMonth) {
  return rc.frequency === 'mensal' || Number(month.slice(5, 7)) === rc.dueMonth
}

/** Lançamento do fixo num mês (ou `null` se não vence nesse mês ou está fora do período). */
export function occurrenceFor(rc: RecurringCost, month: YearMonth, createdAt = new Date().toISOString()): Transaction | null {
  if (!occursIn(rc, month)) return null
  const dueDate: ISODate = dateInMonth(month, rc.dueDay)
  if (dueDate < rc.startDate || (rc.endDate && dueDate > rc.endDate)) return null
  return {
    id: occurrenceId(rc, month),
    description: rc.description,
    amount: rc.amount,
    type: rc.type,
    categoryId: rc.categoryId,
    subcategoryId: rc.subcategoryId,
    dueDate,
    paymentDate: null,
    status: 'pendente',
    paymentMethod: rc.paymentMethod,
    installment: null,
    recurringCostId: rc.id,
    payTo: rc.payTo ?? null,
    payToUid: rc.payToUid ?? null,
    payToHandle: rc.payToHandle ?? null,
    vehicleId: rc.vehicleId ?? null,
    ...(rc.homeLink != null ? { homeLink: rc.homeLink } : {}),
    ...(rc.costKind ? { costKind: rc.costKind } : {}),
    ...(rc.cardId ? { cardId: rc.cardId } : {}),
    createdAt,
  }
}

/**
 * Gera as ocorrências que faltam entre o último mês gerado e `until`.
 * Meses já gerados nunca são recriados, então excluir uma ocorrência é definitivo.
 */
export function pendingOccurrences(
  rc: RecurringCost,
  until: YearMonth = recurringHorizon(),
): { transactions: Transaction[]; lastGeneratedMonth: YearMonth | null } {
  const nothing = { transactions: [], lastGeneratedMonth: rc.lastGeneratedMonth }
  if (!rc.active) return nothing

  let month = rc.lastGeneratedMonth ? shiftMonth(rc.lastGeneratedMonth, 1) : monthOf(rc.startDate)
  const endMonth = rc.endDate && monthOf(rc.endDate) < until ? monthOf(rc.endDate) : until
  if (month > endMonth) return nothing

  const createdAt = new Date().toISOString()
  const transactions: Transaction[] = []

  for (; month <= endMonth; month = shiftMonth(month, 1)) {
    const t = occurrenceFor(rc, month, createdAt)
    if (t) transactions.push(t)
  }

  return { transactions, lastGeneratedMonth: endMonth }
}

/** Valor mensal equivalente (anual dividido por 12). */
export function monthlyEquivalent(rc: RecurringCost) {
  return rc.frequency === 'mensal' ? rc.amount : Math.round(rc.amount / 12)
}
