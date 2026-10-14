import { PieChart as PieIcon } from 'lucide-react'
import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/misc'
import { categoryIconMap } from '@/lib/icons'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { CategorySpending } from '@/types/finance'
import { ChartTooltip } from './chart-tooltip'

const pct = (v: number) => `${(v * 100).toFixed(0)}%`

export function CategoryDonut({ data }: { data: CategorySpending[] }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const total = data.reduce((acc, d) => acc + d.total, 0)
  const focus = data.find((d) => d.category.id === hovered)

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Gastos por categoria</CardTitle>
        <CardDescription>Distribuição das despesas do mês</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
        {data.length === 0 ? (
          <EmptyState icon={PieIcon} title="Sem despesas no mês" description="Lance uma despesa para ver a distribuição." className="w-full" />
        ) : (
          <>
            <div className="relative mx-auto aspect-square w-full max-w-56 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="total"
                    nameKey="category.name"
                    innerRadius="68%"
                    outerRadius="100%"
                    paddingAngle={1.5}
                    cornerRadius={4}
                    stroke="var(--card)"
                    strokeWidth={2}
                    onMouseEnter={(_, i) => setHovered(data[i]?.category.id ?? null)}
                    onMouseLeave={() => setHovered(null)}
                    isAnimationActive={false}
                  >
                    {data.map((d) => (
                      <Cell
                        key={d.category.id}
                        fill={d.category.color}
                        opacity={hovered && hovered !== d.category.id ? 0.35 : 1}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      const item = payload?.[0]?.payload as CategorySpending | undefined
                      if (!active || !item) return null
                      return (
                        <ChartTooltip
                          title={item.category.name}
                          rows={[{ color: item.category.color, label: pct(item.share), value: formatMoney(item.total) }]}
                        />
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xs text-muted-foreground">{focus ? focus.category.name : 'Total'}</span>
                <span className="text-lg font-semibold">{formatMoney(focus ? focus.total : total)}</span>
              </div>
            </div>

            <ul className="flex flex-1 flex-col gap-1" aria-label="Legenda">
              {data.slice(0, 7).map((d) => {
                const Icon = categoryIconMap[d.category.icon]
                return (
                  <li
                    key={d.category.id}
                    onMouseEnter={() => setHovered(d.category.id)}
                    onMouseLeave={() => setHovered(null)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-opacity',
                      hovered && hovered !== d.category.id && 'opacity-50',
                    )}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: d.category.color }}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{d.category.name}</span>
                    <span className="text-muted-foreground">{pct(d.share)}</span>
                    <span className="w-24 shrink-0 text-right font-medium tabular-nums">{formatMoney(d.total)}</span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
