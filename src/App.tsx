import { lazy, Suspense, useEffect, type ComponentType } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { AuthGate, LocalModeBanner, SyncErrorBanner } from '@/components/layout/auth-gate'
import { SharedBanners } from '@/components/shared/shared-ui'
import { EditTransactionDialog } from '@/components/transactions/edit-transaction-dialog'
import { TransactionDialog } from '@/components/transactions/transaction-dialog'
import { Skeleton } from '@/components/ui/misc'
import { useCloudSync } from '@/hooks/use-cloud-sync'
import { useRecurringMaterializer } from '@/hooks/use-recurring'
import { useSharedReconciler } from '@/hooks/use-shared'
import { useThemeSync } from '@/hooks/use-theme'
import { useUIStore, type View } from '@/store/ui-store'

/**
 * Cada tela é um arquivo separado: o celular baixa só a que vai abrir.
 * Depois da primeira tela, as outras são baixadas em segundo plano para a
 * navegação continuar instantânea.
 */
const loaders: Record<View, () => Promise<{ default: ComponentType }>> = {
  dashboard: () => import('@/pages/dashboard-page').then((m) => ({ default: m.DashboardPage })),
  lancamentos: () => import('@/pages/transactions-page').then((m) => ({ default: m.TransactionsPage })),
  calendario: () => import('@/pages/calendar-page').then((m) => ({ default: m.CalendarPage })),
  casa: () => import('@/pages/home-page').then((m) => ({ default: m.HomePage })),
  veiculo: () => import('@/pages/vehicle-page').then((m) => ({ default: m.VehiclePage })),
  inteligencia: () => import('@/pages/recovery-page').then((m) => ({ default: m.RecoveryPage })),
  relatorios: () => import('@/pages/reports-page').then((m) => ({ default: m.ReportsPage })),
  configuracoes: () => import('@/pages/settings-page').then((m) => ({ default: m.SettingsPage })),
}

const PAGES: Record<View, ComponentType> = {
  dashboard: lazy(loaders.dashboard),
  lancamentos: lazy(loaders.lancamentos),
  calendario: lazy(loaders.calendario),
  casa: lazy(loaders.casa),
  veiculo: lazy(loaders.veiculo),
  inteligencia: lazy(loaders.inteligencia),
  relatorios: lazy(loaders.relatorios),
  configuracoes: lazy(loaders.configuracoes),
}

function PageFallback() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6" aria-busy aria-label="Carregando">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-28" />
      <Skeleton className="h-64" />
    </div>
  )
}

/** Baixa as outras telas quando o navegador estiver ocioso. */
function usePrefetchPages() {
  useEffect(() => {
    const prefetch = () => Object.values(loaders).forEach((load) => void load())
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(prefetch, 2000)
    return () => clearTimeout(id)
  }, [])
}

export default function App() {
  useThemeSync()
  useCloudSync()
  useRecurringMaterializer()
  useSharedReconciler()
  usePrefetchPages()
  const view = useUIStore((s) => s.view)
  const Page = PAGES[view]

  return (
    <AuthGate>
      <AppShell>
        <LocalModeBanner />
        <SyncErrorBanner />
        <SharedBanners />
        <Suspense fallback={<PageFallback />}>
          <Page />
        </Suspense>
        <TransactionDialog />
        <EditTransactionDialog />
      </AppShell>
    </AuthGate>
  )
}
