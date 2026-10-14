import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { useFinanceStore } from '@/store/finance-store'
import { useHydrated } from './use-hydrated'

/** Ao abrir o app (e quando os fixos mudam), lança os meses que faltam dos gastos fixos. */
export function useRecurringMaterializer() {
  const hydrated = useHydrated()
  const ready = useAuthStore((s) => s.status === 'local' || (s.status === 'signed_in' && s.dataLoaded && s.recurringLoaded))
  const recurringCosts = useFinanceStore((s) => s.recurringCosts)

  useEffect(() => {
    if (hydrated && ready) useFinanceStore.getState().materializeRecurring()
  }, [hydrated, ready, recurringCosts])
}
