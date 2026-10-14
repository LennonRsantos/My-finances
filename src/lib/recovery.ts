/**
 * Cálculos do "Sair do vermelho": diagnóstico de renda x gastos, plano de
 * cortes, parcelas que terminam e simulação de quitação de dívidas.
 */
import type { Category, Cents, Debt, DebtStrategy, RecurringCost, Transaction, YearMonth } from '@/types/finance'
import { lastNMonths, monthOf, shiftMonth } from './dates'

// ---------------------------------------------------------------------------
// Diagnóstico
// ---------------------------------------------------------------------------

/** Essencial = difícil de cortar; dívida = compromisso já assumido; estilo de vida = onde dá para cortar. */
export type SpendingGroup = 'essencial' | 'dividas' | 'estilo'

const ESSENTIAL_CATEGORIES = new Set(['cat-moradia', 'cat-alimentacao', 'cat-transporte', 'cat-veiculo', 'cat-saude', 'cat-educacao'])
const DEBT_CATEGORIES = new Set(['cat-emprestimos'])
/** Dentro de categorias essenciais, mas cortáveis. */
const LIFESTYLE_SUBCATEGORIES = new Set(['sub-delivery', 'sub-restaurante', 'sub-app', 'sub-veiculo-lavagem'])

export function groupOf(t: Pick<Transaction, 'categoryId' | 'subcategoryId' | 'installment'>): SpendingGroup {
  if (t.installment || DEBT_CATEGORIES.has(t.categoryId)) return 'dividas'
  if (t.subcategoryId && LIFESTYLE_SUBCATEGORIES.has(t.subcategoryId)) return 'estilo'
  return ESSENTIAL_CATEGORIES.has(t.categoryId) ? 'essencial' : 'estilo'
}

/** Referência 50/30/20 adaptada: teto recomendado de cada grupo sobre a renda. */
export const GROUP_LIMITS: Record<SpendingGroup, number> = { essencial: 0.5, estilo: 0.3, dividas: 0.2 }

export const GROUP_LABELS: Record<SpendingGroup, string> = {
  essencial: 'Essenciais',
  dividas: 'Dívidas e parcelas',
  estilo: 'Estilo de vida',
}

export interface CategoryAverage {
  category: Category
  /** Média mensal no período */
  average: Cents
  /** Parte que dá para cortar (sem parcelas e dívidas, que já são compromisso) */
  cuttable: Cents
  /** Quanto do cortável é estilo de vida (ex.: delivery dentro de Alimentação) */
  lifestyle: Cents
  /** Grupo predominante dos gastos da categoria */
  group: SpendingGroup
}

export interface Diagnosis {
  /** Meses com lançamentos usados na média */
  months: YearMonth[]
  income: Cents
  expenses: Cents
  /** Renda − gastos; negativo = no vermelho */
  balance: Cents
  groups: Record<SpendingGroup, Cents>
  categories: CategoryAverage[]
  /** Despesas vencidas e não pagas (todas as datas) */
  overdue: Cents
  overdueCount: number
}

export type HealthLevel = 'vermelho' | 'limite' | 'positivo' | 'sem_dados'

export function healthOf(d: Diagnosis): HealthLevel {
  if (!d.months.length || (d.income === 0 && d.expenses === 0)) return 'sem_dados'
  if (d.balance < 0) return 'vermelho'
  return d.balance < d.income * 0.1 ? 'limite' : 'positivo'
}

/** Média dos últimos `n` meses (até `endMonth`) que têm lançamentos. */
export function computeDiagnosis(
  transactions: Transaction[],
  categories: Category[],
  endMonth: YearMonth,
  today: string,
  n = 3,
): Diagnosis {
  const window = new Set(lastNMonths(endMonth, n))
  const inWindow = transactions.filter((t) => window.has(monthOf(t.dueDate)))
  const months = [...new Set(inWindow.map((t) => monthOf(t.dueDate)))].sort()
  const div = Math.max(months.length, 1)

  let income = 0
  let expenses = 0
  const groups: Record<SpendingGroup, Cents> = { essencial: 0, dividas: 0, estilo: 0 }
  const byCategory = new Map<string, { total: Cents; groups: Record<SpendingGroup, Cents> }>()

  for (const t of inWindow) {
    if (t.type === 'receita') {
      income += t.amount
      continue
    }
    expenses += t.amount
    const g = groupOf(t)
    groups[g] += t.amount
    const entry = byCategory.get(t.categoryId) ?? { total: 0, groups: { essencial: 0, dividas: 0, estilo: 0 } }
    entry.total += t.amount
    entry.groups[g] += t.amount
    byCategory.set(t.categoryId, entry)
  }

  const avg = (v: Cents) => Math.round(v / div)
  const pending = transactions.filter((t) => t.type === 'despesa' && t.status !== 'pago' && t.dueDate < today)

  return {
    months,
    income: avg(income),
    expenses: avg(expenses),
    balance: avg(income) - avg(expenses),
    groups: { essencial: avg(groups.essencial), dividas: avg(groups.dividas), estilo: avg(groups.estilo) },
    categories: categories
      .filter((c) => byCategory.has(c.id))
      .map((category) => {
        const e = byCategory.get(category.id)!
        const group = (Object.keys(e.groups) as SpendingGroup[]).reduce((a, b) => (e.groups[b] > e.groups[a] ? b : a))
        return { category, average: avg(e.total), cuttable: avg(e.total - e.groups.dividas), lifestyle: avg(e.groups.estilo), group }
      })
      .sort((a, b) => b.average - a.average),
    overdue: pending.reduce((a, t) => a + t.amount, 0),
    overdueCount: pending.length,
  }
}

// ---------------------------------------------------------------------------
// Plano de cortes
// ---------------------------------------------------------------------------

export interface CutPlan {
  /** % de corte por categoria (0–100) */
  cuts: Record<string, number>
  /** Gastos fixos (assinaturas etc.) que a pessoa decidiu cancelar */
  cancelled: string[]
  /** Renda extra mensal planejada (bico, venda, hora extra) */
  extraIncome: Cents
}

/** Valor mensal equivalente de um fixo (anual dividido por 12). */
export const monthlyAmount = (rc: RecurringCost): Cents =>
  rc.frequency === 'anual' ? Math.round(rc.amount / 12) : rc.amount

/** Gastos fixos ativos que costumam ser canceláveis. */
export function cancellableCosts(recurring: RecurringCost[]): RecurringCost[] {
  return recurring
    .filter((rc) => rc.active && rc.type === 'despesa' && (rc.isSubscription || !ESSENTIAL_CATEGORIES.has(rc.categoryId)))
    .sort((a, b) => monthlyAmount(b) - monthlyAmount(a))
}

export interface PlanResult {
  cutsTotal: Cents
  cancelledTotal: Cents
  extraIncome: Cents
  /** Quanto o plano libera por mês */
  freed: Cents
  /** Saldo mensal depois do plano */
  newBalance: Cents
}

/**
 * Base de corte de cada categoria: o cortável menos os fixos já cancelados
 * (assim o mesmo gasto não é contado duas vezes).
 */
export function cutBases(d: Diagnosis, plan: CutPlan, recurring: RecurringCost[]): Map<string, { base: Cents; lifestyle: Cents }> {
  const cancelled = new Map<string, Cents>()
  for (const rc of recurring)
    if (plan.cancelled.includes(rc.id)) cancelled.set(rc.categoryId, (cancelled.get(rc.categoryId) ?? 0) + monthlyAmount(rc))
  return new Map(
    d.categories.map((c) => {
      const gone = cancelled.get(c.category.id) ?? 0
      return [c.category.id, { base: Math.max(0, c.cuttable - gone), lifestyle: Math.max(0, c.lifestyle - gone) }]
    }),
  )
}

export function evaluatePlan(d: Diagnosis, plan: CutPlan, recurring: RecurringCost[]): PlanResult {
  const cancelledTotal = recurring.filter((rc) => plan.cancelled.includes(rc.id)).reduce((a, rc) => a + monthlyAmount(rc), 0)
  let cutsTotal = 0
  for (const [id, { base }] of cutBases(d, plan, recurring)) cutsTotal += Math.round((base * (plan.cuts[id] ?? 0)) / 100)
  const freed = cutsTotal + cancelledTotal + plan.extraIncome
  return { cutsTotal, cancelledTotal, extraIncome: plan.extraIncome, freed, newBalance: d.balance + freed }
}

/** Corte máximo sugerido: estilo de vida aguenta bem mais que o essencial. */
const MAX_LIFESTYLE_CUT = 0.4
const MAX_ESSENTIAL_CUT = 0.1

/**
 * Sugere cortes para zerar o déficit e deixar uma folga de 5% da renda
 * (para dívidas e reserva). Primeira rodada: só a parte estilo de vida de
 * cada categoria (delivery, lazer, compras), das maiores para as menores.
 * Segunda rodada, se ainda faltar: até 10% da parte essencial.
 */
export function suggestCuts(d: Diagnosis, plan: CutPlan, recurring: RecurringCost[]): Record<string, number> {
  const target = Math.max(0, -d.balance) + Math.round(d.income * 0.05)
  const { cancelledTotal } = evaluatePlan(d, { ...plan, cuts: {} }, recurring)
  let missing = target - cancelledTotal - plan.extraIncome
  const bases = [...cutBases(d, plan, recurring)].filter(([, b]) => b.base > 0)
  const amounts = new Map<string, Cents>()

  const round = (capOf: (b: { base: Cents; lifestyle: Cents }) => number) => {
    for (const [id, b] of [...bases].sort(([, x], [, y]) => capOf(y) - capOf(x))) {
      if (missing <= 0) return
      const take = Math.min(Math.round(capOf(b)), missing)
      if (take <= 0) continue
      amounts.set(id, (amounts.get(id) ?? 0) + take)
      missing -= take
    }
  }
  round((b) => b.lifestyle * MAX_LIFESTYLE_CUT)
  round((b) => (b.base - b.lifestyle) * MAX_ESSENTIAL_CUT)

  const cuts: Record<string, number> = {}
  for (const [id, amount] of amounts) {
    const base = bases.find(([x]) => x === id)![1].base
    cuts[id] = Math.min(100, Math.ceil(((amount / base) * 100) / 5) * 5)
  }
  return cuts
}

// ---------------------------------------------------------------------------
// Parcelas que terminam
// ---------------------------------------------------------------------------

export interface EndingInstallment {
  installmentId: string
  description: string
  /** Valor da última parcela */
  monthly: Cents
  remaining: number
  remainingTotal: Cents
  lastMonth: YearMonth
}

export function endingInstallments(transactions: Transaction[]): EndingInstallment[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (!t.installment || t.type !== 'despesa' || t.status === 'pago') continue
    const list = groups.get(t.installment.installmentId) ?? []
    list.push(t)
    groups.set(t.installment.installmentId, list)
  }
  return [...groups]
    .map(([installmentId, list]) => {
      const sorted = list.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      const last = sorted[sorted.length - 1]!
      return {
        installmentId,
        description: last.description.replace(/\s*\(\d+\/\d+\)$/, ''),
        monthly: last.amount,
        remaining: sorted.length,
        remainingTotal: sorted.reduce((a, t) => a + t.amount, 0),
        lastMonth: monthOf(last.dueDate),
      }
    })
    .sort((a, b) => a.lastMonth.localeCompare(b.lastMonth))
}

// ---------------------------------------------------------------------------
// Quitação de dívidas
// ---------------------------------------------------------------------------

export const MAX_SIMULATION_MONTHS = 360

export interface PayoffResult {
  strategy: DebtStrategy
  /** Meses até zerar tudo; `null` = não quita em 30 anos */
  months: number | null
  totalInterest: Cents
  totalPaid: Cents
  /** Mês (1-based) em que cada dívida zera */
  payoffMonth: Record<string, number | null>
  /** Ordem de prioridade do pagamento extra */
  order: string[]
}

export function sumMinimums(debts: Debt[]): Cents {
  return debts.reduce((a, d) => a + d.minimumPayment, 0)
}

/** Avalanche: maior juro primeiro. Bola de neve: menor saldo primeiro. */
function priority(debts: Debt[], strategy: DebtStrategy): Debt[] {
  return [...debts].sort((a, b) =>
    strategy === 'avalanche'
      ? b.monthlyInterestRate - a.monthlyInterestRate || a.currentBalance - b.currentBalance
      : a.currentBalance - b.currentBalance || b.monthlyInterestRate - a.monthlyInterestRate,
  )
}

/**
 * Simula mês a mês: aplica juros, paga o mínimo de todas e joga o resto do
 * orçamento na prioridade da estratégia. Quando uma dívida zera, o mínimo
 * dela continua no orçamento e reforça a próxima (efeito bola de neve).
 */
export function simulatePayoff(debts: Debt[], monthlyBudget: Cents, strategy: DebtStrategy): PayoffResult {
  const order = priority(debts, strategy).map((d) => d.id)
  const balance = new Map(debts.map((d) => [d.id, d.currentBalance]))
  const payoffMonth: Record<string, number | null> = Object.fromEntries(debts.map((d) => [d.id, d.currentBalance > 0 ? null : 0]))
  const budget = Math.max(monthlyBudget, sumMinimums(debts))
  let totalInterest = 0
  let totalPaid = 0

  for (let month = 1; month <= MAX_SIMULATION_MONTHS; month++) {
    const open = debts.filter((d) => (balance.get(d.id) ?? 0) > 0)
    if (!open.length) return { strategy, months: month - 1, totalInterest, totalPaid, payoffMonth, order }

    for (const d of open) {
      const interest = Math.round(((balance.get(d.id) ?? 0) * d.monthlyInterestRate) / 100)
      balance.set(d.id, (balance.get(d.id) ?? 0) + interest)
      totalInterest += interest
    }

    let available = budget
    const pay = (d: Debt, amount: Cents) => {
      const value = Math.min(amount, balance.get(d.id) ?? 0, available)
      balance.set(d.id, (balance.get(d.id) ?? 0) - value)
      available -= value
      totalPaid += value
    }
    for (const d of open) pay(d, d.minimumPayment)
    for (const id of order) {
      const d = open.find((x) => x.id === id)
      if (d && available > 0) pay(d, available)
    }
    for (const d of open) if ((balance.get(d.id) ?? 0) <= 0 && payoffMonth[d.id] === null) payoffMonth[d.id] = month
  }

  const done = debts.every((d) => (balance.get(d.id) ?? 0) <= 0)
  return { strategy, months: done ? MAX_SIMULATION_MONTHS : null, totalInterest, totalPaid, payoffMonth, order }
}

/** Dívida cuja parcela nem cobre os juros do mês: o saldo só cresce. */
export const minimumBelowInterest = (d: Debt) => d.minimumPayment <= Math.round((d.currentBalance * d.monthlyInterestRate) / 100)

/** Juros acima disso (a.m.) indicam rotativo/cheque especial: prioridade de renegociação. */
export const HIGH_INTEREST = 5

export const monthAfter = (start: YearMonth, months: number) => shiftMonth(start, months)
