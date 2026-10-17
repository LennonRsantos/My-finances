import { Check, ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { formatDateShort, formatMonthLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { computeReceivables } from '@/lib/transfers'
import { cn } from '@/lib/utils'
import { useSharedStore } from '@/store/shared-store'
import type { ISODate, YearMonth } from '@/types/finance'

/**
 * Lado de quem recebe: "Lennon deve te enviar R$ X". Só leitura; quem marca
 * "Enviado" é quem deve, e aqui aparece o selo.
 */
export function ReceivablesCard({ month, today }: { month: YearMonth; today: ISODate }) {
  const incoming = useSharedStore((s) => s.incoming)
  const data = useMemo(() => computeReceivables(incoming, month, today), [incoming, month, today])
  const [open, setOpen] = useState<string | null>(null)
  if (data.length === 0) return null

  const totalMonth = data.reduce((a, p) => a + p.dueThisMonth, 0)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>Você vai receber</CardTitle>
          <CardDescription>Até o fim de {formatMonthLabel(month).toLowerCase()}</CardDescription>
        </div>
        <span className="text-xl font-semibold tabular-nums tracking-[-0.01em] text-income">{formatMoney(totalMonth)}</span>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y rounded-lg border">
          {data.map((p) => {
            const expanded = open === p.fromUid
            return (
              <li key={p.fromUid}>
                <button onClick={() => setOpen(expanded ? null : p.fromUid)} aria-expanded={expanded} className="flex w-full items-center gap-3 p-3 text-left">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted font-semibold text-foreground">
                    {p.name.replace(/^@/, '').charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">
                      <span className="font-medium">{p.name}</span>
                      {p.totalRemaining === 0 ? ' enviou ' : ' deve te enviar '}
                      <span className="font-semibold tabular-nums">
                        {formatMoney(
                          p.totalRemaining === 0
                            ? p.items.reduce((a, t) => a + t.amount, 0)
                            : p.dueThisMonth || p.totalRemaining,
                        )}
                      </span>
                      {p.totalRemaining > 0 && p.dueThisMonth === 0 && ' nos próximos meses'}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {p.handle && <span>@{p.handle}</span>}
                      {p.dueThisMonth > 0 && p.totalRemaining > p.dueThisMonth && <span>Total restante {formatMoney(p.totalRemaining)}</span>}
                      {p.overdueCount > 0 && <Badge tone="expense">{p.overdueCount} atrasado{p.overdueCount > 1 ? 's' : ''}</Badge>}
                    </span>
                  </span>
                  <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                </button>

                {expanded && (
                  <ul className="border-t bg-muted/40 px-3 py-1">
                    {p.items.length === 0 && <li className="py-2 text-sm text-muted-foreground">Nada para este mês.</li>}
                    {p.items.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{t.description}</span>
                          <span className={cn('text-xs', t.status === 'PENDING' && t.dueDate < today ? 'text-expense' : 'text-muted-foreground')}>
                            {formatDateShort(t.dueDate)}
                          </span>
                        </span>
                        <span className={cn('text-sm font-medium tabular-nums', t.status === 'SENT' && 'text-muted-foreground line-through')}>
                          {formatMoney(t.amount)}
                        </span>
                        {t.status === 'SENT' && (
                          <Badge tone="income">
                            <Check className="size-3" /> Enviado
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
