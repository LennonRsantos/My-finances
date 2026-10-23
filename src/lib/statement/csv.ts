/**
 * CSV de fatura/extrato (Nubank, Inter, planilhas exportadas). Descobre o
 * separador e as colunas pelo nome do cabeçalho.
 */
import type { YearMonth } from '@/types/finance'
import { finalize, normalizeSigns, parseAmount, parseDate, type StatementLine } from './parse'

/** Divide uma linha respeitando aspas ("a;b" fica junto). */
function splitRow(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"'
        i++
      } else quoted = !quoted
    } else if (c === sep && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((v) => v.trim())
}

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export function parseCsv(text: string, invoice: YearMonth): StatementLine[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const first = lines[0]!
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') ? '\t' : ','
  const header = splitRow(first, sep).map(plain)
  const find = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)))
  const iDate = find('data', 'date')
  const iDesc = find('descri', 'lancamento', 'title', 'historico', 'estabelecimento', 'memo')
  const iAmount = find('valor', 'amount', 'value', 'quantia')
  if (iDate < 0 || iDesc < 0 || iAmount < 0) throw new Error('Não achei as colunas de data, descrição e valor neste CSV.')

  const rows = lines.slice(1).flatMap((l) => {
    const cols = splitRow(l, sep)
    const date = parseDate(cols[iDate] ?? '', invoice)
    const amount = parseAmount(cols[iAmount] ?? '')
    const description = (cols[iDesc] ?? '').trim()
    return date && amount !== null && amount !== 0 && description ? [{ date, description, amount }] : []
  })
  return finalize(normalizeSigns(rows))
}
