import {
  Building2,
  Check,
  ChevronRight,
  CheckCircle2,
  Droplet,
  Flame,
  House,
  KeyRound,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  Repeat,
  ShoppingBasket,
  TrendingDown,
  TrendingUp,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MonthSelector } from '@/components/dashboard/month-selector'
import { HomeDialogs, type HomeDialogState } from '@/components/home/home-dialogs'
import { RecurringDialog, RecurringRows } from '@/components/recurring/recurring-dialog'
import { SharedBadge } from '@/components/shared/share-fields'
import { SharedBillsCard } from '@/components/shared/shared-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, EmptyState, Progress, type Tone } from '@/components/ui/misc'
import { formatDateShort, formatMonthLabel, todayISO } from '@/lib/dates'
import { resolveStatus } from '@/lib/finance'
import { compareBills, HOME_CATEGORY_ID, homeMonth, housingStatus, purchaseSummary, type SharedHousing } from '@/lib/home'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { reminderStatus, type ReminderLevel } from '@/lib/vehicle'
import { useFinanceStore } from '@/store/finance-store'
import { useUIStore } from '@/store/ui-store'
import type { RecurringCost, TransactionStatus } from '@/types/finance'
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
const levelTone: Record<ReminderLevel, Tone> = { atrasado: 'expense', em_breve: 'warning', ok: 'income' }
const levelLabel: Record<ReminderLevel, string> = { atrasado: 'Atrasado', em_breve: 'Em breve', ok: 'Em dia' }
const levelColor: Record<ReminderLevel, string> = { atrasado: 'var(--expense)', em_breve: 'var(--warning)', ok: 'var(--income)' }

/** Topo da página: quanto a casa custa no mês e como está o pagamento, numa barra só. */
function MonthOverview() {
  const transactions = useFinanceStore((s) => s.transactions)
  const month = useUIStore((s) => s.selectedMonth)
  const data = homeMonth(transactions, month, todayISO())
  const pending = data.open - data.overdue
  const pct = (v: number) => (data.total ? `${(v / data.total) * 100}%` : '0%')
  const parts = [
    { key: 'pago', label: 'Pago', value: data.paid, color: 'var(--income)' },
    { key: 'pendente', label: 'A pagar', value: pending, color: 'var(--info)' },
    { key: 'atrasado', label: 'Atrasado', value: data.overdue, color: 'var(--expense)' },
  ]

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-muted-foreground">Casa em {formatMonthLabel(month).toLowerCase()}</span>
        <span className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{formatMoney(data.total)}</span>
        {data.total === 0 && <span className="text-sm text-muted-foreground">Nenhum gasto da casa lançado neste mês.</span>}
      </div>
      <div
        role="img"
        aria-label={parts.map((p) => `${p.label}: ${formatMoney(p.value)}`).join(', ')}
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
      >
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span key={p.key} className="h-full transition-[width] duration-500" style={{ width: pct(p.value), background: p.color }} />
          ))}
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.key} className="flex min-w-0 flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
              {p.label}
            </dt>
            <dd className={cn('truncate text-sm font-semibold tabular-nums sm:text-base', p.key === 'atrasado' && p.value > 0 && 'text-expense')}>
              {formatMoney(p.value)}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

const billGroups: { status: TransactionStatus; label: string }[] = [
  { status: 'atrasado', label: 'Atrasadas' },
  { status: 'pendente', label: 'A pagar' },
  { status: 'pago', label: 'Pagas' },
]

function BillsCard({ open }: { open: (d: HomeDialogState) => void }) {
  const { transactions, subcategories, togglePaid } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, subcategories: s.subcategories, togglePaid: s.togglePaid })),
  )
  const month = useUIStore((s) => s.selectedMonth)
  const edit = useUIStore((s) => s.setEditingTransaction)
  const today = todayISO()
  const data = homeMonth(transactions, month, today, 'contas')
  const subName = (id: string | null) => subcategories.find((s) => s.id === id)?.name ?? 'Moradia'
  const groups = billGroups
    .map((g) => ({ ...g, items: data.items.filter((t) => resolveStatus(t, today) === g.status) }))
    .filter((g) => g.items.length > 0)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-5" />
            Contas do mês
          </CardTitle>
          <CardDescription>Toque numa conta para editar. O botão ao lado marca como paga.</CardDescription>
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
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <section key={g.status} aria-label={g.label}>
                <h4 className="flex items-baseline justify-between gap-2 pb-1 text-xs font-medium text-muted-foreground">
                  <span className={cn(g.status === 'atrasado' && 'text-expense')}>
                    {g.label} ({g.items.length})
                  </span>
                  <span className="tabular-nums">{formatMoney(g.items.reduce((a, t) => a + t.amount, 0))}</span>
                </h4>
                <ul className="divide-y">
                  {g.items.map((t) => {
                    const Icon = iconFor(t.subcategoryId)
                    const paid = g.status === 'pago'
                    return (
                      <li key={t.id} className="flex items-center gap-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => edit(t.id)}
                          aria-label={`Editar ${t.description}`}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span
                            className={cn(
                              'grid size-10 shrink-0 place-items-center rounded-xl',
                              g.status === 'atrasado' ? 'bg-expense-soft text-expense' : 'bg-muted text-muted-foreground',
                            )}
                          >
                            <Icon className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                              {t.recurringCostId && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Fixa" />}
                              <span className={cn('line-clamp-2 min-w-0 break-words sm:line-clamp-1', paid && 'text-muted-foreground')}>{t.description}</span>
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {subName(t.subcategoryId) !== t.description && <>{subName(t.subcategoryId)} · </>}
                              {paid ? 'venceu' : 'vence'} {formatDateShort(t.dueDate)}
                            </span>
                            {t.sharedBillId && (
                              <span className="mt-1 flex">
                                <SharedBadge billId={t.sharedBillId} fallback={t.sharedWith} />
                              </span>
                            )}
                          </span>
                          <span className={cn('shrink-0 text-sm font-semibold tabular-nums', paid && 'text-muted-foreground')}>{formatMoney(t.amount)}</span>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => togglePaid(t.id)}
                          aria-label={paid ? `Desfazer pagamento de ${t.description}` : `Marcar ${t.description} como paga`}
                          aria-pressed={paid}
                          className={cn('shrink-0 rounded-full', paid ? 'bg-income-soft text-income hover:bg-income-soft' : 'border text-muted-foreground')}
                        >
                          <Check />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
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
  const anyHistory = rows.some((r) => r.average !== null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparado aos meses anteriores</CardTitle>
        <CardDescription>
          {anyHistory ? 'Cada conta contra a média dos últimos 3 meses.' : 'Ainda sem histórico: a comparação aparece a partir do próximo mês.'}
        </CardDescription>
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
                {r.average !== null ? (
                  <span className="text-xs text-muted-foreground">Média: {formatMoney(r.average)}</span>
                ) : (
                  anyHistory && <span className="text-xs text-muted-foreground">Sem histórico nos 3 meses anteriores</span>
                )}
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

// ---------------------------------------------------------------------------
// Sua moradia: aluguel, financiamento, IPTU
// ---------------------------------------------------------------------------

function HousingRow({
  icon: Icon,
  title,
  value,
  detail,
  badge,
  action,
}: {
  icon: LucideIcon
  title: string
  value?: string
  detail: string
  badge?: ReactNode
  action: ReactNode
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          {title}
          {value && <span className="tabular-nums"> · {value}</span>}
        </span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
        {badge && <span className="mt-1 flex">{badge}</span>}
      </span>
      {action}
    </li>
  )
}

function HousingCard({ open }: { open: (d: HomeDialogState) => void }) {
  const { recurringCosts, installments, transactions } = useFinanceStore(
    useShallow((s) => ({ recurringCosts: s.recurringCosts, installments: s.installments, transactions: s.transactions })),
  )
  const edit = useUIStore((s) => s.setEditingTransaction)
  const [editing, setEditing] = useState<RecurringCost | null>(null)
  const h = housingStatus(recurringCosts, installments, transactions)
  const nextOf = (installmentId: string) =>
    transactions
      .filter((t) => t.installment?.installmentId === installmentId && t.status !== 'pago')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const add = (kind: 'rent' | 'financing' | 'iptu') => (
    <Button size="sm" variant="outline" onClick={() => open({ kind })}>
      <Plus />
      Adicionar
    </Button>
  )
  const editButton = (label: string, onClick: () => void) => (
    <Button size="icon" variant="ghost" aria-label={label} onClick={onClick}>
      <Pencil />
    </Button>
  )
  const iptuNext = h.iptu.installment ? nextOf(h.iptu.installment.id) : null
  const { rent: sharedRent, financing: sharedFinancing, iptu: sharedIptu } = h.shared
  const sharedDetail = (sh: SharedHousing, unit: string) => `sua parte · faltam ${sh.remaining} ${unit} · próxima ${formatDateShort(sh.next.dueDate)}`
  const sharedBadge = (sh: SharedHousing | null) => (sh ? <SharedBadge billId={sh.billId} fallback={sh.next.sharedWith} /> : undefined)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <House className="size-5" />
          Sua moradia
        </CardTitle>
        <CardDescription>Preencha só o que você paga. Casa própria quitada não precisa de aluguel nem financiamento.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          <HousingRow
            icon={KeyRound}
            title="Aluguel"
            value={h.rent ? formatMoney(h.rent.amount) : sharedRent ? formatMoney(sharedRent.next.amount) : undefined}
            detail={h.rent ? `todo dia ${h.rent.dueDay}` : sharedRent ? sharedDetail(sharedRent, 'meses') : 'Não cadastrado'}
            badge={h.rent ? undefined : sharedBadge(sharedRent)}
            action={
              h.rent
                ? editButton('Editar aluguel', () => setEditing(h.rent))
                : sharedRent
                  ? editButton('Editar próximo aluguel', () => edit(sharedRent.next.id))
                  : add('rent')
            }
          />
          <HousingRow
            icon={Landmark}
            title="Financiamento"
            value={h.financing ? formatMoney(h.financing.monthly) : sharedFinancing ? formatMoney(sharedFinancing.next.amount) : undefined}
            detail={
              h.financing
                ? `faltam ${h.financing.remaining} parcelas${h.financing.nextDue ? ` · próxima ${formatDateShort(h.financing.nextDue)}` : ''}`
                : sharedFinancing
                  ? sharedDetail(sharedFinancing, 'parcelas')
                  : 'Não cadastrado'
            }
            badge={h.financing ? undefined : sharedBadge(sharedFinancing)}
            action={
              h.financing
                ? editButton('Editar próxima parcela do financiamento', () => {
                    const next = nextOf(h.financing!.installment.id)
                    if (next) edit(next.id)
                  })
                : sharedFinancing
                  ? editButton('Editar próxima parcela do financiamento', () => edit(sharedFinancing.next.id))
                  : add('financing')
            }
          />
          <HousingRow
            icon={Receipt}
            title="IPTU"
            value={
              h.iptu.recurring
                ? `${formatMoney(h.iptu.recurring.amount)}/ano`
                : h.iptu.installment
                  ? `${formatMoney(h.iptu.installment.totalAmount)}/ano`
                  : sharedIptu
                    ? formatMoney(sharedIptu.next.amount)
                    : undefined
            }
            detail={
              h.iptu.recurring
                ? `à vista, todo ano em ${String(h.iptu.recurring.dueDay).padStart(2, '0')}/${String(h.iptu.recurring.frequency === 'anual' ? h.iptu.recurring.dueMonth : 1).padStart(2, '0')}`
                : h.iptu.installment
                  ? `${h.iptu.installment.totalInstallments} cotas${iptuNext ? ` · próxima ${formatDateShort(iptuNext.dueDate)}` : ''}`
                  : sharedIptu
                    ? sharedDetail(sharedIptu, 'cotas')
                    : 'Não cadastrado'
            }
            badge={h.iptu.recurring || h.iptu.installment ? undefined : sharedBadge(sharedIptu)}
            action={
              h.iptu.recurring
                ? editButton('Editar IPTU', () => setEditing(h.iptu.recurring))
                : h.iptu.installment
                  ? editButton('Editar próxima cota do IPTU', () => iptuNext && edit(iptuNext.id))
                  : sharedIptu
                    ? editButton('Editar próxima cota do IPTU', () => edit(sharedIptu.next.id))
                    : add('iptu')
            }
          />
        </ul>
        {h.financing && (
          <p className="pt-2 text-xs text-muted-foreground">
            O lápis do financiamento abre a próxima parcela. Para mudar todas, edite e escolha “Este e próximos meses”.
          </p>
        )}
      </CardContent>
      <RecurringDialog rc={editing} onClose={() => setEditing(null)} />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Compras da casa
// ---------------------------------------------------------------------------

function PurchasesCard({ open }: { open: (d: HomeDialogState) => void }) {
  const { transactions, subcategories } = useFinanceStore(useShallow((s) => ({ transactions: s.transactions, subcategories: s.subcategories })))
  const month = useUIStore((s) => s.selectedMonth)
  const edit = useUIStore((s) => s.setEditingTransaction)
  const [showAll, setShowAll] = useState(false)
  const p = purchaseSummary(transactions, month)
  const subName = (id: string | null) => subcategories.find((x) => x.id === id)?.name ?? 'Casa'
  const list = showAll ? p.items : p.items.slice(0, 6)
  const max = p.bySubcategory[0]?.total ?? 0

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <ShoppingBasket className="size-5" />
            Compras da casa
          </CardTitle>
          <CardDescription>Limpeza, utensílios, eletrodomésticos, móveis e reparos. Só o que é da casa, não pessoal.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => open({ kind: 'purchase' })}>
          <Plus />
          Compra
        </Button>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ['Neste mês', p.thisMonth],
                ['Média por mês', p.monthlyAverage],
                ['Últimos 12 meses', p.year],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5 rounded-xl bg-muted px-2 py-2.5">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-sm font-semibold tabular-nums">{formatMoney(value)}</span>
              </div>
            ))}
          </div>

          {p.bySubcategory.length > 0 && (
            <ul className="flex flex-col gap-3" aria-label="Compras por tipo nos últimos 12 meses">
              {p.bySubcategory.map((s) => (
                <li key={s.subcategoryId} className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{subName(s.subcategoryId)}</span>
                    <span className="shrink-0 tabular-nums">
                      {formatMoney(s.total)} <span className="text-muted-foreground">· {formatMoney(Math.round(s.total / 12))}/mês</span>
                    </span>
                  </div>
                  <Progress value={max ? s.total / max : 0} color="var(--info)" label={`${subName(s.subcategoryId)}: ${formatMoney(s.total)} em 12 meses`} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col">
          <h4 className="pb-1 text-xs font-medium text-muted-foreground">Últimas compras</h4>
          {p.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma compra para a casa ainda.</p>
          ) : (
            <ul className="divide-y">
              {list.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => edit(t.id)}
                    aria-label={`Editar compra ${t.description}`}
                    className="flex w-full items-center gap-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {t.recurringCostId && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Repete" />}
                        <span className="truncate">{t.description}</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatDateShort(t.dueDate)} · {subName(t.subcategoryId)}
                      </span>
                      {t.sharedBillId && (
                        <span className="mt-1 flex">
                          <SharedBadge billId={t.sharedBillId} fallback={t.sharedWith} />
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(t.amount)}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {p.items.length > 6 && (
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Mostrar menos' : `Ver todas (${p.items.length})`}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

type HomeTab = 'contas' | 'moradia' | 'compras' | 'manutencao'

export function HomePage() {
  const { transactions, maintenance } = useFinanceStore(useShallow((s) => ({ transactions: s.transactions, maintenance: s.maintenance })))
  const month = useUIStore((s) => s.selectedMonth)
  const [dialog, setDialog] = useState<HomeDialogState>(null)
  const [tab, setTab] = useState<HomeTab>('contas')
  const today = todayISO()
  // Contadores nas abas: só o que pede ação.
  const overdue = homeMonth(transactions, month, today, 'contas').items.filter((t) => resolveStatus(t, today) === 'atrasado').length
  const careDue = maintenance.filter((r) => r.vehicleId === null && reminderStatus(r, 0, today).level !== 'ok').length
  const tabs: { key: HomeTab; label: string; count?: number }[] = [
    { key: 'contas', label: 'Contas', count: overdue },
    { key: 'moradia', label: 'Moradia' },
    { key: 'compras', label: 'Compras' },
    { key: 'manutencao', label: 'Manutenção', count: careDue },
  ]

  return (
    <>
      <PageHeader title="Casa" actions={<MonthSelector />} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
        <MonthOverview />

        <div
          role="tablist"
          aria-label="Seções da casa"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:rounded-xl sm:bg-muted sm:p-1 sm:px-1"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`home-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls="home-tabpanel"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:rounded-lg sm:border-0',
                tab === t.key ? 'border-foreground bg-foreground text-background sm:bg-card sm:text-foreground sm:shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t.label}
              {!!t.count && (
                <span
                  className="grid min-w-5 place-items-center rounded-full bg-expense px-1 text-[11px] leading-5 font-semibold text-white"
                  aria-label={`${t.count} pendentes`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div id="home-tabpanel" role="tabpanel" aria-labelledby={`home-tab-${tab}`} className="flex flex-col gap-4">
          {tab === 'contas' && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
              <BillsCard open={setDialog} />
              <div className="flex flex-col gap-4">
                <CompareCard />
                <FixedCard />
              </div>
            </div>
          )}
          {tab === 'moradia' && (
            <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
              <HousingCard open={setDialog} />
              <SharedBillsCard
                filter={(b) => b.categoryId === HOME_CATEGORY_ID}
                title="Contas da casa divididas"
                description="Aguardando: a pessoa ainda não aceitou. Aceita: as parcelas já entraram para os dois."
              />
            </div>
          )}
          {tab === 'compras' && <PurchasesCard open={setDialog} />}
          {tab === 'manutencao' && <MaintenanceCard open={setDialog} />}
        </div>
      </main>
      <HomeDialogs state={dialog} onClose={() => setDialog(null)} />
    </>
  )
}
