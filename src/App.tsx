import type { ComponentType } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { AuthGate, LocalModeBanner, SyncErrorBanner } from '@/components/layout/auth-gate'
import { EditTransactionDialog } from '@/components/transactions/edit-transaction-dialog'
import { TransactionDialog } from '@/components/transactions/transaction-dialog'
import { useCloudSync } from '@/hooks/use-cloud-sync'
import { useRecurringMaterializer } from '@/hooks/use-recurring'
import { useThemeSync } from '@/hooks/use-theme'
import { CalendarPage } from '@/pages/calendar-page'
import { DashboardPage } from '@/pages/dashboard-page'
import { HomePage } from '@/pages/home-page'
import { RecoveryPage } from '@/pages/recovery-page'
import { ReportsPage } from '@/pages/reports-page'
import { SettingsPage } from '@/pages/settings-page'
import { TransactionsPage } from '@/pages/transactions-page'
import { VehiclePage } from '@/pages/vehicle-page'
import { useUIStore, type View } from '@/store/ui-store'

const PAGES: Record<View, ComponentType> = {
  dashboard: DashboardPage,
  lancamentos: TransactionsPage,
  calendario: CalendarPage,
  casa: HomePage,
  veiculo: VehiclePage,
  inteligencia: RecoveryPage,
  relatorios: ReportsPage,
  configuracoes: SettingsPage,
}

export default function App() {
  useThemeSync()
  useCloudSync()
  useRecurringMaterializer()
  const view = useUIStore((s) => s.view)
  const Page = PAGES[view]

  return (
    <AuthGate>
      <AppShell>
        <LocalModeBanner />
        <SyncErrorBanner />
        <Page />
        <TransactionDialog />
        <EditTransactionDialog />
      </AppShell>
    </AuthGate>
  )
}
