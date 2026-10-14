import { zodResolver } from '@hookform/resolvers/zod'
import { Layers, Repeat, Send, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Switch } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fromCents, toCents } from '@/lib/money'
import { parseMoneyInput } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { baseDescription, useFinanceStore, type EditScope } from '@/store/finance-store'
import { useUIStore } from '@/store/ui-store'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type ISODate, type Transaction } from '@/types/finance'

const schema = z.object({
  description: z.string().trim().min(2, 'Descreva o lançamento').max(80, 'Máximo de 80 caracteres'),
  amount: z
    .number({ error: 'Informe um valor válido' })
    .refine((v) => !Number.isNaN(v), 'Informe um valor válido')
    .positive('O valor deve ser maior que zero')
    .max(10_000_000, 'Valor muito alto'),
  categoryId: z.string().min(1, 'Escolha uma categoria'),
  subcategoryId: z.string().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paid: z.boolean(),
  payTo: z.string().trim().max(40, 'Máximo de 40 caracteres'),
  notes: z.string().trim().max(200, 'Máximo de 200 caracteres'),
})
type Values = z.infer<typeof schema>

function EditForm({ transaction: t, onDone }: { transaction: Transaction; onDone: () => void }) {
  const { categories, subcategories, updateTransaction, deleteTransactionScoped } = useFinanceStore(
    useShallow((s) => ({
      categories: s.categories,
      subcategories: s.subcategories,
      updateTransaction: s.updateTransaction,
      deleteTransactionScoped: s.deleteTransactionScoped,
    })),
  )
  const inSeries = !!(t.installment || t.recurringCostId)
  const [scope, setScope] = useState<EditScope>('one')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isIncome = t.type === 'receita'

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: baseDescription(t),
      amount: fromCents(t.amount),
      categoryId: t.categoryId,
      subcategoryId: t.subcategoryId,
      dueDate: t.dueDate,
      paymentMethod: t.paymentMethod ?? 'pix',
      paid: t.status === 'pago',
      payTo: t.payTo ?? '',
      notes: t.notes ?? '',
    },
  })

  const categoryId = useWatch({ control, name: 'categoryId' })
  const payTo = useWatch({ control, name: 'payTo' })?.trim()
  const typeCategories = useMemo(() => categories.filter((c) => c.type === t.type), [categories, t.type])
  const subs = useMemo(() => subcategories.filter((s) => s.categoryId === categoryId), [subcategories, categoryId])

  const onSubmit = (v: Values) => {
    const dueDate = v.dueDate as ISODate
    updateTransaction(
      t.id,
      {
        description: v.description,
        amount: toCents(v.amount),
        categoryId: v.categoryId,
        subcategoryId: v.subcategoryId,
        dueDate,
        paymentMethod: isIncome ? null : v.paymentMethod,
        status: v.paid ? 'pago' : 'pendente',
        paymentDate: v.paid ? (t.paymentDate ?? dueDate) : null,
        payTo: !isIncome && v.payTo ? v.payTo : null,
        notes: v.notes || undefined,
      },
      scope,
    )
    onDone()
  }

  const seriesLabel = t.installment ? 'Esta e próximas parcelas' : 'Este e próximos meses'

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-4">
        {inSeries && (
          <div className="flex flex-col gap-2 rounded-xl border p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              {t.installment ? (
                <Layers className="size-4 text-muted-foreground" />
              ) : (
                <Repeat className="size-4 text-muted-foreground" />
              )}
              {t.installment ? `Parcela ${t.installment.number} de ${t.installment.total}` : 'Lançamento fixo'}
            </p>
            <div role="radiogroup" aria-label="Aplicar alterações em" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {(
                [
                  ['one', 'Só este'],
                  ['future', seriesLabel],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={scope === key}
                  onClick={() => setScope(key)}
                  className={cn(
                    'min-h-9 rounded-lg px-2 text-sm font-medium transition-colors',
                    scope === key ? 'bg-card shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {scope === 'future' && (
              <p className="text-xs text-muted-foreground">
                Descrição, valor, categoria, pagamento e pessoa valem para os próximos ainda pendentes. Data e status mudam só
                neste.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-amount">Valor</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
            <Input
              id="edit-amount"
              inputMode="decimal"
              autoComplete="off"
              className="h-14 pl-10 text-2xl font-semibold sm:text-2xl"
              aria-invalid={!!errors.amount}
              {...register('amount', { setValueAs: parseMoneyInput })}
            />
          </div>
          <FieldError message={errors.amount?.message} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-description">Descrição</Label>
          <Input id="edit-description" aria-invalid={!!errors.description} {...register('description')} />
          {t.installment && <p className="text-xs text-muted-foreground">O número da parcela é mantido automaticamente.</p>}
          <FieldError message={errors.description?.message} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Categoria</Label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v)
                    setValue('subcategoryId', null)
                  }}
                >
                  <SelectTrigger aria-label="Categoria" aria-invalid={!!errors.categoryId}>
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.categoryId?.message} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Subcategoria</Label>
            <Controller
              control={control}
              name="subcategoryId"
              render={({ field }) => (
                <Select
                  value={field.value ?? 'none'}
                  onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                  disabled={subs.length === 0}
                >
                  <SelectTrigger aria-label="Subcategoria">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {subs.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className={cn('grid gap-5', !isIncome && 'sm:grid-cols-2')}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-date">{isIncome ? 'Data de recebimento' : 'Data de vencimento'}</Label>
            <Input id="edit-date" type="date" aria-invalid={!!errors.dueDate} {...register('dueDate')} />
            <FieldError message={errors.dueDate?.message} />
          </div>
          {!isIncome && (
            <div className="flex flex-col gap-2">
              <Label>Forma de pagamento</Label>
              <Controller
                control={control}
                name="paymentMethod"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Forma de pagamento">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}
        </div>

        {!isIncome && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-payTo" className="flex items-center gap-1.5">
              <Send className="size-3.5 text-muted-foreground" /> Enviar para (opcional)
            </Label>
            <Input id="edit-payTo" placeholder="Ex.: Isadora" aria-invalid={!!errors.payTo} {...register('payTo')} />
            <FieldError message={errors.payTo?.message} />
          </div>
        )}

        <Controller
          control={control}
          name="paid"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
              <Label htmlFor="edit-paid">{isIncome ? 'Recebido' : payTo ? `Enviado para ${payTo}` : 'Pago'}</Label>
              <Switch id="edit-paid" checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="edit-notes">Observações (opcional)</Label>
          <Input id="edit-notes" aria-invalid={!!errors.notes} {...register('notes')} />
          <FieldError message={errors.notes?.message} />
        </div>
      </div>

      <div className="flex gap-2 border-t bg-card px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {confirmDelete ? (
          <>
            <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="expense"
              className="flex-[2]"
              onClick={() => {
                deleteTransactionScoped(t.id, scope)
                onDone()
              }}
            >
              {scope === 'future' ? `Excluir: ${seriesLabel.toLowerCase()}` : 'Confirmar exclusão'}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="text-expense"
              aria-label="Excluir"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
            </Button>
            <Button type="submit" className="flex-1">
              Salvar alterações
            </Button>
          </>
        )}
      </div>
    </form>
  )
}

/** Diálogo global de edição; abre via `useUIStore().setEditingTransaction(id)`. */
export function EditTransactionDialog() {
  const id = useUIStore((s) => s.editingTransactionId)
  const close = useUIStore((s) => s.setEditingTransaction)
  const transaction = useFinanceStore((s) => (id ? s.transactions.find((t) => t.id === id) : undefined))

  return (
    <Dialog open={!!transaction} onOpenChange={(o) => !o && close(null)}>
      <DialogContent aria-describedby="edit-tx-desc">
        <DialogHeader>
          <DialogTitle>Editar {transaction?.type === 'receita' ? 'receita' : 'despesa'}</DialogTitle>
          <DialogDescription id="edit-tx-desc">Altere os dados e salve.</DialogDescription>
        </DialogHeader>
        {transaction && <EditForm key={transaction.id} transaction={transaction} onDone={() => close(null)} />}
      </DialogContent>
    </Dialog>
  )
}
