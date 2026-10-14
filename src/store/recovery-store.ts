import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CutPlan } from '@/lib/recovery'
import type { Cents, DebtStrategy } from '@/types/finance'

interface RecoveryState extends CutPlan {
  strategy: DebtStrategy
  /** Valor extra por mês para dívidas, além dos mínimos; `null` = usar a sobra do plano */
  debtExtra: Cents | null
  setCut: (categoryId: string, pct: number) => void
  setCuts: (cuts: Record<string, number>) => void
  toggleCancelled: (id: string) => void
  setExtraIncome: (value: Cents) => void
  setStrategy: (strategy: DebtStrategy) => void
  setDebtExtra: (value: Cents | null) => void
  reset: () => void
}

const initial = { cuts: {}, cancelled: [], extraIncome: 0, strategy: 'avalanche' as DebtStrategy, debtExtra: null }

/** Simulações do "Sair do vermelho" ficam no aparelho (são rascunho de plano, não dados financeiros). */
export const useRecoveryStore = create<RecoveryState>()(
  persist(
    (set) => ({
      ...initial,
      setCut: (categoryId, pct) => set((s) => ({ cuts: { ...s.cuts, [categoryId]: pct } })),
      setCuts: (cuts) => set({ cuts }),
      toggleCancelled: (id) =>
        set((s) => ({ cancelled: s.cancelled.includes(id) ? s.cancelled.filter((x) => x !== id) : [...s.cancelled, id] })),
      setExtraIncome: (extraIncome) => set({ extraIncome }),
      setStrategy: (strategy) => set({ strategy }),
      setDebtExtra: (debtExtra) => set({ debtExtra }),
      reset: () => set(initial),
    }),
    { name: 'financas-recovery' },
  ),
)
