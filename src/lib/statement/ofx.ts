/**
 * OFX (padrão dos bancos: Itaú, Bradesco, Santander, BB...). Lê cada
 * `<STMTTRN>`; o FITID vira a chave, então reimportar não duplica.
 */
import type { ISODate } from '@/types/finance'
import { finalize, normalizeSigns, parseAmount, type StatementLine } from './parse'

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? ''

export function parseOfx(text: string): StatementLine[] {
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  const rows = blocks.flatMap((b) => {
    const posted = tag(b, 'DTPOSTED')
    const date = /^\d{8}/.test(posted) ? (`${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}` as ISODate) : null
    const raw = parseAmount(tag(b, 'TRNAMT').replace('.', ','))
    const description = tag(b, 'MEMO') || tag(b, 'NAME')
    const fitid = tag(b, 'FITID')
    // No OFX a compra é saída (negativa): vira positiva aqui.
    return date && raw !== null && raw !== 0 && description ? [{ date, description, amount: -raw, key: fitid ? `ofx:${fitid}` : undefined }] : []
  })
  // Alguns bancos já mandam a compra positiva: `normalizeSigns` desfaz a inversão.
  return finalize(normalizeSigns(rows))
}
