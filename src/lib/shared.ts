/**
 * Contas compartilhadas (dívidas conjuntas). A conta mãe fica em
 * `sharedBills/{id}`; cada participante gera as próprias parcelas na própria
 * conta (`users/{uid}/transactions`), porque ninguém escreve nos dados do outro.
 */
import type { Cents, ISODate, SharedBill, SharedBillParticipant, Transaction } from '@/types/finance'
import { addMonthsISO } from './dates'
import { splitCents } from './money'

// ---------------------------------------------------------------------------
// @ único
// ---------------------------------------------------------------------------

/** 3 a 20 caracteres: letras minúsculas, números, ponto e sublinhado. */
export const HANDLE_RE = /^[a-z0-9_.]{3,20}$/

/** "@Lennon.Reis " → "lennon.reis" */
export const normalizeHandle = (v: string) => v.trim().replace(/^@+/, '').toLowerCase()

export function handleError(handle: string): string | null {
  if (handle.length < 3) return 'Use pelo menos 3 caracteres'
  if (handle.length > 20) return 'Use no máximo 20 caracteres'
  if (!HANDLE_RE.test(handle)) return 'Só letras minúsculas, números, ponto e _'
  return null
}

/** Sugestão de @ a partir do nome ou do e-mail. */
export function suggestHandle(name: string | null, email: string | null): string {
  const base = (name || email?.split('@')[0] || 'usuario')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
  return (base.length >= 3 ? base : `${base}usuario`).slice(0, 20)
}

// ---------------------------------------------------------------------------
// Divisão
// ---------------------------------------------------------------------------

/**
 * Divide o total pela % do convidado. A cota do criador absorve o
 * arredondamento, então as duas somam exatamente o total.
 */
export function splitShares(total: Cents, inviteePercent: number): { creator: Cents; invitee: Cents } {
  const invitee = Math.round((total * inviteePercent) / 100)
  return { creator: total - invitee, invitee }
}

export const participantOf = (bill: SharedBill, uid: string): SharedBillParticipant | null =>
  bill.participants.find((p) => p.userId === uid) ?? null

export const partnerOf = (bill: SharedBill, uid: string): SharedBillParticipant | null =>
  bill.participants.find((p) => p.userId !== uid) ?? null

export const displayName = (p: Pick<SharedBillParticipant, 'name' | 'handle'>) => p.name || `@${p.handle}`

/**
 * Quanto este participante paga no total.
 * Cada um paga a sua parte: a própria cota.
 * Um pagou tudo: o criador lança o total (já pagou ao credor); o convidado
 * lança só a cota dele, como reembolso ao criador.
 */
export function myTotal(bill: SharedBill, uid: string): Cents {
  const me = participantOf(bill, uid)
  if (!me) return 0
  if (bill.payerType === 'SINGLE_PAYER' && me.role === 'creator') return bill.totalAmount
  return me.calculatedAmount
}

// ---------------------------------------------------------------------------
// Parcelas de cada participante
// ---------------------------------------------------------------------------

export const sharedTxId = (billId: string, uid: string, n: number) => `sb_${billId}_${uid}_${n}`
const sharedInstallmentId = (billId: string, uid: string) => `sb_${billId}_${uid}`

/** Parcelas deste participante na versão atual da conta (ids fixos: gerar de novo não duplica). */
export function buildSharedTransactions(bill: SharedBill, uid: string, now: string): Transaction[] {
  const me = participantOf(bill, uid)
  const partner = partnerOf(bill, uid)
  if (!me || !partner) return []
  const reimbursing = bill.payerType === 'SINGLE_PAYER' && me.role === 'invitee'
  const amounts = splitCents(myTotal(bill, uid), bill.installments)
  return amounts.map((amount, i) => {
    const n = i + 1
    const suffix = bill.installments > 1 ? ` (${n}/${bill.installments})` : ''
    return {
      id: sharedTxId(bill.id, uid, n),
      description: `${reimbursing ? 'Reembolso: ' : ''}${bill.title}${suffix}`,
      amount,
      type: 'despesa',
      categoryId: bill.categoryId,
      subcategoryId: bill.subcategoryId ?? null,
      dueDate: addMonthsISO(bill.firstDueDate, i) as ISODate,
      paymentDate: null,
      status: 'pendente',
      paymentMethod: 'pix',
      installment: bill.installments > 1 ? { installmentId: sharedInstallmentId(bill.id, uid), number: n, total: bill.installments } : null,
      recurringCostId: null,
      payTo: reimbursing ? displayName(partner) : null,
      payToUid: reimbursing ? partner.userId : null,
      payToHandle: reimbursing ? partner.handle : null,
      sharedBillId: bill.id,
      // O convidado não tem o veículo do criador: a parcela dele fica só na categoria.
      vehicleId: me.role === 'creator' ? (bill.vehicleId ?? null) : null,
      sharedWith: displayName(partner),
      sharedVersion: bill.version,
      sharedSuspended: false,
      createdAt: now,
    }
  })
}

export interface SharedChanges {
  upserts: Transaction[]
  deletes: string[]
}

/**
 * O que este aparelho precisa fazer nos próprios lançamentos para refletir
 * a conta compartilhada:
 * - aceita: criar/atualizar as parcelas da versão atual (parcelas já pagas
 *   não mudam; parcelas que sobraram de uma versão maior são apagadas);
 * - pendente depois de editada: suspender as parcelas não pagas da versão
 *   anterior até a nova aceitação;
 * - recusada/cancelada: apagar as parcelas não pagas.
 */
export function reconcileShared(bill: SharedBill, uid: string, mine: Transaction[], now: string): SharedChanges {
  const own = mine.filter((t) => t.sharedBillId === bill.id)
  const unpaid = own.filter((t) => t.status !== 'pago')
  const none: SharedChanges = { upserts: [], deletes: [] }

  if (bill.status === 'REJECTED' || bill.status === 'CANCELLED') {
    return unpaid.length ? { upserts: [], deletes: unpaid.map((t) => t.id) } : none
  }

  if (bill.status === 'PENDING') {
    const toSuspend = unpaid.filter((t) => !t.sharedSuspended && (t.sharedVersion ?? 0) < bill.version)
    return toSuspend.length ? { upserts: toSuspend.map((t) => ({ ...t, sharedSuspended: true })), deletes: [] } : none
  }

  // ACCEPTED
  const fresh = buildSharedTransactions(bill, uid, now)
  const byId = new Map(own.map((t) => [t.id, t]))
  const upserts: Transaction[] = []
  for (const t of fresh) {
    const current = byId.get(t.id)
    if (current?.status === 'pago') continue
    if (current && current.sharedVersion === bill.version && !current.sharedSuspended) continue
    // Mantém o que a pessoa ajustou à mão (status, data de pagamento) só na mesma versão; versão nova recalcula.
    upserts.push(current ? { ...t, createdAt: current.createdAt } : t)
  }
  const freshIds = new Set(fresh.map((t) => t.id))
  const deletes = unpaid.filter((t) => !freshIds.has(t.id)).map((t) => t.id)
  return upserts.length || deletes.length ? { upserts, deletes } : none
}

export interface Replacement {
  /** Lançamentos originais (não pagos) a apagar */
  deletes: Transaction['id'][]
  /** Fixo a encerrar a partir do 1º vencimento da conta dividida */
  endRecurring: { id: string; from: ISODate } | null
}

/**
 * Dividir algo já lançado: quando o convite é aceito, o criador troca os
 * lançamentos originais pelas parcelas divididas. Pagos ficam como estão.
 */
export function replacedBy(bill: SharedBill, uid: string, mine: Transaction[], activeRecurring: ReadonlySet<string>): Replacement | null {
  if (bill.status !== 'ACCEPTED' || bill.createdBy !== uid || !bill.replaces) return null
  const ids = new Set(bill.replaces.transactionIds)
  const deletes = mine.filter((t) => ids.has(t.id) && t.status !== 'pago' && !t.sharedBillId).map((t) => t.id)
  const rc = bill.replaces.recurringCostId
  const endRecurring = rc && activeRecurring.has(rc) ? { id: rc, from: bill.firstDueDate } : null
  return deletes.length || endRecurring ? { deletes, endRecurring } : null
}

/** Convite de alguém que eu deixei no aceite automático: aceito sem perguntar. */
export const autoAcceptable = (bill: SharedBill, uid: string, allowed: ReadonlySet<string>) =>
  bill.status === 'PENDING' && bill.invitedUid === uid && allowed.has(bill.createdBy)

/** Convites que esperam a minha resposta (os do aceite automático não contam). */
export const pendingInvites = (bills: SharedBill[], uid: string, allowed: ReadonlySet<string> = new Set()) =>
  bills.filter((b) => b.status === 'PENDING' && b.invitedUid === uid && !allowed.has(b.createdBy))

export interface SharedRole {
  role: 'creator' | 'invitee'
  bill: SharedBill
  /** @ da outra pessoa */
  partner: string
}

/**
 * Papel no lançamento de conta dividida. Criador pode cancelar a conta (some
 * para os dois); convidado não. `null` se não é dividido ou a conta não chegou.
 */
export function sharedRole(t: Pick<Transaction, 'sharedBillId'>, bills: SharedBill[], uid: string | null): SharedRole | null {
  if (!t.sharedBillId || !uid) return null
  const bill = bills.find((b) => b.id === t.sharedBillId)
  if (!bill || bill.status === 'CANCELLED' || bill.status === 'REJECTED') return null
  return { role: bill.createdBy === uid ? 'creator' : 'invitee', bill, partner: partnerOf(bill, uid)?.handle ?? '' }
}

/** Recusas que o criador ainda não viu. */
export const unseenRejections = (bills: SharedBill[], uid: string) =>
  bills.filter((b) => b.status === 'REJECTED' && b.createdBy === uid && !b.creatorAcknowledged)
