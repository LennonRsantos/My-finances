import { AlertTriangle, ArrowDownRight, ArrowUpRight, CircleCheck, Flame, Landmark, Target, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge, type Tone } from '@/components/ui/misc'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { HEALTH_LABELS, type FinancialHealth, type MonthSummary } from '@/types/finance'

const healthMeta: Record<FinancialHealth, { tone: Tone; icon: LucideIcon; hint: string }> = {
  saudavel: { tone: 'income', icon: CircleCheck, hint: 'Receitas cobrem as despesas com folga.' },
  em_risco: { tone: 'warning', icon: AlertTriangle, hint: 'Despesas acima de 90% da renda ou contas atrasadas.' },
  no_vermelho: { tone: 'expense', icon: Flame, hint: 'Saldo previsto negativo no fim do mês.' },
}

export function HealthBadge({ health }: { health: FinancialHealth }) {
  const { tone, icon: Icon } = healthMeta[health]
  return (
    <Badge tone={tone} className="px-3 py-1 text-sm">
      <Icon className="size-4" />
      {HEALTH_LABELS[health]}
    </Badge>
  )
}

interface StatProps {
  label: string
  value: number
  icon: LucideIcon
  tone: Tone
  emphasis?: boolean
}

const iconTone: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  income: 'bg-income-soft text-income',
  expense: 'bg-expense-soft text-expense',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
}

function Stat({ label, value, icon: Icon, tone, emphasis }: StatProps) {
  return (
    <Card className={cn('flex flex-col gap-3 p-4', emphasis && 'col-span-2 lg:col-span-1')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn('grid size-9 place-items-center rounded-xl', iconTone[tone])}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <span className={cn('text-xl font-semibold tracking-tight sm:text-2xl', value < 0 && 'text-expense')}>
        {formatMoney(value)}
      </span>
    </Card>
  )
}

export function SummaryCards({ summary }: { summary: MonthSummary }) {
  const projectedTone: Tone = summary.projectedEndBalance < 0 ? 'expense' : 'info'
  return (
    <section aria-label="Resumo do mês" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat emphasis label="Saldo atual" value={summary.currentBalance} icon={Landmark} tone="info" />
      <Stat label="Receitas do mês" value={summary.monthIncome} icon={ArrowUpRight} tone="income" />
      <Stat label="Despesas do mês" value={summary.monthExpenses} icon={ArrowDownRight} tone="expense" />
      <Stat
        emphasis
        label="Saldo previsto no fim do mês"
        value={summary.projectedEndBalance}
        icon={Target}
        tone={projectedTone}
      />
    </section>
  )
}

export function HealthBanner({ summary }: { summary: MonthSummary }) {
  const { tone, hint } = healthMeta[summary.health]
  const border: Record<Tone, string> = {
    neutral: '',
    info: '',
    income: 'border-income/30',
    warning: 'border-warning/40',
    expense: 'border-expense/40',
  }
  return (
    <Card className={cn('flex flex-wrap items-center justify-between gap-3 p-4', border[tone])}>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Saúde financeira do mês</span>
        <span className="text-sm">{hint}</span>
      </div>
      <HealthBadge health={summary.health} />
    </Card>
  )
}
