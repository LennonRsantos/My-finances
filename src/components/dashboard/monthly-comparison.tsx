import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMonthLabel } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import type { MonthlyPoint } from '@/types/finance'
import { ChartTooltip } from './chart-tooltip'

const INCOME = 'var(--income)'
const EXPENSE = 'var(--expense)'

export function MonthlyComparison({ data }: { data: MonthlyPoint[] }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Receitas vs despesas</CardTitle>
          <CardDescription>Últimos 12 meses</CardDescription>
        </div>
        <div className="flex items-center gap-4 text-sm" aria-label="Legenda">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: INCOME }} /> Receitas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: EXPENSE }} /> Despesas
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer>
            <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                tickFormatter={(v: number) => formatMoney(v, { compact: true })}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as MonthlyPoint | undefined
                  if (!active || !p) return null
                  return (
                    <ChartTooltip
                      title={formatMonthLabel(p.month)}
                      rows={[
                        { color: INCOME, label: 'Receitas', value: formatMoney(p.income) },
                        { color: EXPENSE, label: 'Despesas', value: formatMoney(p.expenses) },
                        { color: 'transparent', label: 'Saldo', value: formatMoney(p.income - p.expenses) },
                      ]}
                    />
                  )
                }}
              />
              <Bar dataKey="income" name="Receitas" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="expenses" name="Despesas" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
