import { Store } from 'lucide-react'
import { NameListCard } from '@/components/settings/name-list-card'
import { useHomeStores } from '@/hooks/use-home-stores'
import { createId } from '@/lib/utils'
import { useSettingsStore } from '@/store/settings-store'
import type { HomeStore } from '@/types/finance'

/**
 * Lojas das compras da casa. Excluir não mexe nos lançamentos: os que usavam
 * a loja passam a contar como "Sem loja".
 */
export function HomeStoresCard() {
  const stores = useHomeStores()
  const update = useSettingsStore((s) => s.update)
  const save = (next: HomeStore[]) => update({ homeStores: next })
  return (
    <NameListCard
      title="Lojas"
      icon={Store}
      description="Marque onde comprou cada coisa da casa e veja em Casa > Compras quanto gasta em cada loja."
      items={stores}
      placeholder="Nova loja (ex.: Tok&Stok)"
      addLabel="Nova loja"
      onAdd={(name) => save([...stores, { id: createId(), name }])}
      onRename={(id, name) => save(stores.map((s) => (s.id === id ? { ...s, name } : s)))}
      onRemove={(id) => save(stores.filter((s) => s.id !== id))}
    />
  )
}
