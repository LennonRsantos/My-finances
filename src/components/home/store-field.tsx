import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useHomeStores } from '@/hooks/use-home-stores'
import { cleanName, createId } from '@/lib/utils'
import { useSettingsStore } from '@/store/settings-store'

const NONE = 'nenhuma'
const NEW = 'nova'

/** Loja da compra da casa (opcional), para ver quanto vai em cada uma. `''` = nenhuma. Dá para cadastrar a loja aqui. */
export function StoreField({ value, onChange }: { value: string; onChange: (storeId: string) => void }) {
  const stores = useHomeStores()
  const update = useSettingsStore((s) => s.update)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const sorted = [...stores].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  // Loja excluída em Configurações aparece como "Nenhuma" até trocar.
  const current = stores.some((s) => s.id === value) ? value : NONE

  const add = () => {
    const clean = cleanName(name)
    if (!clean) return
    // Nome já cadastrado: usa a loja que existe.
    const found = stores.find((s) => s.name.toLocaleLowerCase('pt-BR') === clean.toLocaleLowerCase('pt-BR'))
    const store = found ?? { id: createId(), name: clean }
    if (!found) update({ homeStores: [...stores, store] })
    onChange(store.id)
    setAdding(false)
    setName('')
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="home-store">Loja (opcional)</Label>
      <Select
        value={adding ? NEW : current}
        onValueChange={(v) => {
          // O Select avisa '' quando a lista muda junto com o valor (loja recém-criada); ignora.
          if (!v) return
          setAdding(v === NEW)
          if (v !== NEW) onChange(v === NONE ? '' : v)
        }}
      >
        <SelectTrigger id="home-store" aria-label="Loja">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Nenhuma</SelectItem>
          {sorted.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
          <SelectItem value={NEW}>+ Nova loja</SelectItem>
        </SelectContent>
      </Select>
      {adding ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            aria-label="Nome da nova loja"
            placeholder="Ex.: Loja do bairro"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              // Enter cadastra a loja sem enviar o formulário da compra.
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
          <Button type="button" variant="outline" disabled={!cleanName(name)} onClick={add}>
            Adicionar
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Edite ou exclua lojas em Configurações &gt; Casa.</p>
      )}
    </div>
  )
}
