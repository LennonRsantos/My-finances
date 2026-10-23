import { CalendarCheck, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/misc'
import { formatDateShort } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import { useUIStore } from '@/store/ui-store'
import type { DueAlerts as DueAlertsData, Transaction } from '@/types/finance'

const LIMIT = 5

type When = 'atrasada' | 'hoje' | 'em breve'

/**
 * Próximas contas numa lista só, na ordem em que precisam de atenção:
 * atrasadas, de hoje e as dos próximos dias. O resto fica no Calendário.
 */
export function DueAlerts({ alerts, days }: { alerts: DueAlertsData; days: number }) {
  const togglePaid = useFinanceStore((s) => s.togglePaid)
  const setView = useUIStore((s) => s.setView)
  const rows: { t: Transaction; when: When }[] = [
    ...alerts.overdue.map((t) => ({ t, when: 'atrasada' as const })),
    ...alerts.dueToday.map((t) => ({ t, when: 'hoje' as const })),
    ...alerts.dueSoon.map((t) => ({ t, when: 'em breve' as const })),
  ]
  const shown = rows.slice(0, LIMIT)
  const total = rows.reduce((a, r) => a + r.t.amount, 0)
  const whenText = (t: Transaction, when: When) =>
    when === 'atrasada' ? `Atrasada desde ${formatDateShort(t.dueDate)}` : when === 'hoje' ? 'Vence hoje' : `Vence ${formatDateShort(t.dueDate)}`

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Próximas contas</CardTitle>
          <CardDescription>
            {rows.length ? (
              <>
                {rows.length} {rows.length === 1 ? 'conta' : 'contas'} até {days} dias: <span className="whitespace-nowrap">{formatMoney(total)}</span>
              </>
            ) : (
              `Nada vencendo nos próximos ${days} dias`
            )}
          </CardDescription>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setView('calendario')}>
          Calendário
          <ChevronRight />
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="Tudo em dia" className="py-6" />
        ) : (
          <ul className="flex flex-col divide-y">
            {shown.map(({ t, when }) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.description}</p>
                  <p className={cn('text-xs', when === 'atrasada' ? 'text-expense' : when === 'hoje' ? 'text-warning' : 'text-muted-foreground')}>
                    {whenText(t, when)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(t.amount)}</span>
                <Button size="sm" variant="outline" onClick={() => togglePaid(t.id)} aria-label={`Marcar ${t.description} como pago`}>
                  Pagar
                </Button>
              </li>
            ))}
          </ul>
        )}
        {rows.length > LIMIT && (
          <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => setView('calendario')}>
            Mais {rows.length - LIMIT} no Calendário
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
