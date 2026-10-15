import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Affix, bodyClass, Choices, Field, FormActions, formClass, PaymentSelect } from '@/components/ui/form-kit'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Switch } from '@/components/ui/misc'
import { todayISO } from '@/lib/dates'
import { formatMoney, fromCents, toCents } from '@/lib/money'
import { cents, date, km, nowISO, optionalMoney, requiredKm, money, toKm } from '@/lib/form-fields'
import { parseMoneyInput } from '@/lib/schemas'
import { cn, createId } from '@/lib/utils'
import {
  DEFAULT_DEPRECIATION_RATE,
  DEFAULT_KM_PER_MONTH,
  DEFAULT_REMINDERS,
  cycleLabel,
  formatKm,
  kmPerMonth,
  reminderSaving,
  DOCUMENT_PRESETS,
  FUEL_SUBCATEGORY_ID,
  MAINTENANCE_SUBCATEGORY_ID,
  VEHICLE_CATEGORY_ID,
  type DocumentPreset,
} from '@/lib/vehicle'
import { useFinanceStore } from '@/store/finance-store'
import {
  FUEL_LABELS,
  FUEL_TYPES,
  PAYMENT_METHODS,
  VEHICLE_KINDS,
  type FuelType,
  type ISODate,
  type MaintenanceReminder,
  type PaymentMethod,
  type RecurringCost,
  type Transaction,
  type Vehicle,
} from '@/types/finance'

export type VehicleDialogState =
  | { kind: 'vehicle'; vehicle?: Vehicle }
  | { kind: 'fuel'; vehicle: Vehicle; currentKm: number; transaction?: Transaction }
  | { kind: 'expense'; vehicle: Vehicle; currentKm: number; transaction?: Transaction }
  | { kind: 'reminder'; vehicle: Vehicle; currentKm: number; reminder?: MaintenanceReminder }
  | { kind: 'complete'; vehicle: Vehicle; currentKm: number; reminder: MaintenanceReminder }
  | { kind: 'document'; vehicle: Vehicle; preset: DocumentPreset }
  | null


// ---------------------------------------------------------------------------
// Peças de formulário
// ---------------------------------------------------------------------------

/** Lançamento de veículo pago na data. */
function expense(
  vehicle: Vehicle,
  fields: Pick<Transaction, 'description' | 'amount' | 'subcategoryId' | 'dueDate' | 'paymentMethod' | 'odometer'> & {
    paid: boolean
    fuel?: Transaction['fuel']
  },
): Transaction {
  const { paid, ...rest } = fields
  return {
    id: createId(),
    type: 'despesa',
    categoryId: VEHICLE_CATEGORY_ID,
    paymentDate: paid ? fields.dueDate : null,
    status: paid ? 'pago' : 'pendente',
    installment: null,
    recurringCostId: null,
    payTo: null,
    vehicleId: vehicle.id,
    fuel: null,
    createdAt: nowISO(),
    ...rest,
  }
}

// ---------------------------------------------------------------------------
// Veículo
// ---------------------------------------------------------------------------

const vehicleSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome, ex.: Onix, Moto').max(40, 'Máximo de 40 caracteres'),
  kind: z.enum(VEHICLE_KINDS),
  fuel: z.enum(FUEL_TYPES),
  model: z.string().trim().max(60),
  plate: z.string().trim().max(10),
  year: z.string().trim().refine((v) => v === '' || (/^\d{4}$/.test(v) && Number(v) > 1900), 'Ano inválido'),
  odometer: requiredKm,
  marketValue: optionalMoney,
  depreciationRate: z.string().trim().refine((v) => v === '' || (parseMoneyInput(v) >= 0 && parseMoneyInput(v) <= 100), 'De 0 a 100'),
})

function VehicleForm({ vehicle, onDone }: { vehicle?: Vehicle; onDone: () => void }) {
  const { saveVehicle, removeVehicle } = useFinanceStore(useShallow((s) => ({ saveVehicle: s.saveVehicle, removeVehicle: s.removeVehicle })))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      name: vehicle?.name ?? '',
      kind: vehicle?.kind ?? 'carro',
      fuel: vehicle?.fuel ?? 'flex',
      model: vehicle?.model ?? '',
      plate: vehicle?.plate ?? '',
      year: vehicle?.year ? String(vehicle.year) : '',
      odometer: vehicle ? String(vehicle.initialOdometer) : '',
      marketValue: vehicle?.marketValue ? moneyText(vehicle.marketValue) : '',
      depreciationRate: String(vehicle?.depreciationRate ?? DEFAULT_DEPRECIATION_RATE).replace('.', ','),
    },
  })
  const [kind, fuel] = useWatch({ control, name: ['kind', 'fuel'] })
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        saveVehicle({
          id: vehicle?.id ?? createId(),
          name: v.name,
          kind: v.kind,
          fuel: v.fuel,
          model: v.model || null,
          plate: v.plate ? v.plate.toUpperCase() : null,
          year: v.year ? Number(v.year) : null,
          initialOdometer: toKm(v.odometer) ?? 0,
          marketValue: v.marketValue ? cents(v.marketValue) : null,
          depreciationRate: v.depreciationRate ? parseMoneyInput(v.depreciationRate) : DEFAULT_DEPRECIATION_RATE,
          active: true,
          createdAt: vehicle?.createdAt ?? nowISO(),
        })
        onDone()
      })}
    >
      <div className={bodyClass}>
        <Field id="v-name" label="Nome" error={e.name?.message}>
          <Input id="v-name" placeholder="Ex.: Onix, Moto do trabalho" aria-invalid={!!e.name} {...register('name')} />
        </Field>
        <div className="flex flex-col gap-2">
          <Label>Tipo</Label>
          <Choices
            label="Tipo"
            value={kind}
            onChange={(v) => setValue('kind', v)}
            options={[
              { value: 'carro', label: 'Carro' },
              { value: 'moto', label: 'Moto' },
              { value: 'outro', label: 'Outro' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Combustível</Label>
          <Choices label="Combustível" value={fuel} onChange={(v) => setValue('fuel', v)} options={FUEL_TYPES.map((f) => ({ value: f, label: FUEL_LABELS[f] }))} />
        </div>
        <Field
          id="v-km"
          label={vehicle ? 'Km no cadastro' : 'Km atual no painel'}
          error={e.odometer?.message}
          hint="Base para os lembretes de manutenção e o consumo."
        >
          <Affix after="km">
            <Input id="v-km" inputMode="numeric" className="pr-10" aria-invalid={!!e.odometer} {...register('odometer')} />
          </Affix>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="v-model" label="Modelo (opcional)">
            <Input id="v-model" placeholder="Ex.: Onix 1.0 LT" {...register('model')} />
          </Field>
          <Field id="v-year" label="Ano (opcional)" error={e.year?.message}>
            <Input id="v-year" inputMode="numeric" placeholder="2020" aria-invalid={!!e.year} {...register('year')} />
          </Field>
        </div>
        <Field id="v-plate" label="Placa (opcional)">
          <Input id="v-plate" autoComplete="off" spellCheck={false} className="uppercase" {...register('plate')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="v-value" label="Valor hoje (FIPE)" error={e.marketValue?.message}>
            <Affix before="R$">
              <Input id="v-value" inputMode="decimal" className="pl-10" aria-invalid={!!e.marketValue} {...register('marketValue')} />
            </Affix>
          </Field>
          <Field id="v-dep" label="Perde por ano" error={e.depreciationRate?.message}>
            <Affix after="%">
              <Input id="v-dep" inputMode="decimal" className="pr-8" aria-invalid={!!e.depreciationRate} {...register('depreciationRate')} />
            </Affix>
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          Opcional. Usado para calcular quanto guardar por mês para trocar de carro sem perder dinheiro. Carros usados perdem perto de 10% ao ano.
        </p>
      </div>
      {confirmDelete && vehicle ? (
        <div className="flex flex-col gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-sm text-muted-foreground">
            Os lembretes são apagados. Gastos já lançados continuam em Lançamentos.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="expense"
              className="flex-1"
              onClick={() => {
                removeVehicle(vehicle.id)
                onDone()
              }}
            >
              Excluir veículo
            </Button>
          </div>
        </div>
      ) : (
        <FormActions
          submitLabel={vehicle ? 'Salvar' : 'Adicionar veículo'}
          extra={
            vehicle ? (
              <Button type="button" variant="outline" size="icon" className="text-expense" aria-label="Excluir veículo" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
              </Button>
            ) : undefined
          }
        />
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Abastecimento
// ---------------------------------------------------------------------------

const positive = (v: string) => parseMoneyInput(v) > 0
const fuelSchema = z
  .object({
    date,
    price: z.string().trim(),
    total: z.string().trim(),
    liters: z.string().trim(),
    odometer: km.refine((v) => v !== '', 'Informe o km do painel: sem ele o consumo não é calculado'),
    type: z.enum(FUEL_TYPES),
    fullTank: z.boolean(),
    paymentMethod: z.enum(PAYMENT_METHODS),
  })
  // Basta saber dois dos três (preço do litro, litros, total); o terceiro é calculado.
  .refine((v) => [v.price, v.liters, v.total].filter(positive).length >= 2, {
    path: ['liters'],
    message: 'Preencha dois destes: preço do litro, litros ou total pago',
  })

/** Completa o que faltar entre preço do litro, litros e total (em reais). */
function solveFuel(priceText: string, litersText: string, totalText: string) {
  const price = parseMoneyInput(priceText)
  const liters = parseMoneyInput(litersText)
  const total = parseMoneyInput(totalText)
  const has = (n: number) => n > 0
  if (has(liters) && has(total)) return { liters, total, price: total / liters }
  if (has(price) && has(liters)) return { liters, total: price * liters, price }
  if (has(price) && has(total)) return { liters: total / price, total, price }
  return null
}

const decimalText = (n: number, digits: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: digits })

const moneyText = (c: number) => fromCents(c).toFixed(2).replace('.', ',')

/** Edição: mantém id, criação e vínculos (parcela, fixo) do lançamento original. */
const keepIdentity = (original: Transaction | undefined, next: Transaction): Transaction =>
  original
    ? { ...next, id: original.id, createdAt: original.createdAt, installment: original.installment, recurringCostId: original.recurringCostId, payTo: original.payTo ?? null, notes: original.notes }
    : next

/** Rodapé de edição: salvar, ou excluir com confirmação. */
function EditActions({ submitLabel, transaction, onDone }: { submitLabel: string; transaction?: Transaction; onDone: () => void }) {
  const remove = useFinanceStore((s) => s.removeTransaction)
  const [confirm, setConfirm] = useState(false)
  if (!transaction) return <FormActions submitLabel={submitLabel} />
  if (confirm)
    return (
      <div className="flex gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirm(false)}>
          Voltar
        </Button>
        <Button
          type="button"
          variant="expense"
          className="flex-1"
          onClick={() => {
            remove(transaction.id)
            onDone()
          }}
        >
          Confirmar exclusão
        </Button>
      </div>
    )
  return (
    <FormActions
      submitLabel={submitLabel}
      extra={
        <Button type="button" variant="outline" size="icon" className="text-expense" aria-label="Excluir" onClick={() => setConfirm(true)}>
          <Trash2 />
        </Button>
      }
    />
  )
}

function FuelForm({ vehicle, currentKm, transaction, onDone }: { vehicle: Vehicle; currentKm: number; transaction?: Transaction; onDone: () => void }) {
  const add = useFinanceStore((s) => s.addVehicleExpense)
  const save = useFinanceStore((s) => s.saveTransaction)
  const defaultType: FuelType = vehicle.fuel === 'flex' ? 'gasolina' : vehicle.fuel
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(fuelSchema),
    defaultValues: transaction
      ? {
          date: transaction.dueDate,
          price: '',
          total: moneyText(transaction.amount),
          liters: String(transaction.fuel?.liters ?? '').replace('.', ','),
          odometer: transaction.odometer != null ? String(transaction.odometer) : '',
          type: transaction.fuel?.type ?? defaultType,
          fullTank: transaction.fuel?.fullTank ?? true,
          paymentMethod: (transaction.paymentMethod ?? 'pix') as PaymentMethod,
        }
      : { date: todayISO(), price: '', total: '', liters: '', odometer: '', type: defaultType, fullTank: true, paymentMethod: 'pix' as PaymentMethod },
  })
  const [price, total, liters, type, fullTank, paymentMethod] = useWatch({
    control,
    name: ['price', 'total', 'liters', 'type', 'fullTank', 'paymentMethod'],
  })
  const solved = solveFuel(price, liters, total)
  // Mostra o valor calculado só no campo que a pessoa deixou em branco.
  const computed = solved && {
    price: !positive(price) ? formatMoney(toCents(solved.price)) : null,
    liters: !positive(liters) ? `${decimalText(solved.liters, 2)} L` : null,
    total: !positive(total) ? formatMoney(toCents(solved.total)) : null,
  }
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        const fuel = solveFuel(v.price, v.liters, v.total)!
        const l = fuel.liters
        const next = keepIdentity(
          transaction,
          expense(vehicle, {
            description: `Abastecimento · ${FUEL_LABELS[v.type]}`,
            amount: toCents(fuel.total),
            subcategoryId: FUEL_SUBCATEGORY_ID,
            dueDate: v.date as ISODate,
            paymentMethod: v.paymentMethod,
            odometer: toKm(v.odometer),
            paid: true,
            fuel: { liters: Math.round(l * 100) / 100, type: v.type, fullTank: v.fullTank },
          }),
        )
        if (transaction) save(next)
        else add(next)
        onDone()
      })}
    >
      <div className={bodyClass}>
        <div className="grid grid-cols-3 gap-2">
          <Field id="f-price" label="Preço do litro">
            <Affix before="R$">
              <Input id="f-price" inputMode="decimal" className="pl-9" placeholder={computed?.price?.replace('R$', '').trim() ?? ''} {...register('price')} />
            </Affix>
          </Field>
          <Field id="f-liters" label="Litros">
            <Affix after="L">
              <Input id="f-liters" inputMode="decimal" className="pr-7" aria-invalid={!!e.liters} placeholder={computed?.liters?.replace(' L', '') ?? ''} {...register('liters')} />
            </Affix>
          </Field>
          <Field id="f-total" label="Total pago">
            <Affix before="R$">
              <Input id="f-total" inputMode="decimal" className="pl-9" placeholder={computed?.total?.replace('R$', '').trim() ?? ''} {...register('total')} />
            </Affix>
          </Field>
        </div>
        <p className={cn('-mt-3 text-sm', e.liters ? 'text-expense' : 'text-muted-foreground')} role={e.liters ? 'alert' : undefined}>
          {e.liters
            ? e.liters.message
            : solved
              ? `${decimalText(solved.liters, 2)} L × ${formatMoney(toCents(solved.price))} = ${formatMoney(toCents(solved.total))}`
              : 'Preencha dois dos três; o terceiro é calculado.'}
        </p>
        {vehicle.fuel === 'flex' && (
          <div className="flex flex-col gap-2">
            <Label>Combustível</Label>
            <Choices
              label="Combustível"
              value={type}
              onChange={(v) => setValue('type', v)}
              options={[
                { value: 'gasolina', label: 'Gasolina' },
                { value: 'etanol', label: 'Etanol' },
              ]}
            />
          </div>
        )}
        <Field id="f-km" label="Km no painel" error={e.odometer?.message} hint={`Último registrado: ${currentKm.toLocaleString('pt-BR')} km.`}>
          <Affix after="km">
            <Input id="f-km" inputMode="numeric" className="pr-10" aria-invalid={!!e.odometer} {...register('odometer')} />
          </Affix>
        </Field>
        <label className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-sm font-medium">Completou o tanque</span>
            <span className="text-xs text-muted-foreground">Necessário para calcular o consumo (km/l).</span>
          </span>
          <Switch checked={fullTank} onCheckedChange={(v) => setValue('fullTank', v)} aria-label="Completou o tanque" />
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Pagamento</Label>
          <PaymentSelect value={paymentMethod} onChange={(v) => setValue('paymentMethod', v)} />
        </div>
        <Field id="f-date" label="Data" error={e.date?.message}>
          <Input id="f-date" type="date" aria-invalid={!!e.date} {...register('date')} />
        </Field>
      </div>
      <EditActions submitLabel="Salvar abastecimento" transaction={transaction} onDone={onDone} />
    </form>
  )
}

// ---------------------------------------------------------------------------
// Outro gasto
// ---------------------------------------------------------------------------

const expenseSchema = z.object({
  subcategoryId: z.string().min(1, 'Escolha o tipo'),
  description: z.string().trim().min(2, 'Descreva o gasto').max(80, 'Máximo de 80 caracteres'),
  amount: money('Informe o valor'),
  date,
  odometer: km,
  paid: z.boolean(),
  paymentMethod: z.enum(PAYMENT_METHODS),
})

function ExpenseForm({ vehicle, transaction, onDone }: { vehicle: Vehicle; transaction?: Transaction; onDone: () => void }) {
  const add = useFinanceStore((s) => s.addVehicleExpense)
  const save = useFinanceStore((s) => s.saveTransaction)
  const subcategories = useFinanceStore((s) => s.subcategories)
  const options = subcategories
    .filter((sc) => sc.categoryId === VEHICLE_CATEGORY_ID && sc.id !== FUEL_SUBCATEGORY_ID)
    .map((sc) => ({ value: sc.id, label: sc.name }))
  const { register, handleSubmit, control, setValue, getValues, formState } = useForm({
    resolver: zodResolver(expenseSchema),
    defaultValues: transaction
      ? {
          subcategoryId: transaction.subcategoryId ?? '',
          description: transaction.description,
          amount: moneyText(transaction.amount),
          date: transaction.dueDate,
          odometer: transaction.odometer != null ? String(transaction.odometer) : '',
          paid: transaction.status === 'pago',
          paymentMethod: (transaction.paymentMethod ?? 'pix') as PaymentMethod,
        }
      : { subcategoryId: '', description: '', amount: '', date: todayISO(), odometer: '', paid: true, paymentMethod: 'pix' as PaymentMethod },
  })
  const [subcategoryId, paid, paymentMethod] = useWatch({ control, name: ['subcategoryId', 'paid', 'paymentMethod'] })
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        const next = keepIdentity(
          transaction,
          expense(vehicle, {
            description: v.description,
            amount: cents(v.amount),
            subcategoryId: v.subcategoryId,
            dueDate: v.date as ISODate,
            paymentMethod: v.paymentMethod,
            odometer: toKm(v.odometer),
            paid: v.paid,
          }),
        )
        if (transaction) save(next)
        else add(next)
        onDone()
      })}
    >
      <div className={bodyClass}>
        <div className="flex flex-col gap-2">
          <Label>Tipo de gasto</Label>
          <Choices
            label="Tipo de gasto"
            value={subcategoryId}
            onChange={(id) => {
              const prev = options.find((o) => o.value === subcategoryId)?.label
              setValue('subcategoryId', id, { shouldValidate: true })
              // Preenche a descrição com o tipo, sem apagar o que a pessoa digitou.
              const desc = getValues('description')
              if (!desc || desc === prev) setValue('description', options.find((o) => o.value === id)?.label ?? '')
            }}
            options={options}
          />
          <FieldError message={e.subcategoryId?.message} />
        </div>
        <Field id="e-desc" label="Descrição" error={e.description?.message}>
          <Input id="e-desc" aria-invalid={!!e.description} {...register('description')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="e-amount" label="Valor" error={e.amount?.message}>
            <Affix before="R$">
              <Input id="e-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
          <Field id="e-date" label="Data" error={e.date?.message}>
            <Input id="e-date" type="date" aria-invalid={!!e.date} {...register('date')} />
          </Field>
        </div>
        <Field id="e-km" label="Km no painel (opcional)" error={e.odometer?.message}>
          <Affix after="km">
            <Input id="e-km" inputMode="numeric" className="pr-10" aria-invalid={!!e.odometer} {...register('odometer')} />
          </Affix>
        </Field>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Já pago</span>
          <Switch checked={paid} onCheckedChange={(v) => setValue('paid', v)} aria-label="Já pago" />
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Pagamento</Label>
          <PaymentSelect value={paymentMethod} onChange={(v) => setValue('paymentMethod', v)} />
        </div>
      </div>
      <EditActions submitLabel="Salvar gasto" transaction={transaction} onDone={onDone} />
    </form>
  )
}

// ---------------------------------------------------------------------------
// Lembrete de manutenção
// ---------------------------------------------------------------------------

const reminderSchema = z
  .object({
    name: z.string().trim().min(2, 'Dê um nome').max(60, 'Máximo de 60 caracteres'),
    intervalKm: km,
    intervalMonths: z.string().trim().refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0), 'Use meses inteiros'),
    lastKm: km,
    lastDate: date,
    estimatedCost: optionalMoney,
  })
  .refine((v) => v.intervalKm !== '' || v.intervalMonths !== '', { path: ['intervalKm'], message: 'Informe km, meses ou os dois' })

function ReminderForm({
  vehicle,
  currentKm,
  reminder,
  onDone,
}: {
  vehicle: Vehicle
  currentKm: number
  reminder?: MaintenanceReminder
  onDone: () => void
}) {
  const { saveReminder, removeReminder } = useFinanceStore(useShallow((s) => ({ saveReminder: s.saveReminder, removeReminder: s.removeReminder })))
  const existing = useFinanceStore(useShallow((s) => s.maintenance.filter((r) => r.vehicleId === vehicle.id).map((r) => r.name)))
  const transactions = useFinanceStore((s) => s.transactions)
  const measuredKm = kmPerMonth(vehicle, transactions)
  const kmMonth = measuredKm ?? DEFAULT_KM_PER_MONTH
  const { register, handleSubmit, setValue, control, formState } = useForm({
    resolver: zodResolver(reminderSchema),
    defaultValues: {
      name: reminder?.name ?? '',
      intervalKm: reminder?.intervalKm ? String(reminder.intervalKm) : '',
      intervalMonths: reminder?.intervalMonths ? String(reminder.intervalMonths) : '',
      lastKm: String(reminder?.lastKm ?? currentKm),
      lastDate: reminder?.lastDate ?? todayISO(),
      estimatedCost: reminder?.estimatedCost ? moneyText(reminder.estimatedCost) : '',
    },
  })
  const e = formState.errors
  const presets = DEFAULT_REMINDERS.filter((p) => !existing.includes(p.name))
  const [wKm, wMonths, wLastKm, wLastDate, wCost] = useWatch({
    control,
    name: ['intervalKm', 'intervalMonths', 'lastKm', 'lastDate', 'estimatedCost'],
  })
  // Prévia ao vivo: quanto guardar por mês com os valores digitados.
  const saving = reminderSaving(
    {
      intervalKm: toKm(wKm),
      intervalMonths: /^\d+$/.test(wMonths) && Number(wMonths) > 0 ? Number(wMonths) : null,
      lastKm: toKm(wLastKm),
      lastDate: /^\d{4}-\d{2}-\d{2}$/.test(wLastDate) ? (wLastDate as ISODate) : null,
      estimatedCost: wCost ? cents(wCost) : null,
    },
    currentKm,
    kmMonth,
    todayISO(),
  )

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        saveReminder({
          id: reminder?.id ?? createId(),
          vehicleId: vehicle.id,
          name: v.name,
          intervalKm: toKm(v.intervalKm),
          intervalMonths: v.intervalMonths ? Number(v.intervalMonths) : null,
          lastKm: toKm(v.lastKm),
          lastDate: v.lastDate as ISODate,
          estimatedCost: v.estimatedCost ? cents(v.estimatedCost) : null,
          createdAt: reminder?.createdAt ?? nowISO(),
        })
        onDone()
      })}
    >
      <div className={bodyClass}>
        {!reminder && presets.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label>Sugestões</Label>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setValue('name', p.name, { shouldValidate: true })
                    setValue('intervalKm', p.intervalKm ? String(p.intervalKm) : '')
                    setValue('intervalMonths', p.intervalMonths ? String(p.intervalMonths) : '')
                    setValue('estimatedCost', moneyText(p.cost * 100))
                  }}
                  className="h-9 rounded-full border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field id="r-name" label="Manutenção" error={e.name?.message}>
          <Input id="r-name" aria-invalid={!!e.name} {...register('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="r-km" label="A cada" error={e.intervalKm?.message}>
            <Affix after="km">
              <Input id="r-km" inputMode="numeric" className="pr-10" aria-invalid={!!e.intervalKm} {...register('intervalKm')} />
            </Affix>
          </Field>
          <Field id="r-months" label="ou a cada" error={e.intervalMonths?.message}>
            <Affix after="meses">
              <Input id="r-months" inputMode="numeric" className="pr-16" aria-invalid={!!e.intervalMonths} {...register('intervalMonths')} />
            </Affix>
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">Vale o que chegar primeiro. Confira os intervalos no manual do veículo.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field id="r-last-km" label="Última vez, km" error={e.lastKm?.message}>
            <Affix after="km">
              <Input id="r-last-km" inputMode="numeric" className="pr-10" aria-invalid={!!e.lastKm} {...register('lastKm')} />
            </Affix>
          </Field>
          <Field id="r-last-date" label="Última vez, data" error={e.lastDate?.message}>
            <Input id="r-last-date" type="date" aria-invalid={!!e.lastDate} {...register('lastDate')} />
          </Field>
        </div>
        <Field
          id="r-cost"
          label="Quanto custa (opcional)"
          error={e.estimatedCost?.message}
          hint="Entra no cálculo de quanto guardar por mês. As sugestões vêm com um valor médio; ajuste ao seu orçamento."
        >
          <Affix before="R$">
            <Input id="r-cost" inputMode="decimal" className="pl-10" aria-invalid={!!e.estimatedCost} {...register('estimatedCost')} />
          </Affix>
        </Field>
        {saving && (
          <div role="status" className="flex flex-col gap-1 rounded-xl bg-info-soft p-3 text-sm text-info">
            <p>
              <span className="font-semibold">Guarde {formatMoney(saving.average)} por mês.</span> A troca acontece {cycleLabel(saving.cycleMonths)}
              {saving.by === 'km'
                ? `, pelos km (você roda ~${formatKm(kmMonth)} por mês${measuredKm ? '' : ', estimativa'}).`
                : ', pelo tempo.'}
            </p>
            {saving.monthsToNext !== null && saving.toNext !== null && (
              <p>
                {saving.monthsToNext <= 0
                  ? `Já venceu: separe ${formatMoney(saving.toNext)} agora.`
                  : Math.abs(saving.toNext - saving.average) > 100
                    ? `A próxima é em ~${Math.max(1, Math.round(saving.monthsToNext))} ${Math.round(saving.monthsToNext) <= 1 ? 'mês' : 'meses'}: começando do zero, guarde ${formatMoney(saving.toNext)} por mês até lá.`
                    : `A próxima é em ~${Math.round(saving.monthsToNext)} meses.`}
              </p>
            )}
          </div>
        )}
      </div>
      <FormActions
        submitLabel={reminder ? 'Salvar' : 'Criar lembrete'}
        extra={
          reminder ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="text-expense"
              aria-label="Excluir lembrete"
              onClick={() => {
                removeReminder(reminder.id)
                onDone()
              }}
            >
              <Trash2 />
            </Button>
          ) : undefined
        }
      />
    </form>
  )
}

const completeSchema = z.object({ km, date, amount: optionalMoney, paymentMethod: z.enum(PAYMENT_METHODS) })

function CompleteForm({ vehicle, currentKm, reminder, onDone }: { vehicle: Vehicle; currentKm: number; reminder: MaintenanceReminder; onDone: () => void }) {
  const complete = useFinanceStore((s) => s.completeReminder)
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(completeSchema),
    defaultValues: { km: String(currentKm), date: todayISO(), amount: '', paymentMethod: 'pix' as PaymentMethod },
  })
  const paymentMethod = useWatch({ control, name: 'paymentMethod' })
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        const value = v.amount ? cents(v.amount) : 0
        complete(
          reminder.id,
          toKm(v.km),
          v.date as ISODate,
          value > 0
            ? expense(vehicle, {
                description: reminder.name,
                amount: value,
                subcategoryId: MAINTENANCE_SUBCATEGORY_ID,
                dueDate: v.date as ISODate,
                paymentMethod: v.paymentMethod,
                odometer: toKm(v.km),
                paid: true,
              })
            : undefined,
        )
        onDone()
      })}
    >
      <div className={bodyClass}>
        <div className="grid grid-cols-2 gap-3">
          <Field id="c-km" label="Km no painel" error={e.km?.message}>
            <Affix after="km">
              <Input id="c-km" inputMode="numeric" className="pr-10" aria-invalid={!!e.km} {...register('km')} />
            </Affix>
          </Field>
          <Field id="c-date" label="Data" error={e.date?.message}>
            <Input id="c-date" type="date" aria-invalid={!!e.date} {...register('date')} />
          </Field>
        </div>
        <Field id="c-amount" label="Quanto custou (opcional)" error={e.amount?.message} hint="Com valor, o gasto entra em Lançamentos como Manutenção.">
          <Affix before="R$">
            <Input id="c-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
          </Affix>
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Pagamento</Label>
          <PaymentSelect value={paymentMethod} onChange={(v) => setValue('paymentMethod', v)} />
        </div>
      </div>
      <FormActions submitLabel="Marcar como feita" />
    </form>
  )
}

// ---------------------------------------------------------------------------
// Documentos anuais
// ---------------------------------------------------------------------------

const documentSchema = z.object({
  amount: money('Informe o valor'),
  date,
  frequency: z.enum(['mensal', 'anual']),
  paymentMethod: z.enum(PAYMENT_METHODS),
})

function DocumentForm({ vehicle, preset, onDone }: { vehicle: Vehicle; preset: DocumentPreset; onDone: () => void }) {
  const addRecurringCost = useFinanceStore((s) => s.addRecurringCost)
  const meta = DOCUMENT_PRESETS[preset]
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(documentSchema),
    defaultValues: { amount: '', date: todayISO(), frequency: 'anual' as 'mensal' | 'anual', paymentMethod: 'pix' as PaymentMethod },
  })
  const [paymentMethod, frequency] = useWatch({ control, name: ['paymentMethod', 'frequency'] })
  const monthly = frequency === 'mensal'
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        const due = v.date as ISODate
        const base: Omit<RecurringCost, 'frequency' | 'dueMonth'> = {
          id: createId(),
          description: `${meta.label} · ${vehicle.name}`,
          amount: cents(v.amount),
          type: 'despesa',
          categoryId: VEHICLE_CATEGORY_ID,
          subcategoryId: meta.subcategoryId,
          paymentMethod: v.paymentMethod,
          dueDay: Number(due.slice(8, 10)),
          autoRenew: true,
          isSubscription: false,
          active: true,
          startDate: due,
          endDate: null,
          lastGeneratedMonth: null,
          payTo: null,
          vehicleId: vehicle.id,
          createdAt: nowISO(),
        }
        const rc: RecurringCost =
          v.frequency === 'mensal' ? { ...base, frequency: 'mensal' } : { ...base, frequency: 'anual', dueMonth: Number(due.slice(5, 7)) }
        addRecurringCost(rc, false)
        onDone()
      })}
    >
      <div className={bodyClass}>
        {meta.monthly && (
          <div className="flex flex-col gap-2">
            <Label>Como você paga</Label>
            <Choices
              label="Como você paga"
              value={frequency}
              onChange={(v) => setValue('frequency', v)}
              options={[
                { value: 'mensal', label: 'Por mês' },
                { value: 'anual', label: 'Por ano' },
              ]}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field id="d-amount" label={monthly ? 'Valor por mês' : 'Valor no ano'} error={e.amount?.message}>
            <Affix before="R$">
              <Input id="d-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
          <Field id="d-date" label="Próximo vencimento" error={e.date?.message}>
            <Input id="d-date" type="date" aria-invalid={!!e.date} {...register('date')} />
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          {meta.hint} Repete {monthly ? 'todo mês' : 'todo ano'} e aparece no Calendário.
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Pagamento</Label>
          <PaymentSelect value={paymentMethod} onChange={(v) => setValue('paymentMethod', v)} />
        </div>
      </div>
      <FormActions submitLabel={`Cadastrar ${meta.label}`} />
    </form>
  )
}

// ---------------------------------------------------------------------------

function titleOf(d: Exclude<VehicleDialogState, null>): { title: string; description: string } {
  switch (d.kind) {
    case 'vehicle':
      return { title: d.vehicle ? 'Editar veículo' : 'Novo veículo', description: 'Carro, moto ou outro veículo seu.' }
    case 'fuel':
      return { title: d.transaction ? 'Editar abastecimento' : 'Abastecimento', description: d.vehicle.name }
    case 'expense':
      return {
        title: d.transaction ? 'Editar gasto' : 'Gasto com o veículo',
        description: `${d.vehicle.name} · entra em Lançamentos na categoria Veículo.`,
      }
    case 'reminder':
      return { title: d.reminder ? 'Editar lembrete' : 'Lembrete de manutenção', description: d.vehicle.name }
    case 'complete':
      return { title: d.reminder.name, description: 'Registrar que a manutenção foi feita.' }
    case 'document':
      return { title: DOCUMENT_PRESETS[d.preset].label, description: d.vehicle.name }
  }
}

export function VehicleDialogs({ state, onClose }: { state: VehicleDialogState; onClose: () => void }) {
  const meta = state ? titleOf(state) : null
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{meta?.title}</DialogTitle>
          <DialogDescription>{meta?.description}</DialogDescription>
        </DialogHeader>
        {state?.kind === 'vehicle' && <VehicleForm vehicle={state.vehicle} onDone={onClose} />}
        {state?.kind === 'fuel' && (
          <FuelForm key={state.transaction?.id ?? 'new'} vehicle={state.vehicle} currentKm={state.currentKm} transaction={state.transaction} onDone={onClose} />
        )}
        {state?.kind === 'expense' && (
          <ExpenseForm key={state.transaction?.id ?? 'new'} vehicle={state.vehicle} transaction={state.transaction} onDone={onClose} />
        )}
        {state?.kind === 'reminder' && (
          <ReminderForm vehicle={state.vehicle} currentKm={state.currentKm} reminder={state.reminder} onDone={onClose} />
        )}
        {state?.kind === 'complete' && (
          <CompleteForm vehicle={state.vehicle} currentKm={state.currentKm} reminder={state.reminder} onDone={onClose} />
        )}
        {state?.kind === 'document' && <DocumentForm vehicle={state.vehicle} preset={state.preset} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
