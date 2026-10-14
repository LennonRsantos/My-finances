import { Construction } from 'lucide-react'
import { AppShell, NAV_ITEMS } from '@/components/layout/app-shell'
import { AuthGate, SyncErrorBanner } from '@/components/layout/auth-gate'
import { EditTransactionDialog } from '@/components/transactions/edit-transaction-dialog'
import { TransactionDialog } from '@/components/transactions/transaction-dialog'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/misc'
import { useCloudSync } from '@/hooks/use-cloud-sync'
import { useRecurringMaterializer } from '@/hooks/use-recurring'
import { useThemeSync } from '@/hooks/use-theme'
import { CalendarPage } from '@/pages/calendar-page'
import { RecoveryPage } from '@/pages/recovery-page'
import { DashboardPage, PageHeader } from '@/pages/dashboard-page'
import { SettingsPage } from '@/pages/settings-page'
import { TransactionsPage } from '@/pages/transactions-page'
import { useUIStore, type View } from '@/store/ui-store'

const roadmap: Partial<Record<View, string>> = {
  relatorios: 'Relatório mensal, média diária de gastos e exportação CSV/PDF.',
}

function ComingSoon({ view }: { view: View }) {
  const label = NAV_ITEMS.find((i) => i.view === view)?.label ?? ''
  return (
    <>
      <PageHeader title={label} />
      <main className="mx-auto w-full max-w-4xl p-4 sm:p-6">
        <Card>
          <EmptyState icon={Construction} title="Próxima etapa" description={roadmap[view]} />
        </Card>
      </main>
    </>
  )
}

export default function App() {
  useThemeSync()
  useCloudSync()
  useRecurringMaterializer()
  const view = useUIStore((s) => s.view)

  return (
    <AuthGate>
      <AppShell>
        <SyncErrorBanner />
        {view === 'dashboard' ? (
          <DashboardPage />
        ) : view === 'lancamentos' ? (
          <TransactionsPage />
        ) : view === 'calendario' ? (
          <CalendarPage />
        ) : view === 'inteligencia' ? (
          <RecoveryPage />
        ) : view === 'configuracoes' ? (
          <SettingsPage />
        ) : (
          <ComingSoon view={view} />
        )}
        <TransactionDialog />
        <EditTransactionDialog />
      </AppShell>
    </AuthGate>
  )
}
