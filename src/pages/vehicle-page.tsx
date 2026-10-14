import { Bike, Car, CheckCircle2, ChevronRight, Fuel, Gauge, Pencil, PiggyBank, Plus, Receipt, Scale, ShieldCheck, Truck, Wrench, type LucideIcon } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useShallow } from 'zustand/react/shallow'
import { ChartTooltip } from '@/components/dashboard/chart-tooltip'
import { RecurringRows } from '@/components/recurring/recurring-dialog'
import { VehicleDialogs, type VehicleDialogState } from '@/components/vehicle/vehicle-dialogs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge, EmptyState, Progress, type Tone } from '@/components/ui/misc'
import { currentYearMonth, formatDateShort, formatMonthLabel, todayISO, yearMonthToDate } from '@/lib/dates'
import { formatMoney, toCents } from '@/lib/money'
import { parseMoneyInput } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import {
  costSummary,
  currentOdometer,
  vehicleReserve,
  type ReserveItem,
  DOCUMENT_PRESETS,
  ethanolVsGasoline,
  formatKm,
  formatKmPerLiter,
  fuelStats,
  reminderStatus,
  VEHICLE_CATEGORY_ID,
  type DocumentPreset,
  type FuelStats,
  type ReminderLevel,
} from '@/lib/vehicle'
import { useFinanceStore } from '@/store/finance-store'
import { FUEL_LABELS, type Vehicle, type VehicleKind } from '@/types/finance'
import { PageHeader } from '@/components/layout/page-header'

const kindIcon: Record<VehicleKind, LucideIcon> = { carro: Car, moto: Bike, outro: Truck }
const levelTone: Record<ReminderLevel, Tone> = { atrasado: 'expense', em_breve: 'warning', ok: 'income' }
const levelLabel: Record<ReminderLevel, string> = { atrasado: 'Atrasada', em_breve: 'Em breve', ok: 'Em dia' }
const levelColor: Record<ReminderLevel, string> = { atrasado: 'var(--expense)', em_breve: 'var(--warning)', ok: 'var(--income)' }

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
  const today = todayISO()
  const rows = reminders
    .map((r) => ({ r, s: reminderStatus(r, currentKm, today) }))
    .sort((a, b) => b.s.progress - a.s.progress)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="size-5" />
            Manutenção
          </CardTitle>
          <CardDescription>Avisa quando faltar 1.000 km ou 30 dias.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => open({ kind: 'reminder', vehicle, currentKm })}>
          <Plus />
          Lembrete
        </Button>
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
            {rows.map(({ r, s }) => {
              const parts = [
                s.kmLeft !== null && (s.kmLeft >= 0 ? `faltam ${formatKm(s.kmLeft)}` : `passou ${formatKm(-s.kmLeft)}`),
                s.daysLeft !== null &&
                  (s.daysLeft >= 0 ? `vence ${formatDateShort(s.dueDate!)}` : `venceu ${formatDateShort(s.dueDate!)}`),
              ].filter(Boolean)
              return (
                <li key={r.id} className="flex flex-col gap-2 py-3">
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
                      <span className="block text-xs text-muted-foreground">{parts.join(' ou ')}</span>
                    </button>
                    <Button size="sm" variant={s.level === 'ok' ? 'ghost' : 'outline'} onClick={() => open({ kind: 'complete', vehicle, currentKm, reminder: r })}>
                      <CheckCircle2 />
                      Feita
                    </Button>
                  </div>
                  <Progress value={s.progress} color={levelColor[s.level]} label={`${r.name}: ${Math.round(s.progress * 100)}% do intervalo`} />
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

function FuelCard({ stats, vehicle, currentKm, open }: { stats: FuelStats; vehicle: Vehicle; currentKm: number; open: (d: VehicleDialogState) => void }) {
  const segment = new Map(stats.segments.map((s) => [s.closingId, s.kmPerLiter]))
  const [showAll, setShowAll] = useState(false)
  const all = [...stats.fills].reverse()
  const recent = showAll ? all : all.slice(0, 8)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Fuel className="size-5" />
            Abastecimentos
          </CardTitle>
          <CardDescription>
            {stats.pricePerLiter !== null
              ? `${stats.liters.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L no total, média de ${formatMoney(stats.pricePerLiter)} por litro.`
              : 'Registre com tanque cheio e km para ver o consumo.'}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => open({ kind: 'fuel', vehicle, currentKm })}>
          <Plus />
          Abastecer
        </Button>
      </CardHeader>
      <CardContent>
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
                      {t.odometer != null && <> · {formatKm(t.odometer)}</>}
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
        {all.length > 8 && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Mostrar menos' : `Ver todos (${all.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/** Gastos do veículo que não são abastecimento: manutenção, seguro, multas... */
function ExpensesCard({ vehicle, currentKm, open }: { vehicle: Vehicle; currentKm: number; open: (d: VehicleDialogState) => void }) {
  const { transactions, subcategories } = useFinanceStore(useShallow((s) => ({ transactions: s.transactions, subcategories: s.subcategories })))
  const [showAll, setShowAll] = useState(false)
  const all = transactions
    .filter((t) => t.vehicleId === vehicle.id && t.type === 'despesa' && !t.fuel)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const list = showAll ? all : all.slice(0, 8)
  const subName = (id: string | null) => subcategories.find((x) => x.id === id)?.name ?? 'Veículo'

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-5" />
            Outros gastos
          </CardTitle>
          <CardDescription>Manutenção, seguro, multas, estacionamento... Toque para editar ou excluir.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => open({ kind: 'expense', vehicle, currentKm })}>
          <Plus />
          Gasto
        </Button>
      </CardHeader>
      <CardContent>
        {all.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum gasto além de combustível.</p>
        ) : (
          <ul className="divide-y">
            {list.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => open({ kind: 'expense', vehicle, currentKm, transaction: t })}
                  aria-label={`Editar ${t.description}`}
                  className="flex w-full items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.description}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatDateShort(t.dueDate)} · {subName(t.subcategoryId)}
                      {t.odometer != null && <> · {formatKm(t.odometer)}</>}
                      {t.status !== 'pago' && <> · a pagar</>}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(t.amount)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {all.length > 8 && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Mostrar menos' : `Ver todos (${all.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/** Etanol ou gasolina: usa o consumo real do carro quando já há histórico dos dois. */
function FuelCompareCard({ stats }: { stats: FuelStats }) {
  const [ethanol, setEthanol] = useState('')
  const [gasoline, setGasoline] = useState('')
  const e = toCents(parseMoneyInput(ethanol) || 0)
  const g = toCents(parseMoneyInput(gasoline) || 0)
  const result = e > 0 && g > 0 ? ethanolVsGasoline(e, g, stats.byType) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="size-5" />
          Etanol ou gasolina?
        </CardTitle>
        <CardDescription>Digite os preços do posto.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ['ethanol', 'Etanol', ethanol, setEthanol],
              ['gasoline', 'Gasolina', gasoline, setGasoline],
            ] as const
          ).map(([id, label, value, set]) => (
            <div key={id} className="flex flex-col gap-2">
              <label htmlFor={`cmp-${id}`} className="text-sm font-medium">
                {label}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                <Input id={`cmp-${id}`} inputMode="decimal" placeholder="0,00" className="pl-10" value={value} onChange={(ev) => set(ev.target.value)} />
              </div>
            </div>
          ))}
        </div>
        {result && (
          <p
            role="status"
            className={cn('rounded-xl px-3 py-2 text-sm', result.best === 'etanol' ? 'bg-income-soft text-income' : 'bg-info-soft text-info')}
          >
            <span className="font-semibold">{result.best === 'etanol' ? 'Etanol compensa.' : 'Gasolina compensa.'}</span> Etanol custa{' '}
            {Math.round(result.ratio * 100)}% da gasolina; compensa até {Math.round(result.threshold * 100)}%
            {result.measured ? ', pelo consumo real do seu veículo.' : ' (regra geral; com histórico dos dois, o app usa o consumo do seu veículo).'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function DocumentsCard({ vehicle, open }: { vehicle: Vehicle; open: (d: VehicleDialogState) => void }) {
  const recurring = useFinanceStore(useShallow((s) => s.recurringCosts.filter((r) => r.vehicleId === vehicle.id && r.active)))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" />
          Seguro e documentos
        </CardTitle>
        <CardDescription>IPVA, licenciamento e seguro (por mês ou por ano). Aparecem no Calendário; toque para editar ou excluir.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {recurring.length > 0 && <RecurringRows items={recurring} />}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DOCUMENT_PRESETS) as DocumentPreset[]).map((p) => (
            <Button key={p} size="sm" variant="outline" onClick={() => open({ kind: 'document', vehicle, preset: p })}>
              <Plus />
              {DOCUMENT_PRESETS[p].label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

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
  const { vehicles, transactions } = useFinanceStore(useShallow((s) => ({ vehicles: s.vehicles, transactions: s.transactions })))
  const active = vehicles.filter((v) => v.active).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<VehicleDialogState>(null)
  const [tab, setTab] = useState<'resumo' | 'reserva'>('resumo')
  const vehicle = active.find((v) => v.id === selectedId) ?? active[0]

  const currentKm = vehicle ? currentOdometer(vehicle, transactions) : 0
  const stats = vehicle ? fuelStats(transactions, vehicle.id) : null
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

            <div role="tablist" aria-label="Seções do veículo" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {(
                [
                  ['resumo', 'Resumo'],
                  ['reserva', 'Quanto guardar'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn('h-10 rounded-lg text-sm font-medium transition-colors', tab === key ? 'bg-card shadow-sm' : 'text-muted-foreground')}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'reserva' ? (
              <ReserveTab vehicle={vehicle} open={setDialog} currentKm={currentKm} />
            ) : (
              <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat icon={Receipt} label="Gasto no mês" value={formatMoney(month?.thisMonth ?? 0)} />
                <Stat
                  icon={Gauge}
                  label="Custo por km"
                  value={month?.costPerKm != null ? formatMoney(month.costPerKm) : '—'}
                  hint={month?.costPerKm == null ? 'Registre o km nos gastos' : undefined}
                />
                <Stat
                  icon={Fuel}
                  label="Consumo médio"
                  value={stats?.average ? formatKmPerLiter(stats.average) : '—'}
                  hint={!stats?.average ? 'Precisa de 2 tanques cheios' : undefined}
                />
                <Stat icon={Car} label="Km atual" value={formatKm(currentKm)} />
              </div>

              <div className="grid grid-cols-3 gap-2">
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
              </div>

              <RemindersCard vehicle={vehicle} currentKm={currentKm} open={setDialog} />
              <CostsCard vehicleId={vehicle.id} />
              {stats && <FuelCard stats={stats} vehicle={vehicle} currentKm={currentKm} open={setDialog} />}
              <ExpensesCard vehicle={vehicle} currentKm={currentKm} open={setDialog} />
              {vehicle.fuel === 'flex' && stats && <FuelCompareCard stats={stats} />}
              <DocumentsCard vehicle={vehicle} open={setDialog} />
              </>
            )}
          </>
        )}
      </main>
      <VehicleDialogs state={dialog} onClose={() => setDialog(null)} />
    </>
  )
}
