import { DoorOpen } from 'lucide-react'
import { NameListCard } from '@/components/settings/name-list-card'
import { useHomeRooms } from '@/hooks/use-home-rooms'
import { createId } from '@/lib/utils'
import { useSettingsStore } from '@/store/settings-store'
import type { HomeRoom } from '@/types/finance'

/**
 * Cômodos usados nas compras e reparos da casa. Excluir não mexe nos
 * lançamentos: os que usavam o cômodo passam a contar como "Sem cômodo".
 */
export function HomeRoomsCard() {
  const rooms = useHomeRooms()
  const update = useSettingsStore((s) => s.update)
  const save = (next: HomeRoom[]) => update({ homeRooms: next })
  return (
    <NameListCard
      title="Cômodos da casa"
      icon={DoorOpen}
      description="Marque em qual cômodo foi cada compra ou reparo e veja em Casa > Compras onde vai mais dinheiro."
      items={rooms}
      placeholder="Novo cômodo (ex.: Quarto do casal)"
      addLabel="Novo cômodo"
      onAdd={(name) => save([...rooms, { id: createId(), name }])}
      onRename={(id, name) => save(rooms.map((r) => (r.id === id ? { ...r, name } : r)))}
      onRemove={(id) => save(rooms.filter((r) => r.id !== id))}
    />
  )
}
