import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemePreference, UserSettings } from '@/types/finance'
import { saveSettings, toCloudSettings } from '@/lib/cloud'
import { currentUid, reportSyncError } from './auth-store'

interface SettingsState {
  settings: UserSettings
  setTheme: (theme: ThemePreference) => void
  update: (patch: Partial<UserSettings>) => void
}

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
