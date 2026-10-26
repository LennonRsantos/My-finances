import { Choices } from '@/components/ui/form-kit'
import { Label } from '@/components/ui/input'
import { useHomeRooms } from '@/hooks/use-home-rooms'

/** Cômodo da casa (opcional), para ver onde vai o gasto com móveis e reparos. `''` = nenhum. */
export function RoomField({ value, onChange }: { value: string; onChange: (roomId: string) => void }) {
  const rooms = useHomeRooms()
  // Cômodo excluído em Configurações aparece como "Nenhum" até trocar.
  const current = rooms.some((r) => r.id === value) ? value : ''
  return (
    <div className="flex flex-col gap-2">
      <Label>Cômodo (opcional)</Label>
      <Choices
        label="Cômodo"
        value={current}
        onChange={onChange}
        options={[{ value: '', label: 'Nenhum' }, ...rooms.map((r) => ({ value: r.id, label: r.name }))]}
      />
      <p className="text-xs text-muted-foreground">Crie ou renomeie cômodos em Configurações &gt; Categorias.</p>
    </div>
  )
}
