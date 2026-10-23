import { Plus, SlidersHorizontal, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, EmptyState } from '@/components/ui/misc'
import { formatMonthLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { SLICE_LABELS, SLICE_LIMIT, type BaseIncome, type SliceUsage } from '@/lib/plan'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui-store'
import type { BudgetSlice, YearMonth } from '@/types/finance'

const SLICE_HINT: Record<BudgetSlice, string> = {
  essencial: 'Moradia, mercado, transporte, contas, saúde, parcelas',
  investir: 'Reserva de emergência e liberdade financeira',
  lazer: 'Passeios, delivery, compras, assinaturas',
  curto: 'Viagens, troca do carro, despesas anuais',
}

function status(u: SliceUsage, income: number) {
  const diff = Math.abs(u.planned - u.actual)
  if (SLICE_LIMIT[u.slice] === 'teto') {
    return u.off
      ? { text: `Passou ${formatMoney(diff)} do teto · ${Math.round((u.actual / income) * 100)}% da renda`, tone: 'text-expense' }
      : { text: `Ainda cabem ${formatMoney(diff)}`, tone: 'text-muted-foreground' }
  }
  if (u.off) return { text: `Faltam ${formatMoney(diff)} para os ${u.percent}%`, tone: 'text-warning' }
  return u.slice === 'investir' && u.percent < 20
    ? { text: 'Meta do mês batida. Com folga, suba para 15% ou 20%.', tone: 'text-income' }
    : { text: 'Meta do mês batida.', tone: 'text-income' }
}

/** Divisão da renda no mês (60/10/20/10): gastos dos lançamentos, guardado das caixinhas. */
export function PlanCard({
  income,
  usage,
  month,
  onAdjust,
}: {
  income: BaseIncome
  usage: SliceUsage[]
  month: YearMonth
  onAdjust: () => void
}) {
  const openForm = useUIStore((s) => s.setTransactionDialogOpen)

  if (income.source === 'nenhuma')
    return (
      <Card>
        <EmptyState
          icon={Target}
          title="Qual é a sua renda?"
          description="O plano usa a média das receitas dos últimos 3 meses. Lance o salário como receita fixa ou informe o valor."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => openForm(true, 'receita')}>
                <Plus />
                Lançar renda
              </Button>
              <Button variant="outline" onClick={onAdjust}>
                Informar valor
              </Button>
            </div>
          }
        />
      </Card>
    )

  const split = usage.map((u) => u.percent).join('/')
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4" />
            Plano de {formatMonthLabel(month).toLowerCase()}
          </CardTitle>
          <CardDescription>
            Renda base <span className="font-medium text-foreground tabular-nums">{formatMoney(income.value)}</span>
            {income.source === 'media' ? ' · média de 3 meses' : ' · informada por você'} · {split}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={onAdjust}>
          <SlidersHorizontal />
          Ajustar
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-4">
          {usage.map((u) => {
            const ratio = u.planned > 0 ? u.actual / u.planned : u.actual > 0 ? 1 : 0
            const teto = SLICE_LIMIT[u.slice] === 'teto'
            const s = status(u, income.value)
            return (
              <li key={u.slice} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    {SLICE_LABELS[u.slice]}
                    <Badge tone={teto ? 'neutral' : 'info'}>{teto ? `até ${u.percent}%` : `mín. ${u.percent}%`}</Badge>
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    <span className="font-semibold">{formatMoney(u.actual)}</span>
                    <span className="text-muted-foreground"> de {formatMoney(u.planned)}</span>
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${SLICE_LABELS[u.slice]}: ${Math.round(ratio * 100)}% do plano`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(ratio * 100)}
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.min(Math.max(ratio, 0), 1) * 100}%`,
                      background: teto ? (u.off ? 'var(--expense)' : 'var(--info)') : u.off ? 'var(--warning)' : 'var(--income)',
                    }}
                  />
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 text-xs">
                  <span className="text-muted-foreground">{SLICE_HINT[u.slice]}</span>
                  <span className={cn('font-medium', s.tone)}>{s.text}</span>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          Gastos vêm dos lançamentos do mês. Investimentos e metas vêm do que você guardou nas caixinhas: guarde assim que o salário cair.
        </p>
      </CardContent>
    </Card>
  )
}
