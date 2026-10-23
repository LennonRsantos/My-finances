import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFinanceStore } from '@/store/finance-store'
import { useSettingsStore } from '@/store/settings-store'
import { useUIStore } from '@/store/ui-store'
import { useAreaCategories } from './use-areas'
import {
  computeBudgetUsage,
  computeCategorySpending,
  computeDueAlerts,
  computeMonthlySeries,
  computeMonthSummary,
  computePayeeBalances,
  transactionsInMonth,
} from '@/lib/finance'
import { todayISO } from '@/lib/dates'
import { installmentDebt } from '@/lib/recovery'
import { areaOf } from '@/lib/reports'

/** Agrega todos os dados derivados do dashboard para o mês selecionado. */
export function useDashboardData() {
  const { transactions, categories } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, categories: s.categories })),
  )
  const { openingBalance, notifications, fixedSeries } = useSettingsStore((s) => s.settings)
  const month = useUIStore((s) => s.selectedMonth)
  const { homeCats } = useAreaCategories()

  return useMemo(() => {
    const today = todayISO()
    const inMonth = transactionsInMonth(transactions, month)
    const expenses = inMonth.filter((t) => t.type === 'despesa')
    const byArea = { casa: 0, veiculo: 0, outros: 0 }
    for (const t of expenses) byArea[areaOf(t, homeCats)] += t.amount
    return {
      month,
      today,
      hasData: inMonth.length > 0,
      /** Despesas do mês ainda não pagas */
      toPay: expenses.filter((t) => t.status !== 'pago').reduce((a, t) => a + t.amount, 0),
      byArea,
      installmentDebt: installmentDebt(transactions, fixedSeries),
      dueSoonDays: notifications.dueSoonDays,
      summary: computeMonthSummary(transactions, month, openingBalance, today),
      alerts: computeDueAlerts(transactions, today, notifications.dueSoonDays),
      categorySpending: computeCategorySpending(transactions, categories, month),
      budgetUsage: computeBudgetUsage(transactions, categories, month),
      monthlySeries: computeMonthlySeries(transactions, month, 12),
      payees: computePayeeBalances(transactions, month, today),
    }
  }, [transactions, categories, month, openingBalance, notifications.dueSoonDays, fixedSeries, homeCats])
}
