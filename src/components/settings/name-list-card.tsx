import { Check, Pencil, Plus, Trash2, X, type LucideIcon } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldError, Input } from '@/components/ui/input'
import { cleanName } from '@/lib/utils'

export interface NamedItem {
  id: string
  name: string
}

const same = (a: string, b: string) => a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR')

/**
 * Lista de nomes editável em Configurações (cômodos, lojas, tipos de compra):
 * adicionar, renomear na linha e excluir com confirmação.
 */
export function NameListCard({
  title,
  icon: Icon,
  description,
  items,
  placeholder,
  addLabel,
  footer,
  onAdd,
  onRename,
  onRemove,
  canRemove = () => true,
  renderRemove,
}: {
  title: string
  icon: LucideIcon
  description: string
  items: readonly NamedItem[]
  placeholder: string
  /** Nome do campo de novo item (leitor de tela) */
  addLabel: string
  footer?: ReactNode
  onAdd: (name: string) => void
  onRename: (id: string, name: string) => void
  /** Exclusão do "Excluir X?" padrão (sem `renderRemove`) */
  onRemove?: (id: string) => void
  canRemove?: (item: NamedItem) => boolean
  /** Confirmação própria no lugar do "Excluir X?" padrão; `close` volta para a linha. */
  renderRemove?: (item: NamedItem, close: () => void) => ReactNode
}) {
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<NamedItem | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const taken = (value: string, except?: string) => items.some((x) => x.id !== except && same(x.name, value))

  const add = (e: FormEvent) => {
    e.preventDefault()
    const value = cleanName(name)
    if (!value) return
    if (taken(value)) return setError(`"${value}" já existe.`)
    onAdd(value)
    setName('')
    setError(null)
  }

  const rename = () => {
    if (!editing) return
    const value = cleanName(editing.name)
    if (!value) return
    if (taken(value, editing.id)) return setError(`"${value}" já existe.`)
    onRename(editing.id, value)
    setEditing(null)
    setError(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="divide-y rounded-xl border">
          {items.map((r) => (
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
              ) : removing === r.id && renderRemove ? (
                <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">{renderRemove(r, () => setRemoving(null))}</div>
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
                      onRemove?.(r.id)
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
                  {canRemove(r) && (
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
                  )}
                </>
              )}
            </li>
          ))}
          {items.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Nada aqui ainda. Adicione abaixo.</li>}
        </ul>
        <form onSubmit={add} className="flex gap-2">
          <Input
            aria-label={addLabel}
            placeholder={placeholder}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
          />
          <Button type="submit" variant="outline" disabled={!cleanName(name)}>
            <Plus />
            Adicionar
          </Button>
        </form>
        <FieldError message={error ?? undefined} />
        {footer}
      </CardContent>
    </Card>
  )
}
