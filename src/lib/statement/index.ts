/** Lê o arquivo de fatura/extrato pelo tipo: OFX, CSV, PDF ou imagem. */
import type { YearMonth } from '@/types/finance'
import { parseCsv } from './csv'
import { parseOfx } from './ofx'
import type { StatementLine } from './parse'

export type { StatementLine } from './parse'

export type StatementKind = 'ofx' | 'csv' | 'pdf' | 'image'

export function kindOf(file: File): StatementKind | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.ofx') || name.endsWith('.qfx')) return 'ofx'
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') return 'csv'
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (file.type.startsWith('image/')) return 'image'
  return null
}

/** Texto de arquivos pequenos tentando UTF-8 e, se vier quebrado, Latin-1 (comum em OFX/CSV de banco). */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8
}

export async function readStatement(file: File, invoice: YearMonth, onProgress?: (p: number) => void): Promise<StatementLine[]> {
  const kind = kindOf(file)
  if (kind === 'ofx') return parseOfx(await readText(file))
  if (kind === 'csv') return parseCsv(await readText(file), invoice)
  if (kind === 'pdf') return (await import('./pdf')).parsePdf(file, invoice)
  if (kind === 'image') return (await import('./image')).parseImage(file, invoice, onProgress)
  throw new Error('Formato não reconhecido. Use PDF, CSV, OFX ou imagem (PNG/JPG).')
}
