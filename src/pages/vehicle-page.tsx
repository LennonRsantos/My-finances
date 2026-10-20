import { ArrowDownWideNarrow, ArrowUpNarrowWide, Bike, CalendarClock, CalendarRange, Car, CheckCircle2, ChevronDown, ClipboardList, ChevronRight, Repeat, Fuel, Gauge, Pencil, PiggyBank, Save, Plus, Receipt, Scale, ShieldCheck, Truck, Wrench, AlertTriangle, Disc, Droplets, Landmark, SquareParking, Users, type LucideIcon } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useShallow } from 'zustand/react/shallow'
import { ChartTooltip } from '@/components/dashboard/chart-tooltip'
import { RecurringDialog } from '@/components/recurring/recurring-dialog'
import { DoneUndoButton } from '@/components/shared/undo-reminder-button'
import { VehicleDialogs, type VehicleDialogState } from '@/components/vehicle/vehicle-dialogs'
import { Button } from '@/components/ui/button'
import { Affix } from '@/components/ui/form-kit'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge, EmptyState, Progress, type Tone } from '@/components/ui/misc'
import { currentYearMonth, formatDateShort, formatMonthLabel, monthOf, shiftMonth, todayISO, yearMonthToDate } from '@/lib/dates'
import { formatMoney, toCents } from '@/lib/money'
import { parseMoneyInput } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import {
  costSummary,
  costPerKm,
  currentOdometer,
  formatPerKm,
  DEFAULT_KM_PER_MONTH,
  kmPerMonth,
  reminderSaving,
  vehicleReserve,
  type ReserveItem,
  DOCUMENT_PRESETS,
  ethanolVsGasoline,
  formatKm,
  formatKmPerLiter,
  fuelStats,
  quoteTotal,
  reminderStatus,
  VEHICLE_CATEGORY_ID,
  type DocumentPreset,
  type FuelStats,
  type ReminderLevel,
  groupExpenses,
  type ExpenseSeries,
  isFinancing,
  vehicleFinancingMonthly,
} from '@/lib/vehicle'
import { useFinanceStore } from '@/store/finance-store'
import { useUIStore } from '@/store/ui-store'
import { FUEL_LABELS, type FuelType, type MaintenanceReminder, type RecurringCost, type Transaction, type Vehicle, type VehicleKind } from '@/types/finance'
import { PageHeader } from '@/components/layout/page-header'

const kindIcon: Record<VehicleKind, LucideIcon> = { carro: Car, moto: Bike, outro: Truck }
const levelTone: Record<ReminderLevel, Tone> = { atrasado: 'expense', em_breve: 'warning', ok: 'income' }
const levelLabel: Record<ReminderLevel, string> = { atrasado: 'Atrasada', em_breve: 'Em breve', ok: 'Em dia' }

function Stat({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Lembretes
// ---------------------------------------------------------------------------

type ReminderRow = { r: MaintenanceReminder; s: ReturnType<typeof reminderStatus> }

/** Ordem da lista de manutenção: um toque passa para a próxima. */
const REMINDER_ORDERS = [
  { label: 'Vence antes', icon: CalendarClock, sort: (a: ReminderRow, b: ReminderRow) => b.s.progress - a.s.progress },
  { label: 'Vence depois', icon: CalendarRange, sort: (a: ReminderRow, b: ReminderRow) => a.s.progress - b.s.progress },
  { label: 'Maior valor', icon: ArrowDownWideNarrow, sort: (a: ReminderRow, b: ReminderRow) => (b.r.estimatedCost ?? 0) - (a.r.estimatedCost ?? 0) },
  { label: 'Menor valor', icon: ArrowUpNarrowWide, sort: (a: ReminderRow, b: ReminderRow) => (a.r.estimatedCost ?? 0) - (b.r.estimatedCost ?? 0) },
] as const

function RemindersCard({
  vehicle,
  currentKm,
  open,
}: {
  vehicle: Vehicle
  currentKm: number
  open: (d: VehicleDialogState) => void
}) {
  const reminders = useFinanceStore(useShallow((s) => s.maintenance.filter((r) => r.vehicleId === vehicle.id)))
  const transactions = useFinanceStore((s) => s.transactions)
  const kmMonth = kmPerMonth(vehicle, transactions) ?? DEFAULT_KM_PER_MONTH
  const today = todayISO()
  const [order, setOrder] = useState(0)
  const Order = REMINDER_ORDERS[order]!
  const computed = reminders.map((r) => ({ r, s: reminderStatus(r, currentKm, today), save: reminderSaving(r, currentKm, kmMonth, today) }))
  // A ordem só muda ao trocar a ordenação ou ao criar/excluir lembrete: marcar
  // ou desmarcar "Feita" não tira a manutenção do lugar.
  const key = `${order}|${reminders.map((r) => r.id).sort().join(',')}`
  const [snapshot, setSnapshot] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] })
  if (snapshot.key !== key) setSnapshot({ key, ids: [...computed].sort(Order.sort).map((x) => x.r.id) })
  const position = new Map(snapshot.ids.map((id, i) => [id, i]))
  const rows = [...computed].sort((a, b) => (position.get(a.r.id) ?? Infinity) - (position.get(b.r.id) ?? Infinity))

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="size-5" />
            Manutenção
          </CardTitle>
          <CardDescription>Avisa quando faltar 1.000 km ou 30 dias.</CardDescription>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {reminders.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOrder((o) => (o + 1) % REMINDER_ORDERS.length)}
              aria-label={`Ordem: ${Order.label}. Tocar para mudar`}
              title="Mudar a ordem"
            >
              <Order.icon />
              {Order.label}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => open({ kind: 'reminder', vehicle, currentKm })}>
            <Plus />
            Lembrete
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="Nenhum lembrete"
            description="Troca de óleo, revisão, pneus... o app avisa antes de vencer."
            className="py-6"
            action={
              <Button size="sm" onClick={() => open({ kind: 'reminder', vehicle, currentKm })}>
                <Plus />
                Criar lembrete
              </Button>
            }
          />
        ) : (
          <ul className="divide-y">
            {rows.map(({ r, s, save }) => {
              const parts = [
                s.kmLeft !== null && (s.kmLeft >= 0 ? `faltam ${formatKm(s.kmLeft)}` : `passou ${formatKm(-s.kmLeft)}`),
                s.daysLeft !== null &&
                  (s.daysLeft >= 0 ? `vence ${formatDateShort(s.dueDate!)}` : `venceu ${formatDateShort(s.dueDate!)}`),
              ].filter(Boolean)
              const last = r.history?.[0] ?? (r.lastDate ? { date: r.lastDate, km: r.lastKm } : null)
              return (
                <li key={r.id} className="py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => open({ kind: 'reminder', vehicle, currentKm, reminder: r })}
                      className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Editar ${r.name}`}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{r.name}</span>
                        <Badge tone={levelTone[s.level]}>{levelLabel[s.level]}</Badge>
                      </span>
                      <span className="block text-xs text-muted-foreground">{parts.length ? parts.join(' ou ') : 'sem prazo'}</span>
                      {last && (
                        <span className="block text-xs text-muted-foreground">
                          Última: {formatDateShort(last.date)}
                          {last.km != null && ` · ${formatKm(last.km)}`}
                        </span>
                      )}
                      {save ? (
                        <span className="block text-xs font-medium text-info">
                          Guarde {formatMoney(save.average)}/mês
                          {save.toNext !== null && save.monthsToNext !== null && save.toNext - save.average > 100 &&
                            (save.monthsToNext <= 0 ? ` · venceu: ${formatMoney(save.toNext)}` : ` · ${formatMoney(save.toNext)}/mês até a próxima`)}
                        </span>
                      ) : (
                        <span className="block text-xs text-muted-foreground">Informe o custo para saber quanto guardar</span>
                      )}
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {r.undo && !r.quote && s.level === 'ok' ? (
                        <DoneUndoButton reminder={r} />
                      ) : (
                        <>
                          <Button size="sm" variant={r.quote || s.level !== 'ok' ? 'outline' : 'ghost'} onClick={() => open({ kind: 'complete', vehicle, currentKm, reminder: r })}>
                            <CheckCircle2 />
                            Concluir
                          </Button>
                          {!r.quote && (
                            <Button size="sm" variant="ghost" onClick={() => open({ kind: 'quote', vehicle, reminder: r })}>
                              <ClipboardList />
                              Orçamento
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {r.quote && (
                    <button
                      type="button"
                      onClick={() => open({ kind: 'quote', vehicle, reminder: r })}
                      className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ClipboardList className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        Orçamento · {r.quote.items.length} {r.quote.items.length === 1 ? 'item' : 'itens'}
                        {r.quote.installments > 1 && ` · ${r.quote.installments}x`}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatMoney(quoteTotal(r.quote))}</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Custos
// ---------------------------------------------------------------------------

function CostsCard({ vehicleId }: { vehicleId: string }) {
  const { transactions, subcategories, categories } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, subcategories: s.subcategories, categories: s.categories })),
  )
  const summary = useMemo(() => costSummary(transactions, vehicleId, currentYearMonth()), [transactions, vehicleId])
  const color = categories.find((c) => c.id === VEHICLE_CATEGORY_ID)?.color ?? 'var(--warning)'
  const subName = (id: string | null) => subcategories.find((s) => s.id === id)?.name ?? 'Outros'
  const max = summary.bySubcategory[0]?.total ?? 0
  const data = summary.months.map((m) => ({ ...m, label: format(yearMonthToDate(m.month), 'MMM', { locale: ptBR }) }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="size-5" />
          Quanto o veículo custa
        </CardTitle>
        <CardDescription>
          Últimos 12 meses: {formatMoney(summary.total)}, média de {formatMoney(Math.round(summary.total / 12))} por mês.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {summary.total === 0 ? (
          <p className="text-sm text-muted-foreground">Sem gastos lançados para este veículo nos últimos 12 meses.</p>
        ) : (
          <>
            <div className="h-48 w-full">
              <ResponsiveContainer>
                <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} interval="preserveStartEnd" />
                  <YAxis
                    width={52}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    tickFormatter={(v: number) => formatMoney(v, { compact: true })}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                    content={({ active, payload }) => {
                      const p = payload?.[0]?.payload as (typeof data)[number] | undefined
                      if (!active || !p) return null
                      return <ChartTooltip title={formatMonthLabel(p.month)} rows={[{ color, label: 'Gastos', value: formatMoney(p.total) }]} />
                    }}
                  />
                  <Bar dataKey="total" name="Gastos" fill={color} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-col gap-3" aria-label="Gastos por tipo">
              {summary.bySubcategory.map((s) => (
                <li key={s.subcategoryId ?? 'none'} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{subName(s.subcategoryId)}</span>
                    <span className="shrink-0 font-medium tabular-nums">{formatMoney(s.total)}</span>
                  </div>
                  <Progress value={max ? s.total / max : 0} color={color} label={`${subName(s.subcategoryId)}: ${formatMoney(s.total)}`} />
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Abastecimentos
// ---------------------------------------------------------------------------

/** Abastecimentos, consumo e preço do combustível num lugar só. */
function FuelCard({ stats, vehicle, currentKm, open }: { stats: FuelStats; vehicle: Vehicle; currentKm: number; open: (d: VehicleDialogState) => void }) {
  const segment = new Map(stats.segments.map((s) => [s.closingId, s.kmPerLiter]))
  const [showAll, setShowAll] = useState(false)
  const all = [...stats.fills].reverse()
  const recent = showAll ? all : all.slice(0, 6)
  const withKm = stats.fills.filter((t) => t.odometer != null).length
  const fuelPerKm = stats.pricePerLiter !== null && stats.average ? stats.pricePerLiter / stats.average : null
  const prices = (Object.entries(stats.lastPrice) as [FuelType, number][]).sort(([a], [b]) => a.localeCompare(b))

  const tiles: [string, string, string | null][] = [
    ['Consumo médio', stats.average ? formatKmPerLiter(stats.average) : '—', stats.average && stats.approximate ? 'aproximado' : null],
    ['Último trecho', stats.last ? formatKmPerLiter(stats.last) : '—', null],
    ['Preço médio do litro', stats.pricePerLiter !== null ? formatMoney(stats.pricePerLiter) : '—', null],
    ['Combustível por km', fuelPerKm !== null ? formatPerKm(fuelPerKm) : '—', null],
  ]

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Fuel className="size-5" />
            Abastecimento e consumo
          </CardTitle>
          <CardDescription>
            {stats.average
              ? stats.approximate
                ? 'Média aproximada pelos litros de cada abastecimento. Complete o tanque duas vezes seguidas para o valor exato.'
                : 'Medido entre abastecimentos de tanque cheio.'
              : withKm < 2
                ? `Registre o km do painel em ${2 - withKm === 2 ? 'dois abastecimentos' : 'mais um abastecimento'} para calcular o consumo.`
                : 'Os km registrados ainda não aumentaram entre os abastecimentos.'}
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => open({ kind: 'fuel', vehicle, currentKm })}>
          <Plus />
          Abastecer
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map(([label, value, note]) => (
            <div key={label} className="flex flex-col gap-0.5 rounded-xl bg-muted px-3 py-2.5">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-base font-semibold tabular-nums">{value}</span>
              {note && <span className="text-xs text-muted-foreground">{note}</span>}
            </div>
          ))}
        </div>

        {prices.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Último preço pago:{' '}
            {prices.map(([type, price], i) => (
              <span key={type}>
                {i > 0 && ' · '}
                {FUEL_LABELS[type]} <span className="font-medium text-foreground tabular-nums">{formatMoney(price)}</span>
              </span>
            ))}
          </p>
        )}

        {vehicle.fuel === 'flex' && <FuelCompare key={vehicle.id} stats={stats} vehicle={vehicle} />}

        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum abastecimento ainda.</p>
        ) : (
          <ul className="divide-y">
            {recent.map((t) => {
              const kml = segment.get(t.id)
              const liters = t.fuel?.liters ?? 0
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => open({ kind: 'fuel', vehicle, currentKm, transaction: t })}
                    aria-label={`Editar abastecimento de ${formatDateShort(t.dueDate)}`}
                    className="flex w-full items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {formatDateShort(t.dueDate)} · {t.fuel ? FUEL_LABELS[t.fuel.type] : ''}
                        {t.fuel && !t.fuel.fullTank && <span className="font-normal text-muted-foreground"> · parcial</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {liters.toLocaleString('pt-BR')} L · {liters ? formatMoney(Math.round(t.amount / liters)) : '—'}/L
                        {t.odometer != null ? <> · {formatKm(t.odometer)}</> : <span className="text-warning"> · sem km</span>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">{formatMoney(t.amount)}</p>
                      {kml && <p className="text-xs text-income">{formatKmPerLiter(kml)}</p>}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {all.length > 6 && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Mostrar menos' : `Ver todos (${all.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Etanol ou gasolina, dentro do card de abastecimento. Começa com o último
 * preço pago de cada um; usa o consumo real do carro quando há histórico.
 */
function FuelCompare({ stats, vehicle }: { stats: FuelStats; vehicle: Vehicle }) {
  const saveVehicle = useFinanceStore((s) => s.saveVehicle)
  const saved = vehicle.pumpPrices
  const initial = (c: number | null | undefined) => (c ? (c / 100).toFixed(2).replace('.', ',') : '')
  // Começa com os preços salvos; sem eles, com o último preço pago de cada um.
  const [ethanol, setEthanol] = useState(() => initial(saved?.etanol ?? stats.lastPrice.etanol))
  const [gasoline, setGasoline] = useState(() => initial(saved?.gasolina ?? stats.lastPrice.gasolina))
  const e = toCents(parseMoneyInput(ethanol) || 0)
  const g = toCents(parseMoneyInput(gasoline) || 0)
  const result = e > 0 && g > 0 ? ethanolVsGasoline(e, g, stats.byType) : null
  const changed = (saved?.etanol ?? null) !== (e || null) || (saved?.gasolina ?? null) !== (g || null)
  const save = () => saveVehicle({ ...vehicle, pumpPrices: { etanol: e || null, gasolina: g || null, savedAt: todayISO() } })

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Scale className="size-4" />
        Etanol ou gasolina? Preço no posto hoje:
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ['ethanol', 'Etanol', ethanol, setEthanol],
            ['gasoline', 'Gasolina', gasoline, setGasoline],
          ] as const
        ).map(([id, label, value, set]) => (
          <div key={id} className="flex flex-col gap-1.5">
            <label htmlFor={`cmp-${id}`} className="text-xs text-muted-foreground">
              {label}
            </label>
            <Affix before="R$">
              <Input id={`cmp-${id}`} inputMode="decimal" placeholder="0,00" className="pl-10" value={value} onChange={(ev) => set(ev.target.value)} />
            </Affix>
          </div>
        ))}
      </div>
      {result && (
        <p role="status" className={cn('rounded-lg px-3 py-2 text-sm', result.best === 'etanol' ? 'bg-income-soft text-income' : 'bg-info-soft text-info')}>
          <span className="font-semibold">{result.best === 'etanol' ? 'Etanol compensa.' : 'Gasolina compensa.'}</span> Etanol custa{' '}
          {Math.round(result.ratio * 100)}% da gasolina; compensa até {Math.round(result.threshold * 100)}%
          {result.measured ? ', pelo consumo real do seu veículo.' : ' (regra geral; com consumo dos dois combustíveis, o app usa o do seu veículo).'}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground" role="status">
          {saved && !changed ? `Preços salvos em ${formatDateShort(saved.savedAt)}.` : changed ? 'Preços alterados, ainda não salvos.' : ''}
        </span>
        <Button size="sm" variant={changed ? 'default' : 'outline'} disabled={!changed || (!e && !g)} onClick={save}>
          <Save />
          {saved && !changed ? 'Salvo' : 'Salvar preços'}
        </Button>
      </div>
    </div>
  )
}

/** Gastos do veículo que não são abastecimento: manutenção, seguro, multas... */
const monthShortLabel = (d: string) => format(parseISO(d), 'MMM/yy', { locale: ptBR })

function ExpenseRow({ t, subName, onOpen, nested }: { t: Transaction; subName: (id: string | null) => string; onOpen: () => void; nested?: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Editar ${t.description}`}
        className={cn('flex w-full items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring', nested && 'py-2 pl-4')}
      >
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate font-medium', nested ? 'text-xs' : 'text-sm')}>{nested ? formatDateShort(t.dueDate) : t.description}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {nested ? (t.status === 'pago' ? 'pago' : 'a pagar') : <>{formatDateShort(t.dueDate)} · {subName(t.subcategoryId)}</>}
            {!nested && t.odometer != null && <> · {formatKm(t.odometer)}</>}
            {!nested && t.status !== 'pago' && <> · a pagar</>}
          </span>
        </span>
        <span className={cn('shrink-0 font-semibold tabular-nums', nested ? 'text-xs' : 'text-sm')}>{formatMoney(t.amount)}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  )
}

function SeriesRow({
  g,
  subName,
  onOpen,
  onEditSeries,
  label,
}: {
  g: ExpenseSeries
  subName: (id: string | null) => string
  onOpen: (t: Transaction) => void
  /** Série de um gasto fixo: editar valor/dia/frequência de todos os meses */
  onEditSeries?: () => void
  /** Linha compacta (ex.: "Ver parcelas") em vez do resumo da série */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const sameValue = g.minAmount === g.maxAmount
  const yearly = g.items.length > 1 && monthOf(g.items[1]!.dueDate) >= shiftMonth(monthOf(g.items[0]!.dueDate), 11)
  return (
    <li>
      {label ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label} ({g.items.length})
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      ) : (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{g.title}</span>
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {monthShortLabel(g.first)} a {monthShortLabel(g.last)} · {g.items.length}x · {subName(g.items[0]!.subcategoryId)}
            {g.paid > 0 && <> · {g.paid} {g.paid === 1 ? 'paga' : 'pagas'}</>}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums">
            {sameValue ? formatMoney(g.minAmount) : `${formatMoney(g.minAmount)}–${formatMoney(g.maxAmount)}`}
          </span>
          <span className="block text-xs text-muted-foreground">{yearly ? 'por ano' : 'por mês'}</span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      )}
      {open && (
        <div className="mb-2 flex flex-col gap-2">
          {onEditSeries && (
            <Button size="sm" variant="outline" className="self-start" onClick={onEditSeries}>
              <Pencil />
              Editar gasto fixo (todos os meses)
            </Button>
          )}
          <ul className="divide-y rounded-xl border">
            {g.items.map((t) => (
              <ExpenseRow key={t.id} t={t} subName={subName} onOpen={() => onOpen(t)} nested />
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Aba Gastos: uma caixa por tipo de gasto
// ---------------------------------------------------------------------------

interface ExpenseBox {
  /** Subcategoria; `null` = Outros (sem tipo ou tipo criado pela pessoa) */
  id: string | null
  label: string
  icon: LucideIcon
  /** Atalhos de gasto fixo (seguro, IPVA, licenciamento) */
  docs?: DocumentPreset[]
}

const EXPENSE_BOXES: ExpenseBox[] = [
  { id: 'sub-veiculo-manutencao', label: 'Manutenção e revisão', icon: Wrench },
  { id: 'sub-veiculo-pneus', label: 'Pneus e peças', icon: Disc },
  { id: 'sub-veiculo-seguro', label: 'Seguro', icon: ShieldCheck, docs: ['seguro'] },
  { id: 'sub-veiculo-ipva', label: 'IPVA e licenciamento', icon: Landmark, docs: ['ipva', 'licenciamento'] },
  { id: 'sub-veiculo-multas', label: 'Multas', icon: AlertTriangle },
  { id: 'sub-veiculo-estacionamento', label: 'Estacionamento e pedágio', icon: SquareParking },
  { id: 'sub-veiculo-lavagem', label: 'Lavagem', icon: Droplets },
  { id: null, label: 'Outros', icon: Receipt },
]
const KNOWN_BOX_IDS = new Set(EXPENSE_BOXES.map((b) => b.id).filter(Boolean))

function BoxCard({
  box,
  items,
  vehicle,
  currentKm,
  open,
  onEditSeries,
}: {
  box: ExpenseBox
  items: Transaction[]
  vehicle: Vehicle
  currentKm: number
  open: (d: VehicleDialogState) => void
  onEditSeries: (recurringCostId: string) => void
}) {
  const subcategories = useFinanceStore((s) => s.subcategories)
  const [showAll, setShowAll] = useState(false)
  const entries = groupExpenses(items)
  const list = showAll ? entries : entries.slice(0, 5)
  const subName = (id: string | null) => subcategories.find((x) => x.id === id)?.name ?? 'Outros'
  const yearAgo = shiftMonth(currentYearMonth(), -11)
  const year = items.filter((t) => monthOf(t.dueDate) >= yearAgo && monthOf(t.dueDate) <= currentYearMonth()).reduce((a, t) => a + t.amount, 0)
  const Icon = box.icon
  const edit = (t: Transaction) => open({ kind: 'expense', vehicle, currentKm, transaction: t })

  return (
    <Card>
      {/* Celular: botões numa linha abaixo do título; a partir de sm, ao lado. */}
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{box.label}</span>
          </CardTitle>
          <CardDescription>Últimos 12 meses: {formatMoney(year)}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:shrink-0 sm:justify-end">
          {box.docs?.map((p) => (
            <Button key={p} size="sm" variant="outline" onClick={() => open({ kind: 'document', vehicle, preset: p })}>
              <Repeat />
              {DOCUMENT_PRESETS[p].label}
            </Button>
          ))}
          <Button size="sm" variant="outline" aria-label={`Novo gasto em ${box.label}`} onClick={() => open({ kind: 'expense', vehicle, currentKm, subcategoryId: box.id ?? undefined })}>
            <Plus />
            {box.docs ? 'Avulso' : 'Gasto'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {list.map((e) =>
            e.kind === 'series' ? (
              <SeriesRow key={e.key} g={e} subName={subName} onOpen={edit} onEditSeries={e.items[0]?.recurringCostId ? () => onEditSeries(e.items[0]!.recurringCostId!) : undefined} />
            ) : (
              <ExpenseRow key={e.item.id} t={e.item} subName={subName} onOpen={() => edit(e.item)} />
            ),
          )}
        </ul>
        {entries.length > 5 && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Mostrar menos' : `Ver todos (${entries.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/** Gastos do veículo separados por tipo; caixas vazias viram atalhos no fim. */
function ExpensesTab({ vehicle, currentKm, stats, open }: { vehicle: Vehicle; currentKm: number; stats: FuelStats; open: (d: VehicleDialogState) => void }) {
  const { transactions, recurringCosts } = useFinanceStore(useShallow((s) => ({ transactions: s.transactions, recurringCosts: s.recurringCosts })))
  const [editingRc, setEditingRc] = useState<RecurringCost | null>(null)
  const mine = transactions.filter((t) => t.vehicleId === vehicle.id && t.type === 'despesa' && !t.fuel && !isFinancing(t))
  const boxOf = (t: Transaction) => (t.subcategoryId && KNOWN_BOX_IDS.has(t.subcategoryId) ? t.subcategoryId : null)
  const filled = EXPENSE_BOXES.filter((b) => mine.some((t) => boxOf(t) === b.id))
  const empty = EXPENSE_BOXES.filter((b) => b.id !== null && !filled.includes(b))

  return (
    <>
      <FuelCard stats={stats} vehicle={vehicle} currentKm={currentKm} open={open} />
      {filled.map((box) => (
        <BoxCard
          key={box.id ?? 'outros'}
          box={box}
          items={mine.filter((t) => boxOf(t) === box.id)}
          vehicle={vehicle}
          currentKm={currentKm}
          open={open}
          onEditSeries={(id) => setEditingRc(recurringCosts.find((r) => r.id === id) ?? null)}
        />
      ))}
      {empty.length > 0 && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm text-muted-foreground">Sem gastos ainda em:</p>
          <div className="flex flex-wrap gap-2">
            {empty.map((box) => {
              const Icon = box.icon
              return (
                <Button
                  key={box.id}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    box.docs ? open({ kind: 'document', vehicle, preset: box.docs[0]! }) : open({ kind: 'expense', vehicle, currentKm, subcategoryId: box.id ?? undefined })
                  }
                >
                  <Icon />
                  {box.label}
                </Button>
              )
            })}
          </div>
        </Card>
      )}
      <RecurringDialog rc={editingRc} onClose={() => setEditingRc(null)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Aba Financiamento
// ---------------------------------------------------------------------------

function FinancingTab({ vehicle, open }: { vehicle: Vehicle; open: (d: VehicleDialogState) => void }) {
  const transactions = useFinanceStore((s) => s.transactions)
  const editTx = useUIStore((s) => s.setEditingTransaction)
  const subcategories = useFinanceStore((s) => s.subcategories)
  const subName = (id: string | null) => subcategories.find((x) => x.id === id)?.name ?? 'Financiamento'
  const series = groupExpenses(transactions.filter((t) => t.vehicleId === vehicle.id && t.type === 'despesa' && isFinancing(t)))
  const monthly = vehicleFinancingMonthly(vehicle, transactions)
  const open_ = series.flatMap((e) => (e.kind === 'series' ? e.items : [e.item])).filter((t) => t.status !== 'pago')
  const remaining = open_.reduce((a, t) => a + t.amount, 0)

  return (
    <>
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Landmark className="size-4" />
              Financiamentos e empréstimos
            </span>
            <span className="text-2xl font-semibold tabular-nums">{formatMoney(monthly)}/mês</span>
            <span className="text-sm text-muted-foreground">Faltam {formatMoney(remaining)} no total.</span>
          </div>
          <Button size="sm" onClick={() => open({ kind: 'financing', vehicle })}>
            <Plus />
            Novo
          </Button>
        </div>
      </Card>

      {series.length === 0 ? (
        <Card>
          <EmptyState
            icon={Landmark}
            title="Nenhum financiamento"
            description="Financiamento, consórcio ou empréstimo do veículo. As parcelas entram no custo por km e no Sair do vermelho."
            action={
              <Button size="sm" onClick={() => open({ kind: 'financing', vehicle })}>
                <Plus />
                Cadastrar
              </Button>
            }
          />
        </Card>
      ) : (
        series.map((e) => {
          if (e.kind !== 'series') {
            return (
              <Card key={e.item.id} className="px-4">
                <ul>
                  <ExpenseRow t={e.item} subName={subName} onOpen={() => editTx(e.item.id)} />
                </ul>
              </Card>
            )
          }
          const total = e.items[0]?.installment?.total ?? e.items.length
          const pendingItems = e.items.filter((t) => t.status !== 'pago')
          const done = total - pendingItems.length
          const next = pendingItems[0]
          return (
            <Card key={e.key}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {e.title}
                  {e.items[0]?.sharedBillId && (
                    <Badge tone="info">
                      <Users className="size-3" />
                      {e.items[0].sharedWith ?? 'Compartilhado'}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {formatMoney(next?.amount ?? e.maxAmount)}/mês · {done} de {total} pagas
                  {next ? ` · próxima ${formatDateShort(next.dueDate)}` : ' · quitado'} · termina em {monthShortLabel(e.last)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Progress value={total ? done / total : 0} color="var(--income)" label={`${done} de ${total} parcelas pagas`} />
                <p className="text-sm text-muted-foreground">
                  Faltam <span className="font-medium text-foreground">{formatMoney(pendingItems.reduce((a, t) => a + t.amount, 0))}</span> em{' '}
                  {pendingItems.length} parcelas.
                </p>
                <ul className="divide-y">
                  <SeriesRow g={e} subName={subName} onOpen={(t) => editTx(t.id)} label="Ver parcelas" />
                </ul>
              </CardContent>
            </Card>
          )
        })
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Quanto guardar
// ---------------------------------------------------------------------------

const RESERVE_COLORS = { manutencao: 'var(--info)', anuais: 'var(--warning)', depreciacao: 'var(--expense)' }

function ReserveSection({ title, color, items, empty }: { title: string; color: string; items: ReserveItem[]; empty: ReactNode }) {
  const total = items.reduce((a, i) => a + i.monthly, 0)
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
          {title}
        </CardTitle>
        <span className="font-semibold tabular-nums">{formatMoney(total)}/mês</span>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">{empty}</div>
        ) : (
          <ul className="divide-y">
            {items.map((i) => (
              <li key={i.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{i.label}</span>
                  <span className="block text-xs text-muted-foreground">{i.detail}</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatMoney(i.monthly)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Quanto separar por mês para manutenção, gastos anuais e depreciação do veículo. */
function ReserveTab({ vehicle, currentKm, open }: { vehicle: Vehicle; currentKm: number; open: (d: VehicleDialogState) => void }) {
  const { transactions, maintenance, recurringCosts } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, maintenance: s.maintenance, recurringCosts: s.recurringCosts })),
  )
  const r = vehicleReserve(vehicle, transactions, maintenance, recurringCosts, currentYearMonth())
  const perKm = costPerKm(vehicle, transactions, maintenance, recurringCosts)
  const parts = [
    { key: 'manutencao', label: 'Manutenção', value: r.maintenance.reduce((a, i) => a + i.monthly, 0) },
    { key: 'anuais', label: 'Gastos anuais', value: r.annual.reduce((a, i) => a + i.monthly, 0) },
    { key: 'depreciacao', label: 'Depreciação', value: r.depreciation?.monthly ?? 0 },
  ] as const

  return (
    <>
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <PiggyBank className="size-4" />
            Guarde por mês
          </span>
          <span className="text-3xl font-semibold tabular-nums">{formatMoney(r.total)}</span>
          <p className="text-sm text-muted-foreground">
            Separando esse valor todo mês, a revisão, o IPVA e a troca de carro deixam de pegar você de surpresa.
          </p>
        </div>
        {r.total > 0 && (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              {parts.map((p) => (p.value > 0 ? <div key={p.key} style={{ width: `${(p.value / r.total) * 100}%`, background: RESERVE_COLORS[p.key] }} /> : null))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {parts.map((p) => (
                <li key={p.key} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: RESERVE_COLORS[p.key] }} aria-hidden />
                  {p.label}: <span className="font-medium tabular-nums">{formatMoney(p.value)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Base de {formatKm(r.kmPerMonth)} por mês {r.kmMeasured ? '(medido pelos seus registros de km)' : '(estimativa; registre o km nos abastecimentos para medir)'}.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4" />
            Quanto custa cada km
          </CardTitle>
          <CardDescription>
            Rodando ~{formatKm(perKm.kmPerMonth)} por mês, cada km custa {perKm.total != null ? formatPerKm(perKm.total) : '—'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {(
              [
                ['Combustível', perKm.fuel, perKm.fuel == null ? 'Abasteça com km e tanque cheio duas vezes para medir o consumo' : 'preço médio do litro ÷ consumo'],
                [
                  'Manutenção',
                  perKm.maintenance,
                  perKm.maintenanceSource === 'planejada'
                    ? 'pelos lembretes com custo (o que você pretende fazer)'
                    : perKm.maintenanceSource === 'realizada'
                      ? 'pelo que você já gastou ÷ km rodados'
                      : 'Cadastre o custo nos lembretes de manutenção',
                ],
                ['Fixos', perKm.fixed, perKm.fixed == null ? 'IPVA, seguro e depreciação entram aqui quando cadastrados' : 'IPVA, seguro, licenciamento e depreciação'],
                [
                  'Financiamento',
                  perKm.financing,
                  perKm.financing == null
                    ? 'Parcela de financiamento ou empréstimo do veículo entra aqui'
                    : `parcela de ${formatMoney(perKm.financingMonthly)}/mês ÷ km do mês`,
                ],
              ] as const
            ).map(([label, value, detail]) => (
              <li key={label} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{detail}</span>
                </span>
                <span className="shrink-0 tabular-nums">{value != null ? formatPerKm(value) : '—'}</span>
              </li>
            ))}
          </ul>
          {perKm.running != null && (
            <p className="pt-2 text-xs text-muted-foreground">
              Só para rodar (combustível + manutenção): {formatPerKm(perKm.running)} por km. Uma viagem de 100 km custa ~{formatPerKm(perKm.running * 100)}.
            </p>
          )}
        </CardContent>
      </Card>

      <ReserveSection
        title="Manutenção prevista"
        color={RESERVE_COLORS.manutencao}
        items={r.maintenance}
        empty={
          <div className="flex flex-col items-start gap-2">
            <span>Crie lembretes com o custo de cada manutenção (óleo, revisão, pneus) para entrarem na conta.</span>
            <Button size="sm" variant="outline" onClick={() => open({ kind: 'reminder', vehicle, currentKm })}>
              <Plus />
              Criar lembrete
            </Button>
          </div>
        }
      />
      {r.missingCost.length > 0 && (
        <Card className="flex flex-col gap-2 p-4 text-sm">
          <p className="text-muted-foreground">Sem custo informado, ficam fora da conta:</p>
          <div className="flex flex-wrap gap-2">
            {r.missingCost.map((m) => (
              <Button key={m.id} size="sm" variant="outline" onClick={() => open({ kind: 'reminder', vehicle, currentKm, reminder: m })}>
                <Pencil />
                {m.name}
              </Button>
            ))}
          </div>
        </Card>
      )}
      <ReserveSection
        title="Gastos anuais"
        color={RESERVE_COLORS.anuais}
        items={r.annual}
        empty="IPVA, licenciamento e seguro pago por ano aparecem aqui, divididos por 12. Cadastre em Resumo > Seguro e documentos."
      />
      <ReserveSection
        title="Depreciação"
        color={RESERVE_COLORS.depreciacao}
        items={r.depreciation ? [r.depreciation] : []}
        empty={
          <div className="flex flex-col items-start gap-2">
            <span>Informe o valor do veículo na tabela FIPE para calcular quanto ele perde por mês.</span>
            <Button size="sm" variant="outline" onClick={() => open({ kind: 'vehicle', vehicle })}>
              <Pencil />
              Informar valor
            </Button>
          </div>
        }
      />

      <Card className="flex flex-col gap-1 p-4 text-sm">
        <p className="font-medium">Seu histórico</p>
        <p className="text-muted-foreground">
          Nos últimos 12 meses você gastou em média {formatMoney(r.historicMaintenance)} por mês com manutenção e pneus.
          {r.historicMaintenance > 0 &&
            (() => {
              const planned = parts[0].value
              return planned < r.historicMaintenance
                ? ' A manutenção prevista está abaixo disso: considere aumentar os custos dos lembretes.'
                : ' A manutenção prevista cobre esse valor.'
            })()}
        </p>
        <p className="text-muted-foreground">Dica: programe uma transferência automática desse valor para uma conta ou caixinha separada no dia do pagamento.</p>
      </Card>
    </>
  )
}

export function VehiclePage() {
  const { vehicles, transactions, maintenance, recurringCosts } = useFinanceStore(
    useShallow((s) => ({ vehicles: s.vehicles, transactions: s.transactions, maintenance: s.maintenance, recurringCosts: s.recurringCosts })),
  )
  const active = vehicles.filter((v) => v.active).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<VehicleDialogState>(null)
  const [tab, setTab] = useState<'resumo' | 'gastos' | 'financiamento' | 'reserva'>('resumo')
  const vehicle = active.find((v) => v.id === selectedId) ?? active[0]

  const currentKm = vehicle ? currentOdometer(vehicle, transactions) : 0
  const stats = vehicle ? fuelStats(transactions, vehicle.id) : null
  const perKm = vehicle ? costPerKm(vehicle, transactions, maintenance, recurringCosts) : null
  const month = vehicle ? costSummary(transactions, vehicle.id, currentYearMonth()) : null

  return (
    <>
      <PageHeader title="Veículo" />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        {!vehicle ? (
          <Card>
            <EmptyState
              icon={Car}
              title="Cadastre seu veículo"
              description="Controle abastecimentos, consumo, manutenção e quanto o carro custa por mês e por km."
              action={
                <Button onClick={() => setDialog({ kind: 'vehicle' })}>
                  <Plus />
                  Adicionar veículo
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {active.map((v) => {
                const Icon = kindIcon[v.kind]
                const selected = v.id === vehicle.id
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    aria-pressed={selected}
                    className={cn(
                      'flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="size-4" />
                    {v.name}
                  </button>
                )
              })}
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Adicionar veículo" onClick={() => setDialog({ kind: 'vehicle' })}>
                <Plus />
              </Button>
            </div>

            <Card className="flex items-center gap-4 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted">
                {(() => {
                  const Icon = kindIcon[vehicle.kind]
                  return <Icon className="size-6" />
                })()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{vehicle.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {[vehicle.model, vehicle.year, vehicle.plate, FUEL_LABELS[vehicle.fuel]].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Editar ${vehicle.name}`} onClick={() => setDialog({ kind: 'vehicle', vehicle })}>
                <Pencil />
              </Button>
            </Card>

            <div role="tablist" aria-label="Seções do veículo" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:grid-cols-4">
              {(
                [
                  ['resumo', 'Resumo'],
                  ['gastos', 'Gastos'],
                  ['financiamento', 'Financiamento'],
                  ['reserva', 'Quanto guardar'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    'h-10 min-w-0 truncate rounded-lg px-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    tab === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'reserva' ? (
              <ReserveTab vehicle={vehicle} open={setDialog} currentKm={currentKm} />
            ) : tab === 'gastos' && stats ? (
              <ExpensesTab vehicle={vehicle} currentKm={currentKm} stats={stats} open={setDialog} />
            ) : tab === 'financiamento' ? (
              <FinancingTab vehicle={vehicle} open={setDialog} />
            ) : (
              <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat icon={Receipt} label="Gasto no mês" value={formatMoney(month?.thisMonth ?? 0)} />
                <Stat
                  icon={Gauge}
                  label="Custo por km"
                  value={perKm?.total != null ? formatPerKm(perKm.total) : '—'}
                  hint={
                    perKm?.total != null
                      ? [
                          perKm.fuel != null && `combustível ${formatPerKm(perKm.fuel)}`,
                          perKm.maintenance != null && `manutenção ${formatPerKm(perKm.maintenance)}`,
                          perKm.fixed != null && `fixos ${formatPerKm(perKm.fixed)}`,
                          perKm.financing != null && `financiamento ${formatPerKm(perKm.financing)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : 'Abasteça com km e tanque cheio ou cadastre o custo das manutenções'
                  }
                />
                <Stat
                  icon={Fuel}
                  label="Consumo médio"
                  value={stats?.average ? formatKmPerLiter(stats.average) : '—'}
                  hint={!stats?.average ? 'Registre o km em 2 abastecimentos' : stats.approximate ? 'aproximado' : undefined}
                />
                <Stat icon={Car} label="Km atual" value={formatKm(currentKm)} />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button onClick={() => setDialog({ kind: 'fuel', vehicle, currentKm })}>
                  <Fuel />
                  Abastecer
                </Button>
                <Button variant="outline" onClick={() => setDialog({ kind: 'expense', vehicle, currentKm })}>
                  <Receipt />
                  Gasto
                </Button>
                <Button variant="outline" onClick={() => setDialog({ kind: 'reminder', vehicle, currentKm })}>
                  <Wrench />
                  Lembrete
                </Button>
                <Button variant="outline" onClick={() => setDialog({ kind: 'financing', vehicle })}>
                  <Landmark />
                  Financiamento
                </Button>
              </div>

              <RemindersCard vehicle={vehicle} currentKm={currentKm} open={setDialog} />
              <CostsCard vehicleId={vehicle.id} />
              </>
            )}
          </>
        )}
      </main>
      <VehicleDialogs state={dialog} onClose={() => setDialog(null)} />
    </>
  )
}
