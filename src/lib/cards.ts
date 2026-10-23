/**
 * Cartões de crédito: em que fatura cai cada compra, resumo da fatura, limite
 * usado e ajuda para importar extratos (categoria sugerida e compras já
 * lançadas que podem ser ligadas em vez de duplicadas).
 */
import type { Cents, CreditCard, ISODate, Transaction, YearMonth } from '@/types/finance'
import { addDaysISO, dateInMonth, monthOf, shiftMonth } from './dates'

export const CARD_COLORS = ['#7c3aed', '#0f766e', '#b91c1c', '#1d4ed8', '#c2410c', '#334155'] as const

type CardList = Pick<CreditCard, 'id' | 'active'>[]

/** Compra no cartão de crédito ainda sem cartão escolhido. */
const cardPurchase = (t: Transaction) => t.type === 'despesa' && t.paymentMethod === 'cartao_credito'

/**
 * Cartão da compra: o escolhido; sem escolha e com um cartão só, esse cartão
 * (vale para compras antigas, sem regravar). Com vários, `null` até escolher.
 */
export function cardOf(t: Transaction, cards: CardList): string | null {
  if (t.cardId) return t.cardId
  if (!cardPurchase(t)) return null
  const active = cards.filter((c) => c.active)
  return active.length === 1 ? active[0]!.id : null
}

/** Compras do cartão (despesas). */
export const cardExpenses = (transactions: Transaction[], cardId: string, cards: CardList) =>
  transactions.filter((t) => t.type === 'despesa' && cardOf(t, cards) === cardId)

/** Com vários cartões: compras no cartão de crédito que ainda não dizem qual (fora as de conta dividida). */
export const unassignedCardPurchases = (transactions: Transaction[], cards: CardList) =>
  cards.filter((c) => c.active).length < 2
    ? []
    : transactions.filter((t) => cardPurchase(t) && !t.cardId && !t.sharedBillId).sort((a, b) => b.dueDate.localeCompare(a.dueDate))

/**
 * Fatura de uma compra: até o dia de fechamento entra na fatura do mês;
 * depois dele, na do mês seguinte. O vencimento é no mês da fatura, ou no
 * seguinte quando o vencimento vem antes do fechamento (ex.: fecha 28, vence 5).
 */
export function invoiceOf(date: ISODate, card: Pick<CreditCard, 'closingDay' | 'dueDay'>): YearMonth {
  const m = monthOf(date)
  return Number(date.slice(8, 10)) > card.closingDay ? shiftMonth(m, 1) : m
}

export function invoiceDates(month: YearMonth, card: Pick<CreditCard, 'closingDay' | 'dueDay'>): { closing: ISODate; due: ISODate } {
  const closing = dateInMonth(month, card.closingDay)
  const due = dateInMonth(card.dueDay > card.closingDay ? month : shiftMonth(month, 1), card.dueDay)
  return { closing, due }
}

export type InvoiceStatus = 'aberta' | 'fechada' | 'paga' | 'atrasada' | 'vazia'

export interface InvoiceSummary {
  month: YearMonth
  closing: ISODate
  due: ISODate
  items: Transaction[]
  total: Cents
  paid: Cents
  open: Cents
  status: InvoiceStatus
}

export function invoiceSummary(transactions: Transaction[], card: CreditCard, month: YearMonth, today: ISODate, cards: CardList): InvoiceSummary {
  const { closing, due } = invoiceDates(month, card)
  const items = cardExpenses(transactions, card.id, cards)
    .filter((t) => invoiceOf(t.dueDate, card) === month)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  const total = items.reduce((a, t) => a + t.amount, 0)
  const paid = items.filter((t) => t.status === 'pago').reduce((a, t) => a + t.amount, 0)
  const open = total - paid
  const status: InvoiceStatus =
    items.length === 0 ? 'vazia' : open === 0 ? 'paga' : today > due ? 'atrasada' : today > closing ? 'fechada' : 'aberta'
  return { month, closing, due, items, total, paid, open, status }
}

/** Fatura em que uma compra feita hoje cairia. */
export const currentInvoice = (card: CreditCard, today: ISODate) => invoiceOf(today, card)

/** Limite já comprometido: compras do cartão ainda não pagas (inclui parcelas futuras). */
export const usedLimit = (transactions: Transaction[], cardId: string, cards: CardList) =>
  cardExpenses(transactions, cardId, cards)
    .filter((t) => t.status !== 'pago')
    .reduce((a, t) => a + t.amount, 0)

// ---------------------------------------------------------------------------
// Importação de extrato
// ---------------------------------------------------------------------------

/** "PARC 03/10", "3/10", "03 de 10", "Parcela 3 de 10" → número e total, e a descrição sem isso. */
export function splitInstallment(description: string): { description: string; installment: { number: number; total: number } | null } {
  const re = /\s*[-–(]?\s*(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*\)?\s*$/i
  const m = description.match(re)
  if (m) {
    const number = Number(m[1])
    const total = Number(m[2])
    if (total >= 2 && number >= 1 && number <= total && total <= 120) {
      return { description: description.slice(0, m.index).trim() || description.trim(), installment: { number, total } }
    }
  }
  return { description: description.trim(), installment: null }
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(\d+\/\d+\)/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)

/** 0–1: quanto as palavras das duas descrições batem. */
export function similarity(a: string, b: string): number {
  const wa = new Set(words(a))
  const wb = new Set(words(b))
  if (!wa.size || !wb.size) return 0
  let common = 0
  for (const w of wa) if (wb.has(w)) common++
  return common / Math.min(wa.size, wb.size)
}

/** Categoria do lançamento mais parecido já feito; sem nada parecido, `fallback`. */
export function suggestCategory(
  description: string,
  transactions: Transaction[],
  fallback: string,
): { categoryId: string; subcategoryId: string | null } {
  let best: Transaction | null = null
  let score = 0
  for (const t of transactions) {
    if (t.type !== 'despesa') continue
    const s = similarity(description, t.description)
    if (s > score || (s === score && best && t.dueDate > best.dueDate)) {
      best = t
      score = s
    }
  }
  return best && score >= 0.5 ? { categoryId: best.categoryId, subcategoryId: best.subcategoryId } : { categoryId: fallback, subcategoryId: null }
}

export interface MatchCandidate {
  transaction: Transaction
  /** Maior = mais provável */
  score: number
}

/**
 * Lançamentos já existentes que provavelmente são esta compra: mesmo valor
 * (±R$ 0,05), data até 5 dias de diferença (parcela: mesmo número e total).
 * Inclui os já importados por outro arquivo (ex.: o CSV antes do OFX), para a
 * mesma compra não entrar duas vezes. Ordenados pelo mais provável.
 */
export function findMatches(
  line: { date: ISODate; description: string; amount: Cents; installment: { number: number; total: number } | null },
  transactions: Transaction[],
  taken: ReadonlySet<string> = new Set(),
): MatchCandidate[] {
  const from = addDaysISO(line.date, -5)
  const to = addDaysISO(line.date, 5)
  const out: MatchCandidate[] = []
  for (const t of transactions) {
    if (t.type !== 'despesa' || taken.has(t.id) || t.fuel) continue
    if (Math.abs(t.amount - line.amount) > 5) continue
    const sameInstallment = line.installment && t.installment && t.installment.number === line.installment.number && t.installment.total === line.installment.total
    // Parcela: a data da linha costuma ser a da compra original; vale pelo número da parcela.
    if (!sameInstallment && (t.dueDate < from || t.dueDate > to)) continue
    const days = Math.abs(new Date(t.dueDate).getTime() - new Date(line.date).getTime()) / 86_400_000
    const score = (sameInstallment ? 2 : 0) + similarity(line.description, t.description) + (t.amount === line.amount ? 0.5 : 0) + Math.max(0, 1 - days / 5) * 0.5
    out.push({ transaction: t, score })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Linhas que não são compra: pagamento da fatura, estorno, crédito, anuidade estornada. */
export const isPaymentLike = (description: string, amount: Cents) =>
  amount < 0 || /pagamento|pagto|estorno|cr[eé]dito|devolu|reembolso/i.test(description)

/** Situação para exibir. */
export const INVOICE_LABEL: Record<InvoiceStatus, string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  paga: 'Paga',
  atrasada: 'Atrasada',
  vazia: 'Sem compras',
}
