import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, CalendarClock, Layers } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { yearMonthToDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { NO_FIXED_SERIES, useSettingsStore } from '@/store/settings-store'
import type { EndingInstallment, InstallmentDebt } from '@/lib/recovery'

const LIMIT = 4

/** Ordem da lista: um toque passa para a próxima. */
const ORDERS = [
  { label: 'Maior primeiro', icon: ArrowDownWideNarrow, sort: (a: EndingInstallment, b: EndingInstallment) => b.remainingTotal - a.remainingTotal },
  { label: 'Menor primeiro', icon: ArrowUpNarrowWide, sort: (a: EndingInstallment, b: EndingInstallment) => a.remainingTotal - b.remainingTotal },
  { label: 'Termina antes', icon: CalendarClock, sort: (a: EndingInstallment, b: EndingInstallment) => a.lastMonth.localeCompare(b.lastMonth) || b.remainingTotal - a.remainingTotal },
] as const
const monthLabel = (m: Parameters<typeof yearMonthToDate>[0]) => format(yearMonthToDate(m), 'MMM/yy', { locale: ptBR })

/**
 * Saldo devedor acumulado de compras parceladas: soma das parcelas ainda não
 * pagas de todos os meses (contas fixas não entram).
 */
export function InstallmentDebtCard({ debt }: { debt: InstallmentDebt }) {
  const [showAll, setShowAll] = useState(false)
  const [order, setOrder] = useState(0)
  const sorted = useMemo(() => [...debt.items].sort(ORDERS[order]!.sort), [debt.items, order])
  const Order = ORDERS[order]!
  const fixed = useSettingsStore((s) => s.settings.fixedSeries ?? NO_FIXED_SERIES)
  const toggleFixedSeries = useSettingsStore((s) => s.toggleFixedSeries)
  if (debt.count === 0 && fixed.length === 0) return null
  const list = showAll ? sorted : sorted.slice(0, LIMIT)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-4" />
            Saldo devedor em parcelas
          </CardTitle>
          {debt.count > 1 && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setOrder((o) => (o + 1) % ORDERS.length)}
              aria-label={`Ordem: ${Order.label}. Tocar para mudar`}
              title="Mudar a ordem"
            >
              <Order.icon />
              {Order.label}
            </Button>
          )}
        </div>
        <CardDescription>Tudo o que falta pagar de compras e empréstimos parcelados, de todos os meses.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Falta pagar</span>
            <span className="text-lg font-semibold tabular-nums">{formatMoney(debt.total)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Por mês</span>
            <span className="text-lg font-semibold tabular-nums">{formatMoney(debt.monthly)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Parcelamentos</span>
            <span className="text-lg font-semibold tabular-nums">{debt.count}</span>
          </div>
        </div>

        <ul className="flex flex-col gap-3">
          {list.map((i) => {
            const paid = i.totalInstallments - i.remaining
            return (
              <li key={i.installmentId} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{i.description}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatMoney(i.remainingTotal)}</span>
                </div>
                <Progress
                  value={i.totalInstallments ? paid / i.totalInstallments : 0}
                  color="var(--income)"
                  label={`${i.description}: ${paid} de ${i.totalInstallments} parcelas pagas`}
                />
                <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Faltam {i.remaining} de {i.totalInstallments} · {formatMoney(i.monthly)}/mês · termina em {monthLabel(i.lastMonth)}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleFixedSeries(i.installmentId)}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    É conta fixa
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
        {fixed.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {fixed.length} {fixed.length === 1 ? 'parcelamento marcado' : 'parcelamentos marcados'} como conta fixa, fora do saldo.{' '}
            <button type="button" onClick={() => fixed.forEach(toggleFixedSeries)} className="font-medium text-foreground underline-offset-2 hover:underline">
              Desfazer
            </button>
          </p>
        )}
        {debt.count > LIMIT && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Mostrar menos' : `Ver todos (${debt.count})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
