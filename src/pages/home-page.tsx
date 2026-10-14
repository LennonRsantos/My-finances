import {
  Building2,
  Check,
  CheckCircle2,
  Droplet,
  Flame,
  House,
  KeyRound,
  Plus,
  Receipt,
  Repeat,
  TrendingDown,
  TrendingUp,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MonthSelector } from '@/components/dashboard/month-selector'
import { HomeDialogs, type HomeDialogState } from '@/components/home/home-dialogs'
import { RecurringRows } from '@/components/recurring/recurring-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, EmptyState, Progress, type Tone } from '@/components/ui/misc'
import { formatDateShort, formatMonthLabel, todayISO } from '@/lib/dates'
import { resolveStatus } from '@/lib/finance'
import { compareBills, HOME_CATEGORY_ID, homeMonth } from '@/lib/home'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { reminderStatus, type ReminderLevel } from '@/lib/vehicle'
import { useFinanceStore } from '@/store/finance-store'
import { useUIStore } from '@/store/ui-store'
import type { TransactionStatus } from '@/types/finance'
import { PageHeader } from '@/components/layout/page-header'

const billIcon: Record<string, LucideIcon> = {
  'sub-aluguel': KeyRound,
  'sub-condominio': Building2,
  'sub-energia': Zap,
  'sub-agua': Droplet,
  'sub-gas': Flame,
  'sub-internet': Wifi,
  'sub-iptu': Receipt,
  'sub-casa-manutencao': Wrench,
}
const iconFor = (id: string | null) => (id && billIcon[id]) || House

const statusTone: Record<TransactionStatus, Tone> = { pago: 'income', pendente: 'info', atrasado: 'expense' }
const statusLabel: Record<TransactionStatus, string> = { pago: 'Pago', pendente: 'A pagar', atrasado: 'Atrasado' }
const levelTone: Record<ReminderLevel, Tone> = { atrasado: 'expense', em_breve: 'warning', ok: 'income' }
const levelLabel: Record<ReminderLevel, string> = { atrasado: 'Atrasado', em_breve: 'Em breve', ok: 'Em dia' }
const levelColor: Record<ReminderLevel, string> = { atrasado: 'var(--expense)', em_breve: 'var(--warning)', ok: 'var(--income)' }

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: 'expense' | 'income'; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-lg font-semibold tabular-nums', tone === 'expense' && 'text-expense', tone === 'income' && 'text-income')}>{value}</span>
      {hint && <span className="text-xs text-expense">{hint}</span>}
    </Card>
  )
}

function BillsCard({ open }: { open: (d: HomeDialogState) => void }) {
  const { transactions, subcategories, togglePaid } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, subcategories: s.subcategories, togglePaid: s.togglePaid })),
  )
  const month = useUIStore((s) => s.selectedMonth)
  const edit = useUIStore((s) => s.setEditingTransaction)
  const today = todayISO()
  const data = homeMonth(transactions, month, today)
  const subName = (id: string | null) => subcategories.find((s) => s.id === id)?.name ?? 'Moradia'

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-5" />
            Contas de {formatMonthLabel(month).toLowerCase()}
          </CardTitle>
          <CardDescription>Toque numa conta para editar ou excluir.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => open({ kind: 'bill' })}>
          <Plus />
          Conta
        </Button>
      </CardHeader>
      <CardContent>
        {data.items.length === 0 ? (
          <EmptyState
            icon={House}
            title="Nenhuma conta neste mês"
            description="Aluguel, luz, água, internet... lance aqui e acompanhe o que falta pagar."
            className="py-6"
            action={
              <Button size="sm" onClick={() => open({ kind: 'bill' })}>
                <Plus />
                Lançar conta
              </Button>
            }
          />
        ) : (
          <ul className="divide-y">
            {data.items.map((t) => {
              const Icon = iconFor(t.subcategoryId)
              const status = resolveStatus(t, today)
              const paid = status === 'pago'
              return (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => edit(t.id)}
                    aria-label={`Editar ${t.description}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {t.recurringCostId && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Fixa" />}
                        <span className="line-clamp-2 min-w-0 break-words sm:line-clamp-1">{t.description}</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {subName(t.subcategoryId)} · vence {formatDateShort(t.dueDate)}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2 sm:hidden">
                        <span className="text-sm font-semibold tabular-nums">{formatMoney(t.amount)}</span>
                        <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>
                      </span>
                    </span>
                  </button>
                  <div className="hidden flex-col items-end gap-1 sm:flex">
                    <span className="text-sm font-semibold tabular-nums">{formatMoney(t.amount)}</span>
                    <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => togglePaid(t.id)}
                    aria-label={paid ? 'Desfazer pagamento' : 'Marcar como pago'}
                    className={paid ? 'text-income' : 'text-muted-foreground'}
                  >
                    <Check />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function CompareCard() {
  const { transactions, subcategories } = useFinanceStore(useShallow((s) => ({ transactions: s.transactions, subcategories: s.subcategories })))
  const month = useUIStore((s) => s.selectedMonth)
  const rows = compareBills(transactions, month)
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => Math.max(r.total, r.average ?? 0)))
  const subName = (id: string | null) => subcategories.find((s) => s.id === id)?.name ?? 'Moradia'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparado aos meses anteriores</CardTitle>
        <CardDescription>Cada conta contra a média dos últimos 3 meses.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {rows.map((r) => {
            const up = r.change !== null && r.change > 0.05
            const down = r.change !== null && r.change < -0.05
            return (
              <li key={r.subcategoryId ?? 'none'} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{subName(r.subcategoryId)}</span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    {r.change !== null && (
                      <span className={cn('flex items-center gap-0.5 text-xs', up ? 'text-expense' : down ? 'text-income' : 'text-muted-foreground')}>
                        {up ? <TrendingUp className="size-3.5" /> : down ? <TrendingDown className="size-3.5" /> : null}
                        {r.change > 0 ? '+' : ''}
                        {Math.round(r.change * 100)}%
                      </span>
                    )}
                    <span className="font-medium">{formatMoney(r.total)}</span>
                  </span>
                </div>
                <Progress value={max ? r.total / max : 0} color={up ? 'var(--expense)' : 'var(--info)'} label={`${subName(r.subcategoryId)}: ${formatMoney(r.total)}`} />
                <span className="text-xs text-muted-foreground">
                  {r.average !== null ? `Média: ${formatMoney(r.average)}` : 'Sem histórico nos 3 meses anteriores'}
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function FixedCard() {
  const recurring = useFinanceStore(
    useShallow((s) => s.recurringCosts.filter((r) => r.active && r.type === 'despesa' && r.categoryId === HOME_CATEGORY_ID)),
  )
  if (!recurring.length) return null
  const monthly = recurring.reduce((a, r) => a + (r.frequency === 'anual' ? Math.round(r.amount / 12) : r.amount), 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat className="size-5" />
          Contas fixas da casa
        </CardTitle>
        <CardDescription>Somam {formatMoney(monthly)} por mês. Toque numa conta para editar ou excluir.</CardDescription>
      </CardHeader>
      <CardContent>
        <RecurringRows items={recurring} />
      </CardContent>
    </Card>
  )
}

function MaintenanceCard({ open }: { open: (d: HomeDialogState) => void }) {
  const reminders = useFinanceStore(useShallow((s) => s.maintenance.filter((r) => r.vehicleId === null)))
  const today = todayISO()
  const rows = reminders.map((r) => ({ r, s: reminderStatus(r, 0, today) })).sort((a, b) => b.s.progress - a.s.progress)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="size-5" />
            Manutenção da casa
          </CardTitle>
          <CardDescription>Cuidados que se repetem. Reparos avulsos: use Conta &gt; Manutenção e reparos.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => open({ kind: 'reminder' })}>
          <Plus />
          Lembrete
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="Nenhum lembrete"
            description="Caixa d'água, filtro, ar-condicionado, dedetização... o app avisa antes de vencer."
            className="py-6"
            action={
              <Button size="sm" onClick={() => open({ kind: 'reminder' })}>
                <Plus />
                Criar lembrete
              </Button>
            }
          />
        ) : (
          <ul className="divide-y">
            {rows.map(({ r, s }) => (
              <li key={r.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => open({ kind: 'reminder', reminder: r })}
                    className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Editar ${r.name}`}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.name}</span>
                      <Badge tone={levelTone[s.level]}>{levelLabel[s.level]}</Badge>
                    </span>
                    {s.dueDate && (
                      <span className="block text-xs text-muted-foreground">
                        {(s.daysLeft ?? 0) >= 0 ? 'Próximo em' : 'Venceu em'} {formatDateShort(s.dueDate)}
                      </span>
                    )}
                  </button>
                  <Button size="sm" variant={s.level === 'ok' ? 'ghost' : 'outline'} onClick={() => open({ kind: 'complete', reminder: r })}>
                    <CheckCircle2 />
                    Feito
                  </Button>
                </div>
                <Progress value={s.progress} color={levelColor[s.level]} label={`${r.name}: ${Math.round(s.progress * 100)}% do intervalo`} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function HomePage() {
  const transactions = useFinanceStore((s) => s.transactions)
  const month = useUIStore((s) => s.selectedMonth)
  const [dialog, setDialog] = useState<HomeDialogState>(null)
  const data = homeMonth(transactions, month, todayISO())

  return (
    <>
      <PageHeader title="Casa" actions={<MonthSelector />} />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total do mês" value={formatMoney(data.total)} />
          <Stat label="Já pago" value={formatMoney(data.paid)} tone={data.paid > 0 ? 'income' : undefined} />
          <Stat label="Falta pagar" value={formatMoney(data.open)} hint={data.overdue > 0 ? `${formatMoney(data.overdue)} atrasado` : undefined} />
        </div>
        <BillsCard open={setDialog} />
        <CompareCard />
        <FixedCard />
        <MaintenanceCard open={setDialog} />
      </main>
      <HomeDialogs state={dialog} onClose={() => setDialog(null)} />
    </>
  )
}
