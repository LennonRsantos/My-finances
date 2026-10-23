import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MonthSelector } from '@/components/dashboard/month-selector'
import { GoalDialogs, type GoalDialogState } from '@/components/goals/goal-dialogs'
import { GoalsList } from '@/components/goals/goals-list'
import { AllocationCard, DebtCard, FreedomCard, IncomeGrowthCard, ReserveCard, SeasonalCard } from '@/components/goals/pillar-cards'
import { PlanCard } from '@/components/goals/plan-card'
import { PlanDialog } from '@/components/goals/plan-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { Skeleton } from '@/components/ui/misc'
import { useGoalPlan } from '@/hooks/use-goal-plan'
import { useHydrated } from '@/hooks/use-hydrated'
import { goalProgress } from '@/lib/goals'
import { expensiveDebts, incomeGrowth, kindOf, monthPlan, seasonalExpenses } from '@/lib/plan'
import { useFinanceStore } from '@/store/finance-store'
import { useSettingsStore } from '@/store/settings-store'
import { useUIStore } from '@/store/ui-store'
import type { GoalKind } from '@/types/finance'

function GoalsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Carregando">
      <Skeleton className="h-72" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  )
}

export function GoalsPage() {
  const hydrated = useHydrated()
  const { today, plan, diagnosis, targets, goals } = useGoalPlan()
  const { transactions, recurringCosts, vehicles, maintenance, debts } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, recurringCosts: s.recurringCosts, vehicles: s.vehicles, maintenance: s.maintenance, debts: s.debts })),
  )
  const fixedSeries = useSettingsStore((s) => s.settings.fixedSeries)
  const month = useUIStore((s) => s.selectedMonth)
  const [dialog, setDialog] = useState<GoalDialogState>(null)
  const [planOpen, setPlanOpen] = useState(false)

  const usage = useMemo(
    () => monthPlan(transactions, goals, month, targets.income.value, plan, fixedSeries),
    [transactions, goals, month, targets.income.value, plan, fixedSeries],
  )
  const seasonal = useMemo(
    () => seasonalExpenses(recurringCosts, vehicles, maintenance, transactions, month),
    [recurringCosts, vehicles, maintenance, transactions, month],
  )
  const growth = useMemo(() => incomeGrowth(transactions, today), [transactions, today])

  // A mais antiga de cada tipo vira o card principal; as outras ficam nas caixinhas.
  const first = (k: GoalKind) => goals.filter((g) => kindOf(g) === k).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
  const reserve = first('reserva')
  const reserveDone = !!reserve && goalProgress(reserve, today).status === 'concluida'
  // Dívida cara ou conta atrasada passa na frente: quitar vem antes de investir.
  const debtFirst = expensiveDebts(debts).length > 0 || diagnosis.overdue > 0
  const debtCard = <DebtCard debts={debts} overdue={diagnosis.overdue} overdueCount={diagnosis.overdueCount} />

  return (
    <>
      <PageHeader title="Metas" actions={<MonthSelector />} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:p-6">
        {!hydrated ? (
          <GoalsSkeleton />
        ) : (
          <>
            <PlanCard income={targets.income} usage={usage} month={month} onAdjust={() => setPlanOpen(true)} />
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
              {debtFirst && debtCard}
              <ReserveCard goal={reserve} targets={targets} plan={plan} today={today} onOpen={setDialog} />
              <FreedomCard goal={first('liberdade')} targets={targets} plan={plan} today={today} onOpen={setDialog} />
              <SeasonalCard items={seasonal} goal={first('anual')} month={month} onOpen={setDialog} />
              {!debtFirst && debtCard}
              <IncomeGrowthCard growth={growth} target={plan.incomeGrowth} onAdjust={() => setPlanOpen(true)} />
              <AllocationCard goals={goals} reserveDone={reserveDone} />
            </div>
            <GoalsList goals={goals} today={today} onOpen={setDialog} />
          </>
        )}
      </main>
      <GoalDialogs state={dialog} onClose={() => setDialog(null)} />
      <PlanDialog open={planOpen} onClose={() => setPlanOpen(false)} />
    </>
  )
}
