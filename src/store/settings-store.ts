import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AutoAcceptPerson, ThemePreference, UserSettings } from '@/types/finance'
import { saveSettings, toCloudSettings } from '@/lib/cloud'
import { saveAutoAccept } from '@/lib/shared-cloud'
import { currentUid, reportSyncError } from './auth-store'

interface SettingsState {
  settings: UserSettings
  setTheme: (theme: ThemePreference) => void
  update: (patch: Partial<UserSettings>) => void
  /** Quem tem contas divididas aceitas sem pedir (configurações + espelho para o criador consultar). */
  setAutoAccept: (people: AutoAcceptPerson[]) => void
  /** Marca/desmarca um parcelamento como conta fixa (sincroniza na nuvem). */
  toggleFixedSeries: (installmentId: string) => void
}

/** Lista vazia estável para seletores (um `[]` novo a cada leitura faria o zustand renderizar sem parar). */
export const NO_FIXED_SERIES: readonly string[] = []
export const NO_AUTO_ACCEPT: readonly AutoAcceptPerson[] = []

export const defaultSettings: UserSettings = {
  currency: 'BRL',
  locale: 'pt-BR',
  theme: 'system',
  openingBalance: 0,
  notifications: { dueToday: true, dueSoon: true, dueSoonDays: 7, overdue: true, budgetExceeded: true },
}

/** Chave lida também pelo script anti-flash em `index.html`. */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      setTheme: (theme) => set((s) => ({ settings: { ...s.settings, theme } })),
      // Tema fica por aparelho; o resto sincroniza com a nuvem quando logado.
      update: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }))
        const uid = currentUid()
        if (uid) saveSettings(uid, toCloudSettings(get().settings)).catch(reportSyncError)
      },
      setAutoAccept: (people) => {
        get().update({ autoAcceptFrom: people })
        const uid = currentUid()
        if (uid) saveAutoAccept(uid, people.map((p) => p.uid)).catch(reportSyncError)
      },
      toggleFixedSeries: (id) => {
        const current = get().settings.fixedSeries ?? []
        get().update({ fixedSeries: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] })
      },
    }),
    {
      name: 'financas-settings',
      // v2: saldo inicial de exemplo (R$ 3.500) volta para zero.
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Pick<SettingsState, 'settings'>
        return version < 2 ? { settings: { ...state.settings, openingBalance: 0 } } : state
      },
    },
  ),
)
