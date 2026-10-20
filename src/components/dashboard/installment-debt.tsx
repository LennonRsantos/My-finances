import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, CalendarClock, Check, Layers, ListChecks, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { yearMonthToDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
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

const detail = (i: EndingInstallment) =>
  `Faltam ${i.remaining} de ${i.totalInstallments} · ${formatMoney(i.monthly)}/mês · termina em ${monthLabel(i.lastMonth)}`

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  )
}

/** Nome, valor e barra de um parcelamento. */
function RowBody({ i }: { i: EndingInstallment }) {
  const paid = i.totalInstallments - i.remaining
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">{i.description}</span>
        <span className="shrink-0 font-semibold tabular-nums">{formatMoney(i.remainingTotal)}</span>
      </div>
      <Progress
        value={i.totalInstallments ? paid / i.totalInstallments : 0}
        color="var(--income)"
        label={`${i.description}: ${paid} de ${i.totalInstallments} parcelas pagas`}
      />
    </>
  )
}

/**
 * Saldo devedor acumulado de compras parceladas: soma das parcelas ainda não
 * pagas de todos os meses (contas fixas não entram).
 */
export function InstallmentDebtCard({ debt }: { debt: InstallmentDebt }) {
  const [showAll, setShowAll] = useState(false)
  const [order, setOrder] = useState(0)
  // "Somar algumas": seleção só na hora; não muda o saldo normal nem as configurações.
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const sorted = useMemo(() => [...debt.items].sort(ORDERS[order]!.sort), [debt.items, order])
  const Order = ORDERS[order]!
  const fixed = useSettingsStore((s) => s.settings.fixedSeries ?? NO_FIXED_SERIES)
  const toggleFixedSeries = useFinanceStore((s) => s.toggleFixedSeries)
  if (debt.count === 0 && fixed.length === 0) return null
  const selecting = picked !== null
  const list = showAll || selecting ? sorted : sorted.slice(0, LIMIT)
  const chosen = picked ? sorted.filter((i) => picked.has(i.installmentId)) : []
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-4" />
            Saldo devedor em parcelas
          </CardTitle>
          {debt.count > 1 && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setPicked((p) => (p ? null : new Set()))} aria-pressed={selecting}>
                {selecting ? <X /> : <ListChecks />}
                {selecting ? 'Fechar' : 'Somar algumas'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOrder((o) => (o + 1) % ORDERS.length)}
                aria-label={`Ordem: ${Order.label}. Tocar para mudar`}
                title="Mudar a ordem"
              >
                <Order.icon />
                {Order.label}
              </Button>
            </div>
          )}
        </div>
        <CardDescription>
          {selecting
            ? 'Toque nas contas que quer somar. Ao fechar, volta ao saldo de todas.'
            : 'Tudo o que falta pagar de compras e empréstimos parcelados, de todos os meses.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {picked ? (
          <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3">
            <div className="grid grid-cols-3 gap-3">
              <Figure label="Selecionadas" value={formatMoney(chosen.reduce((a, i) => a + i.remainingTotal, 0))} />
              <Figure label="Por mês" value={formatMoney(chosen.reduce((a, i) => a + i.monthly, 0))} />
              <Figure label="Contas" value={`${chosen.length} de ${debt.count}`} />
            </div>
            <div className="flex gap-3 text-xs">
              <button
                type="button"
                onClick={() => setPicked(new Set(sorted.map((i) => i.installmentId)))}
                className="-my-2 py-2 font-medium underline-offset-2 hover:underline"
              >
                Todas
              </button>
              <button type="button" onClick={() => setPicked(new Set())} className="-my-2 py-2 font-medium underline-offset-2 hover:underline">
                Nenhuma
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Figure label="Falta pagar" value={formatMoney(debt.total)} />
            <Figure label="Por mês" value={formatMoney(debt.monthly)} />
            <Figure label="Parcelamentos" value={debt.count} />
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {list.map((i) => {
            if (picked) {
              const on = picked.has(i.installmentId)
              return (
                <li key={i.installmentId}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(i.installmentId)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg text-left outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring',
                      !on && 'opacity-60',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border', on && 'border-foreground bg-foreground text-background')}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <RowBody i={i} />
                      <span className="text-xs text-muted-foreground">{detail(i)}</span>
                    </span>
                  </button>
                </li>
              )
            }
            return (
              <li key={i.installmentId} className="flex flex-col gap-1.5">
                <RowBody i={i} />
                <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{detail(i)}</span>
                  <button
                    type="button"
                    onClick={() => toggleFixedSeries(i.installmentId)}
                    className="-my-2 py-2 font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    É conta fixa
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
        {!selecting && fixed.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {fixed.length} {fixed.length === 1 ? 'parcelamento marcado' : 'parcelamentos marcados'} como conta fixa, fora do saldo.{' '}
            <button type="button" onClick={() => fixed.forEach(toggleFixedSeries)} className="-my-2 py-2 font-medium text-foreground underline-offset-2 hover:underline">
              Desfazer
            </button>
          </p>
        )}
        {!selecting && debt.count > LIMIT && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Mostrar menos' : `Ver todos (${debt.count})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
