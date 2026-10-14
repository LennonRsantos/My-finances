/**
 * Acesso ao Firestore. Estrutura:
 *
 *   users/{uid}                      { settings, createdAt, defaultsVersion }
 *   users/{uid}/transactions/{id}    Transaction
 *   users/{uid}/installments/{id}    Installment
 *   users/{uid}/recurringCosts/{id}  RecurringCost
 *   users/{uid}/categories/{id}      Category
 *   users/{uid}/subcategories/{id}   Subcategory
 *   users/{uid}/debts/{id}           Debt
 *   users/{uid}/vehicles/{id}        Vehicle
 *   users/{uid}/maintenance/{id}     MaintenanceReminder
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
  type WriteBatch,
} from 'firebase/firestore'
import type { Category, Debt, Installment, MaintenanceReminder, Vehicle, RecurringCost, Subcategory, Transaction, UserSettings } from '@/types/finance'
import { DEFAULT_CATEGORIES_VERSION, missingDefaults } from '@/data/mock'
import { getFirebase } from './firebase'

export type CloudSettings = Omit<UserSettings, 'theme'>

export interface Collections {
  transactions: Transaction
  installments: Installment
  recurringCosts: RecurringCost
  categories: Category
  subcategories: Subcategory
  debts: Debt
  vehicles: Vehicle
  maintenance: MaintenanceReminder
}
export type CollectionName = keyof Collections

/** Gravação tipada: o `data` precisa bater com a coleção. */
export type DocWrite = { [K in CollectionName]: { name: K; data: Collections[K] } }[CollectionName]
export interface DocRef {
  name: CollectionName
  id: string
}

const userDoc = (uid: string) => doc(getFirebase().db, 'users', uid)
const col = (uid: string, name: CollectionName) => collection(getFirebase().db, 'users', uid, name)
const itemDoc = (uid: string, name: CollectionName, id: string) => doc(col(uid, name), id)

/** Firestore limita 500 operações por batch. */
async function inBatches<T>(items: T[], apply: (batch: WriteBatch, item: T) => void) {
  const { db } = getFirebase()
  for (let i = 0; i < items.length; i += 450) {
    const batch = writeBatch(db)
    items.slice(i, i + 450).forEach((item) => apply(batch, item))
    await batch.commit()
  }
}

export function toCloudSettings({ theme: _theme, ...rest }: UserSettings): CloudSettings {
  return rest
}

// ---------------------------------------------------------------------------
// Leitura em tempo real
// ---------------------------------------------------------------------------

export function subscribeCollection<K extends CollectionName>(
  uid: string,
  name: K,
  onData: (items: Collections[K][]) => void,
  onError: (e: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    col(uid, name),
    (snap) => onData(snap.docs.map((d) => d.data() as Collections[K])),
    onError,
  )
}

export function subscribeSettings(
  uid: string,
  onData: (settings: CloudSettings | null) => void,
  onError: (e: unknown) => void,
): Unsubscribe {
  return onSnapshot(userDoc(uid), (snap) => onData((snap.data()?.settings as CloudSettings | undefined) ?? null), onError)
}

// ---------------------------------------------------------------------------
// Primeiro acesso
// ---------------------------------------------------------------------------

export interface LocalSnapshot {
  settings: CloudSettings
  categories: Category[]
  subcategories: Subcategory[]
  transactions: Transaction[]
  installments: Installment[]
  recurringCosts: RecurringCost[]
  debts: Debt[]
  vehicles: Vehicle[]
  maintenance: MaintenanceReminder[]
}

/**
 * Se o usuário ainda não existe no Firestore, envia o que estava salvo no
 * navegador (categorias, lançamentos, saldo inicial). Retorna `true` se enviou.
 */
export async function seedUserIfNew(uid: string, local: LocalSnapshot): Promise<boolean> {
  const existing = await getDoc(userDoc(uid))
  if (existing.exists()) return false

  const items: { name: CollectionName; data: DocumentData & { id: string } }[] = [
    ...local.categories.map((data) => ({ name: 'categories' as const, data })),
    ...local.subcategories.map((data) => ({ name: 'subcategories' as const, data })),
    ...local.installments.map((data) => ({ name: 'installments' as const, data })),
    ...local.transactions.map((data) => ({ name: 'transactions' as const, data })),
    ...local.recurringCosts.map((data) => ({ name: 'recurringCosts' as const, data })),
    ...local.debts.map((data) => ({ name: 'debts' as const, data })),
    ...local.vehicles.map((data) => ({ name: 'vehicles' as const, data })),
    ...local.maintenance.map((data) => ({ name: 'maintenance' as const, data })),
  ]
  await inBatches(items, (batch, { name, data }) => batch.set(itemDoc(uid, name, data.id), data))
  // Documento do usuário por último: só marca como criado depois dos dados.
  await setDoc(userDoc(uid), {
    settings: local.settings,
    createdAt: serverTimestamp(),
    defaultsVersion: DEFAULT_CATEGORIES_VERSION,
  })
  return true
}

/** Conta antiga: adiciona categorias padrão criadas depois (só as que faltam). */
export async function ensureDefaultCategories(uid: string) {
  const user = await getDoc(userDoc(uid))
  const version = (user.data()?.defaultsVersion as number | undefined) ?? 1
  if (version >= DEFAULT_CATEGORIES_VERSION) return

  const [cats, subs] = await Promise.all([getDocs(col(uid, 'categories')), getDocs(col(uid, 'subcategories'))])
  const missing = missingDefaults(
    cats.docs.map((d) => ({ id: d.id })),
    subs.docs.map((d) => ({ id: d.id })),
    version,
  )
  await inBatches<{ name: CollectionName; data: Category | Subcategory }>(
    [
      ...missing.categories.map((data) => ({ name: 'categories' as const, data })),
      ...missing.subcategories.map((data) => ({ name: 'subcategories' as const, data })),
    ],
    (batch, { name, data }) => batch.set(itemDoc(uid, name, data.id), data),
  )
  await setDoc(userDoc(uid), { defaultsVersion: DEFAULT_CATEGORIES_VERSION }, { merge: true })
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

export function saveSettings(uid: string, settings: CloudSettings) {
  return setDoc(userDoc(uid), { settings }, { merge: true })
}

/** Grava (cria ou substitui) vários documentos em lote. */
export function saveDocs(uid: string, items: DocWrite[]) {
  return inBatches(items, (batch, { name, data }) => batch.set(itemDoc(uid, name, data.id), data))
}

export function deleteDocs(uid: string, refs: DocRef[]) {
  return inBatches(refs, (batch, { name, id }) => batch.delete(itemDoc(uid, name, id)))
}

const ALL_COLLECTIONS: CollectionName[] = ['transactions', 'installments', 'recurringCosts', 'categories', 'subcategories', 'debts', 'vehicles', 'maintenance']

/** Exclusão de conta: apaga todas as coleções do usuário e o documento dele. */
export async function deleteAllUserData(uid: string) {
  for (const name of ALL_COLLECTIONS) {
    const snap = await getDocs(col(uid, name))
    await deleteDocs(
      uid,
      snap.docs.map((d) => ({ name, id: d.id })),
    )
  }
  await deleteDoc(userDoc(uid))
}
