import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { saveRecovery, type CloudRecovery } from '@/lib/cloud'
import type { CutPlan } from '@/lib/recovery'
import type { Cents, DebtStrategy } from '@/types/finance'
import { currentUid, reportSyncError } from './auth-store'
import { localOnlyStorage } from './local-storage'

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

export const initialRecovery: CloudRecovery = { cuts: {}, cancelled: [], extraIncome: 0, strategy: 'avalanche', debtExtra: null }

export const recoveryData = ({ cuts, cancelled, extraIncome, strategy, debtExtra }: CloudRecovery): CloudRecovery => ({
  cuts,
  cancelled,
  extraIncome,
  strategy,
  debtExtra,
})

/** Plano do "Sair do vermelho": logado, fica no Firestore e chega em tempo real aos outros aparelhos. */
export const useRecoveryStore = create<RecoveryState>()(
  persist(
    (set, get) => {
      // Arrastar um controle muda o plano várias vezes por segundo: grava só a última.
      let timer: ReturnType<typeof setTimeout> | undefined
      const update = (patch: Partial<CloudRecovery>) => {
        set(patch)
        const uid = currentUid()
        if (!uid) return
        clearTimeout(timer)
        timer = setTimeout(() => {
          if (currentUid() === uid) saveRecovery(uid, recoveryData(get())).catch(reportSyncError)
        }, 400)
      }
      return {
        ...initialRecovery,
        setCut: (categoryId, pct) => update({ cuts: { ...get().cuts, [categoryId]: pct } }),
        setCuts: (cuts) => update({ cuts }),
        toggleCancelled: (id) => {
          const { cancelled } = get()
          update({ cancelled: cancelled.includes(id) ? cancelled.filter((x) => x !== id) : [...cancelled, id] })
        },
        setExtraIncome: (extraIncome) => update({ extraIncome }),
        setStrategy: (strategy) => update({ strategy }),
        setDebtExtra: (debtExtra) => update({ debtExtra }),
        reset: () => update(initialRecovery),
      }
    },
    { name: 'financas-recovery', storage: localOnlyStorage },
  ),
)
