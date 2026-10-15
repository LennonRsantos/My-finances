import { useEffect, useRef } from 'react'
import { reconcileShared } from '@/lib/shared'
import { useAuthStore } from '@/store/auth-store'
import { useFinanceStore } from '@/store/finance-store'
import { useSharedStore } from '@/store/shared-store'

/**
 * Mantém as minhas parcelas de contas compartilhadas em dia com a conta mãe:
 * cria ao aceitar, suspende quando o criador edita, apaga as não pagas se a
 * conta for recusada ou cancelada. Cada aparelho só mexe nos próprios dados.
 */
export function useSharedReconciler() {
  const uid = useAuthStore((s) => (s.status === 'signed_in' && s.dataLoaded ? s.user?.uid : null))
  const bills = useSharedStore((s) => s.bills)
  const transactions = useFinanceStore((s) => s.transactions)
  // Cada estado (conta + versão + status) é aplicado uma vez por sessão: se a
  // gravação falhar, o Firestore desfaz e não ficamos tentando sem parar.
  const applied = useRef(new Set<string>())

  useEffect(() => {
    if (!uid || !bills.length) return
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
    if (upserts.length || deletes.length) useFinanceStore.getState().applySharedChanges(upserts, deletes)
  }, [uid, bills, transactions])
}
