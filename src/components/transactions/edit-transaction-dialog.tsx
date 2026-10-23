import { zodResolver } from '@hookform/resolvers/zod'
import { Layers, Repeat, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useShallow } from 'zustand/react/shallow'
import { ShareExisting, canShareExisting } from '@/components/shared/share-existing'
import { useSharedRole } from '@/components/shared/share-fields'
import { PayToField, payLinkOf, type PayLink } from '@/components/shared/pay-to-field'
import { SharedBillDialog } from '@/components/shared/shared-ui'
import { InstallmentProgressEditor } from '@/components/transactions/adjust-installments'
import { LinkFields } from '@/components/transactions/link-fields'
import { CardSelect } from '@/components/cards/card-select'
import { useAreaCategories } from '@/hooks/use-areas'
import { costKindOf, currentLink, linkPayload, type LinkTarget } from '@/lib/areas'
import { Button } from '@/components/ui/button'
import { Affix } from '@/components/ui/form-kit'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Switch } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fromCents, toCents } from '@/lib/money'
import { parseMoneyInput } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { cancelSharedBill } from '@/lib/shared-cloud'
import { baseDescription, useFinanceStore, type EditScope } from '@/store/finance-store'
import { reportSyncError, useAuthStore } from '@/store/auth-store'
import { useSettingsStore } from '@/store/settings-store'
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
  const { categories, subcategories, vehicles, cards, updateTransaction, deleteTransactionScoped } = useFinanceStore(
    useShallow((s) => ({
      categories: s.categories,
      subcategories: s.subcategories,
      vehicles: s.vehicles,
      cards: s.cards,
      updateTransaction: s.updateTransaction,
      deleteTransactionScoped: s.deleteTransactionScoped,
    })),
  )
  // Vínculo com Casa/Veículo e fixo/variável (abastecimento fica sempre no veículo).
  const { homeCats } = useAreaCategories()
  const activeVehicles = vehicles.filter((v) => v.active || v.id === t.vehicleId)
  const [link, setLink] = useState<LinkTarget>(() => currentLink(t, homeCats))
  const [linkVehicle, setLinkVehicle] = useState<string | null>(t.vehicleId ?? null)
  const autoKind = t.recurringCostId || t.installment ? 'fixo' : 'variavel'
  const [kind, setKind] = useState(() => costKindOf(t))
  const cardList = cards.filter((c) => c.active || c.id === t.cardId)
  const [cardSel, setCardSel] = useState<string | null>(() => t.cardId ?? null)
  const inSeries = !!(t.installment || t.recurringCostId)
  // Parcelamento que na verdade é conta fixa (ex.: aluguel dividido em 12x).
  const seriesId = t.installment?.installmentId
  const isFixed = useSettingsStore((s) => !!seriesId && (s.settings.fixedSeries ?? []).includes(seriesId))
  const toggleFixedSeries = useFinanceStore((s) => s.toggleFixedSeries)
  const [scope, setScope] = useState<EditScope>('one')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isIncome = t.type === 'receita'
  const signedIn = useAuthStore((s) => s.status === 'signed_in')
  const canShare = canShareExisting(t, signedIn)
  const shared = useSharedRole(t)
  const [editingBill, setEditingBill] = useState(false)

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
  const paymentMethodValue = useWatch({ control, name: 'paymentMethod' })
  const payToRaw = useWatch({ control, name: 'payTo' }) ?? ''
  const payTo = payToRaw.trim()
  const [payLink, setPayLink] = useState<PayLink | null>(() => payLinkOf(t))
  const payeeSuggestions = useFinanceStore(
    useShallow((s) => [...new Set(s.transactions.filter((x) => x.payTo?.trim() && !x.payToUid).map((x) => x.payTo!.trim()))].sort()),
  )
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
        payToUid: !isIncome && v.payTo && payLink ? payLink.uid : null,
        payToHandle: !isIncome && v.payTo && payLink ? payLink.handle : null,
        notes: v.notes || undefined,
        cardId: !isIncome && v.paymentMethod === 'cartao_credito' ? cardSel : null,
        ...(t.fuel || isIncome ? {} : linkPayload(v.categoryId, link, linkVehicle ?? activeVehicles[0]?.id ?? null, kind, autoKind, homeCats)),
      },
      scope,
    )
    onDone()
  }

  const seriesLabel = t.installment ? 'Esta e próximas parcelas' : 'Este e próximos meses'

  return (
    <>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-4">
          {inSeries && (
            <div className="flex flex-col gap-2 rounded-xl border p-3">
              <div className="flex items-start gap-2 text-sm font-medium">
                {t.installment && !isFixed ? (
                  <Layers className="mt-2.5 size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Repeat className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                {t.installment && !t.sharedBillId ? (
                  // Andamento editável: "Parcela [5] de [10]".
                  <div className="min-w-0 flex-1">
                    <InstallmentProgressEditor transaction={t} onDone={onDone} />
                  </div>
                ) : t.installment ? (
                  <span className="flex flex-col gap-0.5">
                    {`Parcela ${t.installment.number} de ${t.installment.total}`}
                    <span className="text-xs font-normal text-muted-foreground">Conta dividida: ajuste em "Editar conta dividida".</span>
                  </span>
                ) : (
                  'Lançamento fixo'
                )}
              </div>
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
              {seriesId && (
                <label className="mt-1 flex items-center justify-between gap-3 border-t pt-3">
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">Conta fixa (não é dívida)</span>
                    <span className="text-xs text-muted-foreground">
                      Para aluguel, condomínio e contas que se repetem. Não entra no saldo devedor. Vale para todas as parcelas.
                    </span>
                  </span>
                  <Switch checked={isFixed} onCheckedChange={() => toggleFixedSeries(seriesId)} aria-label="Conta fixa (não é dívida)" />
                </label>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-amount">Valor</Label>
            <Affix before="R$">
              <Input
                id="edit-amount"
                inputMode="decimal"
                autoComplete="off"
                className="h-14 pl-10 text-2xl font-semibold sm:text-2xl"
                aria-invalid={!!errors.amount}
                {...register('amount', { setValueAs: parseMoneyInput })}
              />
            </Affix>
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

          {!isIncome && paymentMethodValue === 'cartao_credito' && cardList.length > 0 && (
            <CardSelect cards={cardList} value={cardSel} onChange={setCardSel} />
          )}

          {!isIncome && !t.fuel && (
            <LinkFields
              link={link}
              onLink={setLink}
              vehicles={activeVehicles}
              vehicleId={linkVehicle}
              onVehicle={setLinkVehicle}
              kind={kind}
              onKind={setKind}
              autoKind={autoKind}
            />
          )}

          {!isIncome && (
            <PayToField
              id="edit-payTo"
              value={payToRaw}
              onChange={(name) => setValue('payTo', name, { shouldValidate: !!errors.payTo })}
              link={payLink}
              onLinkChange={setPayLink}
              suggestions={payeeSuggestions}
              error={errors.payTo?.message}
            />
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

          {canShare && <ShareExisting transaction={t} />}
          {shared && (
            <div className="flex flex-col gap-2 rounded-xl border p-3 text-sm text-muted-foreground">
              <p>
                {shared.role === 'creator'
                  ? `Conta dividida com @${shared.partner}. Excluir cancela a conta: as parcelas não pagas somem para os dois.`
                  : `Conta de @${shared.partner}. Só quem criou pode cancelar; se cancelar, some daqui também.`}
              </p>
              {shared.role === 'creator' && (
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setEditingBill(true)}>
                  {shared.bill.recurring ? 'Editar conta dividida' : 'Editar conta dividida (valor, parcelas ou fixa)'}
                </Button>
              )}
            </div>
          )}

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
                  // Conta dividida: cancela a conta (parcelas não pagas somem para os dois).
                  if (shared?.role === 'creator') cancelSharedBill(shared.bill).catch(reportSyncError)
                  else deleteTransactionScoped(t.id, scope)
                  onDone()
                }}
              >
                {shared?.role === 'creator'
                  ? 'Cancelar para os dois'
                  : scope === 'future'
                    ? `Excluir: ${seriesLabel.toLowerCase()}`
                    : 'Confirmar exclusão'}
              </Button>
            </>
          ) : (
            <>
              {shared?.role !== 'invitee' && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="text-expense"
                  aria-label={shared ? 'Cancelar conta dividida' : 'Excluir'}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 />
                </Button>
              )}
              <Button type="submit" className="flex-1">
                Salvar alterações
              </Button>
            </>
          )}
        </div>
      </form>
      {/* Fora do <form>: o submit do diálogo da conta não pode subir para este formulário. */}
      <SharedBillDialog bill={editingBill && shared ? shared.bill : null} onClose={() => setEditingBill(false)} />
    </>
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
