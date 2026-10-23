/**
 * Peças comuns da leitura de extrato/fatura: datas, valores, linhas de texto
 * ("12/10 MERCADO X 230,00") e o formato único que todos os leitores devolvem.
 */
import type { Cents, ISODate, YearMonth } from '@/types/finance'
import { splitInstallment } from '../cards'

export interface StatementLine {
  date: ISODate
  description: string
  /** Positivo = compra; negativo = pagamento, estorno ou crédito */
  amount: Cents
  installment: { number: number; total: number } | null
  /** Identifica a linha entre importações (FITID do OFX ou data+descrição+valor) */
  key: string
}

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6,
  jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * "2026-10-12", "12/10/2026", "12/10/26", "12/10", "12 OUT", "12/out".
 * Sem ano: o do mês da fatura, ou o anterior quando o mês da compra vem depois
 * (compra de dezembro numa fatura de janeiro).
 */
export function parseDate(raw: string, invoice: YearMonth): ISODate | null {
  const s = raw.trim().toLowerCase()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}` as ISODate
  m = s.match(/^(\d{1,2})[/.\-\s]+(\d{1,2}|[a-zç]{3})[a-zç]*\.?(?:[/.\-\s]+(\d{2,4}))?$/)
  if (!m) return null
  const day = Number(m[1])
  const month = /^\d+$/.test(m[2]!) ? Number(m[2]) : MONTHS[m[2]!.slice(0, 3)]
  if (!month || month < 1 || month > 12 || day < 1 || day > 31) return null
  let year: number
  if (m[3]) year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  else {
    const [iy, im] = invoice.split('-').map(Number)
    year = month > im! + 1 ? iy! - 1 : iy!
  }
  return `${year}-${pad(month)}-${pad(day)}` as ISODate
}

/** "R$ 1.234,56", "-45,00", "45,00-", "1234.56", "(45,00)" → centavos (negativo quando marcado). */
export function parseAmount(raw: string): Cents | null {
  let s = raw.trim().replace(/r\$\s?/i, '').replace(/\s/g, '')
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.endsWith('-')) {
    negative = true
    s = s.slice(0, -1)
  }
  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) s = s.slice(1)
  if (!/^[\d.,]+$/.test(s)) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  // O separador decimal é o último que aparece com 1–2 dígitos depois.
  let normalized: string
  if (lastComma > lastDot) normalized = s.replace(/\./g, '').replace(',', '.')
  else if (lastDot > lastComma && s.length - lastDot - 1 <= 2) normalized = s.replace(/,/g, '')
  else normalized = s.replace(/[.,]/g, '')
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  return negative ? -cents : cents
}

const normalizeKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Monta as linhas finais: parcela separada da descrição e chave única por linha. */
export function finalize(raw: { date: ISODate; description: string; amount: Cents; key?: string }[]): StatementLine[] {
  const seen = new Map<string, number>()
  return raw.map((r) => {
    const { description, installment } = splitInstallment(r.description)
    const base = `${r.date}|${normalizeKey(r.description)}|${r.amount}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { date: r.date, description, amount: r.amount, installment, key: r.key ?? `${base}|${n}` }
  })
}

/**
 * Se quase tudo veio negativo, o banco marca compra como saída (comum em
 * extrato de conta): inverte para compra ficar positiva.
 */
export function normalizeSigns<T extends { amount: Cents }>(rows: T[]): T[] {
  const negatives = rows.filter((r) => r.amount < 0).length
  return negatives > rows.length / 2 ? rows.map((r) => ({ ...r, amount: -r.amount })) : rows
}

// Linha de texto: data no começo, valor no fim, descrição no meio.
const LINE_RE =
  /^(\d{1,2}[/.\-\s](?:\d{1,2}|[A-Za-zÇç]{3})[A-Za-zÇç]*\.?(?:[/.\-\s]\d{2,4})?)\s+(.+?)\s+(\(?-?\s?(?:R\$\s?)?-?\d{1,3}(?:[.\s]?\d{3})*,\d{2}\)?-?)$/

/** Texto corrido (PDF ou foto) → linhas "data descrição valor". O resto é ignorado. */
export function parseTextLines(text: string, invoice: YearMonth): StatementLine[] {
  const rows: { date: ISODate; description: string; amount: Cents }[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim()
    const m = line.match(LINE_RE)
    if (!m) continue
    const date = parseDate(m[1]!, invoice)
    const amount = parseAmount(m[3]!)
    const description = m[2]!.replace(/\s+R\$$/i, '').trim()
    if (!date || amount === null || amount === 0 || description.length < 2) continue
    rows.push({ date, description, amount })
  }
  return finalize(rows)
}
