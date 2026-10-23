import { zodResolver } from '@hookform/resolvers/zod'
import { Affix } from '@/components/ui/form-kit'
import { ArrowDownRight, ArrowUpRight, Layers, Repeat } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm, useWatch, type DefaultValues } from 'react-hook-form'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Switch } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { addDaysISO, addMonthsISO, formatDateShort, formatMonthLabel, monthOf, todayISO } from '@/lib/dates'
import { categoryIconMap } from '@/lib/icons'
import { formatMoney, splitCents, toCents } from '@/lib/money'
import { MAX_INSTALLMENTS, parseMoneyInput, transactionFormSchema, type TransactionFormValues } from '@/lib/schemas'
import { cn, createId } from '@/lib/utils'
import { VEHICLE_CATEGORY_ID } from '@/lib/vehicle'
import { PayToField, type PayLink } from '@/components/shared/pay-to-field'
import { LinkFields } from '@/components/transactions/link-fields'
import { compactLink, defaultLink, linkPayload, type LinkTarget } from '@/lib/areas'
import { useAreaCategories } from '@/hooks/use-areas'
import type { CostKind } from '@/types/finance'
import {
  SHARED_FIXED_MONTHS,
  ShareFields,
  fixedShareNote,
  sendShareInvite,
  useShare,
  yearlyShareNote,
} from '@/components/shared/share-fields'
import { useFinanceStore } from '@/store/finance-store'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type ISODate,
  type RecurringCost,
  type Transaction,
  type TransactionType,
} from '@/types/finance'

/** `amount` fica de fora para o campo começar vazio (não "NaN"). */
function defaultValues(type: TransactionType): DefaultValues<TransactionFormValues> {
  return {
    type,
    description: '',
    categoryId: '',
    subcategoryId: null,
    dueDate: todayISO(),
    paymentMethod: type === 'receita' ? 'pix' : 'cartao_credito',
    paid: true,
    isInstallment: false,
    isRecurring: false,
    frequency: 'mensal',
    installmentMode: 'nova',
    currentInstallment: 1,
    installments: 2,
    accountName: '',
    notes: '',
    payTo: '',
  }
}

interface Props {
  initialType?: TransactionType
  onSuccess?: (message: string) => void
  onCancel?: () => void
}

export function TransactionForm({ initialType = 'despesa', onSuccess, onCancel }: Props) {
  const { categories, subcategories, transactions, vehicles, addTransaction, addInstallmentPurchase, addRecurringCost } = useFinanceStore(
    useShallow((s) => ({
      transactions: s.transactions,
      vehicles: s.vehicles,
      categories: s.categories,
      subcategories: s.subcategories,
      addTransaction: s.addTransaction,
      addInstallmentPurchase: s.addInstallmentPurchase,
      addRecurringCost: s.addRecurringCost,
    })),
  )

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: defaultValues(initialType),
    mode: 'onTouched',
  })

  const [type, categoryId, amount, isInstallment, installments, dueDate, installmentMode, currentInstallment, isRecurring, frequency] =
    useWatch({
    control,
    name: [
      'type',
      'categoryId',
      'amount',
      'isInstallment',
      'installments',
      'dueDate',
      'installmentMode',
      'currentInstallment',
      'isRecurring',
      'frequency',
    ],
  })
  // Vínculo com Casa/Veículo: sugerido pela categoria; trocar vale até mudar a categoria.
  const activeVehicles = vehicles.filter((v) => v.active)
  const { homeCats, vehicleCats } = useAreaCategories()
  const [pickedVehicle, setPickedVehicle] = useState<string | null | undefined>(undefined)
  const [linkPick, setLinkPick] = useState<{ categoryId: string; link: LinkTarget } | null>(null)
  const [kindPick, setKindPick] = useState<CostKind | null>(null)
  const linkTarget: LinkTarget =
    type !== 'despesa'
      ? 'nenhum'
      : linkPick?.categoryId === categoryId
        ? linkPick.link
        : defaultLink(categoryId, homeCats, vehicleCats, activeVehicles.length > 0)
  const vehicleId = linkTarget === 'veiculo' && activeVehicles.length ? (pickedVehicle ?? activeVehicles[0]!.id) : null
  const autoKind: CostKind = isRecurring || isInstallment ? 'fixo' : 'variavel'
  const costKind = kindPick ?? autoKind

  /** Parcelamento já em andamento (ex.: empréstimo na 11ª de 36) */
  const ongoing = isInstallment && installmentMode === 'andamento'
  const payToRaw = useWatch({ control, name: 'payTo' }) ?? ''
  const payTo = payToRaw.trim()
  // Usuário do app escolhido em "Enviar para" (ele vê o valor no Dashboard dele).
  const [payLink, setPayLink] = useState<PayLink | null>(null)

  /** Nomes já usados, para autocompletar. */
  const payeeSuggestions = useMemo(() => {
    const names = new Map<string, string>()
    for (const t of transactions) if (t.payTo?.trim()) names.set(t.payTo.trim().toLocaleLowerCase('pt-BR'), t.payTo.trim())
    return [...names.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [transactions])

  const recurringHint = useMemo(() => {
    if (!isRecurring || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null
    const date = dueDate as ISODate
    const when =
      frequency === 'mensal'
        ? `todo dia ${Number(date.slice(8, 10))}`
        : `todo ano em ${formatDateShort(date).replace(/ \d{4}$/, '')}`
    return `Lança ${when}, a partir de ${formatMonthLabel(monthOf(date))}. Para parar, use "Encerrar" no card de fixos em Lançamentos.`
  }, [isRecurring, frequency, dueDate])

  const typeCategories = useMemo(() => categories.filter((c) => c.type === type), [categories, type])
  const categorySubs = useMemo(() => subcategories.filter((s) => s.categoryId === categoryId), [subcategories, categoryId])

  // Trocar o tipo invalida categoria e parcelamento.
  useEffect(() => {
    setValue('categoryId', '')
    setValue('subcategoryId', null)
    if (type === 'receita') setValue('isInstallment', false)
  }, [type, setValue])

  const installmentPreview = useMemo(() => {
    if (!isInstallment || !(amount > 0) || !(installments >= 2)) return null
    const total = Math.min(installments, MAX_INSTALLMENTS)
    const startAt = ongoing ? Math.min(Math.max(currentInstallment || 1, 1), total) : 1
    // Em andamento o valor digitado é o da parcela; na compra nova, o total.
    const parts = ongoing ? Array.from({ length: total }, () => toCents(amount)) : splitCents(toCents(amount), total)
    const remaining = parts.slice(startAt - 1)
    const last = addMonthsISO(dueDate as ISODate, remaining.length - 1)
    return {
      startAt,
      total,
      count: remaining.length,
      first: remaining[0] ?? 0,
      last: remaining[remaining.length - 1] ?? 0,
      outstanding: remaining.reduce((a, b) => a + b, 0),
      lastMonth: formatMonthLabel(monthOf(last)),
    }
  }, [isInstallment, ongoing, amount, installments, currentInstallment, dueDate])

  // Dividir esta conta com outro usuário (pelo @). Só com login.
  const { share, setShare, available: shareAvailable, reset: resetShare } = useShare()
  const canShare = shareAvailable && type === 'despesa'
  const sharing = canShare && share.on
  // Gasto do veículo sempre com tipo (seguro, manutenção...), para cair na caixa certa.
  const [subMissing, setSubMissing] = useState(false)

  const submitShared = async (v: TransactionFormValues) => {
    const value = toCents(v.amount)
    // Fixo mensal vira 12 meses; em andamento, só as parcelas que faltam.
    const count = v.isRecurring
      ? v.frequency === 'mensal'
        ? SHARED_FIXED_MONTHS
        : 1
      : v.isInstallment
        ? v.installmentMode === 'andamento'
          ? v.installments - v.currentInstallment + 1
          : v.installments
        : 1
    const perInstallment = v.isRecurring || (v.isInstallment && v.installmentMode === 'andamento')
    const result = await sendShareInvite(share, {
      title: v.description,
      totalAmount: perInstallment ? value * count : value,
      installments: count,
      recurring: v.isRecurring && v.frequency === 'mensal',
      ...(v.isInstallment && !v.isRecurring && v.installmentMode === 'andamento'
        ? { installmentOffset: v.currentInstallment - 1, installmentTotal: v.installments }
        : {}),
      firstDueDate: v.dueDate as ISODate,
      categoryId: v.categoryId,
      subcategoryId: v.subcategoryId,
      vehicleId,
    })
    if ('error' in result) return setShare({ ...share, error: result.error })
    onSuccess?.(
      result.auto
        ? `Conta dividida com @${result.handle}: aceita automaticamente, já está nos lançamentos dos dois.`
        : `Convite enviado para @${result.handle}. As parcelas entram quando a pessoa aceitar.`,
    )
    reset(defaultValues(v.type))
    resetShare()
  }

  const onSubmit = async (v: TransactionFormValues) => {
    if (vehicleId && v.categoryId === VEHICLE_CATEGORY_ID && !v.subcategoryId) {
      setSubMissing(true)
      return
    }
    setSubMissing(false)
    if (sharing) return submitShared(v)
    const due = v.dueDate as ISODate
    const totalCents = toCents(v.amount)
    const payTo = v.type === 'despesa' && v.payTo ? v.payTo : null
    const link = payTo ? payLink : null
    const payTarget = { payToUid: link?.uid ?? null, payToHandle: link?.handle ?? null }
    const linked = compactLink(linkPayload(v.categoryId, linkTarget, vehicleId, costKind, autoKind, homeCats))

    if (v.isRecurring) {
      const base = {
        id: createId(),
        description: v.description,
        amount: totalCents,
        type: v.type,
        categoryId: v.categoryId,
        subcategoryId: v.subcategoryId,
        paymentMethod: v.type === 'receita' ? null : v.paymentMethod,
        dueDay: Number(due.slice(8, 10)),
        autoRenew: true,
        isSubscription: v.categoryId === 'cat-assinaturas',
        active: true,
        startDate: due,
        endDate: null,
        lastGeneratedMonth: null,
        payTo,
        ...payTarget,
        ...linked,
        createdAt: new Date().toISOString(),
      }
      const rc: RecurringCost =
        v.frequency === 'mensal'
          ? { ...base, frequency: 'mensal' }
          : { ...base, frequency: 'anual', dueMonth: Number(due.slice(5, 7)) }
      addRecurringCost(rc, v.paid)
      onSuccess?.(`${v.type === 'receita' ? 'Receita fixa' : 'Gasto fixo'} "${v.description}" cadastrado`)
    } else if (v.isInstallment) {
      const isOngoing = v.installmentMode === 'andamento'
      const startAt = isOngoing ? v.currentInstallment : 1
      addInstallmentPurchase({
        description: v.description,
        // Em andamento o valor digitado é o da parcela.
        totalAmount: isOngoing ? totalCents * v.installments : totalCents,
        totalInstallments: v.installments,
        startAt,
        firstDueDate: due,
        categoryId: v.categoryId,
        subcategoryId: v.subcategoryId,
        paymentMethod: v.paymentMethod,
        accountName: v.accountName || PAYMENT_METHOD_LABELS[v.paymentMethod],
        firstPaid: v.paid,
        payTo,
        ...payTarget,
        ...linked,
        notes: v.notes || undefined,
      })
      onSuccess?.(`${v.installments - startAt + 1} parcelas de "${v.description}" lançadas`)
    } else {
      const t: Transaction = {
        id: createId(),
        description: v.description,
        amount: totalCents,
        type: v.type,
        categoryId: v.categoryId,
        subcategoryId: v.subcategoryId,
        dueDate: due,
        paymentDate: v.paid ? due : null,
        status: v.paid ? 'pago' : 'pendente',
        paymentMethod: v.type === 'receita' ? null : v.paymentMethod,
        installment: null,
        recurringCostId: null,
        payTo,
        ...payTarget,
        ...linked,
        notes: v.notes || undefined,
        createdAt: new Date().toISOString(),
      }
      addTransaction(t)
      onSuccess?.(`${v.type === 'receita' ? 'Receita' : 'Despesa'} "${v.description}" lançada`)
    }
    reset(defaultValues(v.type))
    setPickedVehicle(undefined)
    setLinkPick(null)
    setKindPick(null)
    setPayLink(null)
  }

  const today = todayISO()
  const quickDates = [
    { label: 'Hoje', value: today },
    { label: 'Ontem', value: addDaysISO(today, -1) },
  ]

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-4">
        {/* Tipo */}
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <div role="radiogroup" aria-label="Tipo de lançamento" className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
              {(['despesa', 'receita'] as const).map((t) => {
                const Icon = t === 'despesa' ? ArrowDownRight : ArrowUpRight
                const active = field.value === t
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => field.onChange(t)}
                    className={cn(
                      'flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors',
                      active ? 'bg-card shadow-sm' : 'text-muted-foreground',
                      active && (t === 'despesa' ? 'text-expense' : 'text-income'),
                    )}
                  >
                    <Icon className="size-4" />
                    {t === 'despesa' ? 'Despesa' : 'Receita'}
                  </button>
                )
              })}
            </div>
          )}
        />

        {/* Valor */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="amount">{ongoing ? 'Valor da parcela' : isInstallment ? 'Valor total da compra' : 'Valor'}</Label>
          <Affix before="R$">
            <Input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              className="h-14 pl-10 text-2xl font-semibold sm:text-2xl"
              aria-invalid={!!errors.amount}
              {...register('amount', { setValueAs: parseMoneyInput })}
            />
          </Affix>
          <FieldError message={errors.amount?.message} />
        </div>

        {/* Descrição */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Descrição</Label>
          <Input
            id="description"
            placeholder={type === 'despesa' ? 'Ex.: Mercado, Uber, Conta de luz' : 'Ex.: Salário, Freela'}
            aria-invalid={!!errors.description}
            {...register('description')}
          />
          <FieldError message={errors.description?.message} />
        </div>

        {/* Categoria: atalhos + select */}
        <div className="flex flex-col gap-2">
          <Label>Categoria</Label>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <>
                <div className="flex flex-wrap gap-2">
                  {typeCategories.slice(0, 6).map((c) => {
                    const Icon = categoryIconMap[c.icon]
                    const active = field.value === c.id
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          field.onChange(c.id)
                          setValue('subcategoryId', null)
                        }}
                        className={cn(
                          'flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                          active ? 'border-transparent text-white' : 'hover:bg-muted',
                        )}
                        style={active ? { background: c.color } : undefined}
                      >
                        <Icon className="size-3.5" style={active ? undefined : { color: c.color }} />
                        {c.name}
                      </button>
                    )
                  })}
                </div>
                {typeCategories.length > 6 && (
                  <Select
                    value={field.value || undefined}
                    onValueChange={(v) => {
                      field.onChange(v)
                      setValue('subcategoryId', null)
                    }}
                  >
                    <SelectTrigger aria-invalid={!!errors.categoryId} aria-label="Todas as categorias">
                      <SelectValue placeholder="Outras categorias" />
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
              </>
            )}
          />
          <FieldError message={errors.categoryId?.message} />
        </div>

        {categorySubs.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label>Subcategoria (opcional)</Label>
            <Controller
              control={control}
              name="subcategoryId"
              render={({ field }) => (
                <Select value={field.value ?? 'none'} onValueChange={(v) => field.onChange(v === 'none' ? null : v)}>
                  <SelectTrigger aria-label="Subcategoria">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {categorySubs.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        )}

        {subMissing && categoryId === VEHICLE_CATEGORY_ID && (
          <p role="alert" className="-mt-3 text-sm text-expense">
            Escolha o tipo do gasto do veículo (seguro, manutenção, combustível...).
          </p>
        )}

        {type === 'despesa' && (
          <LinkFields
            link={linkTarget}
            onLink={(l) => setLinkPick({ categoryId, link: l })}
            vehicles={activeVehicles}
            vehicleId={vehicleId}
            onVehicle={setPickedVehicle}
            kind={costKind}
            onKind={setKindPick}
            autoKind={autoKind}
          />
        )}

        {/* Data + forma de pagamento (só despesa) */}
        <div className={cn('grid gap-5', type === 'despesa' && 'sm:grid-cols-2')}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dueDate">
              {ongoing
                ? `Vencimento da parcela ${installmentPreview?.startAt ?? currentInstallment}`
                : isInstallment
                  ? '1ª parcela vence em'
                  : isRecurring
                    ? type === 'receita'
                      ? '1º recebimento'
                      : '1º vencimento'
                    : type === 'receita'
                    ? 'Data de recebimento'
                    : 'Data de vencimento'}
            </Label>
            <Input id="dueDate" type="date" aria-invalid={!!errors.dueDate} {...register('dueDate')} />
            <div className="flex gap-2">
              {quickDates.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => setValue('dueDate', d.value, { shouldValidate: true })}
                  className={cn(
                    'h-9 rounded-full border px-4 text-sm',
                    dueDate === d.value ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted',
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <FieldError message={errors.dueDate?.message} />
          </div>

          {type === 'despesa' && (
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

        {/* Para quem enviar (só despesa) */}
        {type === 'despesa' && (
          <PayToField
            id="payTo"
            value={payToRaw}
            onChange={(name) => setValue('payTo', name, { shouldValidate: !!errors.payTo })}
            link={payLink}
            onLinkChange={setPayLink}
            suggestions={payeeSuggestions}
            error={errors.payTo?.message}
          />
        )}

        {/* Status */}
        <Controller
          control={control}
          name="paid"
          render={({ field }) => (
            <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
              <div>
                <Label htmlFor="paid">
                  {ongoing
                    ? `Parcela ${installmentPreview?.startAt ?? currentInstallment} já paga`
                    : isInstallment
                      ? '1ª parcela já paga'
                      : isRecurring
                        ? type === 'receita'
                          ? '1º já recebido'
                          : '1º já pago'
                      : type === 'receita'
                        ? 'Já recebido'
                        : payTo
                          ? `Já enviado para ${payTo}`
                          : 'Já pago'}
                </Label>
                <p className="text-xs text-muted-foreground">Desligue para lançar como pendente.</p>
              </div>
              <Switch id="paid" checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )}
        />

        {/* Fixo (recorrente) */}
        <div className="flex flex-col gap-4 rounded-xl border p-3">
          <Controller
            control={control}
            name="isRecurring"
            render={({ field }) => (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Repeat className="size-4 text-muted-foreground" />
                  <div>
                    <Label htmlFor="isRecurring">{type === 'receita' ? 'Receita fixa' : 'Gasto fixo'}</Label>
                    <p className="text-xs text-muted-foreground">Repete automaticamente, ex.: aluguel, internet, salário.</p>
                  </div>
                </div>
                <Switch
                  id="isRecurring"
                  checked={field.value}
                  onCheckedChange={(on) => {
                    field.onChange(on)
                    if (on) setValue('isInstallment', false)
                  }}
                />
              </div>
            )}
          />
          <FieldError message={errors.isRecurring?.message} />
          {isRecurring && (
            <>
              <Controller
                control={control}
                name="frequency"
                render={({ field }) => (
                  <div role="radiogroup" aria-label="Frequência" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                    {(
                      [
                        ['mensal', 'Todo mês'],
                        ['anual', 'Todo ano'],
                      ] as const
                    ).map(([freq, label]) => (
                      <button
                        key={freq}
                        type="button"
                        role="radio"
                        aria-checked={field.value === freq}
                        onClick={() => field.onChange(freq)}
                        className={cn(
                          'h-9 rounded-lg text-sm font-medium transition-colors',
                          field.value === freq ? 'bg-card shadow-sm' : 'text-muted-foreground',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              />
              {recurringHint && <p className="rounded-xl bg-info-soft px-3 py-2 text-sm text-info">{recurringHint}</p>}
            </>
          )}
        </div>

        {/* Parcelamento */}
        {type === 'despesa' && (
          <div className="flex flex-col gap-4 rounded-xl border p-3">
            <Controller
              control={control}
              name="isInstallment"
              render={({ field }) => (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-muted-foreground" />
                    <Label htmlFor="isInstallment">Parcelado ou empréstimo</Label>
                  </div>
                  <Switch
                    id="isInstallment"
                    checked={field.value}
                    onCheckedChange={(on) => {
                      field.onChange(on)
                      if (on) setValue('isRecurring', false)
                    }}
                  />
                </div>
              )}
            />
            <FieldError message={errors.isInstallment?.message} />

            {isInstallment && (
              <>
                <Controller
                  control={control}
                  name="installmentMode"
                  render={({ field }) => (
                    <div role="radiogroup" aria-label="Tipo de parcelamento" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                      {(
                        [
                          ['nova', 'Compra nova'],
                          ['andamento', 'Já em andamento'],
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          role="radio"
                          aria-checked={field.value === mode}
                          onClick={() => {
                            field.onChange(mode)
                            // Em andamento, a parcela do mês normalmente ainda não foi paga.
                            setValue('paid', mode === 'nova')
                            // Empréstimo costuma ser boleto/débito; compra parcelada, cartão.
                            setValue('paymentMethod', mode === 'andamento' ? 'boleto' : 'cartao_credito')
                          }}
                          className={cn(
                            'h-9 rounded-lg text-sm font-medium transition-colors',
                            field.value === mode ? 'bg-card shadow-sm' : 'text-muted-foreground',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  {ongoing && (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="currentInstallment">Parcela atual</Label>
                      <Input
                        id="currentInstallment"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={installments || MAX_INSTALLMENTS}
                        aria-invalid={!!errors.currentInstallment}
                        {...register('currentInstallment', { valueAsNumber: true })}
                      />
                      <FieldError message={errors.currentInstallment?.message} />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="installments">{ongoing ? 'Total de parcelas' : 'Parcelas'}</Label>
                    <Input
                      id="installments"
                      type="number"
                      inputMode="numeric"
                      min={2}
                      max={MAX_INSTALLMENTS}
                      aria-invalid={!!errors.installments}
                      {...register('installments', { valueAsNumber: true, deps: ['currentInstallment'] })}
                    />
                    <FieldError message={errors.installments?.message} />
                  </div>
                  <div className={cn('flex flex-col gap-2', ongoing && 'col-span-2')}>
                    <Label htmlFor="accountName">{ongoing ? 'Banco / credor' : 'Cartão / conta'}</Label>
                    <Input
                      id="accountName"
                      placeholder={ongoing ? 'Ex.: Caixa, Banco do Brasil' : 'Ex.: Nubank'}
                      aria-invalid={!!errors.accountName}
                      {...register('accountName')}
                    />
                    <FieldError message={errors.accountName?.message} />
                  </div>
                </div>

                {installmentPreview && (
                  <div className="rounded-xl bg-info-soft px-3 py-2 text-sm text-info">
                    {ongoing ? (
                      <>
                        <p>
                          Parcelas {installmentPreview.startAt} a {installmentPreview.total} ({installmentPreview.count}{' '}
                          {installmentPreview.count === 1 ? 'restante' : 'restantes'}) de{' '}
                          <strong>{formatMoney(installmentPreview.first)}</strong> · até {installmentPreview.lastMonth}
                        </p>
                        <p>
                          Falta pagar <strong>{formatMoney(installmentPreview.outstanding)}</strong>
                        </p>
                      </>
                    ) : (
                      <p>
                        {installmentPreview.total}x de <strong>{formatMoney(installmentPreview.first)}</strong>
                        {installmentPreview.last !== installmentPreview.first && (
                          <> (última {formatMoney(installmentPreview.last)})</>
                        )}{' '}
                        · até {installmentPreview.lastMonth}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {canShare && (
          <ShareFields
            share={share}
            onChange={setShare}
            note={isRecurring ? (frequency === 'mensal' ? fixedShareNote : yearlyShareNote) : ongoing ? 'O convite cobre só as parcelas que faltam.' : undefined}
          />
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">Observações (opcional)</Label>
          <Input id="notes" aria-invalid={!!errors.notes} {...register('notes')} />
          <FieldError message={errors.notes?.message} />
        </div>
      </div>

      <div className="flex gap-2 border-t bg-card px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" variant={type === 'receita' ? 'income' : 'default'} className="flex-[2]" disabled={isSubmitting}>
          {sharing ? (isSubmitting ? 'Enviando…' : 'Enviar convite') : isInstallment ? 'Gerar parcelas' : 'Salvar lançamento'}
        </Button>
      </div>
    </form>
  )
}
