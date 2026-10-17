import { CalendarX2, Plus } from 'lucide-react'
import { BudgetProgress } from '@/components/dashboard/budget-progress'
import { AreaStrip } from '@/components/dashboard/area-strip'
import { CategoryDonut } from '@/components/dashboard/category-donut'
import { DueAlerts } from '@/components/dashboard/due-alerts'
import { InstallmentDebtCard } from '@/components/dashboard/installment-debt'
import { ReceivablesCard } from '@/components/dashboard/receivables-card'
import { MonthSelector } from '@/components/dashboard/month-selector'
import { MonthlyComparison } from '@/components/dashboard/monthly-comparison'
import { PayeesCard } from '@/components/dashboard/payees-card'
import { MonthStatement } from '@/components/dashboard/summary-cards'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, Skeleton } from '@/components/ui/misc'
import { useDashboardData } from '@/hooks/use-dashboard'
import { useHydrated } from '@/hooks/use-hydrated'
import { formatMonthLabel } from '@/lib/dates'
import { useUIStore } from '@/store/ui-store'

export { PageHeader }

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Carregando">
      <Skeleton className="h-52" />
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
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:p-6">
        {!hydrated ? (
          <DashboardSkeleton />
        ) : (
          <>
            <MonthStatement summary={data.summary} toPay={data.toPay} />
            <PayeesCard data={data.payees} month={data.month} today={data.today} />
            <ReceivablesCard month={data.month} today={data.today} />

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

            {/* Ordem: o que pede ação (contas, limites) antes do que é análise (onde foi, histórico). */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-5">
              <div className="flex flex-col gap-4 lg:col-span-2">
                <DueAlerts alerts={data.alerts} days={data.dueSoonDays} />
                <InstallmentDebtCard debt={data.installmentDebt} />
                <BudgetProgress data={data.budgetUsage} />
              </div>
              <div className="flex flex-col gap-4 lg:col-span-3">
                {data.hasData && <AreaStrip byArea={data.byArea} total={data.summary.monthExpenses} />}
                <CategoryDonut data={data.categorySpending} />
                <MonthlyComparison data={data.monthlySeries} />
              </div>
            </div>
          </>
        )}
      </main>
    </>
  )
}
