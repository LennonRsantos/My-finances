/**
 * Metas (caixinhas): quanto já foi guardado e quanto guardar por mês para
 * chegar no valor até o prazo. O dinheiro da meta não é lançamento.
 */
import type { Cents, Goal, ISODate, YearMonth } from '@/types/finance'
import { monthOf } from './dates'

export type GoalStatus = 'concluida' | 'sem_prazo' | 'no_ritmo' | 'abaixo' | 'vencida'

export interface GoalProgress {
  saved: Cents
  remaining: Cents
  /** 0–1 */
  ratio: number
  /** Meses do atual até o do prazo, contando os dois; `null` sem prazo */
  monthsLeft: number | null
  /** Quanto guardar por mês para chegar no prazo; `null` sem prazo ou concluída */
  perMonth: Cents | null
  savedThisMonth: Cents
  status: GoalStatus
}

/** Meses de `from` até `to`, contando os dois (jan→jan = 1). */
function monthsBetween(from: YearMonth, to: YearMonth) {
  const [y1, m1] = from.split('-').map(Number)
  const [y2, m2] = to.split('-').map(Number)
  return (y2! - y1!) * 12 + (m2! - m1!) + 1
}

export function goalProgress(goal: Goal, today: ISODate): GoalProgress {
  const saved = goal.deposits.reduce((a, d) => a + d.amount, 0)
  const remaining = Math.max(0, goal.target - saved)
  const month = monthOf(today)
  const savedThisMonth = goal.deposits.filter((d) => !d.initial && monthOf(d.date) === month).reduce((a, d) => a + d.amount, 0)
  const ratio = goal.target > 0 ? Math.min(1, Math.max(0, saved / goal.target)) : 0

  if (remaining === 0) return { saved, remaining, ratio: 1, monthsLeft: null, perMonth: null, savedThisMonth, status: 'concluida' }
  if (!goal.deadline) return { saved, remaining, ratio, monthsLeft: null, perMonth: null, savedThisMonth, status: 'sem_prazo' }

  const monthsLeft = monthsBetween(month, monthOf(goal.deadline))
  if (monthsLeft < 1 || goal.deadline < today) {
    return { saved, remaining, ratio, monthsLeft: 0, perMonth: remaining, savedThisMonth, status: 'vencida' }
  }
  // O que já entrou neste mês conta para a parcela do mês.
  const perMonth = Math.ceil((remaining + Math.max(0, savedThisMonth)) / monthsLeft)
  return { saved, remaining, ratio, monthsLeft, perMonth, savedThisMonth, status: savedThisMonth >= perMonth ? 'no_ritmo' : 'abaixo' }
}
