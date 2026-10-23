import { ChevronRight, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { useGoalPlan } from '@/hooks/use-goal-plan'
import { formatMonthLabel } from '@/lib/dates'
import { goalProgress } from '@/lib/goals'
import { formatMoney } from '@/lib/money'
import { depositsInMonth } from '@/lib/plan'
import { useUIStore } from '@/store/ui-store'
import type { YearMonth } from '@/types/finance'

/** Resumo das metas no Dashboard: investido no mês e caixinhas atrasadas. O resto fica na aba Metas. */
export function GoalsSummary({ month }: { month: YearMonth }) {
  const { goals, plan, targets, today } = useGoalPlan()
  const setView = useUIStore((s) => s.setView)
  const planned = Math.round((targets.income.value * plan.split.investir) / 100)
  const invested = depositsInMonth(goals, month, ['reserva', 'liberdade'])
  const behind = goals.filter((g) => goalProgress(g, today).status === 'abaixo').length

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4" />
            Metas
          </CardTitle>
          <CardDescription>
            {goals.length === 0
              ? 'Reserva de emergência, investimentos e liberdade financeira.'
              : behind > 0
                ? `${behind} ${behind === 1 ? 'caixinha abaixo' : 'caixinhas abaixo'} do ritmo deste mês.`
                : 'Caixinhas em dia.'}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setView('metas')}>
          Ver metas
          <ChevronRight />
        </Button>
      </CardHeader>
      {planned > 0 && (
        <CardContent className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="text-muted-foreground">Investido em {formatMonthLabel(month, 'short').toLowerCase()}</span>
            <span className="tabular-nums">
              <span className="font-semibold">{formatMoney(invested)}</span>
              <span className="text-muted-foreground">
                {' '}
                de {formatMoney(planned)} ({plan.split.investir}%)
              </span>
            </span>
          </div>
          <Progress value={invested / planned} color="var(--income)" label={`Investido no mês: ${Math.round((invested / planned) * 100)}% do plano`} />
        </CardContent>
      )}
    </Card>
  )
}
