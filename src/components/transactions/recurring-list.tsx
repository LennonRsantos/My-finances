import { ChevronDown, Repeat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { categoryIconMap } from '@/lib/icons'
import { formatMoney } from '@/lib/money'
import { monthlyEquivalent } from '@/lib/recurring'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import type { RecurringCost, TransactionType } from '@/types/finance'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function scheduleLabel(rc: RecurringCost) {
  return rc.frequency === 'mensal' ? `Todo dia ${rc.dueDay}` : `Todo ano, ${rc.dueDay} de ${MONTHS[rc.dueMonth - 1]}`
}

/** Lista recolhível dos fixos ativos de um tipo, com opção de encerrar. */
export function RecurringList({ type }: { type: TransactionType }) {
  const { recurringCosts, categories, endRecurringCost } = useFinanceStore(
    useShallow((s) => ({ recurringCosts: s.recurringCosts, categories: s.categories, endRecurringCost: s.endRecurringCost })),
  )
  const [open, setOpen] = useState(false)
  const [ending, setEnding] = useState<RecurringCost | null>(null)

  const active = useMemo(
    () => recurringCosts.filter((r) => r.active && r.type === type).sort((a, b) => b.amount - a.amount),
    [recurringCosts, type],
  )
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const monthlyTotal = active.reduce((acc, r) => acc + monthlyEquivalent(r), 0)

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
          <p className="text-sm text-muted-foreground">{formatMoney(monthlyTotal)}/mês</p>
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
