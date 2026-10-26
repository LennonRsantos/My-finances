import { todayISO } from '@/lib/dates'
import { fromCents, splitCents, toCents } from '@/lib/money'
import { parseMoneyInput } from '@/lib/schemas'
import { createId } from '@/lib/utils'
import type { Cents, ISODate } from '@/types/finance'

/** Uma parte de receita recebida em datas diferentes (ex.: freela pago metade agora, metade depois). */
export interface ReceiptPart {
  id: string
  /** Texto da caixa de valor; a última parte é sempre o restante do total. */
  amount: string
  date: ISODate | ''
}

export const MIN_PARTS = 2
export const MAX_PARTS = 12

const moneyText = (c: number) => fromCents(c).toFixed(2).replace('.', ',')

/** Uma parte por data, com o total dividido igual (sem total válido, valores vazios). */
export function spreadParts(totalCents: Cents, dates: (ISODate | '')[]): ReceiptPart[] {
  const cents = totalCents > 0 ? splitCents(totalCents, dates.length) : null
  return dates.map((date, i) => ({ id: createId(), amount: cents ? moneyText(cents[i]!) : '', date }))
}

/**
 * Valor de cada parte em centavos: as editáveis pelo que foi digitado, a
 * última com o que falta para fechar o total. `error` quando não dá para salvar.
 */
export function resolveParts(parts: ReceiptPart[], totalCents: Cents) {
  const typed = parts.slice(0, -1).map((p) => toCents(parseMoneyInput(p.amount)))
  const remainder = totalCents - typed.reduce((a, b) => a + b, 0)
  const error = typed.some((c) => !(c > 0))
    ? 'Informe o valor de cada parte.'
    : !(remainder > 0)
      ? 'As partes passam do total. Ajuste os valores.'
      : parts.some((p) => !p.date)
        ? 'Escolha a data de cada parte.'
        : null
  return { cents: [...typed, remainder], remainder, error }
}

/**
 * Campos de cada lançamento gerado: "(1/2)" na descrição (sem repetir o de
 * uma divisão anterior). Com `received`, partes até hoje entram recebidas;
 * parte com data futura fica sempre pendente.
 */
export function partEntries(parts: ReceiptPart[], cents: Cents[], description: string, received: boolean) {
  const today = todayISO()
  const base = description.replace(/\s*\(\d+\/\d+\)$/, '')
  return parts.map((p, i) => {
    const date = p.date as ISODate
    const paid = received && date <= today
    return {
      description: `${base} (${i + 1}/${parts.length})`,
      amount: cents[i]!,
      dueDate: date,
      status: paid ? ('pago' as const) : ('pendente' as const),
      paymentDate: paid ? date : null,
    }
  })
}
