/**
 * Firestore das contas compartilhadas e do @ único. Estrutura:
 *
 *   handles/{handle}       { uid, name }   reserva do @ (só cria se não existir)
 *   users/{uid}            { handle, ... } @ do usuário
 *   sharedBills/{id}       SharedBill      lida por criador e convidado
 *
 * As regras em `firestore.rules` garantem: @ não se repete; só criador e
 * convidado leem a conta; o convidado só pode aceitar/recusar (não muda
 * valores nem percentuais); o criador não muda quem é o convidado.
 */
import { collection, doc, getDoc, onSnapshot, query, setDoc, updateDoc, where, writeBatch, type Unsubscribe } from 'firebase/firestore'
import type { Category, Cents, ISODate, SharedBill, SharedPayerType } from '@/types/finance'
import { getFirebase } from './firebase'
import { splitShares } from './shared'
import { createId } from './utils'

const db = () => getFirebase().db
const handleDoc = (handle: string) => doc(db(), 'handles', handle)
const userDoc = (uid: string) => doc(db(), 'users', uid)
const billsCol = () => collection(db(), 'sharedBills')
const billDoc = (id: string) => doc(db(), 'sharedBills', id)

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
  firstDueDate: ISODate
  categoryId: Category['id']
  subcategoryId?: string | null
  vehicleId?: string | null
  payerType: SharedPayerType
  /** % da conta que cabe ao convidado */
  inviteePercent: number
  creator: { uid: string; handle: string; name: string | null }
  invitee: { uid: string; handle: string; name: string | null }
}

/** Cria o convite (status PENDING). As parcelas só nascem quando o convidado aceitar. */
export async function createSharedBill(input: NewSharedBill): Promise<SharedBill> {
  const now = new Date().toISOString()
  const shares = splitShares(input.totalAmount, input.inviteePercent)
  const bill: SharedBill = {
    id: createId(),
    title: input.title,
    totalAmount: input.totalAmount,
    installments: input.installments,
    firstDueDate: input.firstDueDate,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId ?? null,
    vehicleId: input.vehicleId ?? null,
    payerType: input.payerType,
    status: 'PENDING',
    createdBy: input.creator.uid,
    invitedUid: input.invitee.uid,
    participants: [
      { userId: input.creator.uid, handle: input.creator.handle, name: input.creator.name, role: 'creator', splitPercentage: 100 - input.inviteePercent, calculatedAmount: shares.creator, status: 'ACCEPTED' },
      { userId: input.invitee.uid, handle: input.invitee.handle, name: input.invitee.name, role: 'invitee', splitPercentage: input.inviteePercent, calculatedAmount: shares.invitee, status: 'PENDING_APPROVAL' },
    ],
    version: 1,
    creatorAcknowledged: false,
    respondedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  await setDoc(billDoc(bill.id), bill)
  return bill
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
}

/**
 * Criador edita. Mudou valor, parcelas, data, divisão ou forma de pagamento:
 * volta a PENDING com versão nova e o convidado precisa aceitar de novo
 * (as parcelas antigas ficam suspensas até lá). Só o título: muda direto.
 */
export function updateSharedBill(bill: SharedBill, edit: SharedBillEdit) {
  const now = new Date().toISOString()
  const shares = splitShares(edit.totalAmount, edit.inviteePercent)
  const invitee = bill.participants[1]
  const material =
    edit.totalAmount !== bill.totalAmount ||
    edit.installments !== bill.installments ||
    edit.firstDueDate !== bill.firstDueDate ||
    edit.payerType !== bill.payerType ||
    edit.inviteePercent !== invitee.splitPercentage
  const reconfirm = material && bill.status !== 'PENDING'
  const participants: SharedBill['participants'] = [
    { ...bill.participants[0], splitPercentage: 100 - edit.inviteePercent, calculatedAmount: shares.creator },
    { ...invitee, splitPercentage: edit.inviteePercent, calculatedAmount: shares.invitee, status: reconfirm ? 'PENDING_APPROVAL' : invitee.status },
  ]
  return updateDoc(billDoc(bill.id), {
    title: edit.title,
    totalAmount: edit.totalAmount,
    installments: edit.installments,
    firstDueDate: edit.firstDueDate,
    payerType: edit.payerType,
    participants,
    ...(material ? { version: bill.version + 1 } : {}),
    ...(reconfirm || (material && bill.status === 'REJECTED') ? { status: 'PENDING', respondedAt: null, creatorAcknowledged: false } : {}),
    updatedAt: now,
  })
}

export function cancelSharedBill(bill: SharedBill) {
  return updateDoc(billDoc(bill.id), { status: 'CANCELLED', updatedAt: new Date().toISOString() })
}

/** Criador fecha o aviso de recusa. */
export function acknowledgeSharedBill(bill: SharedBill) {
  return updateDoc(billDoc(bill.id), { creatorAcknowledged: true })
}
