import { DEFAULT_HOME_ROOMS } from '@/lib/home'
import { useSettingsStore } from '@/store/settings-store'

/** Cômodos da casa (Configurações > Cômodos da casa); sem nada salvo, os padrão. */
export function useHomeRooms() {
  return useSettingsStore((s) => s.settings.homeRooms) ?? DEFAULT_HOME_ROOMS
}
