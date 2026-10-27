import { Pencil, Plus, TextCursorInput, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cleanName, cn, createId, foldText } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import { useSettingsStore } from '@/store/settings-store'
import type { Category, DescriptionPreset, TransactionType } from '@/types/finance'

const NO_PRESETS: DescriptionPreset[] = []

type DialogState = { kind: 'edit'; preset?: DescriptionPreset } | { kind: 'delete'; preset: DescriptionPreset } | null

function Actions({ label, destructive, onConfirm, disabled }: { label: string; destructive?: boolean; onConfirm?: () => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <DialogClose asChild>
        <Button type="button" variant="outline" className="flex-1">
          Cancelar
        </Button>
      </DialogClose>
      <Button
        type={onConfirm ? 'button' : 'submit'}
        variant={destructive ? 'expense' : 'default'}
        className="flex-[2]"
        onClick={onConfirm}
        disabled={disabled}
      >
        {label}
      </Button>
    </div>
  )
}

function PresetForm({
  preset,
  categories,
  presets,
  onSave,
}: {
  preset?: DescriptionPreset
  categories: Category[]
  /** Sugestões do mesmo tipo, para não repetir nome */
  presets: DescriptionPreset[]
  onSave: (p: DescriptionPreset) => void
}) {
  const [name, setName] = useState(preset?.name ?? '')
  const [categoryId, setCategoryId] = useState(() =>
    preset && categories.some((c) => c.id === preset.categoryId) ? preset.categoryId : '',
  )
  const [errors, setErrors] = useState<{ name?: string; category?: string }>({})

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = cleanName(name)
    const next = {
      name: !value ? 'Informe o nome' : presets.some((p) => p.id !== preset?.id && foldText(p.name) === foldText(value)) ? 'Já existe' : undefined,
      category: categoryId ? undefined : 'Escolha a categoria',
    }
    setErrors(next)
    if (next.name || next.category) return
    onSave({ id: preset?.id ?? createId(), name: value, categoryId })
  }

  return (
    <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-5 px-5 pb-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="preset-name">Descrição</Label>
          <Input
            id="preset-name"
            autoFocus
            maxLength={40}
            placeholder="Ex.: nome do cliente, loja, serviço"
            aria-invalid={!!errors.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <FieldError message={errors.name} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="preset-category">Categoria</Label>
          <Select value={categoryId || undefined} onValueChange={setCategoryId}>
            <SelectTrigger id="preset-category" aria-label="Categoria" aria-invalid={!!errors.category}>
              <SelectValue placeholder="Escolha a categoria" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.category} />
        </div>
      </div>
      <Actions label={preset ? 'Salvar' : 'Criar sugestão'} />
    </form>
  )
}

/**
 * Descrições prontas para o Novo lançamento (ex.: clientes de freela). Tocar
 * numa sugestão no formulário preenche a descrição e a categoria.
 */
export function DescriptionPresetsCard() {
  const presets = useSettingsStore((s) => s.settings.descriptionPresets) ?? NO_PRESETS
  const update = useSettingsStore((s) => s.update)
  const categories = useFinanceStore(useShallow((s) => s.categories))
  const [tab, setTab] = useState<TransactionType>('receita')
  const [dialog, setDialog] = useState<DialogState>(null)
  const close = () => setDialog(null)

  const typeOf = (p: DescriptionPreset) => categories.find((c) => c.id === p.categoryId)?.type ?? null
  const typeCategories = useMemo(
    () => categories.filter((c) => c.type === tab).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [categories, tab],
  )
  // Categoria excluída: aparece nas duas abas para editar ou excluir.
  const list = presets
    .filter((p) => (typeOf(p) ?? tab) === tab)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  const save = (p: DescriptionPreset) => {
    update({ descriptionPresets: presets.some((x) => x.id === p.id) ? presets.map((x) => (x.id === p.id ? p : x)) : [...presets, p] })
    close()
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <TextCursorInput className="size-5" />
            Sugestões de descrição
          </CardTitle>
          <CardDescription>Aparecem abaixo da descrição no Novo lançamento. Tocar preenche descrição e categoria.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setDialog({ kind: 'edit' })}>
          <Plus /> Nova
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div role="tablist" aria-label="Tipo das sugestões" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(
            [
              ['receita', 'Receitas'],
              ['despesa', 'Despesas'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn('h-9 rounded-lg text-sm font-medium transition-colors', tab === key ? 'bg-card shadow-sm' : 'text-muted-foreground')}
            >
              {label} ({presets.filter((p) => typeOf(p) === key).length})
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">Nenhuma sugestão. Crie a primeira no botão Nova.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {list.map((p) => {
              const category = categories.find((c) => c.id === p.categoryId)
              return (
                <li key={p.id} className="flex min-h-12 items-center gap-2 py-1.5 pl-3 pr-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {category ? (
                        <>
                          <span className="size-2 shrink-0 rounded-full" style={{ background: category.color }} aria-hidden />
                          <span className="truncate">{category.name}</span>
                        </>
                      ) : (
                        <span className="text-expense">Categoria excluída</span>
                      )}
                    </span>
                  </span>
                  <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Editar ${p.name}`} onClick={() => setDialog({ kind: 'edit', preset: p })}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-expense"
                    aria-label={`Excluir ${p.name}`}
                    onClick={() => setDialog({ kind: 'delete', preset: p })}
                  >
                    <Trash2 />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && close()}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === 'delete'
                ? `Excluir "${dialog.preset.name}"?`
                : dialog?.preset
                  ? 'Editar sugestão'
                  : `Nova sugestão de ${tab === 'receita' ? 'receita' : 'despesa'}`}
            </DialogTitle>
          </DialogHeader>
          {dialog?.kind === 'edit' && (
            <PresetForm
              key={dialog.preset?.id ?? 'new'}
              preset={dialog.preset}
              categories={typeCategories}
              presets={presets.filter((p) => (typeOf(p) ?? tab) === tab)}
              onSave={save}
            />
          )}
          {dialog?.kind === 'delete' && (
            <>
              <p className="px-5 pb-4 text-sm text-muted-foreground">Some das sugestões. Lançamentos já feitos não mudam.</p>
              <Actions
                destructive
                label="Excluir"
                onConfirm={() => {
                  update({ descriptionPresets: presets.filter((x) => x.id !== dialog.preset.id) })
                  close()
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
