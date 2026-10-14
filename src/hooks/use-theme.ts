import { useEffect } from 'react'
import { useSettingsStore } from '@/store/settings-store'

/** Aplica a classe `dark` no <html> conforme a preferência e o sistema. */
export function useThemeSync() {
  const theme = useSettingsStore((s) => s.settings.theme)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}
