/**
 * Plano da aba Metas: quanto da renda vai para cada parte no mês (60/10/20/10)
 * e as metas calculadas pela renda (reserva de emergência, liberdade
 * financeira, despesas anuais). O guardado vem das caixinhas, não de lançamentos.
 */
import {
  BUDGET_SLICES,
  type BudgetSlice,
  type Cents,
  type Debt,
  type Goal,
  type GoalAsset,
  type GoalKind,
  type GoalPlan,
  type ISODate,
  type MaintenanceReminder,
  type RecurringCost,
  type Transaction,
  type Vehicle,
  type YearMonth,
} from '@/types/finance'
import { monthOf, shiftMonth } from './dates'
import { groupOf, HIGH_INTEREST, type Diagnosis } from './recovery'
import { cycleLabel, DEFAULT_KM_PER_MONTH, kmPerMonth, reminderCycle } from './vehicle'

export const DEFAULT_GOAL_PLAN: GoalPlan = {
  income: null,
  split: { essencial: 60, investir: 10, lazer: 20, curto: 10 },
  reserveMonths: 6,
  reserveBase: 'custo',
  freedomIncome: null,
  freedomMultiplier: 200,
  incomeGrowth: null,
}

/** Plano salvo completado com o padrão. */
export function planOf(saved: Partial<GoalPlan> | null | undefined): GoalPlan {
  return { ...DEFAULT_GOAL_PLAN, ...saved, split: { ...DEFAULT_GOAL_PLAN.split, ...saved?.split } }
}

// ---------------------------------------------------------------------------
// Tipos de caixinha
// ---------------------------------------------------------------------------

export const kindOf = (g: Pick<Goal, 'kind'>): GoalKind => g.kind ?? 'livre'

export const KIND_LABELS: Record<GoalKind, string> = {
  reserva: 'Reserva de emergência',
  liberdade: 'Liberdade financeira',
  curto_prazo: 'Curto prazo',
  anual: 'Despesas anuais',
  livre: 'Outra',
}

export const ASSET_LABELS: Record<GoalAsset, string> = { renda_fixa: 'Renda fixa', renda_variavel: 'Renda variável' }

/** Reserva e liberdade são investimento de longo prazo; o resto é meta de curto prazo. */
export const sliceOfKind = (kind: GoalKind): 'investir' | 'curto' => (kind === 'reserva' || kind === 'liberdade' ? 'investir' : 'curto')

// ---------------------------------------------------------------------------
// Renda e alvos
// ---------------------------------------------------------------------------

export interface BaseIncome {
  value: Cents
  /** `manual` = informada no plano; `media` = média das receitas; `nenhuma` = sem receitas lançadas */
  source: 'manual' | 'media' | 'nenhuma'
}

export interface PlanTargets {
  income: BaseIncome
  /** Custo de vida mensal: essenciais + parcelas e dívidas (o que continua vindo num aperto) */
  living: Cents
  /** Quanto a reserva cobre por mês (custo de vida ou renda) */
  reserveMonthly: Cents
  /** Reserva de emergência: `reserveMonthly` × meses */
  reserve: Cents
  freedomIncome: Cents
  /** Liberdade financeira: renda desejada × multiplicador */
  freedom: Cents
}

const wholeReais = (c: Cents) => Math.round(c / 100) * 100

export function planTargets(plan: GoalPlan, d: Diagnosis): PlanTargets {
  const income: BaseIncome = plan.income
    ? { value: plan.income, source: 'manual' }
    : d.income > 0
      ? { value: d.income, source: 'media' }
      : { value: 0, source: 'nenhuma' }
  const living = d.groups.essencial + d.groups.dividas
  // Sem gastos lançados, a reserva usa a renda.
  const reserveMonthly = plan.reserveBase === 'renda' || living === 0 ? income.value : living
  const freedomIncome = plan.freedomIncome ?? income.value
  return {
    income,
    living,
    reserveMonthly,
    reserve: wholeReais(reserveMonthly * plan.reserveMonths),
    freedomIncome,
    freedom: wholeReais(freedomIncome * plan.freedomMultiplier),
  }
}

/** Alvo calculado pelo plano; `null` = tipo sem fórmula ou sem renda para calcular. */
export function autoTargetFor(kind: GoalKind, t: PlanTargets): Cents | null {
  const value = kind === 'reserva' ? t.reserve : kind === 'liberdade' ? t.freedom : 0
  return value > 0 ? value : null
}

/** Caixinha com o alvo do plano aplicado (o `target` salvo pode estar desatualizado). */
export function withPlanTarget(g: Goal, t: PlanTargets): Goal {
  if (!g.autoTarget) return g
  const target = autoTargetFor(kindOf(g), t)
  return target && target !== g.target ? { ...g, target } : g
}

export const savedIn = (g: Goal): Cents => g.deposits.reduce((a, d) => a + d.amount, 0)

/** Guardado (líquido) nas caixinhas no mês; "já tenho guardado" não conta. */
export function depositsInMonth(goals: Goal[], month: YearMonth, kinds?: readonly GoalKind[]): Cents {
  let total = 0
  for (const g of goals) {
    if (kinds && !kinds.includes(kindOf(g))) continue
    for (const d of g.deposits) if (!d.initial && monthOf(d.date) === month) total += d.amount
  }
  return total
}

// ---------------------------------------------------------------------------
// Plano do mês
// ---------------------------------------------------------------------------

export const SLICE_LABELS: Record<BudgetSlice, string> = {
  essencial: 'Essenciais e contas fixas',
  investir: 'Investimentos',
  lazer: 'Lazer e desejos',
  curto: 'Metas de curto prazo',
}

export const SLICE_SHORT: Record<BudgetSlice, string> = { essencial: 'Essenciais', investir: 'Investir', lazer: 'Lazer', curto: 'Curto prazo' }

/** Gasto tem teto; o que guardar tem mínimo. */
export const SLICE_LIMIT: Record<BudgetSlice, 'teto' | 'minimo'> = { essencial: 'teto', investir: 'minimo', lazer: 'teto', curto: 'minimo' }

export interface SliceUsage {
  slice: BudgetSlice
  /** % da renda no plano */
  percent: number
  planned: Cents
  /** Gasto (essenciais, lazer) ou guardado nas caixinhas (investimentos, curto prazo) */
  actual: Cents
  /** Passou do teto ou não chegou no mínimo */
  off: boolean
}

export function monthPlan(
  transactions: Transaction[],
  goals: Goal[],
  month: YearMonth,
  income: Cents,
  plan: GoalPlan,
  fixedSeries: readonly string[] = [],
): SliceUsage[] {
  const fixed = new Set(fixedSeries)
  const actual: Record<BudgetSlice, Cents> = { essencial: 0, investir: 0, lazer: 0, curto: 0 }
  for (const t of transactions) {
    if (t.type !== 'despesa' || monthOf(t.dueDate) !== month) continue
    // Parcelas e dívidas já são compromisso: entram no teto das contas fixas.
    actual[groupOf(t, fixed) === 'estilo' ? 'lazer' : 'essencial'] += t.amount
  }
  for (const g of goals) actual[sliceOfKind(kindOf(g))] += depositsInMonth([g], month)

  return BUDGET_SLICES.map((slice) => {
    const planned = Math.round((income * plan.split[slice]) / 100)
    const off = SLICE_LIMIT[slice] === 'teto' ? actual[slice] > planned : actual[slice] < planned
    return { slice, percent: plan.split[slice], planned, actual: actual[slice], off }
  })
}

// ---------------------------------------------------------------------------
// Liberdade financeira
// ---------------------------------------------------------------------------

/** Rendimento acima da inflação da regra dos 200x (0,5% ao mês). */
export const REAL_MONTHLY_RETURN = 0.005

/**
 * Meses até juntar `target` guardando `monthly` por mês, rendendo 0,5% ao mês
 * acima da inflação. `null` = não chega em 100 anos.
 */
export function monthsToReach(saved: Cents, target: Cents, monthly: Cents, rate = REAL_MONTHLY_RETURN): number | null {
  let balance = saved
  for (let m = 0; m <= 1200; m++) {
    if (balance >= target) return m
    balance = balance * (1 + rate) + monthly
  }
  return null
}

// ---------------------------------------------------------------------------
// Despesas anuais
// ---------------------------------------------------------------------------

export interface SeasonalItem {
  label: string
  /** Valor de cada vez */
  amount: Cents
  /** Quanto guardar por mês */
  monthly: Cents
  /** Quando vem: "todo ano em mar", "a cada ~6 meses" */
  when: string
  /** Carro ou casa; `null` = conta anual */
  owner: string | null
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/**
 * Despesas que não vêm todo mês: fixos anuais (IPVA, IPTU, seguros) e
 * manutenções com custo estimado (casa e veículos), como na reserva do
 * Veículo. Guardar a parte do mês evita que estourem o orçamento quando chegam.
 */
export function seasonalExpenses(
  recurring: RecurringCost[],
  vehicles: Vehicle[],
  maintenance: MaintenanceReminder[],
  transactions: Transaction[],
  month: YearMonth,
): SeasonalItem[] {
  const items: SeasonalItem[] = []
  for (const rc of recurring) {
    if (!rc.active || rc.type !== 'despesa' || rc.frequency !== 'anual') continue
    if (rc.endDate && monthOf(rc.endDate) < month) continue
    items.push({ label: rc.description, amount: rc.amount, monthly: Math.round(rc.amount / 12), when: `todo ano em ${MONTHS[rc.dueMonth - 1]}`, owner: null })
  }
  const active = new Map(vehicles.filter((v) => v.active).map((v) => [v.id, v]))
  for (const r of maintenance) {
    if (!r.estimatedCost) continue
    const vehicle = r.vehicleId === null ? null : active.get(r.vehicleId)
    if (vehicle === undefined) continue
    const cycle = reminderCycle(r, vehicle ? (kmPerMonth(vehicle, transactions) ?? DEFAULT_KM_PER_MONTH) : 0)
    if (!cycle) continue
    items.push({
      label: r.name,
      amount: r.estimatedCost,
      monthly: Math.round(r.estimatedCost / cycle.months),
      when: cycleLabel(cycle.months),
      owner: vehicle ? vehicle.name : 'Casa',
    })
  }
  return items.sort((a, b) => b.monthly - a.monthly)
}

// ---------------------------------------------------------------------------
// Dívidas caras e renda
// ---------------------------------------------------------------------------

/** Dívidas com juros altos (rotativo, cheque especial, empréstimo pessoal). */
export const expensiveDebts = (debts: Debt[]) =>
  debts.filter((d) => d.currentBalance > 0 && d.monthlyInterestRate >= HIGH_INTEREST).sort((a, b) => b.monthlyInterestRate - a.monthlyInterestRate)

export interface IncomeGrowth {
  /** Receitas de janeiro até o mês atual */
  current: Cents
  /** Mesmos meses do ano passado */
  previous: Cents
  /** Último mês contado */
  until: YearMonth
  /** `current / previous − 1`; `null` = sem receitas no ano passado */
  change: number | null
}

export function incomeGrowth(transactions: Transaction[], today: ISODate): IncomeGrowth {
  const until = monthOf(today)
  const lastYearUntil = shiftMonth(until, -12)
  const year = until.slice(0, 4)
  const lastYear = lastYearUntil.slice(0, 4)
  let current = 0
  let previous = 0
  for (const t of transactions) {
    if (t.type !== 'receita') continue
    const m = monthOf(t.dueDate)
    if (m.startsWith(year) && m <= until) current += t.amount
    else if (m.startsWith(lastYear) && m <= lastYearUntil) previous += t.amount
  }
  return { current, previous, until, change: previous > 0 ? current / previous - 1 : null }
}

// ---------------------------------------------------------------------------
// Diversificação
// ---------------------------------------------------------------------------

/** Saldo das caixinhas de longo prazo por tipo de aplicação. */
export function allocation(goals: Goal[]): Record<GoalAsset | 'sem_tipo', Cents> {
  const out: Record<GoalAsset | 'sem_tipo', Cents> = { renda_fixa: 0, renda_variavel: 0, sem_tipo: 0 }
  for (const g of goals) {
    const kind = kindOf(g)
    if (kind === 'anual' || kind === 'curto_prazo') continue
    const saved = savedIn(g)
    if (saved > 0) out[g.asset ?? 'sem_tipo'] += saved
  }
  return out
}
