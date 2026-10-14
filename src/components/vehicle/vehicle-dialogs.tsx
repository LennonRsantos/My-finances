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
import { formatMoney, toCents } from '@/lib/money'
import { cents, date, km, nowISO, optionalMoney, requiredKm, money, toKm } from '@/lib/form-fields'
import { parseMoneyInput } from '@/lib/schemas'
import { createId } from '@/lib/utils'
import {
  DEFAULT_REMINDERS,
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
  | { kind: 'fuel'; vehicle: Vehicle; currentKm: number }
  | { kind: 'expense'; vehicle: Vehicle; currentKm: number }
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

const fuelSchema = z.object({
  date,
  total: money('Informe quanto pagou'),
  liters: z.string().trim().refine((v) => parseMoneyInput(v) > 0, 'Informe os litros'),
  odometer: km,
  type: z.enum(FUEL_TYPES),
  fullTank: z.boolean(),
  paymentMethod: z.enum(PAYMENT_METHODS),
})

function FuelForm({ vehicle, currentKm, onDone }: { vehicle: Vehicle; currentKm: number; onDone: () => void }) {
  const add = useFinanceStore((s) => s.addVehicleExpense)
  const defaultType: FuelType = vehicle.fuel === 'flex' ? 'gasolina' : vehicle.fuel
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(fuelSchema),
    defaultValues: { date: todayISO(), total: '', liters: '', odometer: '', type: defaultType, fullTank: true, paymentMethod: 'pix' as PaymentMethod },
  })
  const [total, liters, type, fullTank, paymentMethod] = useWatch({ control, name: ['total', 'liters', 'type', 'fullTank', 'paymentMethod'] })
  const perLiter = parseMoneyInput(total) > 0 && parseMoneyInput(liters) > 0 ? toCents(parseMoneyInput(total) / parseMoneyInput(liters)) : null
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        const l = parseMoneyInput(v.liters)
        add(
          expense(vehicle, {
            description: `Abastecimento · ${FUEL_LABELS[v.type]}`,
            amount: cents(v.total),
            subcategoryId: FUEL_SUBCATEGORY_ID,
            dueDate: v.date as ISODate,
            paymentMethod: v.paymentMethod,
            odometer: toKm(v.odometer),
            paid: true,
            fuel: { liters: Math.round(l * 100) / 100, type: v.type, fullTank: v.fullTank },
          }),
        )
        onDone()
      })}
    >
      <div className={bodyClass}>
        <div className="grid grid-cols-2 gap-3">
          <Field id="f-total" label="Total pago" error={e.total?.message}>
            <Affix before="R$">
              <Input id="f-total" inputMode="decimal" className="pl-10" aria-invalid={!!e.total} {...register('total')} />
            </Affix>
          </Field>
          <Field id="f-liters" label="Litros" error={e.liters?.message}>
            <Affix after="L">
              <Input id="f-liters" inputMode="decimal" className="pr-8" aria-invalid={!!e.liters} {...register('liters')} />
            </Affix>
          </Field>
        </div>
        {perLiter !== null && <p className="-mt-3 text-sm text-muted-foreground">{formatMoney(perLiter)} por litro</p>}
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
        <Field id="f-km" label="Km no painel" error={e.odometer?.message} hint={`Último registrado: ${currentKm.toLocaleString('pt-BR')} km. Sem km, o consumo não é calculado.`}>
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
      <FormActions submitLabel="Salvar abastecimento" />
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

function ExpenseForm({ vehicle, onDone }: { vehicle: Vehicle; onDone: () => void }) {
  const add = useFinanceStore((s) => s.addVehicleExpense)
  const subcategories = useFinanceStore((s) => s.subcategories)
  const options = subcategories
    .filter((sc) => sc.categoryId === VEHICLE_CATEGORY_ID && sc.id !== FUEL_SUBCATEGORY_ID)
    .map((sc) => ({ value: sc.id, label: sc.name }))
  const { register, handleSubmit, control, setValue, getValues, formState } = useForm({
    resolver: zodResolver(expenseSchema),
    defaultValues: { subcategoryId: '', description: '', amount: '', date: todayISO(), odometer: '', paid: true, paymentMethod: 'pix' as PaymentMethod },
  })
  const [subcategoryId, paid, paymentMethod] = useWatch({ control, name: ['subcategoryId', 'paid', 'paymentMethod'] })
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        add(
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
      <FormActions submitLabel="Salvar gasto" />
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
  const { register, handleSubmit, setValue, formState } = useForm({
    resolver: zodResolver(reminderSchema),
    defaultValues: {
      name: reminder?.name ?? '',
      intervalKm: reminder?.intervalKm ? String(reminder.intervalKm) : '',
      intervalMonths: reminder?.intervalMonths ? String(reminder.intervalMonths) : '',
      lastKm: String(reminder?.lastKm ?? currentKm),
      lastDate: reminder?.lastDate ?? todayISO(),
    },
  })
  const e = formState.errors
  const presets = DEFAULT_REMINDERS.filter((p) => !existing.includes(p.name))

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

const documentSchema = z.object({ amount: money('Informe o valor'), date, paymentMethod: z.enum(PAYMENT_METHODS) })

function DocumentForm({ vehicle, preset, onDone }: { vehicle: Vehicle; preset: DocumentPreset; onDone: () => void }) {
  const addRecurringCost = useFinanceStore((s) => s.addRecurringCost)
  const meta = DOCUMENT_PRESETS[preset]
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(documentSchema),
    defaultValues: { amount: '', date: todayISO(), paymentMethod: 'pix' as PaymentMethod },
  })
  const paymentMethod = useWatch({ control, name: 'paymentMethod' })
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        const due = v.date as ISODate
        const rc: RecurringCost = {
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
          frequency: 'anual',
          dueMonth: Number(due.slice(5, 7)),
        }
        addRecurringCost(rc, false)
        onDone()
      })}
    >
      <div className={bodyClass}>
        <div className="grid grid-cols-2 gap-3">
          <Field id="d-amount" label="Valor no ano" error={e.amount?.message}>
            <Affix before="R$">
              <Input id="d-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
          <Field id="d-date" label="Próximo vencimento" error={e.date?.message}>
            <Input id="d-date" type="date" aria-invalid={!!e.date} {...register('date')} />
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">{meta.hint} Repete todo ano e aparece no Calendário.</p>
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
      return { title: 'Abastecimento', description: d.vehicle.name }
    case 'expense':
      return { title: 'Gasto com o veículo', description: `${d.vehicle.name} · entra em Lançamentos na categoria Veículo.` }
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
        {state?.kind === 'fuel' && <FuelForm vehicle={state.vehicle} currentKm={state.currentKm} onDone={onClose} />}
        {state?.kind === 'expense' && <ExpenseForm vehicle={state.vehicle} onDone={onClose} />}
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
