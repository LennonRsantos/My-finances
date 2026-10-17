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
import { subscribeHandle, subscribeSharedBills, subscribeTransfers } from '@/lib/shared-cloud'
import { initialRecovery, recoveryData, useRecoveryStore } from '@/store/recovery-store'
import { resetShared, useSharedStore } from '@/store/shared-store'
import { defaultSettings, useSettingsStore } from '@/store/settings-store'

/**
 * Preparação da conta (primeiro login, categorias novas). Roda em paralelo
 * com as escutas: antes, o app esperava essas leituras no servidor para só
 * então mostrar os dados.
 */
async function prepareAccount(uid: string, finance: ReturnType<typeof useFinanceStore.getState>) {
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
}

/** Liga os dados do usuário logado ao Firestore. Retorna função de desligar. */
function startSync(uid: string): Unsubscribe {
  // Foto do que estava no navegador antes das escutas trocarem o estado.
  prepareAccount(uid, useFinanceStore.getState()).catch(reportSyncError)

  const setAuth = useAuthStore.getState().set
  const unsubs = [
    subscribeCollection(uid, 'transactions', (transactions) => {
      useFinanceStore.setState({ transactions })
      setAuth({ dataLoaded: true })
    }, (e) => {
      // Sem permissão ou sem rede: mostra o erro em vez de carregar para sempre.
      reportSyncError(e)
      setAuth({ dataLoaded: true })
    }),
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
  unsubs.push(
    subscribeHandle(uid, (handle) => useSharedStore.setState({ handle, handleLoaded: true }), reportSyncError),
    subscribeSharedBills(uid, (bills) => useSharedStore.setState({ bills, rulesMissing: false }), (e) => {
      // Sem as regras novas publicadas, só a parte compartilhada para: aviso discreto, não erro geral.
      if ((e as { code?: string })?.code === 'permission-denied') useSharedStore.setState({ rulesMissing: true })
      else reportSyncError(e)
    }),
    subscribeTransfers(
      uid,
      (outgoing) => useSharedStore.setState({ outgoing, transfersLoaded: true }),
      (incoming) => useSharedStore.setState({ incoming }),
      // Regras de `transfers` não publicadas: "Enviar para" segue só local, como antes.
      (e) => {
        if ((e as { code?: string })?.code !== 'permission-denied') reportSyncError(e)
      },
    ),
  )
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

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      stopSync?.()
      stopSync = null

      if (!user) {
        // Saiu: limpa a tela para não expor dados da conta anterior.
        useFinanceStore.setState(initialFinanceData())
        useSettingsStore.setState((s) => ({ settings: { ...defaultSettings, theme: s.settings.theme } }))
        useRecoveryStore.setState(initialRecovery)
        resetShared()
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
      const stop = startSync(user.uid)
      if (cancelled || auth.currentUser?.uid !== user.uid) stop()
      else stopSync = stop
    })

    return () => {
      cancelled = true
      unsubscribeAuth()
      stopSync?.()
    }
  }, [])
}
