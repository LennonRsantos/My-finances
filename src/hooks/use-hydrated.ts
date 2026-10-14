import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { useFinanceStore } from '@/store/finance-store'

/** `true` quando os dados já foram carregados (localStorage ou primeiro snapshot do Firestore). */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(() => useFinanceStore.persist.hasHydrated())

  useEffect(() => {
    if (hydrated) return
    return useFinanceStore.persist.onFinishHydration(() => setHydrated(true))
  }, [hydrated])

  const cloudPending = useAuthStore((s) => s.status === 'signed_in' && !s.dataLoaded)
  return hydrated && !cloudPending
}
