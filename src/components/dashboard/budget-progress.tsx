import { Target } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, EmptyState, Progress } from '@/components/ui/misc'
import { categoryIconMap } from '@/lib/icons'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { BudgetUsage } from '@/types/finance'

/** Cor da barra reflete o estado do orçamento, não a categoria. */
function barColor(ratio: number) {
  if (ratio > 1) return 'var(--expense)'
  if (ratio >= 0.8) return 'var(--warning)'
  return 'var(--income)'
}

export function BudgetProgress({ data }: { data: BudgetUsage[] }) {
  const [showAll, setShowAll] = useState(false)
  // Por padrão só o que pede atenção: estourou ou passou de 80%.
  const attention = data.filter((d) => d.ratio >= 0.8)
  const list = showAll ? data : attention
  const summary =
    data.length === 0
      ? 'Gasto do mês contra o limite de cada categoria'
      : attention.length
        ? `${attention.length} de ${data.length} ${attention.length === 1 ? 'pede' : 'pedem'} atenção`
        : `Os ${data.length} limites estão em dia`
  return (
    <Card>
      <CardHeader>
        <CardTitle>Limites por categoria</CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState icon={Target} title="Nenhum limite definido" description="Defina limites mensais em Configurações > Categorias." />
        ) : (
          <ul className="flex flex-col gap-4">
            {list.map(({ category, spent, budget, ratio }) => {
              const Icon = categoryIconMap[category.icon]
              const over = ratio > 1
              return (
                <li key={category.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium">{category.name}</span>
                    {over ? (
                      <Badge tone="expense">Estourou {Math.round((ratio - 1) * 100)}%</Badge>
                    ) : ratio >= 0.8 ? (
                      <Badge tone="warning">{Math.round(ratio * 100)}%</Badge>
                    ) : (
                      <span className="text-muted-foreground">{Math.round(ratio * 100)}%</span>
                    )}
                  </div>
                  <Progress value={ratio} color={barColor(ratio)} label={`${category.name}: ${Math.round(ratio * 100)}% do limite`} />
                  <p className="text-xs text-muted-foreground">
                    <span className={cn('font-medium text-foreground', over && 'text-expense')}>{formatMoney(spent)}</span> de{' '}
                    {formatMoney(budget)}
                    {!over && <> · resta {formatMoney(budget - spent)}</>}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
        {data.length > attention.length && (
          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Mostrar só os que pedem atenção' : `Ver todos os limites (${data.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
