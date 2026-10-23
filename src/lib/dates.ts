import { addDays, addMonths, endOfMonth, format, getDaysInMonth, parseISO, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { ISODate, YearMonth } from '@/types/finance'

export function toISODate(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd') as ISODate
}

export function toYearMonth(date: Date): YearMonth {
  return format(date, 'yyyy-MM') as YearMonth
}

/** Interpreta `YYYY-MM-DD` como data local (sem deslocamento de fuso). */
export function parseDate(value: ISODate): Date {
  return parseISO(value)
}

export function todayISO(): ISODate {
  return toISODate(new Date())
}

export function currentYearMonth(): YearMonth {
  return toYearMonth(new Date())
}

export function monthOf(date: ISODate): YearMonth {
  return date.slice(0, 7) as YearMonth
}

export function yearMonthToDate(month: YearMonth): Date {
  return parseISO(`${month}-01`)
}

export function shiftMonth(month: YearMonth, delta: number): YearMonth {
  return toYearMonth(addMonths(yearMonthToDate(month), delta))
}

export function lastNMonths(endMonth: YearMonth, n: number): YearMonth[] {
  const end = yearMonthToDate(endMonth)
  return Array.from({ length: n }, (_, i) => toYearMonth(subMonths(end, n - 1 - i)))
}

export function monthEnd(month: YearMonth): ISODate {
  return toISODate(endOfMonth(yearMonthToDate(month)))
}

export function addDaysISO(date: ISODate, days: number): ISODate {
  return toISODate(addDays(parseDate(date), days))
}

/** Mesma data N meses depois, ajustando dia 31 -> último dia do mês. */
export function addMonthsISO(date: ISODate, months: number): ISODate {
  return toISODate(addMonths(parseDate(date), months))
}

/** Data com dia fixo dentro do mês, limitada ao último dia. */
export function dateInMonth(month: YearMonth, day: number): ISODate {
  const d = yearMonthToDate(month)
  const clamped = Math.min(day, getDaysInMonth(d))
  return `${month}-${String(clamped).padStart(2, '0')}` as ISODate
}

export function formatMonthLabel(month: YearMonth, style: 'long' | 'short' = 'long'): string {
  const d = yearMonthToDate(month)
  const label = format(d, style === 'long' ? "MMMM 'de' yyyy" : 'MMM', { locale: ptBR })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** "8 meses", "2 anos e 3 meses". */
export function durationLabel(months: number): string {
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'}`
  const y = Math.floor(months / 12)
  const m = months % 12
  return `${y} ${y === 1 ? 'ano' : 'anos'}${m ? ` e ${m} ${m === 1 ? 'mês' : 'meses'}` : ''}`
}

/** "05 de mar"; inclui o ano quando difere do ano corrente. */
export function formatDateShort(date: ISODate): string {
  const d = parseDate(date)
  const pattern = d.getFullYear() === new Date().getFullYear() ? "dd 'de' MMM" : "dd 'de' MMM yyyy"
  return format(d, pattern, { locale: ptBR })
}
