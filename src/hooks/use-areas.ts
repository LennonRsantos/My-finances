import { useMemo } from 'react'
import { DEFAULT_HOME_CATEGORIES, DEFAULT_VEHICLE_CATEGORIES } from '@/lib/areas'
import { useSettingsStore } from '@/store/settings-store'

/** Categorias marcadas como da Casa e do Veículo (Configurações > Categorias), como conjuntos. */
export function useAreaCategories() {
  const home = useSettingsStore((s) => s.settings.homeCategoryIds) ?? DEFAULT_HOME_CATEGORIES
  const vehicle = useSettingsStore((s) => s.settings.vehicleCategoryIds) ?? DEFAULT_VEHICLE_CATEGORIES
  const homeCats = useMemo(() => new Set(home), [home])
  const vehicleCats = useMemo(() => new Set(vehicle), [vehicle])
  return { homeCats, vehicleCats, homeIds: home, vehicleIds: vehicle }
}
