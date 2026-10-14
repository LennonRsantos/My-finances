import { CalendarX2, Plus, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { BudgetProgress } from '@/components/dashboard/budget-progress'
import { CategoryDonut } from '@/components/dashboard/category-donut'
import { DueAlerts } from '@/components/dashboard/due-alerts'
import { MonthSelector } from '@/components/dashboard/month-selector'
import { MonthlyComparison } from '@/components/dashboard/monthly-comparison'
import { PayeesCard } from '@/components/dashboard/payees-card'
import { HealthBanner, SummaryCards } from '@/components/dashboard/summary-cards'
import { ThemeToggle } from '@/components/layout/app-shell'
import { MobileAccountButton } from '@/components/layout/user-menu'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { useDashboardData } from '@/hooks/use-dashboard'
import { useHydrated } from '@/hooks/use-hydrated'
import { formatMonthLabel } from '@/lib/dates'
import { useUIStore } from '@/store/ui-store'

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-background/90 px-4 py-2 backdrop-blur sm:px-6">
      <div className="mr-auto flex min-w-0 items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground lg:hidden">
          <Wallet className="size-4" />
        </span>
        <h1 className="truncate text-lg font-semibold">{title}</h1>
      </div>
      <MobileHeaderActions />
      {/* No celular, as ações (ex.: seletor de mês) ganham uma linha inteira. */}
      {actions && <div className="order-last flex w-full justify-center sm:order-none sm:w-auto">{actions}</div>}
    </header>
  )
}

/** Tema e conta (configurações, sair) ficam no header no mobile, fora da barra inferior. */
function MobileHeaderActions() {
  return (
    <div className="flex lg:hidden">
      <ThemeToggle />
      <MobileAccountButton />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Carregando">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className={i % 3 === 0 ? 'col-span-2 h-24 lg:col-span-1' : 'h-24'} />
        ))}
      </div>
      <Skeleton className="h-16" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const hydrated = useHydrated()
  const data = useDashboardData()
  const openForm = useUIStore((s) => s.setTransactionDialogOpen)

  return (
    <>
      <PageHeader title="Dashboard" actions={<MonthSelector />} />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 sm:p-6">
        {!hydrated ? (
          <DashboardSkeleton />
        ) : (
          <>
            <SummaryCards summary={data.summary} />
            <HealthBanner summary={data.summary} />
            <PayeesCard data={data.payees} month={data.month} today={data.today} />

            {!data.hasData && (
              <Card>
                <EmptyState
                  icon={CalendarX2}
                  title={`Nenhum lançamento em ${formatMonthLabel(data.month)}`}
                  description="Comece registrando suas receitas e despesas deste mês."
                  action={
                    <Button onClick={() => openForm(true)}>
                      <Plus /> Novo lançamento
                    </Button>
                  }
                />
              </Card>
            )}

            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <CategoryDonut data={data.categorySpending} />
              </div>
              <div className="lg:col-span-2">
                <DueAlerts alerts={data.alerts} />
              </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <MonthlyComparison data={data.monthlySeries} />
              </div>
              <div className="lg:col-span-2">
                <BudgetProgress data={data.budgetUsage} />
              </div>
            </div>
          </>
        )}
      </main>
    </>
  )
}
