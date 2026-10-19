import { useEffect, useRef } from 'react'
import { autoAcceptable, reconcileShared, replacedBy, sharedInstallmentId } from '@/lib/shared'
import { respondSharedBill, setSharedNumbering, updateSharedBill } from '@/lib/shared-cloud'
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
  const fixedSeries = useSettingsStore((s) => s.settings.fixedSeries)
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
    // Contas divididas antes de guardar a série original (ex.: da 11ª de 36):
    // acha o parcelamento de origem pelo título e grava a numeração.
    const { installments } = useFinanceStore.getState()
    for (const bill of bills) {
      if (bill.createdBy !== uid || bill.installments < 2 || bill.installmentTotal != null || bill.status === 'CANCELLED') continue
      const origin = installments.find((i) => i.description === bill.title && i.totalInstallments > bill.installments)
      if (!origin) continue
      const key = `numbering:${bill.id}`
      if (applied.current.has(key)) continue
      applied.current.add(key)
      setSharedNumbering(bill, origin.totalInstallments - bill.installments, origin.totalInstallments).catch(reportSyncError)
    }
    // Conta dividida que eu criei e marquei "É conta fixa": vira fixa de verdade
    // (valor por mês, sem fim, sem "1/12"). Como muda o combinado, o parceiro aceita de novo.
    const fixed = new Set(fixedSeries ?? [])
    for (const bill of bills) {
      if (bill.createdBy !== uid || bill.recurring || bill.installments < 2) continue
      if (bill.status !== 'ACCEPTED' && bill.status !== 'PENDING') continue
      if (!fixed.has(sharedInstallmentId(bill.id, uid))) continue
      const key = `fixed:${bill.id}`
      if (applied.current.has(key)) continue
      applied.current.add(key)
      updateSharedBill(bill, {
        title: bill.title,
        totalAmount: Math.round(bill.totalAmount / bill.installments),
        installments: 1,
        recurring: true,
        firstDueDate: bill.firstDueDate,
        payerType: bill.payerType,
        inviteePercent: bill.participants[1].splitPercentage,
      }).catch(reportSyncError)
    }
    const now = new Date().toISOString()
    const upserts = []
    const deletes = []
    for (const bill of bills) {
      const changes = reconcileShared(bill, uid, transactions, now)
      if (!changes.upserts.length && !changes.deletes.length) continue
      const key = `${bill.id}:${bill.version}:${bill.status}:${bill.installmentTotal ?? ''}`
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
  }, [uid, bills, transactions, recurringCosts, autoAccept, fixedSeries])
}
