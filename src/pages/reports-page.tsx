import { Car, Download, House, Layers, TrendingDown, TrendingUp, Wallet, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MonthlyComparison } from '@/components/dashboard/monthly-comparison'
import { MonthSelector } from '@/components/dashboard/month-selector'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, Progress } from '@/components/ui/misc'
import { formatDateShort, formatMonthLabel, todayISO } from '@/lib/dates'
import { computeMonthlySeries } from '@/lib/finance'
import { categoryIconMap } from '@/lib/icons'
import { formatMoney } from '@/lib/money'
import { buildReport, toCSV, type Area, type ReportPeriod } from '@/lib/reports'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import { useUIStore } from '@/store/ui-store'
import { PAYMENT_METHOD_LABELS } from '@/types/finance'
import { PageHeader } from '@/components/layout/page-header'

const AREAS: { area: Area; label: string; icon: LucideIcon; view?: 'casa' | 'veiculo' }[] = [
  { area: 'casa', label: 'Casa', icon: House, view: 'casa' },
  { area: 'veiculo', label: 'Veículo', icon: Car, view: 'veiculo' },
  { area: 'outros', label: 'Outros gastos', icon: Layers },
]

const pct = (v: number) => `${Math.round(v * 100)}%`

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: 'income' | 'expense'; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-lg font-semibold tabular-nums', tone === 'income' && 'text-income', tone === 'expense' && 'text-expense')}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Card>
  )
}

export function ReportsPage() {
  const { transactions, categories, subcategories, vehicles } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, categories: s.categories, subcategories: s.subcategories, vehicles: s.vehicles })),
  )
  const month = useUIStore((s) => s.selectedMonth)
  const setView = useUIStore((s) => s.setView)
  const [period, setPeriod] = useState<ReportPeriod>('mes')
  const today = todayISO()
  const report = buildReport(transactions, month, period, today)
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const periodLabel =
    period === 'mes' ? formatMonthLabel(month) : `${formatMonthLabel(report.months[0]!)} a ${formatMonthLabel(month)}`

  const exportCSV = () => {
    const csv = toCSV(report.items, { categories, subcategories, vehicles }, today)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `financas-${period === 'mes' ? month : `${report.months[0]}_${month}`}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader title="Relatórios" actions={<MonthSelector />} />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Período" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {(
              [
                ['mes', 'Mês'],
                ['ano', '12 meses'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={period === key}
                onClick={() => setPeriod(key)}
                className={cn('h-9 rounded-lg px-4 text-sm font-medium transition-colors', period === key ? 'bg-card shadow-sm' : 'text-muted-foreground')}
              >
                {label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!report.items.length}>
            <Download />
            Exportar CSV
          </Button>
        </div>
        <p className="-mt-1 text-sm text-muted-foreground">{periodLabel}</p>

        {report.items.length === 0 ? (
          <Card>
            <EmptyState icon={Wallet} title="Sem lançamentos no período" description="Troque o mês no topo ou lance receitas e despesas." />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Receitas" value={formatMoney(report.income)} tone="income" />
              <Stat label="Despesas" value={formatMoney(report.expenses)} tone="expense" />
              <Stat label="Saldo" value={`${report.balance < 0 ? '−' : ''}${formatMoney(Math.abs(report.balance))}`} tone={report.balance < 0 ? 'expense' : 'income'} />
              <Stat label="Gasto médio por dia" value={formatMoney(report.dailyAverage)} hint={report.days ? `${report.days} dias` : 'Período ainda não começou'} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Por área</CardTitle>
                <CardDescription>Quanto das despesas foi para a casa, para o veículo e para o resto.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-4">
                  {AREAS.map(({ area, label, icon: Icon, view }) => {
                    const total = report.byArea[area]
                    const share = report.expenses ? total / report.expenses : 0
                    return (
                      <li key={area} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          {view ? (
                            <button type="button" onClick={() => setView(view)} className="flex items-center gap-2 font-medium hover:underline">
                              <Icon className="size-4 text-muted-foreground" />
                              {label}
                            </button>
                          ) : (
                            <span className="flex items-center gap-2 font-medium">
                              <Icon className="size-4 text-muted-foreground" />
                              {label}
                            </span>
                          )}
                          <span className="tabular-nums">
                            {formatMoney(total)} <span className="text-muted-foreground">· {pct(share)}</span>
                          </span>
                        </div>
                        <Progress value={share} label={`${label}: ${pct(share)} das despesas`} color="var(--info)" />
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>

            {period === 'ano' && <MonthlyComparison data={computeMonthlySeries(transactions, month, 12)} />}

            <Card>
              <CardHeader>
                <CardTitle>Por categoria</CardTitle>
                <CardDescription>Comparado ao {period === 'mes' ? 'mês anterior' : 'período de 12 meses anterior'}.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {report.byCategory.map((c) => {
                    const category = categoryById.get(c.categoryId)
                    const Icon = category ? categoryIconMap[category.icon] : Layers
                    const change = c.previous ? (c.total - c.previous) / c.previous : null
                    return (
                      <li key={c.categoryId} className="flex items-center gap-3 py-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: category?.color ?? 'var(--muted-foreground)' }}>
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{category?.name ?? 'Sem categoria'}</p>
                          <p className="text-xs text-muted-foreground">{pct(c.share)} das despesas</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums">{formatMoney(c.total)}</p>
                          {change !== null && Math.abs(change) >= 0.05 && (
                            <p className={cn('flex items-center justify-end gap-0.5 text-xs', change > 0 ? 'text-expense' : 'text-income')}>
                              {change > 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                              {change > 0 ? '+' : ''}
                              {pct(change)}
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>

            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Maiores gastos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="divide-y">
                    {report.top.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{t.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateShort(t.dueDate)} · {categoryById.get(t.categoryId)?.name ?? 'Sem categoria'}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(t.amount)}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Por forma de pagamento</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-3">
                    {report.byPayment.map((p) => (
                      <li key={p.method ?? 'none'} className="flex flex-col gap-1.5">
                        <div className="flex justify-between gap-2 text-sm">
                          <span>{p.method ? PAYMENT_METHOD_LABELS[p.method] : 'Não informado'}</span>
                          <span className="tabular-nums">{formatMoney(p.total)}</span>
                        </div>
                        <Progress value={report.expenses ? p.total / report.expenses : 0} label={`${p.method ?? 'Não informado'}`} color="var(--info)" />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </>
  )
}
