import { Check, DoorOpen, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldError, Input } from '@/components/ui/input'
import { useHomeRooms } from '@/hooks/use-home-rooms'
import { createId } from '@/lib/utils'
import { useSettingsStore } from '@/store/settings-store'
import type { HomeRoom } from '@/types/finance'

const clean = (v: string) => v.trim().replace(/\s+/g, ' ').slice(0, 30)

/**
 * Cômodos usados nas compras e reparos da casa. Excluir não mexe nos
 * lançamentos: os que usavam o cômodo passam a contar como "Sem cômodo".
 */
export function HomeRoomsCard() {
  const rooms = useHomeRooms()
  const update = useSettingsStore((s) => s.update)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = (next: HomeRoom[]) => update({ homeRooms: next })
  const taken = (value: string, except?: string) =>
    rooms.some((r) => r.id !== except && r.name.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR'))

  const add = (e: FormEvent) => {
    e.preventDefault()
    const value = clean(name)
    if (!value) return
    if (taken(value)) return setError(`"${value}" já existe.`)
    save([...rooms, { id: createId(), name: value }])
    setName('')
    setError(null)
  }

  const rename = () => {
    if (!editing) return
    const value = clean(editing.name)
    if (!value) return
    if (taken(value, editing.id)) return setError(`"${value}" já existe.`)
    save(rooms.map((r) => (r.id === editing.id ? { ...r, name: value } : r)))
    setEditing(null)
    setError(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DoorOpen className="size-5" />
          Cômodos da casa
        </CardTitle>
        <CardDescription>Marque em qual cômodo foi cada compra ou reparo e veja em Casa &gt; Compras onde vai mais dinheiro.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="divide-y rounded-xl border">
          {rooms.map((r) => (
            <li key={r.id} className="flex min-h-12 items-center gap-2 px-3 py-1.5">
              {editing?.id === r.id ? (
                <>
                  <Input
                    autoFocus
                    aria-label={`Novo nome de ${r.name}`}
                    className="h-9"
                    value={editing.name}
                    onChange={(e) => setEditing({ id: r.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') rename()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label="Salvar nome" onClick={rename}>
                    <Check />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Cancelar" onClick={() => setEditing(null)}>
                    <X />
                  </Button>
                </>
              ) : removing === r.id ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">Excluir {r.name}?</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setRemoving(null)}>
                    Não
                  </Button>
                  <Button
                    type="button"
                    variant="expense"
                    size="sm"
                    onClick={() => {
                      save(rooms.filter((x) => x.id !== r.id))
                      setRemoving(null)
                    }}
                  >
                    Excluir
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground"
                    aria-label={`Renomear ${r.name}`}
                    onClick={() => {
                      setEditing({ id: r.id, name: r.name })
                      setRemoving(null)
                      setError(null)
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground"
                    aria-label={`Excluir ${r.name}`}
                    onClick={() => {
                      setRemoving(r.id)
                      setEditing(null)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
          {rooms.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Nenhum cômodo. Adicione abaixo.</li>}
        </ul>
        <form onSubmit={add} className="flex gap-2">
          <Input
            aria-label="Novo cômodo"
            placeholder="Novo cômodo (ex.: Quarto do casal)"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
          />
          <Button type="submit" variant="outline" disabled={!clean(name)}>
            <Plus />
            Adicionar
          </Button>
        </form>
        <FieldError message={error ?? undefined} />
      </CardContent>
    </Card>
  )
}
