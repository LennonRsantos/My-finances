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
    <div className={cn('flex min-w-0 flex-col gap-1 px-3 py-3.5 sm:px-5', className)}>
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn('whitespace-nowrap text-[15px] font-semibold tabular-nums tracking-[-0.01em] sm:text-[17px]', tone && text[tone], value < 0 && 'text-expense')}>
        {/* No celular o sinal sai: a cor já diz se entra ou sai e o valor cabe numa linha. */}
        {sign && value !== 0 && <span className="hidden sm:inline" aria-hidden>{sign} </span>}
        {formatMoney(value)}
      </dd>
    </div>
  )
}

/** O status olha o fim do mês (não o saldo de hoje); o texto diz isso com o valor. */
function statusText(summary: MonthSummary): string {
  const end = formatMoney(summary.projectedEndBalance)
  if (summary.health === 'no_vermelho') return `O mês deve fechar negativo em ${formatMoney(Math.abs(summary.projectedEndBalance))}.`
  if (summary.health === 'em_risco') return `O mês deve fechar em ${end}, mas há contas atrasadas ou gastos acima de 90% da renda.`
  return `O mês deve fechar com ${end}.`
}

/**
 * Sobra do mês: receitas menos despesas só deste mês, sem o saldo que veio de
 * antes. Mostra quanto o mês, sozinho, deveria deixar de sobra.
 */
function MonthLeftover({ income, expenses }: { income: number; expenses: number }) {
  const left = income - expenses
  const share = income > 0 ? Math.round((left / income) * 100) : null
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{left < 0 ? 'Falta no mês' : 'Sobra do mês'}</span>
        <span className="text-xs text-muted-foreground">
          Receitas − despesas deste mês{share !== null && left > 0 ? ` · ${share}% da renda` : ''}
        </span>
      </div>
      <span className={cn('whitespace-nowrap text-lg font-semibold tabular-nums', left < 0 ? 'text-expense' : left > 0 ? 'text-income' : 'text-muted-foreground')}>
        {formatMoney(left)}
      </span>
    </div>
  )
}

/** Resumo do mês: saldo de hoje e previsão do fim do mês lado a lado, movimento embaixo. */
export function MonthStatement({ summary, toPay }: { summary: MonthSummary; toPay: number }) {
  const { tone } = healthMeta[summary.health]
  return (
    <section aria-label="Resumo do mês" className="rounded-xl border bg-card">
      <div className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Saldo hoje</h2>
          <BigMoney value={summary.currentBalance} />
        </div>
        <div className="flex flex-col gap-3 sm:border-l sm:pl-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Previsto no fim do mês</h2>
            <span className={cn('inline-flex items-center gap-2 text-sm font-medium', text[tone])}>
              <span className={cn('size-2 rounded-full', dot[tone])} aria-hidden />
              {HEALTH_LABELS[summary.health]}
            </span>
          </div>
          <BigMoney value={summary.projectedEndBalance} />
          <p className="text-sm text-muted-foreground">{statusText(summary)}</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 border-t [&>div+div]:border-l">
        <Figure label="Receitas" value={summary.monthIncome} tone="income" sign="+" />
        <Figure label="Despesas" value={summary.monthExpenses} tone="expense" sign="−" />
        <Figure label="Falta pagar" value={toPay} tone={toPay > 0 ? 'warning' : undefined} />
      </dl>
      <MonthLeftover income={summary.monthIncome} expenses={summary.monthExpenses} />
    </section>
  )
}
