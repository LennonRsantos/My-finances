import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { useFinanceStore } from '@/store/finance-store'
import { useSettingsStore } from '@/store/settings-store'
import { useHydrated } from './use-hydrated'

/** Ao abrir o app (e quando os fixos mudam), lança os meses que faltam dos gastos fixos. */
export function useRecurringMaterializer() {
  const hydrated = useHydrated()
  const ready = useAuthStore((s) => s.status === 'local' || (s.status === 'signed_in' && s.dataLoaded && s.recurringLoaded))
  const recurringCosts = useFinanceStore((s) => s.recurringCosts)

  useEffect(() => {
    if (hydrated && ready) useFinanceStore.getState().materializeRecurring()
  }, [hydrated, ready, recurringCosts])

  // Parcelamentos marcados como conta fixa ficam sem "(n/N)". Só tira (nunca devolve
  // aqui): com as configurações ainda chegando da nuvem, a lista vem vazia.
  const fixedSeries = useSettingsStore((s) => s.settings.fixedSeries)
  const transactions = useFinanceStore((s) => s.transactions)
  useEffect(() => {
    if (hydrated && ready) useFinanceStore.getState().syncFixedSeriesLabels()
  }, [hydrated, ready, fixedSeries, transactions])
}
