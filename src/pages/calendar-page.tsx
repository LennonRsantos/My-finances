import { CalendarCheck, Check, Inbox, Layers, Plus, Repeat } from 'lucide-react'
import { format, getDay, getDaysInMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MonthSelector } from '@/components/dashboard/month-selector'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge, EmptyState, type Tone } from '@/components/ui/misc'
import { dateInMonth, monthOf, parseDate, todayISO, yearMonthToDate } from '@/lib/dates'
import { resolveStatus, transactionsInMonth } from '@/lib/finance'
import { categoryIconMap } from '@/lib/icons'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import { useUIStore } from '@/store/ui-store'
import type { ISODate, Transaction, TransactionStatus } from '@/types/finance'
import { PageHeader } from '@/components/layout/page-header'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const statusTone: Record<TransactionStatus, Tone> = { pago: 'income', pendente: 'info', atrasado: 'expense' }
const statusDot: Record<TransactionStatus, string> = { pago: 'bg-income', pendente: 'bg-info', atrasado: 'bg-expense' }
const statusLabels: Record<TransactionStatus, string> = { pago: 'Pago', pendente: 'A vencer', atrasado: 'Atrasado' }
const STATUS_ORDER: TransactionStatus[] = ['atrasado', 'pendente', 'pago']

interface DayInfo {
  items: Transaction[]
  statuses: Set<TransactionStatus>
  /** Despesas não pagas do dia */
  open: number
}

export function CalendarPage() {
  const { transactions, categories, togglePaid } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, categories: s.categories, togglePaid: s.togglePaid })),
  )
  const month = useUIStore((s) => s.selectedMonth)
  const edit = useUIStore((s) => s.setEditingTransaction)
  const openForm = useUIStore((s) => s.setTransactionDialogOpen)
  const today = todayISO()

  const days = useMemo(() => {
    const map = new Map<ISODate, DayInfo>()
    for (const t of transactionsInMonth(transactions, month)) {
      const info = map.get(t.dueDate) ?? { items: [], statuses: new Set(), open: 0 }
      const status = resolveStatus(t, today)
      info.items.push(t)
      info.statuses.add(status)
      if (t.type === 'despesa' && status !== 'pago') info.open += t.amount
      map.set(t.dueDate, info)
    }
    return map
  }, [transactions, month, today])

  const summary = useMemo(() => {
    const acc: Record<TransactionStatus, { count: number; total: number }> = {
      atrasado: { count: 0, total: 0 },
      pendente: { count: 0, total: 0 },
      pago: { count: 0, total: 0 },
    }
    for (const info of days.values())
      for (const t of info.items) {
        if (t.type !== 'despesa') continue
        const s = resolveStatus(t, today)
        acc[s].count++
        acc[s].total += t.amount
      }
    return acc
  }, [days, today])

  // Dia aberto: o escolhido, ou hoje quando o mês é o atual, ou o primeiro com lançamentos.
  const [picked, setPicked] = useState<ISODate | null>(null)
  const selected: ISODate =
    picked && monthOf(picked) === month
      ? picked
      : monthOf(today) === month
        ? today
        : ([...days.keys()].sort()[0] ?? dateInMonth(month, 1))

  const first = yearMonthToDate(month)
  const leading = getDay(first)
  const total = getDaysInMonth(first)
  const cells: (ISODate | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: total }, (_, i) => dateInMonth(month, i + 1)),
  ]
  while (cells.length % 7) cells.push(null)

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const selectedItems = [...(days.get(selected)?.items ?? [])].sort(
    (a, b) => STATUS_ORDER.indexOf(resolveStatus(a, today)) - STATUS_ORDER.indexOf(resolveStatus(b, today)),
  )
  const selectedLabel = format(parseDate(selected), "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <>
      <PageHeader title="Calendário" actions={<MonthSelector />} />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <div className="grid grid-cols-3 gap-3">
          {STATUS_ORDER.map((s) => (
            <Card key={s} className="flex flex-col gap-1 p-3">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('size-2 rounded-full', statusDot[s])} />
                {statusLabels[s]} ({summary[s].count})
              </span>
              <span className={cn('font-semibold', s === 'atrasado' && summary[s].total > 0 && 'text-expense')}>
                {formatMoney(summary[s].total)}
              </span>
            </Card>
          ))}
        </div>

        <Card className="p-2 sm:p-3">
          <div className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div role="grid" aria-label="Dias do mês" className="grid grid-cols-7 gap-1">
            {cells.map((date, i) => {
              if (!date) return <span key={`empty-${i}`} aria-hidden />
              const info = days.get(date)
              const isToday = date === today
              const isSelected = date === selected
              const day = Number(date.slice(8))
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setPicked(date)}
                  aria-pressed={isSelected}
                  aria-label={`${day}${info ? `, ${info.items.length} lançamento${info.items.length > 1 ? 's' : ''}` : ''}`}
                  className={cn(
                    'flex min-h-14 flex-col items-center gap-1 rounded-xl border border-transparent p-1 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:min-h-20 sm:items-start sm:p-2',
                    isSelected && 'border-primary bg-muted',
                    info?.statuses.has('atrasado') && !isSelected && 'bg-expense-soft/60',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-7 place-items-center rounded-full text-xs font-medium',
                      isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {day}
                  </span>
                  {info && (
                    <>
                      <span className="flex gap-0.5">
                        {STATUS_ORDER.filter((s) => info.statuses.has(s)).map((s) => (
                          <span key={s} className={cn('size-1.5 rounded-full', statusDot[s])} />
                        ))}
                      </span>
                      {info.open > 0 && (
                        <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                          {formatMoney(info.open)}
                        </span>
                      )}
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </Card>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold first-letter:uppercase">{selectedLabel}</h2>
            <Button variant="ghost" size="sm" onClick={() => openForm(true, 'despesa')}>
              <Plus />
              Novo
            </Button>
          </div>
          <Card>
            {selectedItems.length === 0 ? (
              <EmptyState icon={CalendarCheck} title="Nada vence neste dia" />
            ) : (
              <ul className="divide-y">
                {selectedItems.map((t) => {
                  const cat = categoryById.get(t.categoryId)
                  const Icon = cat ? categoryIconMap[cat.icon] : Inbox
                  const status = resolveStatus(t, today)
                  const paid = status === 'pago'
                  const amountAndStatus = (
                    <>
                      <span className={cn('text-sm font-semibold tabular-nums', t.type === 'receita' && 'text-income')}>
                        {t.type === 'receita' ? '+' : '−'} {formatMoney(t.amount)}
                      </span>
                      <Badge tone={statusTone[status]}>{paid && t.type === 'receita' ? 'Recebido' : statusLabels[status]}</Badge>
                    </>
                  )
                  return (
                    <li key={t.id} className="flex items-center gap-3 p-3 sm:p-4">
                      <button
                        type="button"
                        onClick={() => edit(t.id)}
                        aria-label={`Editar ${t.description}`}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          className="grid size-10 shrink-0 place-items-center rounded-xl text-white"
                          style={{ background: cat?.color ?? 'var(--muted-foreground)' }}
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-start gap-1.5 text-sm font-medium">
                            {t.installment && <Layers className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Parcela" />}
                            {t.recurringCostId && <Repeat className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Fixo" />}
                            <span className="line-clamp-2 min-w-0 break-words sm:line-clamp-1">{t.description}</span>
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {cat?.name ?? 'Sem categoria'}
                            {t.payTo && <> · para {t.payTo}</>}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">{amountAndStatus}</div>
                        </div>
                      </button>
                      <div className="hidden flex-col items-end gap-1 sm:flex">{amountAndStatus}</div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => togglePaid(t.id)}
                        aria-label={paid ? 'Desfazer' : t.type === 'receita' ? 'Marcar como recebido' : 'Marcar como pago'}
                        className={paid ? 'text-income' : 'text-muted-foreground'}
                      >
                        <Check />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </section>
      </main>
    </>
  )
}
