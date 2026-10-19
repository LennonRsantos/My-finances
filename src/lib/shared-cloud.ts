/**
 * Firestore das contas compartilhadas e do @ único. Estrutura:
 *
 *   handles/{handle}       { uid, name }   reserva do @ (só cria se não existir)
 *   users/{uid}            { handle, ... } @ do usuário
 *   sharedBills/{id}       SharedBill      lida por criador e convidado
 *   autoAccept/{uid}       { uids }        quem tem contas aceitas sem pedir
 *   transfers/{from}_{tx}  Transfer        "Lennon deve te enviar R$ X"
 *
 * As regras em `firestore.rules` garantem: @ não se repete; só criador e
 * convidado leem a conta; o convidado só pode aceitar/recusar (não muda
 * valores nem percentuais); o criador não muda quem é o convidado.
 */
import { collection, doc, getDoc, onSnapshot, query, setDoc, updateDoc, where, writeBatch, type Unsubscribe } from 'firebase/firestore'
import type { Category, Cents, ISODate, SharedBill, SharedBillReplaces, SharedPayerType, Transfer } from '@/types/finance'
import type { TransferData } from './transfers'
import { getFirebase } from './firebase'
import { splitShares } from './shared'
import { createId } from './utils'

const db = () => getFirebase().db
const handleDoc = (handle: string) => doc(db(), 'handles', handle)
const userDoc = (uid: string) => doc(db(), 'users', uid)
const billsCol = () => collection(db(), 'sharedBills')
const billDoc = (id: string) => doc(db(), 'sharedBills', id)
const autoAcceptDoc = (uid: string) => doc(db(), 'autoAccept', uid)
const transfersCol = () => collection(db(), 'transfers')
const transferDoc = (id: string) => doc(db(), 'transfers', id)

// ---------------------------------------------------------------------------
// Valores a enviar entre usuários
// ---------------------------------------------------------------------------

/** Escuta o que eu devo enviar (meus espelhos) e o que me devem. */
export function subscribeTransfers(
  uid: string,
  onOutgoing: (list: Transfer[]) => void,
  onIncoming: (list: Transfer[]) => void,
  onError: (e: unknown) => void,
): Unsubscribe {
  const a = onSnapshot(query(transfersCol(), where('fromUid', '==', uid)), (s) => onOutgoing(s.docs.map((d) => d.data() as Transfer)), onError)
  const b = onSnapshot(query(transfersCol(), where('toUid', '==', uid)), (s) => onIncoming(s.docs.map((d) => d.data() as Transfer)), onError)
  return () => {
    a()
    b()
  }
}

/** Grava e apaga espelhos em lotes (limite de 500 operações por lote). */
export async function writeTransfers(upserts: TransferData[], deletes: string[]) {
  const now = new Date().toISOString()
  const ops = [...upserts.map((t) => ({ t })), ...deletes.map((id) => ({ id }))]
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db())
    for (const op of ops.slice(i, i + 450)) {
      if ('t' in op) batch.set(transferDoc(op.t.id), { ...op.t, updatedAt: now })
      else batch.delete(transferDoc(op.id))
    }
    await batch.commit()
  }
}

// ---------------------------------------------------------------------------
// Aceite automático
// ---------------------------------------------------------------------------

/** Grava quem pode me mandar contas que entram direto. */
export function saveAutoAccept(uid: string, uids: string[]) {
  return setDoc(autoAcceptDoc(uid), { uids })
}

/**
 * O convidado aceita minhas contas sem perguntar? As regras só deixam ler a
 * lista de quem está nela; qualquer erro (sem permissão, sem rede) = não.
 */
export async function acceptsMe(inviteeUid: string, myUid: string): Promise<boolean> {
  try {
    const snap = await getDoc(autoAcceptDoc(inviteeUid))
    return snap.exists() && ((snap.data().uids as string[] | undefined) ?? []).includes(myUid)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// @ único
// ---------------------------------------------------------------------------

export interface HandleOwner {
  uid: string
  name: string | null
}

export async function lookupHandle(handle: string): Promise<HandleOwner | null> {
  const snap = await getDoc(handleDoc(handle))
  return snap.exists() ? (snap.data() as HandleOwner) : null
}

/**
 * Reserva o novo @ e libera o antigo, tudo junto. Se o @ já for de outra
 * pessoa, as regras recusam a criação e nada muda.
 */
export async function claimHandle(uid: string, name: string | null, handle: string, previous: string | null) {
  const batch = writeBatch(db())
  batch.set(handleDoc(handle), { uid, name })
  if (previous && previous !== handle) batch.delete(handleDoc(previous))
  batch.set(userDoc(uid), { handle }, { merge: true })
  await batch.commit()
}

export function subscribeHandle(uid: string, onData: (handle: string | null) => void, onError: (e: unknown) => void): Unsubscribe {
  return onSnapshot(userDoc(uid), (snap) => onData((snap.data()?.handle as string | undefined) ?? null), onError)
}

// ---------------------------------------------------------------------------
// Contas compartilhadas
// ---------------------------------------------------------------------------

/** Escuta as contas que criei e as que recebi, juntas. */
export function subscribeSharedBills(uid: string, onData: (bills: SharedBill[]) => void, onError: (e: unknown) => void): Unsubscribe {
  let created: SharedBill[] = []
  let invited: SharedBill[] = []
  const emit = () => onData([...created, ...invited].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  const a = onSnapshot(query(billsCol(), where('createdBy', '==', uid)), (s) => {
    created = s.docs.map((d) => d.data() as SharedBill)
    emit()
  }, onError)
  const b = onSnapshot(query(billsCol(), where('invitedUid', '==', uid)), (s) => {
    invited = s.docs.map((d) => d.data() as SharedBill)
    emit()
  }, onError)
  return () => {
    a()
    b()
  }
}

export interface NewSharedBill {
  title: string
  totalAmount: Cents
  installments: number
  /** Numeração na série original (ver `SharedBill.installmentOffset`) */
  installmentOffset?: number | null
  installmentTotal?: number | null
  /** Conta fixa: valor por mês, sem fim (ver `SharedBill.recurring`) */
  recurring?: boolean | null
  firstDueDate: ISODate
  categoryId: Category['id']
  subcategoryId?: string | null
  vehicleId?: string | null
  replaces?: SharedBillReplaces | null
  payerType: SharedPayerType
  /** % da conta que cabe ao convidado */
  inviteePercent: number
  creator: { uid: string; handle: string; name: string | null }
  invitee: { uid: string; handle: string; name: string | null }
}

/**
 * Cria o convite (status PENDING). As parcelas só nascem quando o convidado
 * aceitar. Se o convidado me deixou no aceite automático, já nasce ACCEPTED.
 */
export async function createSharedBill(input: NewSharedBill): Promise<SharedBill> {
  const now = new Date().toISOString()
  const auto = await acceptsMe(input.invitee.uid, input.creator.uid)
  const shares = splitShares(input.totalAmount, input.inviteePercent)
  const bill: SharedBill = {
    id: createId(),
    title: input.title,
    totalAmount: input.totalAmount,
    installments: input.installments,
    installmentOffset: input.installmentOffset ?? null,
    installmentTotal: input.installmentTotal ?? null,
    recurring: input.recurring ?? false,
    firstDueDate: input.firstDueDate,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId ?? null,
    vehicleId: input.vehicleId ?? null,
    replaces: input.replaces ?? null,
    payerType: input.payerType,
    status: auto ? 'ACCEPTED' : 'PENDING',
    createdBy: input.creator.uid,
    invitedUid: input.invitee.uid,
    participants: [
      { userId: input.creator.uid, handle: input.creator.handle, name: input.creator.name, role: 'creator', splitPercentage: 100 - input.inviteePercent, calculatedAmount: shares.creator, status: 'ACCEPTED' },
      { userId: input.invitee.uid, handle: input.invitee.handle, name: input.invitee.name, role: 'invitee', splitPercentage: input.inviteePercent, calculatedAmount: shares.invitee, status: auto ? 'ACCEPTED' : 'PENDING_APPROVAL' },
    ],
    version: 1,
    creatorAcknowledged: false,
    respondedAt: auto ? now : null,
    createdAt: now,
    updatedAt: now,
  }
  try {
    await setDoc(billDoc(bill.id), bill)
    return bill
  } catch (e) {
    if (!auto) throw e
    // Regras antigas (sem aceite automático publicado): vai como convite comum.
    const pending: SharedBill = {
      ...bill,
      status: 'PENDING',
      respondedAt: null,
      participants: [bill.participants[0], { ...bill.participants[1], status: 'PENDING_APPROVAL' }],
    }
    await setDoc(billDoc(bill.id), pending)
    return pending
  }
}

/** Convidado aceita ou recusa. As regras só deixam mudar status, participantes (status) e datas. */
export function respondSharedBill(bill: SharedBill, action: 'ACCEPT' | 'REJECT') {
  const now = new Date().toISOString()
  const status = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED'
  const participants = bill.participants.map((p) =>
    p.role === 'invitee' ? { ...p, status } : p,
  ) as SharedBill['participants']
  return updateDoc(billDoc(bill.id), { status, participants, respondedAt: now, updatedAt: now })
}

export interface SharedBillEdit {
  title: string
  totalAmount: Cents
  installments: number
  firstDueDate: ISODate
  payerType: SharedPayerType
  inviteePercent: number
  /** Conta fixa: `totalAmount` por mês e `installments` = 1 */
  recurring: boolean
}

/**
 * Criador edita. Mudou valor, parcelas, data, divisão ou forma de pagamento:
 * volta a PENDING com versão nova e o convidado precisa aceitar de novo
 * (as parcelas antigas ficam suspensas até lá). Só o título: muda direto.
 */
export async function updateSharedBill(bill: SharedBill, edit: SharedBillEdit) {
  const now = new Date().toISOString()
  const shares = splitShares(edit.totalAmount, edit.inviteePercent)
  const invitee = bill.participants[1]
  const material =
    edit.totalAmount !== bill.totalAmount ||
    edit.installments !== bill.installments ||
    edit.recurring !== !!bill.recurring ||
    edit.firstDueDate !== bill.firstDueDate ||
    edit.payerType !== bill.payerType ||
    edit.inviteePercent !== invitee.splitPercentage
  // Convidado com aceite automático para mim: a mudança vale sem pedir de novo.
  const reconfirm = material && bill.status !== 'PENDING' && !(bill.status === 'ACCEPTED' && (await acceptsMe(bill.invitedUid, bill.createdBy)))
  const participants: SharedBill['participants'] = [
    { ...bill.participants[0], splitPercentage: 100 - edit.inviteePercent, calculatedAmount: shares.creator },
    { ...invitee, splitPercentage: edit.inviteePercent, calculatedAmount: shares.invitee, status: reconfirm ? 'PENDING_APPROVAL' : invitee.status },
  ]
  return updateDoc(billDoc(bill.id), {
    title: edit.title,
    totalAmount: edit.totalAmount,
    installments: edit.recurring ? 1 : edit.installments,
    recurring: edit.recurring,
    firstDueDate: edit.firstDueDate,
    payerType: edit.payerType,
    participants,
    ...(material ? { version: bill.version + 1 } : {}),
    ...(reconfirm || (material && bill.status === 'REJECTED') ? { status: 'PENDING', respondedAt: null, creatorAcknowledged: false } : {}),
    updatedAt: now,
  })
}

/** Só a numeração na série original (ex.: 11/36): não muda valores nem pede novo aceite. */
export function setSharedNumbering(bill: SharedBill, installmentOffset: number, installmentTotal: number) {
  return updateDoc(billDoc(bill.id), { installmentOffset, installmentTotal, updatedAt: new Date().toISOString() })
}

export function cancelSharedBill(bill: SharedBill) {
  return updateDoc(billDoc(bill.id), { status: 'CANCELLED', updatedAt: new Date().toISOString() })
}

/** Criador fecha o aviso de recusa. */
export function acknowledgeSharedBill(bill: SharedBill) {
  return updateDoc(billDoc(bill.id), { creatorAcknowledged: true })
}
