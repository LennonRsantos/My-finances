import { DEFAULT_HOME_STORES } from '@/lib/home'
import { useSettingsStore } from '@/store/settings-store'

/** Lojas das compras da casa (Configurações > Casa); sem nada salvo, as padrão. */
export function useHomeStores() {
  return useSettingsStore((s) => s.settings.homeStores) ?? DEFAULT_HOME_STORES
}
