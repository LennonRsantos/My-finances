import { Car, Check, House, type LucideIcon } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAreaCategories } from '@/hooks/use-areas'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import { useSettingsStore } from '@/store/settings-store'

function Chips({ title, icon: Icon, description, selected, onToggle }: {
  title: string
  icon: LucideIcon
  description: string
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
}) {
  const categories = useFinanceStore(useShallow((s) => s.categories.filter((c) => c.type === 'despesa').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))))
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </p>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={title}>
        {categories.map((c) => {
          const on = selected.has(c.id)
          return (
            <button
              key={c.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(c.id)}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {on && <Check className="size-3.5" strokeWidth={3} />}
              {c.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Quais categorias entram sozinhas na Casa e quais já vêm ligadas ao Veículo.
 * Cada lançamento ainda pode trocar o vínculo no formulário.
 */
export function AreaCategoriesCard() {
  const { homeCats, vehicleCats, homeIds, vehicleIds } = useAreaCategories()
  const update = useSettingsStore((s) => s.update)
  const toggle = (list: readonly string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Casa e Veículo</CardTitle>
        <CardDescription>Gastos dessas categorias aparecem também na Casa ou no Veículo. Dá para trocar em cada lançamento.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Chips
          title="Entram na Casa"
          icon={House}
          description="Contas e compras da casa, mesmo fora de Moradia (ex.: manutenção, mercado da casa)."
          selected={homeCats}
          onToggle={(id) => update({ homeCategoryIds: toggle(homeIds, id) })}
        />
        <Chips
          title="Vinculadas ao Veículo"
          icon={Car}
          description="Já vêm ligadas ao veículo no lançamento (ex.: transporte, estacionamento)."
          selected={vehicleCats}
          onToggle={(id) => update({ vehicleCategoryIds: toggle(vehicleIds, id) })}
        />
      </CardContent>
    </Card>
  )
}
