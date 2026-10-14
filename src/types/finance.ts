/**
 * Modelo de domínio financeiro.
 *
 * Convenções:
 * - Valores monetários são SEMPRE inteiros em centavos (`Cents`) para evitar
 *   erros de ponto flutuante. Conversão para reais só na borda (UI/forms).
 * - Datas de calendário são strings ISO `YYYY-MM-DD` (`ISODate`), sem fuso.
 * - Mês de referência é `YYYY-MM` (`YearMonth`).
 */

// ---------------------------------------------------------------------------
// Primitivos
// ---------------------------------------------------------------------------

export type ID = string
/** Valor monetário inteiro em centavos. Ex.: R$ 12,34 => 1234 */
export type Cents = number
/** Data de calendário `YYYY-MM-DD` */
export type ISODate = `${number}-${number}-${number}`
/** Mês de referência `YYYY-MM` */
export type YearMonth = `${number}-${number}`
/** Cor hexadecimal, ex.: `#22c55e` */
export type HexColor = `#${string}`
/** Percentual expresso em pontos (2.5 = 2,5%) */
export type Percent = number

export type CurrencyCode = 'BRL' | 'USD' | 'EUR'

// ---------------------------------------------------------------------------
// Enumerações
// ---------------------------------------------------------------------------

export const TRANSACTION_TYPES = ['despesa', 'receita'] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

export const TRANSACTION_STATUSES = ['pago', 'pendente', 'atrasado'] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

export const PAYMENT_METHODS = ['cartao_credito', 'pix', 'boleto', 'dinheiro'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const RECURRENCE_FREQUENCIES = ['mensal', 'anual'] as const
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

export const DEBT_STRATEGIES = ['avalanche', 'bola_de_neve'] as const
export type DebtStrategy = (typeof DEBT_STRATEGIES)[number]

export type FinancialHealth = 'saudavel' | 'em_risco' | 'no_vermelho'

/** Ícones permitidos para categorias (mapeados para Lucide em `lib/icons.ts`). */
export const CATEGORY_ICONS = [
  'utensils',
  'house',
  'car',
  'heart-pulse',
  'graduation-cap',
  'gamepad',
  'shopping-bag',
  'repeat',
  'zap',
  'smartphone',
  'plane',
  'shirt',
  'gift',
  'receipt',
  'briefcase',
  'trending-up',
  'wallet',
  'piggy-bank',
  'bus',
  'fuel',
  'wrench',
  'shield-check',
  'landmark',
] as const
export type CategoryIcon = (typeof CATEGORY_ICONS)[number]

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export interface Category {
  id: ID
  name: string
  /** Categoria de despesa ou de receita */
  type: TransactionType
  color: HexColor
  icon: CategoryIcon
  /** Limite de orçamento mensal planejado; `null` = sem limite */
  monthlyBudget: Cents | null
}

export interface Subcategory {
  id: ID
  categoryId: Category['id']
  name: string
  /** Herda da categoria quando ausente */
  color?: HexColor
  icon?: CategoryIcon
  monthlyBudget: Cents | null
}

// ---------------------------------------------------------------------------
// Transações
// ---------------------------------------------------------------------------

/** Vínculo de uma transação com o parcelamento que a gerou. */
export interface InstallmentRef {
  installmentId: Installment['id']
  /** Número desta parcela (1-based) */
  number: number
  total: number
}

export interface Transaction {
  id: ID
  description: string
  /** Sempre positivo; o sinal vem de `type` */
  amount: Cents
  type: TransactionType
  categoryId: Category['id']
  subcategoryId: Subcategory['id'] | null
  dueDate: ISODate
  /** Preenchida somente quando `status === 'pago'` */
  paymentDate: ISODate | null
  status: TransactionStatus
  /** Só despesas têm forma de pagamento; receitas usam `null` */
  paymentMethod: PaymentMethod | null
  /** Presente quando a transação é uma parcela */
  installment: InstallmentRef | null
  /** Presente quando gerada a partir de um custo recorrente */
  recurringCostId: RecurringCost['id'] | null
  /** Pessoa para quem o valor deve ser enviado (ex.: "Isadora"); ausente = ninguém */
  payTo?: string | null
  notes?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Custos recorrentes / fixos
// ---------------------------------------------------------------------------

interface RecurringCostBase {
  id: ID
  description: string
  amount: Cents
  type: TransactionType
  categoryId: Category['id']
  subcategoryId: Subcategory['id'] | null
  /** `null` em receitas fixas */
  paymentMethod: PaymentMethod | null
  /** Dia de vencimento (1–31; ajustado ao último dia em meses curtos) */
  dueDay: number
  autoRenew: boolean
  /** Marca assinaturas (streaming, apps) para a calculadora de economia */
  isSubscription: boolean
  active: boolean
  startDate: ISODate
  endDate: ISODate | null
  /** Último mês já gerado como transação; `null` = nenhum ainda */
  lastGeneratedMonth: YearMonth | null
  /** Pessoa para quem o valor deve ser enviado (ex.: "Isadora"); ausente = ninguém */
  payTo?: string | null
  createdAt: string
}

export interface MonthlyRecurringCost extends RecurringCostBase {
  frequency: 'mensal'
}

export interface YearlyRecurringCost extends RecurringCostBase {
  frequency: 'anual'
  /** Mês de vencimento (1–12) */
  dueMonth: number
}

export type RecurringCost = MonthlyRecurringCost | YearlyRecurringCost

// ---------------------------------------------------------------------------
// Parcelamentos
// ---------------------------------------------------------------------------

export interface Installment {
  id: ID
  description: string
  categoryId: Category['id']
  subcategoryId: Subcategory['id'] | null
  totalInstallments: number
  /** Próxima parcela a pagar (1-based); `totalInstallments + 1` = quitado */
  currentInstallment: number
  totalAmount: Cents
  /** Valor padrão da parcela; a última absorve diferença de arredondamento */
  installmentAmount: Cents
  startDate: ISODate
  paymentMethod: PaymentMethod
  /** Cartão ou conta associada, ex.: "Nubank", "Itaú Visa" */
  accountName: string
  /** Pessoa para quem o valor deve ser enviado (ex.: "Isadora"); ausente = ninguém */
  payTo?: string | null
}

// ---------------------------------------------------------------------------
// Dívidas / Plano de saída do vermelho
// ---------------------------------------------------------------------------

/** Dívida cadastrada para o plano de quitação (cartão, empréstimo, cheque especial...). */
export interface Debt {
  id: ID
  creditorName: string
  /** Juros ao mês, ex.: 12.5 = 12,5% a.m. */
  monthlyInterestRate: Percent
  currentBalance: Cents
  /** Quanto se paga por mês hoje (parcela ou mínimo da fatura) */
  minimumPayment: Cents
  createdAt: string
}

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------

export type ThemePreference = 'light' | 'dark' | 'system'

export interface NotificationPreferences {
  dueToday: boolean
  dueSoon: boolean
  /** Antecedência em dias para alerta "a vencer" */
  dueSoonDays: number
  overdue: boolean
  budgetExceeded: boolean
}

export interface UserSettings {
  currency: CurrencyCode
  locale: 'pt-BR'
  theme: ThemePreference
  /** Saldo inicial da conta antes do primeiro lançamento */
  openingBalance: Cents
  notifications: NotificationPreferences
}

// ---------------------------------------------------------------------------
// Modelos derivados (view models do dashboard)
// ---------------------------------------------------------------------------

export interface MonthSummary {
  month: YearMonth
  currentBalance: Cents
  monthIncome: Cents
  monthExpenses: Cents
  projectedEndBalance: Cents
  health: FinancialHealth
}

/** Quanto falta enviar para uma pessoa. */
export interface PayeeBalance {
  name: string
  /** Pendente com vencimento até o fim do mês selecionado (inclui atrasados) */
  dueThisMonth: Cents
  /** Todo o pendente, inclusive meses futuros */
  totalRemaining: Cents
  overdueCount: number
  /** Itens pendentes até o fim do mês, do mais antigo ao mais novo */
  items: Transaction[]
}

export interface DueAlerts {
  dueToday: Transaction[]
  dueSoon: Transaction[]
  overdue: Transaction[]
}

export interface CategorySpending {
  category: Category
  total: Cents
  /** Fatia do total de despesas do mês (0–1) */
  share: number
}

export interface BudgetUsage {
  category: Category
  spent: Cents
  budget: Cents
  /** spent / budget (pode passar de 1) */
  ratio: number
}

export interface MonthlyPoint {
  month: YearMonth
  label: string
  income: Cents
  expenses: Cents
}

// ---------------------------------------------------------------------------
// Rótulos para UI
// ---------------------------------------------------------------------------

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cartao_credito: 'Cartão de crédito',
  pix: 'Pix',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
}

export const STATUS_LABELS: Record<TransactionStatus, string> = {
  pago: 'Pago',
  pendente: 'Pendente',
  atrasado: 'Atrasado',
}

export const HEALTH_LABELS: Record<FinancialHealth, string> = {
  saudavel: 'Saudável',
  em_risco: 'Em risco',
  no_vermelho: 'No vermelho',
}
