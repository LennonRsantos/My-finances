import type { Category, PaymentMethod, Subcategory, Transaction, YearMonth } from '@/types/finance'
import { currentYearMonth, dateInMonth, lastNMonths, shiftMonth, todayISO } from '@/lib/dates'
import { generateInstallments } from '@/lib/finance'
import { toCents } from '@/lib/money'

/**
 * Versão das categorias padrão. Ao incluir novas, suba o número: contas
 * existentes recebem só as que faltam (por id), sem sobrescrever edições.
 */
export const DEFAULT_CATEGORIES_VERSION = 4

export const mockCategories: Category[] = [
  { id: 'cat-moradia', name: 'Moradia', type: 'despesa', color: '#6366f1', icon: 'house', monthlyBudget: toCents(2200) },
  { id: 'cat-alimentacao', name: 'Alimentação', type: 'despesa', color: '#f97316', icon: 'utensils', monthlyBudget: toCents(1500) },
  { id: 'cat-transporte', name: 'Transporte', type: 'despesa', color: '#0ea5e9', icon: 'bus', monthlyBudget: toCents(600) },
  { id: 'cat-veiculo', name: 'Veículo', type: 'despesa', color: '#b45309', icon: 'car', monthlyBudget: null },
  { id: 'cat-saude', name: 'Saúde', type: 'despesa', color: '#ef4444', icon: 'heart-pulse', monthlyBudget: toCents(500) },
  { id: 'cat-lazer', name: 'Lazer', type: 'despesa', color: '#a855f7', icon: 'gamepad', monthlyBudget: toCents(400) },
  { id: 'cat-assinaturas', name: 'Assinaturas', type: 'despesa', color: '#ec4899', icon: 'repeat', monthlyBudget: toCents(150) },
  { id: 'cat-compras', name: 'Compras', type: 'despesa', color: '#ca8a04', icon: 'shopping-bag', monthlyBudget: toCents(500) },
  { id: 'cat-educacao', name: 'Educação', type: 'despesa', color: '#14b8a6', icon: 'graduation-cap', monthlyBudget: null },
  { id: 'cat-emprestimos', name: 'Empréstimos e financiamentos', type: 'despesa', color: '#64748b', icon: 'landmark', monthlyBudget: null },
  { id: 'cat-salario', name: 'Salário', type: 'receita', color: '#22c55e', icon: 'briefcase', monthlyBudget: null },
  { id: 'cat-freela', name: 'Freelas', type: 'receita', color: '#10b981', icon: 'trending-up', monthlyBudget: null },
]

export const mockSubcategories: Subcategory[] = [
  { id: 'sub-aluguel', categoryId: 'cat-moradia', name: 'Aluguel', monthlyBudget: null },
  { id: 'sub-energia', categoryId: 'cat-moradia', name: 'Energia', monthlyBudget: null },
  { id: 'sub-internet', categoryId: 'cat-moradia', name: 'Internet', monthlyBudget: null },
  { id: 'sub-agua', categoryId: 'cat-moradia', name: 'Água', monthlyBudget: null },
  { id: 'sub-gas', categoryId: 'cat-moradia', name: 'Gás', monthlyBudget: null },
  { id: 'sub-condominio', categoryId: 'cat-moradia', name: 'Condomínio', monthlyBudget: null },
  { id: 'sub-iptu', categoryId: 'cat-moradia', name: 'IPTU', icon: 'receipt', monthlyBudget: null },
  { id: 'sub-casa-manutencao', categoryId: 'cat-moradia', name: 'Manutenção e reparos', icon: 'wrench', monthlyBudget: null },
  { id: 'sub-casa-financiamento', categoryId: 'cat-moradia', name: 'Financiamento do imóvel', icon: 'landmark', monthlyBudget: null },
  { id: 'sub-casa-limpeza', categoryId: 'cat-moradia', name: 'Limpeza e higiene da casa', monthlyBudget: null },
  { id: 'sub-casa-utensilios', categoryId: 'cat-moradia', name: 'Utensílios e cozinha', monthlyBudget: null },
  { id: 'sub-casa-eletro', categoryId: 'cat-moradia', name: 'Eletrodomésticos e eletrônicos', icon: 'zap', monthlyBudget: null },
  { id: 'sub-casa-moveis', categoryId: 'cat-moradia', name: 'Móveis e decoração', icon: 'house', monthlyBudget: null },
  { id: 'sub-mercado', categoryId: 'cat-alimentacao', name: 'Mercado', monthlyBudget: null },
  { id: 'sub-delivery', categoryId: 'cat-alimentacao', name: 'Delivery', monthlyBudget: toCents(300) },
  { id: 'sub-restaurante', categoryId: 'cat-alimentacao', name: 'Restaurante', monthlyBudget: null },
  { id: 'sub-app', categoryId: 'cat-transporte', name: 'Aplicativo', monthlyBudget: null },
  { id: 'sub-transporte-publico', categoryId: 'cat-transporte', name: 'Transporte público', monthlyBudget: null },
  { id: 'sub-veiculo-combustivel', categoryId: 'cat-veiculo', name: 'Combustível', icon: 'fuel', monthlyBudget: null },
  { id: 'sub-veiculo-manutencao', categoryId: 'cat-veiculo', name: 'Manutenção e revisão', icon: 'wrench', monthlyBudget: null },
  { id: 'sub-veiculo-pneus', categoryId: 'cat-veiculo', name: 'Pneus e peças', icon: 'wrench', monthlyBudget: null },
  { id: 'sub-veiculo-seguro', categoryId: 'cat-veiculo', name: 'Seguro', icon: 'shield-check', monthlyBudget: null },
  { id: 'sub-veiculo-ipva', categoryId: 'cat-veiculo', name: 'IPVA e licenciamento', icon: 'receipt', monthlyBudget: null },
  { id: 'sub-veiculo-multas', categoryId: 'cat-veiculo', name: 'Multas', icon: 'receipt', monthlyBudget: null },
  { id: 'sub-veiculo-estacionamento', categoryId: 'cat-veiculo', name: 'Estacionamento e pedágio', monthlyBudget: null },
  { id: 'sub-veiculo-lavagem', categoryId: 'cat-veiculo', name: 'Lavagem', monthlyBudget: null },
  { id: 'sub-veiculo-financiamento', categoryId: 'cat-veiculo', name: 'Financiamento ou consórcio', icon: 'landmark', monthlyBudget: null },
  { id: 'sub-emprestimo-pessoal', categoryId: 'cat-emprestimos', name: 'Empréstimo pessoal', monthlyBudget: null },
  { id: 'sub-emprestimo-consignado', categoryId: 'cat-emprestimos', name: 'Consignado', monthlyBudget: null },
  { id: 'sub-emprestimo-financiamento', categoryId: 'cat-emprestimos', name: 'Financiamento imobiliário', monthlyBudget: null },
  { id: 'sub-emprestimo-fatura', categoryId: 'cat-emprestimos', name: 'Parcelamento de fatura', monthlyBudget: null },
  { id: 'sub-farmacia', categoryId: 'cat-saude', name: 'Farmácia', monthlyBudget: null },
  { id: 'sub-streaming', categoryId: 'cat-assinaturas', name: 'Streaming', monthlyBudget: null },
]

/** Versão em que cada padrão novo entrou; quem não está aqui é da versão 2 ou anterior. */
const INTRODUCED_IN: Record<string, number> = {
  'sub-agua': 3,
  'sub-gas': 3,
  'sub-condominio': 3,
  'sub-iptu': 3,
  'sub-casa-manutencao': 3,
  'sub-casa-financiamento': 4,
  'sub-casa-limpeza': 4,
  'sub-casa-utensilios': 4,
  'sub-casa-eletro': 4,
  'sub-casa-moveis': 4,
}
const introducedIn = (id: string) => INTRODUCED_IN[id] ?? 2

/**
 * Categorias/subcategorias padrão que ainda não existem (comparando por id).
 * Com `sinceVersion`, só as criadas depois dela: padrões antigos que a pessoa
 * apagou de propósito não voltam.
 */
export function missingDefaults(
  categories: Pick<Category, 'id'>[],
  subcategories: Pick<Subcategory, 'id'>[],
  sinceVersion = 0,
) {
  const catIds = new Set(categories.map((c) => c.id))
  const subIds = new Set(subcategories.map((s) => s.id))
  const isNew = (id: string) => introducedIn(id) > sinceVersion
  return {
    categories: mockCategories.filter((c) => !catIds.has(c.id) && isNew(c.id)),
    subcategories: mockSubcategories.filter((s) => !subIds.has(s.id) && isNew(s.id)),
  }
}

/** PRNG determinístico para que o mock seja estável entre recargas. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

interface Template {
  description: string
  categoryId: string
  subcategoryId: string | null
  day: number
  min: number
  max: number
  method: PaymentMethod
  type?: Transaction['type']
}

const monthlyTemplates: Template[] = [
  { description: 'Salário', categoryId: 'cat-salario', subcategoryId: null, day: 5, min: 6800, max: 6800, method: 'pix', type: 'receita' },
  { description: 'Projeto freela', categoryId: 'cat-freela', subcategoryId: null, day: 20, min: 0, max: 1800, method: 'pix', type: 'receita' },
  { description: 'Aluguel', categoryId: 'cat-moradia', subcategoryId: 'sub-aluguel', day: 10, min: 1650, max: 1650, method: 'boleto' },
  { description: 'Conta de luz', categoryId: 'cat-moradia', subcategoryId: 'sub-energia', day: 15, min: 140, max: 260, method: 'boleto' },
  { description: 'Internet fibra', categoryId: 'cat-moradia', subcategoryId: 'sub-internet', day: 12, min: 119.9, max: 119.9, method: 'boleto' },
  { description: 'Supermercado', categoryId: 'cat-alimentacao', subcategoryId: 'sub-mercado', day: 7, min: 480, max: 720, method: 'cartao_credito' },
  { description: 'Supermercado', categoryId: 'cat-alimentacao', subcategoryId: 'sub-mercado', day: 21, min: 300, max: 520, method: 'cartao_credito' },
  { description: 'iFood', categoryId: 'cat-alimentacao', subcategoryId: 'sub-delivery', day: 14, min: 120, max: 380, method: 'cartao_credito' },
  { description: 'Combustível', categoryId: 'cat-veiculo', subcategoryId: 'sub-veiculo-combustivel', day: 9, min: 220, max: 380, method: 'cartao_credito' },
  { description: 'Uber', categoryId: 'cat-transporte', subcategoryId: 'sub-app', day: 18, min: 40, max: 160, method: 'cartao_credito' },
  { description: 'Farmácia', categoryId: 'cat-saude', subcategoryId: 'sub-farmacia', day: 16, min: 30, max: 220, method: 'pix' },
  { description: 'Plano de saúde', categoryId: 'cat-saude', subcategoryId: null, day: 8, min: 320, max: 320, method: 'boleto' },
  { description: 'Netflix', categoryId: 'cat-assinaturas', subcategoryId: 'sub-streaming', day: 3, min: 44.9, max: 44.9, method: 'cartao_credito' },
  { description: 'Spotify', categoryId: 'cat-assinaturas', subcategoryId: 'sub-streaming', day: 3, min: 21.9, max: 21.9, method: 'cartao_credito' },
  { description: 'Academia', categoryId: 'cat-lazer', subcategoryId: null, day: 1, min: 99.9, max: 99.9, method: 'pix' },
  { description: 'Cinema e bares', categoryId: 'cat-lazer', subcategoryId: null, day: 23, min: 60, max: 340, method: 'cartao_credito' },
  { description: 'Curso online', categoryId: 'cat-educacao', subcategoryId: null, day: 25, min: 89, max: 89, method: 'cartao_credito' },
]

export function buildMockTransactions(): Transaction[] {
  const rand = seeded(42)
  const today = todayISO()
  const current = currentYearMonth()
  const months: YearMonth[] = [...lastNMonths(current, 12), shiftMonth(current, 1)]
  const createdAt = new Date().toISOString()

  const recurring = months.flatMap((month) =>
    monthlyTemplates.map((tpl): Transaction | null => {
      const value = tpl.min + (tpl.max - tpl.min) * rand()
      if (value < 1) return null
      const dueDate = dateInMonth(month, tpl.day)
      // Passado: quase tudo pago; alguns atrasos para popular alertas.
      const paid = dueDate < today && rand() > 0.04
      return {
        id: `mock-${month}-${tpl.description}-${tpl.day}`,
        description: tpl.description,
        amount: toCents(value),
        type: tpl.type ?? 'despesa',
        categoryId: tpl.categoryId,
        subcategoryId: tpl.subcategoryId,
        dueDate,
        paymentDate: paid ? dueDate : null,
        status: paid ? 'pago' : 'pendente',
        paymentMethod: tpl.type === 'receita' ? null : tpl.method,
        installment: null,
        recurringCostId: null,
        createdAt,
      }
    }),
  )

  const notebook = generateInstallments({
    description: 'Notebook',
    totalAmount: toCents(4799),
    totalInstallments: 10,
    firstDueDate: dateInMonth(shiftMonth(current, -3), 10),
    categoryId: 'cat-compras',
    subcategoryId: null,
    paymentMethod: 'cartao_credito',
    accountName: 'Nubank',
  }).transactions.map((t) =>
    t.dueDate < today ? { ...t, status: 'pago' as const, paymentDate: t.dueDate } : t,
  )

  return [...recurring.filter((t): t is Transaction => t !== null), ...notebook]
}
