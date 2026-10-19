import { ChevronDown, Repeat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { categoryIconMap } from '@/lib/icons'
import { formatMoney } from '@/lib/money'
import { monthOf } from '@/lib/dates'
import { monthlyEquivalent, occursIn, recurringHorizon } from '@/lib/recurring'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import type { RecurringCost, Transaction, TransactionType, YearMonth } from '@/types/finance'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function scheduleLabel(rc: RecurringCost) {
  return rc.frequency === 'mensal' ? `Todo dia ${rc.dueDay}` : `Todo ano, ${rc.dueDay} de ${MONTHS[rc.dueMonth - 1]}`
}

type MonthState = { kind: 'lancado'; t: Transaction } | { kind: 'nao_vence' } | { kind: 'futuro' } | { kind: 'faltando' }

/** O fixo neste mês: lançado, não vence (anual de outro mês, começa depois) ou sem lançamento. */
function stateIn(rc: RecurringCost, month: YearMonth, transactions: Transaction[]): MonthState {
  const t = transactions.find((x) => x.recurringCostId === rc.id && monthOf(x.dueDate) === month)
  if (t) return { kind: 'lancado', t }
  if (!occursIn(rc, month) || month < monthOf(rc.startDate) || (rc.endDate && month > monthOf(rc.endDate))) return { kind: 'nao_vence' }
  if (month > recurringHorizon()) return { kind: 'futuro' }
  return { kind: 'faltando' }
}

/** Lista recolhível dos fixos ativos de um tipo, com opção de encerrar. */
export function RecurringList({ type, month }: { type: TransactionType; month: YearMonth }) {
  const { recurringCosts, categories, endRecurringCost, transactions, restoreOccurrence } = useFinanceStore(
    useShallow((s) => ({
      recurringCosts: s.recurringCosts,
      categories: s.categories,
      endRecurringCost: s.endRecurringCost,
      transactions: s.transactions,
      restoreOccurrence: s.restoreOccurrence,
    })),
  )
  const [open, setOpen] = useState(false)
  const [ending, setEnding] = useState<RecurringCost | null>(null)

  const active = useMemo(
    () => recurringCosts.filter((r) => r.active && r.type === type).sort((a, b) => b.amount - a.amount),
    [recurringCosts, type],
  )
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const monthlyTotal = active.reduce((acc, r) => acc + monthlyEquivalent(r), 0)
  const states = new Map(active.map((rc) => [rc.id, stateIn(rc, month, transactions)]))
  const inMonth = [...states.values()].reduce((a, st) => a + (st.kind === 'lancado' ? st.t.amount : 0), 0)
  const missing = [...states.values()].filter((st) => st.kind === 'faltando').length

  if (active.length === 0) return null

  return (
    <Card>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="grid size-10 place-items-center rounded-xl bg-info-soft text-info">
          <Repeat className="size-4" />
        </span>
        <div className="flex-1">
          <p className="font-medium">
            {type === 'receita' ? 'Receitas fixas' : 'Gastos fixos'} ({active.length})
          </p>
          <p className="text-sm text-muted-foreground">
            {formatMoney(inMonth)} neste mês
            {monthlyTotal !== inMonth && ` · média ${formatMoney(monthlyTotal)}/mês`}
            {missing > 0 && <span className="text-warning"> · {missing} sem lançamento</span>}
          </p>
        </div>
        <ChevronDown className={cn('size-5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <ul className="divide-y border-t">
          {active.map((rc) => {
            const cat = categoryById.get(rc.categoryId)
            const Icon = cat ? categoryIconMap[cat.icon] : Repeat
            return (
              <li key={rc.id} className="flex items-center gap-3 p-3 sm:px-4">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl text-white"
                  style={{ background: cat?.color ?? 'var(--muted-foreground)' }}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{rc.description}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {scheduleLabel(rc)} · {cat?.name ?? 'Sem categoria'}
                  </p>
                  {(() => {
                    const st = states.get(rc.id)!
                    if (st.kind === 'lancado') return null
                    if (st.kind === 'faltando')
                      return (
                        <p className="text-xs text-warning">
                          Sem lançamento neste mês.{' '}
                          <button type="button" onClick={() => restoreOccurrence(rc.id, month)} className="font-medium underline underline-offset-2">
                            Lançar
                          </button>
                        </p>
                      )
                    return <p className="text-xs text-muted-foreground">{st.kind === 'futuro' ? 'Entra quando o mês chegar perto' : 'Não vence neste mês'}</p>
                  })()}
                </div>
                <span className={cn('text-sm font-semibold', rc.type === 'receita' && 'text-income')}>
                  {rc.type === 'receita' ? '+' : '−'} {formatMoney(rc.amount)}
                </span>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-expense" onClick={() => setEnding(rc)}>
                  Encerrar
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={!!ending} onOpenChange={(o) => !o && setEnding(null)}>
        <DialogContent aria-describedby="end-rc-desc">
          <DialogHeader>
            <DialogTitle>Encerrar "{ending?.description}"?</DialogTitle>
            <DialogDescription id="end-rc-desc">
              Para de lançar nos próximos meses e apaga os lançamentos futuros ainda pendentes. O histórico pago continua.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <DialogClose asChild>
              <Button variant="outline" className="flex-1">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              variant="expense"
              className="flex-1"
              onClick={() => {
                if (ending) endRecurringCost(ending.id)
                setEnding(null)
              }}
            >
              Encerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
