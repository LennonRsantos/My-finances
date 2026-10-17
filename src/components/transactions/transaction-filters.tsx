import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { resolveStatus } from '@/lib/finance'
import { useSettingsStore } from '@/store/settings-store'
import { DEFAULT_TX_FILTERS } from '@/store/ui-store'
import type { Category, ISODate, SortKey, Transaction, TransactionFilters as Filters, TransactionStatus, TransactionType } from '@/types/finance'

export type { SortKey, Filters }

export const DEFAULT_FILTERS: Filters = DEFAULT_TX_FILTERS

const SORT_LABELS: Record<SortKey, string> = {
  date_desc: 'Data: mais recente',
  date_asc: 'Data: mais antiga',
  amount_desc: 'Valor: maior primeiro',
  amount_asc: 'Valor: menor primeiro',
}

const sorters: Record<SortKey, (a: Transaction, b: Transaction) => number> = {
  date_desc: (a, b) => b.dueDate.localeCompare(a.dueDate) || b.amount - a.amount,
  date_asc: (a, b) => a.dueDate.localeCompare(b.dueDate) || b.amount - a.amount,
  amount_desc: (a, b) => b.amount - a.amount || b.dueDate.localeCompare(a.dueDate),
  amount_asc: (a, b) => a.amount - b.amount || b.dueDate.localeCompare(a.dueDate),
}

/** Aplica categoria, status e ordenação. */
export function applyFilters(rows: Transaction[], f: Filters, today: ISODate): Transaction[] {
  return rows
    .filter((t) => f.categoryId === 'all' || t.categoryId === f.categoryId)
    .filter((t) => f.status === 'all' || resolveStatus(t, today) === f.status)
    .sort(sorters[f.sort])
}

export function activeFilterCount(f: Filters) {
  return (f.categoryId !== 'all' ? 1 : 0) + (f.status !== 'all' ? 1 : 0) + (f.sort !== DEFAULT_FILTERS.sort ? 1 : 0)
}

export function TransactionFilters({
  value,
  onChange,
  categories,
  type,
}: {
  value: Filters
  onChange: (f: Filters) => void
  categories: Category[]
  type: TransactionType
}) {
  const statusOptions: [TransactionStatus, string][] =
    type === 'receita'
      ? [
          ['pago', 'Recebido'],
          ['pendente', 'A receber'],
          ['atrasado', 'Atrasado'],
        ]
      : [
          ['pago', 'Pago'],
          ['pendente', 'A pagar'],
          ['atrasado', 'Atrasado'],
        ]
  const count = activeFilterCount(value)
  const keep = useSettingsStore((s) => !!s.settings.keepFilters)

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Select value={value.sort} onValueChange={(sort) => onChange({ ...value, sort: sort as SortKey })}>
          <SelectTrigger aria-label="Ordenar por" className="col-span-2 sm:col-span-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SORT_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.categoryId} onValueChange={(categoryId) => onChange({ ...value, categoryId })}>
          <SelectTrigger aria-label="Filtrar por categoria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories
              .filter((c) => c.type === type)
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select
          value={value.status}
          onValueChange={(status) => onChange({ ...value, status: status as Filters['status'] })}
        >
          <SelectTrigger aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {statusOptions.map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(count > 0 || keep) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {count > 0 && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange(DEFAULT_FILTERS)}>
              <X /> Limpar filtros ({count})
            </Button>
          )}
          {keep && <span className="px-2 text-xs text-muted-foreground">Filtros salvos · mude em Configurações &gt; Preferências</span>}
        </div>
      )}
    </div>
  )
}
