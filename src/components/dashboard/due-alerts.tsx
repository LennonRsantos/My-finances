import { CalendarCheck, CalendarClock, CircleAlert, Clock } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, type Tone } from '@/components/ui/misc'
import { formatDateShort } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import type { DueAlerts as DueAlertsData, Transaction } from '@/types/finance'

type Bucket = keyof DueAlertsData

const buckets: { key: Bucket; label: string; tone: Tone; icon: typeof Clock }[] = [
  { key: 'overdue', label: 'Atrasadas', tone: 'expense', icon: CircleAlert },
  { key: 'dueToday', label: 'Hoje', tone: 'warning', icon: Clock },
  { key: 'dueSoon', label: '7 dias', tone: 'info', icon: CalendarClock },
]

const activeTone: Record<Tone, string> = {
  expense: 'border-expense/40 bg-expense-soft text-expense',
  warning: 'border-warning/40 bg-warning-soft text-warning',
  info: 'border-info/40 bg-info-soft text-info',
  income: '',
  neutral: '',
}

export function DueAlerts({ alerts }: { alerts: DueAlertsData }) {
  const firstWithItems = buckets.find((b) => alerts[b.key].length > 0)?.key ?? 'overdue'
  const [active, setActive] = useState<Bucket>(firstWithItems)
  const togglePaid = useFinanceStore((s) => s.togglePaid)
  const items = alerts[active]
  const current = buckets.find((b) => b.key === active)!

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertas de vencimento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div role="tablist" className="grid grid-cols-3 gap-2">
          {buckets.map(({ key, label, tone, icon: Icon }) => (
            <button
              key={key}
              role="tab"
              aria-selected={active === key}
              onClick={() => setActive(key)}
              className={cn(
                'flex min-h-16 flex-col items-start justify-between rounded-xl border p-2.5 text-left transition-colors',
                active === key ? activeTone[tone] : 'hover:bg-muted',
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Icon className="size-3.5" />
                {label}
              </span>
              <span className="text-lg font-semibold text-foreground">{alerts[key].length}</span>
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="Nada por aqui" description={`Nenhuma conta em "${current.label}".`} className="py-6" />
        ) : (
          <ul className="flex max-h-72 flex-col divide-y overflow-y-auto">
            {items.map((t) => (
              <AlertRow key={t.id} transaction={t} tone={current.tone} onPay={() => togglePaid(t.id)} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function AlertRow({ transaction: t, tone, onPay }: { transaction: Transaction; tone: Tone; onPay: () => void }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{t.description}</p>
        <p className={cn('text-xs', tone === 'expense' ? 'text-expense' : 'text-muted-foreground')}>
          Vence {formatDateShort(t.dueDate)}
        </p>
      </div>
      <span className="text-sm font-semibold">{formatMoney(t.amount)}</span>
      <Button size="sm" variant="outline" onClick={onPay} aria-label={`Marcar ${t.description} como pago`}>
        Pagar
      </Button>
    </li>
  )
}
