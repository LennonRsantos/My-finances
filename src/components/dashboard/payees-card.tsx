import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/misc'
import { formatDateShort, formatMonthLabel } from '@/lib/dates'
import { payeeKey } from '@/lib/finance'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import type { PayeeBalance, YearMonth } from '@/types/finance'

/** Quanto falta enviar para cada pessoa, com os itens do mês. Usuário do app também vê. */
export function PayeesCard({ data, month, today }: { data: PayeeBalance[]; month: YearMonth; today: string }) {
  const togglePaid = useFinanceStore((s) => s.togglePaid)
  const [open, setOpen] = useState<string | null>(null)
  if (data.length === 0) return null

  const totalMonth = data.reduce((a, p) => a + p.dueThisMonth, 0)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>Você precisa enviar</CardTitle>
          <CardDescription>Até o fim de {formatMonthLabel(month).toLowerCase()}</CardDescription>
        </div>
        <span className="text-xl font-semibold tabular-nums tracking-[-0.01em]">{formatMoney(totalMonth)}</span>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y rounded-lg border">
          {data.map((p) => {
            const key = p.handle ? `@${p.handle}` : payeeKey(p.name)
            const expanded = open === key
            return (
              <li key={key}>
                <button
                  onClick={() => setOpen(expanded ? null : key)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted font-semibold text-foreground">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.overdueCount > 0 && <Badge tone="expense">{p.overdueCount} atrasado{p.overdueCount > 1 ? 's' : ''}</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.handle && <span className="text-info">@{p.handle} também vê · </span>}
                      {p.totalRemaining > p.dueThisMonth
                        ? `Total restante ${formatMoney(p.totalRemaining)}`
                        : `${p.items.length} ${p.items.length === 1 ? 'item' : 'itens'}`}
                    </span>
                  </span>
                  <span className={cn('font-semibold', p.dueThisMonth === 0 && 'text-muted-foreground')}>
                    {formatMoney(p.dueThisMonth)}
                  </span>
                  <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                </button>

                {expanded && (
                  <ul className="border-t bg-muted/40 px-3 py-1">
                    {p.items.length === 0 && (
                      <li className="py-2 text-sm text-muted-foreground">Nada a enviar neste mês.</li>
                    )}
                    {p.items.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{t.description}</span>
                          <span className={cn('text-xs', t.dueDate < today ? 'text-expense' : 'text-muted-foreground')}>
                            {formatDateShort(t.dueDate)}
                          </span>
                        </span>
                        <span className="text-sm font-medium">{formatMoney(t.amount)}</span>
                        <Button size="sm" variant="outline" onClick={() => togglePaid(t.id)} aria-label={`Marcar ${t.description} como enviado`}>
                          Enviado
                        </Button>
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
