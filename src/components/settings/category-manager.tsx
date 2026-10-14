import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { categoryIconMap } from '@/lib/icons'
import { formatMoney, fromCents, toCents } from '@/lib/money'
import { parseMoneyInput } from '@/lib/schemas'
import { cn, createId } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import { CATEGORY_ICONS, type Category, type HexColor, type Subcategory, type TransactionType } from '@/types/finance'

/** Cores sugeridas; o seletor livre continua disponível. */
const COLOR_PRESETS: HexColor[] = [
  '#6366f1',
  '#f97316',
  '#0ea5e9',
  '#b45309',
  '#ef4444',
  '#a855f7',
  '#ec4899',
  '#ca8a04',
  '#14b8a6',
  '#64748b',
  '#22c55e',
  '#10b981',
]

const budgetField = z
  .string()
  .trim()
  .refine((v) => v === '' || (!Number.isNaN(parseMoneyInput(v)) && parseMoneyInput(v) >= 0), 'Valor inválido')

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(40, 'Máximo de 40 caracteres'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida'),
  icon: z.enum(CATEGORY_ICONS),
  budget: budgetField,
})
type CategoryValues = z.infer<typeof categorySchema>

const subcategorySchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(40, 'Máximo de 40 caracteres'),
  budget: budgetField,
})
type SubcategoryValues = z.infer<typeof subcategorySchema>

const toBudget = (v: string) => (v === '' ? null : toCents(parseMoneyInput(v)))
const fromBudget = (v: number | null) => (v === null ? '' : fromCents(v).toFixed(2).replace('.', ','))

type DialogState =
  | { kind: 'category'; type: TransactionType; category?: Category }
  | { kind: 'subcategory'; category: Category; subcategory?: Subcategory }
  | { kind: 'delete-category'; category: Category }
  | { kind: 'delete-subcategory'; subcategory: Subcategory }
  | null

// ---------------------------------------------------------------------------
// Formulários
// ---------------------------------------------------------------------------

function CategoryForm({ type, category, onDone }: { type: TransactionType; category?: Category; onDone: () => void }) {
  const saveCategory = useFinanceStore((s) => s.saveCategory)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? '',
      color: category?.color ?? COLOR_PRESETS[0],
      icon: category?.icon ?? (type === 'receita' ? 'wallet' : 'receipt'),
      budget: fromBudget(category?.monthlyBudget ?? null),
    },
  })

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit((v) => {
        saveCategory({
          id: category?.id ?? createId(),
          name: v.name,
          type: category?.type ?? type,
          color: v.color.toLowerCase() as HexColor,
          icon: v.icon,
          monthlyBudget: type === 'despesa' ? toBudget(v.budget) : null,
        })
        onDone()
      })}
    >
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cat-name">Nome</Label>
          <Input id="cat-name" aria-invalid={!!errors.name} {...register('name')} />
          <FieldError message={errors.name?.message} />
        </div>

        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <div className="flex flex-col gap-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Cor ${c}`}
                    aria-pressed={field.value.toLowerCase() === c}
                    onClick={() => field.onChange(c)}
                    className={cn(
                      'size-9 rounded-full ring-offset-2 ring-offset-card transition',
                      field.value.toLowerCase() === c && 'ring-2 ring-foreground',
                    )}
                    style={{ background: c }}
                  />
                ))}
                <label
                  className="relative grid size-9 cursor-pointer place-items-center rounded-full border text-xs text-muted-foreground"
                  title="Outra cor"
                >
                  +
                  <input
                    type="color"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Escolher outra cor"
                  />
                </label>
              </div>
              <FieldError message={errors.color?.message} />
            </div>
          )}
        />

        <Controller
          control={control}
          name="icon"
          render={({ field }) => (
            <div className="flex flex-col gap-2">
              <Label>Ícone</Label>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                {CATEGORY_ICONS.map((name) => {
                  const Icon = categoryIconMap[name]
                  const active = field.value === name
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-label={name}
                      aria-pressed={active}
                      onClick={() => field.onChange(name)}
                      className={cn(
                        'grid aspect-square place-items-center rounded-xl border transition-colors',
                        active ? 'border-primary bg-info-soft text-info' : 'hover:bg-muted',
                      )}
                    >
                      <Icon className="size-5" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        />

        {type === 'despesa' && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-budget">Limite mensal (opcional)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
              <Input
                id="cat-budget"
                inputMode="decimal"
                placeholder="Sem limite"
                className="pl-10"
                aria-invalid={!!errors.budget}
                {...register('budget')}
              />
            </div>
            <FieldError message={errors.budget?.message} />
          </div>
        )}
      </div>
      <DialogActions submitLabel={category ? 'Salvar' : 'Criar categoria'} />
    </form>
  )
}

function SubcategoryForm({ category, subcategory, onDone }: { category: Category; subcategory?: Subcategory; onDone: () => void }) {
  const saveSubcategory = useFinanceStore((s) => s.saveSubcategory)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SubcategoryValues>({
    resolver: zodResolver(subcategorySchema),
    defaultValues: { name: subcategory?.name ?? '', budget: fromBudget(subcategory?.monthlyBudget ?? null) },
  })

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit((v) => {
        saveSubcategory({
          ...subcategory,
          id: subcategory?.id ?? createId(),
          categoryId: category.id,
          name: v.name,
          monthlyBudget: category.type === 'despesa' ? toBudget(v.budget) : null,
        })
        onDone()
      })}
    >
      <div className="flex flex-col gap-5 px-5 pb-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sub-name">Nome</Label>
          <Input id="sub-name" aria-invalid={!!errors.name} {...register('name')} />
          <FieldError message={errors.name?.message} />
        </div>
        {category.type === 'despesa' && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="sub-budget">Limite mensal (opcional)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
              <Input
                id="sub-budget"
                inputMode="decimal"
                placeholder="Sem limite"
                className="pl-10"
                aria-invalid={!!errors.budget}
                {...register('budget')}
              />
            </div>
            <FieldError message={errors.budget?.message} />
          </div>
        )}
      </div>
      <DialogActions submitLabel={subcategory ? 'Salvar' : 'Criar subcategoria'} />
    </form>
  )
}

function DialogActions({
  submitLabel,
  destructive,
  onConfirm,
  disabled,
}: {
  submitLabel: string
  destructive?: boolean
  onConfirm?: () => void
  disabled?: boolean
}) {
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
        {submitLabel}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exclusão
// ---------------------------------------------------------------------------

function DeleteCategory({ category, onDone }: { category: Category; onDone: () => void }) {
  const { categories, transactions, recurringCosts, installments, deleteCategory } = useFinanceStore(
    useShallow((s) => ({
      categories: s.categories,
      transactions: s.transactions,
      recurringCosts: s.recurringCosts,
      installments: s.installments,
      deleteCategory: s.deleteCategory,
    })),
  )
  const others = categories.filter((c) => c.type === category.type && c.id !== category.id)
  const usage =
    transactions.filter((t) => t.categoryId === category.id).length +
    recurringCosts.filter((r) => r.categoryId === category.id).length +
    installments.filter((i) => i.categoryId === category.id).length
  const [moveTo, setMoveTo] = useState<string>('')

  if (others.length === 0) {
    return (
      <div className="px-5 pb-5 text-sm text-muted-foreground">
        É a única categoria de {category.type === 'receita' ? 'receita' : 'despesa'}. Crie outra antes de excluir esta.
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3 px-5 pb-4 text-sm">
        {usage > 0 ? (
          <>
            <p>
              <strong>{usage}</strong> {usage === 1 ? 'registro usa' : 'registros usam'} esta categoria. Escolha para onde
              movê-los:
            </p>
            <Select value={moveTo || undefined} onValueChange={setMoveTo}>
              <SelectTrigger aria-label="Mover para">
                <SelectValue placeholder="Mover para…" />
              </SelectTrigger>
              <SelectContent>
                {others.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : (
          <p className="text-muted-foreground">Nenhum lançamento usa esta categoria.</p>
        )}
        <p className="text-muted-foreground">As subcategorias dela também serão excluídas.</p>
      </div>
      <DialogActions
        destructive
        submitLabel="Excluir"
        disabled={usage > 0 && !moveTo}
        onConfirm={() => {
          deleteCategory(category.id, usage > 0 ? moveTo : null)
          onDone()
        }}
      />
    </>
  )
}

function DeleteSubcategory({ subcategory, onDone }: { subcategory: Subcategory; onDone: () => void }) {
  const deleteSubcategory = useFinanceStore((s) => s.deleteSubcategory)
  const usage = useFinanceStore((s) => s.transactions.filter((t) => t.subcategoryId === subcategory.id).length)
  return (
    <>
      <p className="px-5 pb-4 text-sm text-muted-foreground">
        {usage > 0
          ? `${usage} ${usage === 1 ? 'lançamento continua' : 'lançamentos continuam'} na categoria, só sem subcategoria.`
          : 'Nenhum lançamento usa esta subcategoria.'}
      </p>
      <DialogActions
        destructive
        submitLabel="Excluir"
        onConfirm={() => {
          deleteSubcategory(subcategory.id)
          onDone()
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

export function CategoryManager() {
  const { categories, subcategories } = useFinanceStore(
    useShallow((s) => ({ categories: s.categories, subcategories: s.subcategories })),
  )
  const [tab, setTab] = useState<TransactionType>('despesa')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const close = () => setDialog(null)

  const list = useMemo(
    () => categories.filter((c) => c.type === tab).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [categories, tab],
  )
  const subsByCategory = useMemo(() => {
    const map = new Map<string, Subcategory[]>()
    for (const s of [...subcategories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))) {
      map.set(s.categoryId, [...(map.get(s.categoryId) ?? []), s])
    }
    return map
  }, [subcategories])

  const title =
    dialog?.kind === 'category'
      ? dialog.category
        ? 'Editar categoria'
        : `Nova categoria de ${dialog.type === 'receita' ? 'receita' : 'despesa'}`
      : dialog?.kind === 'subcategory'
        ? dialog.subcategory
          ? 'Editar subcategoria'
          : `Nova subcategoria em ${dialog.category.name}`
        : dialog?.kind === 'delete-category'
          ? `Excluir "${dialog.category.name}"?`
          : dialog?.kind === 'delete-subcategory'
            ? `Excluir "${dialog.subcategory.name}"?`
            : ''

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardDescription>Toque numa categoria para ver e editar as subcategorias.</CardDescription>
        <Button size="sm" onClick={() => setDialog({ kind: 'category', type: tab })}>
          <Plus /> Nova
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div role="tablist" aria-label="Tipo" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(
            [
              ['despesa', 'Despesas'],
              ['receita', 'Receitas'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                'h-9 rounded-lg text-sm font-medium transition-colors',
                tab === key ? 'bg-card shadow-sm' : 'text-muted-foreground',
              )}
            >
              {label} ({categories.filter((c) => c.type === key).length})
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <EmptyState icon={Tags} title="Nenhuma categoria" description="Crie a primeira no botão Nova." className="py-6" />
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {list.map((c) => {
              const Icon = categoryIconMap[c.icon]
              const subs = subsByCategory.get(c.id) ?? []
              const open = expanded === c.id
              return (
                <li key={c.id}>
                  <div className="flex items-center gap-2 p-2 pl-3">
                    <button
                      onClick={() => setExpanded(open ? null : c.id)}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: c.color }}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {subs.length} {subs.length === 1 ? 'subcategoria' : 'subcategorias'}
                          {c.monthlyBudget !== null && <> · limite {formatMoney(c.monthlyBudget)}</>}
                        </span>
                      </span>
                      <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
                    </button>
                    <Button variant="ghost" size="icon" aria-label={`Editar ${c.name}`} onClick={() => setDialog({ kind: 'category', type: c.type, category: c })}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir ${c.name}`}
                      className="text-muted-foreground hover:text-expense"
                      onClick={() => setDialog({ kind: 'delete-category', category: c })}
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  {open && (
                    <div className="border-t bg-muted/40 px-3 py-2">
                      {subs.length > 0 && (
                        <ul className="flex flex-col">
                          {subs.map((s) => (
                            <li key={s.id} className="flex items-center gap-2 pl-12">
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {s.name}
                                {s.monthlyBudget !== null && (
                                  <span className="text-xs text-muted-foreground"> · limite {formatMoney(s.monthlyBudget)}</span>
                                )}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Editar ${s.name}`}
                                onClick={() => setDialog({ kind: 'subcategory', category: c, subcategory: s })}
                              >
                                <Pencil />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Excluir ${s.name}`}
                                className="text-muted-foreground hover:text-expense"
                                onClick={() => setDialog({ kind: 'delete-subcategory', subcategory: s })}
                              >
                                <Trash2 />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-10 text-primary"
                        onClick={() => setDialog({ kind: 'subcategory', category: c })}
                      >
                        <Plus /> Adicionar subcategoria
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && close()}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {dialog?.kind === 'delete-category' && <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>}
          </DialogHeader>
          {dialog?.kind === 'category' && (
            <CategoryForm key={dialog.category?.id ?? 'new'} type={dialog.type} category={dialog.category} onDone={close} />
          )}
          {dialog?.kind === 'subcategory' && (
            <SubcategoryForm
              key={dialog.subcategory?.id ?? 'new'}
              category={dialog.category}
              subcategory={dialog.subcategory}
              onDone={close}
            />
          )}
          {dialog?.kind === 'delete-category' && <DeleteCategory category={dialog.category} onDone={close} />}
          {dialog?.kind === 'delete-subcategory' && <DeleteSubcategory subcategory={dialog.subcategory} onDone={close} />}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
