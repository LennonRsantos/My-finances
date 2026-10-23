import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { currentYearMonth, todayISO } from '@/lib/dates'
import { planOf, planTargets, withPlanTarget } from '@/lib/plan'
import { computeDiagnosis } from '@/lib/recovery'
import { useFinanceStore } from '@/store/finance-store'
import { useSettingsStore } from '@/store/settings-store'

/**
 * Plano da aba Metas: renda base (média de 3 meses ou a informada), alvos
 * calculados e as caixinhas com o alvo do plano já aplicado.
 */
export function useGoalPlan() {
  const { transactions, categories, goals } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, categories: s.categories, goals: s.goals })),
  )
  const saved = useSettingsStore((s) => s.settings.goalPlan)
  const fixedSeries = useSettingsStore((s) => s.settings.fixedSeries)

  return useMemo(() => {
    const today = todayISO()
    const plan = planOf(saved)
    const diagnosis = computeDiagnosis(transactions, categories, currentYearMonth(), today, 3, fixedSeries)
    const targets = planTargets(plan, diagnosis)
    return { today, plan, diagnosis, targets, goals: goals.map((g) => withPlanTarget(g, targets)) }
  }, [transactions, categories, goals, saved, fixedSeries])
}
