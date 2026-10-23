import { CalendarRange, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useGoalPlan } from '@/hooks/use-goal-plan'
import { currentYearMonth, formatMonthLabel, todayISO } from '@/lib/dates'
import { forecast, type ForecastMonth } from '@/lib/forecast'
import { goalProgress } from '@/lib/goals'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import { useSettingsStore } from '@/store/settings-store'
import { ChartTooltip } from './chart-tooltip'

const POSITIVE = 'var(--income)'
const NEGATIVE = 'var(--expense)'

/**
 * Saldo previsto no fim de cada um dos próximos 6 meses, com o que já está
 * lançado (fixos, parcelas, avulsos). "Com metas" desconta o que guardar por mês.
 */
export function ForecastCard() {
  const transactions = useFinanceStore((s) => s.transactions)
  // Caixinhas com o alvo do plano (reserva e liberdade calculadas pela renda).
  const { goals } = useGoalPlan()
  const openingBalance = useSettingsStore((s) => s.settings.openingBalance)
  const [withGoals, setWithGoals] = useState(false)
  const today = todayISO()

  const goalsPerMonth = useMemo(
    () =>
      goals.reduce((a, g) => {
        const p = goalProgress(g, today)
        return a + (p.status === 'concluida' ? 0 : (p.perMonth ?? 0))
      }, 0),
    [goals, today],
  )
  const months = useMemo(
    () => forecast(transactions, openingBalance, currentYearMonth(), today, 6, goalsPerMonth),
    [transactions, openingBalance, today, goalsPerMonth],
  )
  const useGoals = withGoals && goalsPerMonth > 0
  const value = (m: ForecastMonth) => (useGoals ? m.endAfterGoals : m.endBalance)
  const data = months.map((m) => ({ ...m, label: formatMonthLabel(m.month, 'short'), value: value(m) }))
  const firstNegative = months.find((m) => value(m) < 0)
  const missing = months.filter((m) => m.incomeMissing)
  // Sem nada lançado nos próximos meses, o card só mostraria zeros.
  if (months.every((m) => m.income === 0 && m.expenses === 0) && openingBalance === 0) return null

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="size-4" />
            Próximos meses
          </CardTitle>
          <CardDescription>
            {firstNegative
              ? `Saldo fica negativo em ${formatMonthLabel(firstNegative.month).toLowerCase()}.`
              : 'Saldo previsto no fim de cada mês, com o que já está lançado.'}
          </CardDescription>
        </div>
        {goalsPerMonth > 0 && (
          <Button size="sm" variant={useGoals ? 'default' : 'outline'} aria-pressed={useGoals} onClick={() => setWithGoals((v) => !v)}>
            {useGoals ? 'Com metas' : 'Incluir metas'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="h-52 w-full">
          <ResponsiveContainer>
            <BarChart data={data} barCategoryGap="28%" margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
              <YAxis
                width={56}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                tickFormatter={(v: number) => formatMoney(v, { compact: true })}
              />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as (ForecastMonth & { value: number }) | undefined
                  if (!active || !p) return null
                  return (
                    <ChartTooltip
                      title={formatMonthLabel(p.month)}
                      rows={[
                        { color: 'transparent', label: 'Receitas', value: formatMoney(p.income) },
                        { color: 'transparent', label: 'Despesas', value: formatMoney(p.expenses) },
                        ...(useGoals ? [{ color: 'transparent', label: 'Metas (acumulado)', value: formatMoney(p.endBalance - p.endAfterGoals) }] : []),
                        { color: p.value < 0 ? NEGATIVE : POSITIVE, label: 'Saldo no fim', value: formatMoney(p.value) },
                      ]}
                    />
                  )
                }}
              />
              <Bar dataKey="value" name="Saldo previsto" maxBarSize={28}>
                {data.map((d) => (
                  <Cell key={d.month} fill={d.value < 0 ? NEGATIVE : POSITIVE} radius={(d.value < 0 ? [0, 0, 4, 4] : [4, 4, 0, 0]) as unknown as number} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Mesma informação em texto: não depende da cor nem do gráfico. */}
        <table className="w-full text-xs sm:text-sm [&_td]:whitespace-nowrap">
          <caption className="sr-only">Previsão por mês</caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="pb-1 text-left font-normal">Mês</th>
              <th className="pb-1 text-right font-normal">Receitas</th>
              <th className="pb-1 text-right font-normal">Despesas</th>
              <th className="pb-1 text-right font-normal">Saldo</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {months.map((m) => (
              <tr key={m.month} className="border-t">
                <td className="py-1.5 capitalize">{formatMonthLabel(m.month, 'short')}</td>
                <td className={cn('py-1.5 text-right', m.incomeMissing && 'text-muted-foreground')}>{m.incomeMissing ? '—' : formatMoney(m.income)}</td>
                <td className="py-1.5 text-right">{formatMoney(m.expenses)}</td>
                <td className={cn('py-1.5 text-right font-medium', value(m) < 0 && 'text-expense')}>{formatMoney(value(m))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {missing.length > 0 && (
          <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {missing.length === months.length ? 'Nenhum mês tem receita lançada' : `${missing.length} ${missing.length === 1 ? 'mês sem' : 'meses sem'} receita lançada`}: o saldo
              aparece menor do que deve ser. Lance o salário como receita fixa para a previsão ficar certa.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
