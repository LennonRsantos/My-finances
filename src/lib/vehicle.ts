/**
 * Cálculos da aba Veículo. Os gastos são lançamentos comuns com `vehicleId`;
 * abastecimentos trazem `fuel` (litros) e `odometer` (km).
 */
import { differenceInCalendarDays } from 'date-fns'
import type { Cents, FuelType, ISODate, MaintenanceReminder, Transaction, Vehicle, YearMonth } from '@/types/finance'
import { addMonthsISO, lastNMonths, monthOf, parseDate } from './dates'

export const VEHICLE_CATEGORY_ID = 'cat-veiculo'
export const FUEL_SUBCATEGORY_ID = 'sub-veiculo-combustivel'
export const MAINTENANCE_SUBCATEGORY_ID = 'sub-veiculo-manutencao'

export const vehicleExpenses = (transactions: Transaction[], vehicleId: string) =>
  transactions.filter((t) => t.vehicleId === vehicleId && t.type === 'despesa')

/** Maior km já registrado; sem registros, o km do cadastro. */
export function currentOdometer(vehicle: Vehicle, transactions: Transaction[]): number {
  return transactions.reduce(
    (max, t) => (t.vehicleId === vehicle.id && t.odometer != null && t.odometer > max ? t.odometer : max),
    vehicle.initialOdometer,
  )
}

// ---------------------------------------------------------------------------
// Consumo
// ---------------------------------------------------------------------------

export interface FuelSegment {
  /** Abastecimento (tanque cheio) que fecha o trecho */
  closingId: string
  km: number
  liters: number
  kmPerLiter: number
  type: FuelType
}

export interface FuelStats {
  fills: Transaction[]
  segments: FuelSegment[]
  /** km/l médio dos trechos medidos; `null` sem dois tanques cheios */
  average: number | null
  last: number | null
  /** Média por combustível (no flex, para comparar etanol e gasolina) */
  byType: Partial<Record<FuelType, number>>
  /** Preço médio do litro, em centavos */
  pricePerLiter: Cents | null
  liters: number
}

/**
 * Método do tanque cheio: entre dois abastecimentos com tanque cheio, o
 * consumo é km rodados ÷ litros colocados depois do primeiro (inclui os
 * parciais no meio). Abastecimentos sem km ficam fora da conta.
 */
export function fuelStats(transactions: Transaction[], vehicleId: string): FuelStats {
  const fills = transactions
    .filter((t) => t.vehicleId === vehicleId && t.fuel)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.odometer ?? 0) - (b.odometer ?? 0))

  const segments: FuelSegment[] = []
  let startKm: number | null = null
  let liters = 0
  for (const t of fills) {
    const fuel = t.fuel!
    if (t.odometer == null) {
      startKm = null
      continue
    }
    if (startKm === null) {
      if (fuel.fullTank) startKm = t.odometer
      continue
    }
    liters += fuel.liters
    if (!fuel.fullTank) continue
    const km = t.odometer - startKm
    if (km > 0 && liters > 0) segments.push({ closingId: t.id, km, liters, kmPerLiter: km / liters, type: fuel.type })
    startKm = t.odometer
    liters = 0
  }

  const ratio = (list: FuelSegment[]) =>
    list.length ? list.reduce((a, s) => a + s.km, 0) / list.reduce((a, s) => a + s.liters, 0) : null
  const byType: FuelStats['byType'] = {}
  for (const type of new Set(segments.map((s) => s.type))) byType[type] = ratio(segments.filter((s) => s.type === type)) ?? undefined

  const totalLiters = fills.reduce((a, t) => a + (t.fuel?.liters ?? 0), 0)
  const totalAmount = fills.reduce((a, t) => a + t.amount, 0)
  return {
    fills,
    segments,
    average: ratio(segments),
    last: segments.at(-1)?.kmPerLiter ?? null,
    byType,
    pricePerLiter: totalLiters > 0 ? Math.round(totalAmount / totalLiters) : null,
    liters: totalLiters,
  }
}

/**
 * Etanol compensa quando custa até X% da gasolina. X vem do consumo real do
 * carro (km/l etanol ÷ km/l gasolina) ou, sem histórico, da regra dos 70%.
 */
export function ethanolVsGasoline(ethanol: Cents, gasoline: Cents, byType: FuelStats['byType']) {
  const measured = byType.etanol && byType.gasolina ? byType.etanol / byType.gasolina : null
  const threshold = measured ?? 0.7
  const ratio = gasoline > 0 ? ethanol / gasoline : 0
  return { threshold, measured: measured !== null, ratio, best: ratio <= threshold ? ('etanol' as const) : ('gasolina' as const) }
}

// ---------------------------------------------------------------------------
// Custos
// ---------------------------------------------------------------------------

export interface CostSummary {
  months: { month: YearMonth; total: Cents }[]
  /** Total por subcategoria (`null` = sem subcategoria) no período */
  bySubcategory: { subcategoryId: string | null; total: Cents }[]
  total: Cents
  thisMonth: Cents
  /** Km rodados no período (pelos registros de hodômetro) */
  km: number
  /** Gasto por km rodado; `null` sem km suficiente */
  costPerKm: Cents | null
}

export function costSummary(transactions: Transaction[], vehicleId: string, endMonth: YearMonth, n = 12): CostSummary {
  const window = lastNMonths(endMonth, n)
  const inWindow = new Set(window)
  const list = vehicleExpenses(transactions, vehicleId).filter((t) => inWindow.has(monthOf(t.dueDate)))

  const byMonth = new Map<YearMonth, Cents>(window.map((m) => [m, 0]))
  const bySub = new Map<string | null, Cents>()
  for (const t of list) {
    byMonth.set(monthOf(t.dueDate), (byMonth.get(monthOf(t.dueDate)) ?? 0) + t.amount)
    bySub.set(t.subcategoryId, (bySub.get(t.subcategoryId) ?? 0) + t.amount)
  }

  const readings = list.map((t) => t.odometer).filter((km): km is number => km != null)
  const km = readings.length > 1 ? Math.max(...readings) - Math.min(...readings) : 0
  const total = list.reduce((a, t) => a + t.amount, 0)

  return {
    months: window.map((month) => ({ month, total: byMonth.get(month) ?? 0 })),
    bySubcategory: [...bySub].map(([subcategoryId, v]) => ({ subcategoryId, total: v })).sort((a, b) => b.total - a.total),
    total,
    thisMonth: byMonth.get(endMonth) ?? 0,
    km,
    costPerKm: km >= 100 ? Math.round(total / km) : null,
  }
}

// ---------------------------------------------------------------------------
// Manutenção
// ---------------------------------------------------------------------------

export type ReminderLevel = 'atrasado' | 'em_breve' | 'ok'

export interface ReminderStatus {
  level: ReminderLevel
  /** Km até vencer (negativo = passou) */
  kmLeft: number | null
  daysLeft: number | null
  dueDate: ISODate | null
  /** Quanto do intervalo já foi usado (0–1+), pelo critério mais próximo */
  progress: number
}

/** "Em breve" quando faltam até 1.000 km ou 30 dias. */
export const SOON_KM = 1000
export const SOON_DAYS = 30

export function reminderStatus(r: MaintenanceReminder, currentKm: number, today: ISODate): ReminderStatus {
  const kmLeft = r.intervalKm && r.lastKm != null ? r.lastKm + r.intervalKm - currentKm : null
  const dueDate = r.intervalMonths && r.lastDate ? addMonthsISO(r.lastDate, r.intervalMonths) : null
  const daysLeft = dueDate ? differenceInCalendarDays(parseDate(dueDate), parseDate(today)) : null

  const kmProgress = kmLeft !== null && r.intervalKm ? 1 - kmLeft / r.intervalKm : 0
  const totalDays = dueDate && r.lastDate ? differenceInCalendarDays(parseDate(dueDate), parseDate(r.lastDate)) : 0
  const dayProgress = daysLeft !== null && totalDays > 0 ? 1 - daysLeft / totalDays : 0

  const level: ReminderLevel =
    (kmLeft !== null && kmLeft < 0) || (daysLeft !== null && daysLeft < 0)
      ? 'atrasado'
      : (kmLeft !== null && kmLeft <= SOON_KM) || (daysLeft !== null && daysLeft <= SOON_DAYS)
        ? 'em_breve'
        : 'ok'
  return { level, kmLeft, daysLeft, dueDate, progress: Math.max(kmProgress, dayProgress, 0) }
}

/** Intervalos comuns de manual; o usuário ajusta ao cadastrar. */
export const DEFAULT_REMINDERS: { name: string; intervalKm: number | null; intervalMonths: number | null }[] = [
  { name: 'Troca de óleo e filtro', intervalKm: 10000, intervalMonths: 12 },
  { name: 'Revisão', intervalKm: 10000, intervalMonths: 12 },
  { name: 'Rodízio e alinhamento', intervalKm: 10000, intervalMonths: null },
  { name: 'Filtro de ar', intervalKm: 15000, intervalMonths: null },
  { name: 'Correia dentada', intervalKm: 50000, intervalMonths: 48 },
  { name: 'Fluido de freio', intervalKm: null, intervalMonths: 24 },
]

export type DocumentPreset = 'ipva' | 'licenciamento' | 'seguro'

/** Gastos anuais do veículo, cadastrados como fixo anual. */
export const DOCUMENT_PRESETS: Record<DocumentPreset, { label: string; subcategoryId: string; hint: string }> = {
  ipva: { label: 'IPVA', subcategoryId: 'sub-veiculo-ipva', hint: 'Valor total do ano (à vista ou soma das cotas).' },
  licenciamento: { label: 'Licenciamento', subcategoryId: 'sub-veiculo-ipva', hint: 'Taxa anual do Detran.' },
  seguro: { label: 'Seguro', subcategoryId: 'sub-veiculo-seguro', hint: 'Valor anual da apólice. Se paga parcelado, use Lançamentos > Parcelado.' },
}

export const formatKm = (km: number) => `${Math.round(km).toLocaleString('pt-BR')} km`
export const formatKmPerLiter = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km/l`
