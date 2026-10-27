import { useShallow } from 'zustand/react/shallow'
import { foldText } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import { useSettingsStore } from '@/store/settings-store'
import type { DescriptionPreset, TransactionType } from '@/types/finance'

const MAX_CHIPS = 8

/**
 * Sugestões de descrição (Configurações > Categorias) do tipo do lançamento,
 * filtradas pelo que já foi digitado. Escolher preenche descrição e categoria.
 */
export function DescriptionChips({
  type,
  text,
  onPick,
}: {
  type: TransactionType
  text: string
  onPick: (preset: DescriptionPreset) => void
}) {
  const presets = useSettingsStore((s) => s.settings.descriptionPresets)
  const categories = useFinanceStore(useShallow((s) => s.categories.filter((c) => c.type === type)))
  const typed = foldText(text)
  const options = (presets ?? [])
    .map((p) => ({ preset: p, category: categories.find((c) => c.id === p.categoryId) }))
    .filter(({ preset, category }) => category && foldText(preset.name) !== typed && (!typed || foldText(preset.name).includes(typed)))
    .sort((a, b) => a.preset.name.localeCompare(b.preset.name, 'pt-BR'))
    .slice(0, MAX_CHIPS)
  if (options.length === 0) return null

  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Sugestões de descrição">
      {options.map(({ preset, category }) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onPick(preset)}
          className="flex shrink-0 items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted"
        >
          <span className="font-medium">{preset.name}</span>
          <span className="max-w-32 truncate text-muted-foreground">· {category!.name}</span>
        </button>
      ))}
    </div>
  )
}
