/**
 * Previsão dos próximos meses com o que já está lançado (fixos, parcelas,
 * avulsos futuros). Mesmo cálculo do "Previsto no fim do mês" do Dashboard.
 */
import type { Cents, ISODate, Transaction, YearMonth } from '@/types/finance'
import { shiftMonth } from './dates'
import { computeMonthSummary } from './finance'

export interface ForecastMonth {
  month: YearMonth
  income: Cents
  expenses: Cents
  /** Saldo previsto no último dia do mês */
  endBalance: Cents
  /** Saldo se guardar o "por mês" das metas desde o mês atual */
  endAfterGoals: Cents
  /** Nenhuma receita lançada no mês: o saldo tende a parecer pior que o real */
  incomeMissing: boolean
}

export function forecast(
  transactions: Transaction[],
  openingBalance: Cents,
  fromMonth: YearMonth,
  today: ISODate,
  months = 6,
  goalsPerMonth: Cents = 0,
): ForecastMonth[] {
  return Array.from({ length: months }, (_, i) => {
    const month = shiftMonth(fromMonth, i)
    const s = computeMonthSummary(transactions, month, openingBalance, today)
    return {
      month,
      income: s.monthIncome,
      expenses: s.monthExpenses,
      endBalance: s.projectedEndBalance,
      endAfterGoals: s.projectedEndBalance - goalsPerMonth * (i + 1),
      incomeMissing: s.monthIncome === 0,
    }
  })
}
