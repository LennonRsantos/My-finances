import type { Tone } from '@/components/ui/misc'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { HEALTH_LABELS, type FinancialHealth, type MonthSummary } from '@/types/finance'

const healthMeta: Record<FinancialHealth, { tone: Tone; hint: string }> = {
  saudavel: { tone: 'income', hint: 'Receitas cobrem as despesas com folga.' },
  em_risco: { tone: 'warning', hint: 'Despesas acima de 90% da renda ou contas atrasadas.' },
  no_vermelho: { tone: 'expense', hint: 'Saldo previsto negativo no fim do mês.' },
}

const dot: Record<Tone, string> = {
  income: 'bg-income',
  warning: 'bg-warning',
  expense: 'bg-expense',
  info: 'bg-info',
  neutral: 'bg-muted-foreground',
}

const text: Record<Tone, string> = {
  income: 'text-income',
  warning: 'text-warning',
  expense: 'text-expense',
  info: 'text-info',
  neutral: 'text-muted-foreground',
}

/** Divide "R$ 1.234,56" em parte inteira e centavos para dar peso ao valor. */
function BigMoney({ value }: { value: number }) {
  const formatted = formatMoney(value)
  const comma = formatted.lastIndexOf(',')
  const whole = comma >= 0 ? formatted.slice(0, comma) : formatted
  const cents = comma >= 0 ? formatted.slice(comma) : ''
  return (
    <span className={cn('text-[2.5rem] font-semibold leading-none tracking-[-0.03em] tabular-nums sm:text-5xl', value < 0 && 'text-expense')}>
      {whole}
      <span className="text-[0.55em] font-medium tracking-normal text-muted-foreground">{cents}</span>
    </span>
  )
}

function Figure({ label, value, tone, sign, className }: { label: string; value: number; tone?: Tone; sign?: '+' | '−'; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1 px-4 py-3.5 sm:px-5', className)}>
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn('text-[17px] font-semibold tabular-nums tracking-[-0.01em]', tone && text[tone], value < 0 && 'text-expense')}>
        {sign && value !== 0 && <span aria-hidden>{sign} </span>}
        {formatMoney(value)}
      </dd>
    </div>
  )
}

/** Resumo do mês como um extrato: saldo em destaque e o movimento logo abaixo. */
export function MonthStatement({ summary }: { summary: MonthSummary }) {
  const { tone, hint } = healthMeta[summary.health]
  return (
    <section aria-label="Resumo do mês" className="rounded-xl border bg-card">
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Saldo atual</h2>
          <span className={cn('inline-flex items-center gap-2 text-sm font-medium', text[tone])}>
            <span className={cn('size-2 rounded-full', dot[tone])} aria-hidden />
            {HEALTH_LABELS[summary.health]}
          </span>
        </div>
        <BigMoney value={summary.currentBalance} />
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <dl className="grid grid-cols-2 border-t sm:grid-cols-3 [&>div+div]:border-l [&>div:nth-child(3)]:col-span-2 [&>div:nth-child(3)]:border-l-0 [&>div:nth-child(3)]:border-t sm:[&>div:nth-child(3)]:col-span-1 sm:[&>div:nth-child(3)]:border-l sm:[&>div:nth-child(3)]:border-t-0">
        <Figure label="Receitas do mês" value={summary.monthIncome} tone="income" sign="+" />
        <Figure label="Despesas do mês" value={summary.monthExpenses} tone="expense" sign="−" />
        <Figure label="Previsto no fim do mês" value={summary.projectedEndBalance} />
      </dl>
    </section>
  )
}
