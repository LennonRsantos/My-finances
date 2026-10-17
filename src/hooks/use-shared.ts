import { useEffect, useRef } from 'react'
import { autoAcceptable, reconcileShared, replacedBy } from '@/lib/shared'
import { respondSharedBill } from '@/lib/shared-cloud'
import { reportSyncError, useAuthStore } from '@/store/auth-store'
import { useFinanceStore } from '@/store/finance-store'
import { NO_AUTO_ACCEPT, useSettingsStore } from '@/store/settings-store'
import { useSharedStore } from '@/store/shared-store'
import type { ISODate } from '@/types/finance'

/**
 * Mantém as minhas parcelas de contas compartilhadas em dia com a conta mãe:
 * cria ao aceitar, suspende quando o criador edita, apaga as não pagas se a
 * conta for recusada ou cancelada. Cada aparelho só mexe nos próprios dados.
 */
export function useSharedReconciler() {
  const uid = useAuthStore((s) => (s.status === 'signed_in' && s.dataLoaded ? s.user?.uid : null))
  const bills = useSharedStore((s) => s.bills)
  const transactions = useFinanceStore((s) => s.transactions)
  const recurringCosts = useFinanceStore((s) => s.recurringCosts)
  const autoAccept = useSettingsStore((s) => s.settings.autoAcceptFrom ?? NO_AUTO_ACCEPT)
  // Cada estado (conta + versão + status) é aplicado uma vez por sessão: se a
  // gravação falhar, o Firestore desfaz e não ficamos tentando sem parar.
  const applied = useRef(new Set<string>())

  useEffect(() => {
    if (!uid || !bills.length) return
    // Aceite automático: convite de quem eu permiti entra sem passar pelo sino.
    const allowed = new Set(autoAccept.map((p) => p.uid))
    for (const bill of bills) {
      if (!autoAcceptable(bill, uid, allowed)) continue
      const key = `auto:${bill.id}:${bill.version}`
      if (applied.current.has(key)) continue
      applied.current.add(key)
      respondSharedBill(bill, 'ACCEPT').catch(reportSyncError)
    }
    const now = new Date().toISOString()
    const upserts = []
    const deletes = []
    for (const bill of bills) {
      const changes = reconcileShared(bill, uid, transactions, now)
      if (!changes.upserts.length && !changes.deletes.length) continue
      const key = `${bill.id}:${bill.version}:${bill.status}`
      if (applied.current.has(key)) continue
      applied.current.add(key)
      upserts.push(...changes.upserts)
      deletes.push(...changes.deletes)
    }
    // Conta criada a partir de lançamentos já existentes: some com os originais.
    const active = new Set(recurringCosts.filter((r) => r.active).map((r) => r.id))
    const ends: { id: string; from: ISODate }[] = []
    for (const bill of bills) {
      const r = replacedBy(bill, uid, transactions, active)
      if (!r) continue
      const key = `replace:${bill.id}:${bill.version}`
      if (applied.current.has(key)) continue
      applied.current.add(key)
      deletes.push(...r.deletes)
      if (r.endRecurring) ends.push(r.endRecurring)
    }
    const store = useFinanceStore.getState()
    if (upserts.length || deletes.length) store.applySharedChanges(upserts, deletes)
    for (const e of ends) store.endRecurringCost(e.id, e.from)
  }, [uid, bills, transactions, recurringCosts, autoAccept])
}
