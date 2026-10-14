import type { Cents, CurrencyCode } from '@/types/finance'

const formatters = new Map<string, Intl.NumberFormat>()

function getFormatter(currency: CurrencyCode, compact: boolean) {
  const key = `${currency}-${compact}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
    })
    formatters.set(key, f)
  }
  return f
}

export function formatMoney(
  value: Cents,
  { currency = 'BRL', compact = false }: { currency?: CurrencyCode; compact?: boolean } = {},
): string {
  return getFormatter(currency, compact).format(value / 100)
}

/** Reais (number) -> centavos inteiros */
export function toCents(reais: number): Cents {
  return Math.round(reais * 100)
}

export function fromCents(value: Cents): number {
  return value / 100
}

/**
 * Divide um total em N parcelas inteiras. A diferença de arredondamento
 * vai para a última parcela, então a soma bate exatamente com o total.
 */
export function splitCents(total: Cents, parts: number): Cents[] {
  const base = Math.floor(total / parts)
  const result = Array.from({ length: parts }, () => base)
  result[parts - 1] = total - base * (parts - 1)
  return result
}
