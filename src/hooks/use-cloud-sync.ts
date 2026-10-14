import { onAuthStateChanged } from 'firebase/auth'
import type { Unsubscribe } from 'firebase/firestore'
import { useEffect } from 'react'
import {
  ensureDefaultCategories,
  saveRecovery,
  seedUserIfNew,
  subscribeCollection,
  subscribeRecovery,
  subscribeSettings,
  toCloudSettings,
} from '@/lib/cloud'
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase'
import { reportSyncError, useAuthStore } from '@/store/auth-store'
import { initialFinanceData, useFinanceStore } from '@/store/finance-store'
import { initialRecovery, recoveryData, useRecoveryStore } from '@/store/recovery-store'
import { defaultSettings, useSettingsStore } from '@/store/settings-store'

/** Liga os dados do usuário logado ao Firestore. Retorna função de desligar. */
async function startSync(uid: string): Promise<Unsubscribe> {
  const finance = useFinanceStore.getState()
  // Primeiro login neste projeto: leva para a nuvem o que já estava no navegador.
  await seedUserIfNew(uid, {
    settings: toCloudSettings(useSettingsStore.getState().settings),
    categories: finance.categories,
    subcategories: finance.subcategories,
    transactions: finance.transactions,
    installments: finance.installments,
    recurringCosts: finance.recurringCosts,
    debts: finance.debts,
    vehicles: finance.vehicles,
    maintenance: finance.maintenance,
  })
  await ensureDefaultCategories(uid)

  const setAuth = useAuthStore.getState().set
  const unsubs = [
    subscribeCollection(uid, 'transactions', (transactions) => {
      useFinanceStore.setState({ transactions })
      setAuth({ dataLoaded: true })
    }, reportSyncError),
    subscribeCollection(uid, 'installments', (installments) => useFinanceStore.setState({ installments }), reportSyncError),
    subscribeCollection(
      uid,
      'recurringCosts',
      (recurringCosts) => {
        useFinanceStore.setState({ recurringCosts })
        setAuth({ recurringLoaded: true })
      },
      reportSyncError,
    ),
    subscribeCollection(uid, 'categories', (categories) => useFinanceStore.setState({ categories }), reportSyncError),
    subscribeCollection(uid, 'subcategories', (subcategories) => useFinanceStore.setState({ subcategories }), reportSyncError),
    subscribeCollection(uid, 'debts', (debts) => useFinanceStore.setState({ debts }), reportSyncError),
    subscribeCollection(uid, 'vehicles', (vehicles) => useFinanceStore.setState({ vehicles }), reportSyncError),
    subscribeCollection(uid, 'maintenance', (maintenance) => useFinanceStore.setState({ maintenance }), reportSyncError),
    subscribeSettings(uid, (remote) => {
      if (!remote) return
      useSettingsStore.setState((s) => ({ settings: { ...s.settings, ...remote, theme: s.settings.theme } }))
    }, reportSyncError),
    subscribeRecovery(uid, (remote) => {
      // Conta sem plano ainda: leva o que estava no aparelho.
      if (!remote) {
        saveRecovery(uid, recoveryData(useRecoveryStore.getState())).catch(reportSyncError)
        return
      }
      useRecoveryStore.setState({ ...initialRecovery, ...remote })
    }, reportSyncError),
  ]
  return () => unsubs.forEach((u) => u())
}

/** Observa o login e mantém o estado do app espelhando o Firestore. */
export function useCloudSync() {
  useEffect(() => {
    if (!isFirebaseConfigured) return
    const { auth } = getFirebase()
    const setAuth = useAuthStore.getState().set
    let stopSync: Unsubscribe | null = null
    let cancelled = false

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      stopSync?.()
      stopSync = null

      if (!user) {
        // Saiu: limpa a tela para não expor dados da conta anterior.
        useFinanceStore.setState(initialFinanceData())
        useSettingsStore.setState((s) => ({ settings: { ...defaultSettings, theme: s.settings.theme } }))
        useRecoveryStore.setState(initialRecovery)
        setAuth({ status: 'signed_out', user: null, dataLoaded: false, recurringLoaded: false, syncError: null })
        return
      }

      setAuth({
        status: 'signed_in',
        user: { uid: user.uid, name: user.displayName, email: user.email, photoURL: user.photoURL },
        dataLoaded: false,
        recurringLoaded: false,
        syncError: null,
      })
      try {
        const stop = await startSync(user.uid)
        if (cancelled || auth.currentUser?.uid !== user.uid) stop()
        else stopSync = stop
      } catch (e) {
        reportSyncError(e)
        setAuth({ dataLoaded: true })
      }
    })

    return () => {
      cancelled = true
      unsubscribeAuth()
      stopSync?.()
    }
  }, [])
}
