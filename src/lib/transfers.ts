/**
 * "Enviar para @usuário": cada despesa minha com `payToUid` vira um espelho em
 * `transfers/`, que a outra pessoa lê ("Lennon deve te enviar R$ X"). Aqui
 * ficam as partes puras: o que deveria existir, a diferença para o que existe
 * e o resumo de quem recebe.
 */
import type { Cents, ISODate, Transaction, Transfer, YearMonth } from '@/types/finance'
import { addDaysISO, monthEnd } from './dates'

/** Enviados continuam visíveis para quem recebe por este tempo. */
const SENT_DAYS = 30

export const transferId = (fromUid: string, txId: string) => `${fromUid}_${txId}`

export interface Me {
  uid: string
  handle: string | null
  name: string | null
}

export type TransferData = Omit<Transfer, 'updatedAt'>

/** Espelhos que deveriam existir a partir dos meus lançamentos. */
export function desiredTransfers(transactions: Transaction[], me: Me, today: ISODate): TransferData[] {
  const since = addDaysISO(today, -SENT_DAYS)
  const out: TransferData[] = []
  for (const t of transactions) {
    if (t.type !== 'despesa' || !t.payToUid || t.payToUid === me.uid || t.sharedSuspended) continue
    const sent = t.status === 'pago'
    if (sent && (t.paymentDate ?? t.dueDate) < since) continue
    out.push({
      id: transferId(me.uid, t.id),
      txId: t.id,
      fromUid: me.uid,
      fromHandle: me.handle,
      fromName: me.name,
      toUid: t.payToUid,
      amount: t.amount,
      dueDate: t.dueDate,
      description: t.description,
      status: sent ? 'SENT' : 'PENDING',
    })
  }
  return out
}

const KEYS = ['toUid', 'amount', 'dueDate', 'description', 'status', 'fromHandle', 'fromName'] as const

/** O que gravar e apagar para o Firestore ficar igual ao desejado. */
export function diffTransfers(desired: TransferData[], current: Transfer[]): { upserts: TransferData[]; deletes: string[] } {
  const byId = new Map(current.map((t) => [t.id, t]))
  const upserts = desired.filter((d) => {
    const c = byId.get(d.id)
    return !c || KEYS.some((k) => c[k] !== d[k])
  })
  const keep = new Set(desired.map((d) => d.id))
  const deletes = current.filter((c) => !keep.has(c.id)).map((c) => c.id)
  return { upserts, deletes }
}

export interface Receivable {
  fromUid: string
  name: string
  handle: string | null
  /** Pendente com vencimento até o fim do mês (inclui atrasados) */
  dueThisMonth: Cents
  /** Todo o pendente, inclusive meses futuros */
  totalRemaining: Cents
  overdueCount: number
  /** Pendentes até o fim do mês e enviados recentes, por data */
  items: Transfer[]
}

/** Quanto cada pessoa deve me enviar, para o card de quem recebe. */
export function computeReceivables(incoming: Transfer[], month: YearMonth, today: ISODate): Receivable[] {
  const end = monthEnd(month)
  const groups = new Map<string, Receivable>()
  for (const t of incoming) {
    const g = groups.get(t.fromUid) ?? {
      fromUid: t.fromUid,
      name: t.fromName || (t.fromHandle ? `@${t.fromHandle}` : 'Alguém'),
      handle: t.fromHandle,
      dueThisMonth: 0,
      totalRemaining: 0,
      overdueCount: 0,
      items: [],
    }
    if (t.status === 'SENT') g.items.push(t)
    else {
      g.totalRemaining += t.amount
      if (t.dueDate <= end) {
        g.dueThisMonth += t.amount
        g.items.push(t)
        if (t.dueDate < today) g.overdueCount += 1
      }
    }
    groups.set(t.fromUid, g)
  }
  return [...groups.values()]
    .filter((g) => g.totalRemaining > 0 || g.items.length > 0)
    .map((g) => ({
      ...g,
      // Pendentes primeiro (mais antigos no topo), enviados no fim.
      items: g.items.sort((a, b) => (a.status === b.status ? a.dueDate.localeCompare(b.dueDate) : a.status === 'PENDING' ? -1 : 1)),
    }))
    .sort((a, b) => b.dueThisMonth - a.dueThisMonth || b.totalRemaining - a.totalRemaining)
}
