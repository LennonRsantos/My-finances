import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Affix, bodyClass, Choices, Field, FormActions, formClass, PaymentSelect } from '@/components/ui/form-kit'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Switch } from '@/components/ui/misc'
import { todayISO } from '@/lib/dates'
import { cents, date, money, nowISO, optionalMoney } from '@/lib/form-fields'
import { BILL_ORDER, HOME_CATEGORY_ID, HOME_MAINTENANCE_SUBCATEGORY_ID, HOME_REMINDERS } from '@/lib/home'
import { createId } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import { PAYMENT_METHODS, type ISODate, type MaintenanceReminder, type PaymentMethod, type RecurringCost, type Transaction } from '@/types/finance'

export type HomeDialogState =
  | { kind: 'bill'; subcategoryId?: string }
  | { kind: 'reminder'; reminder?: MaintenanceReminder }
  | { kind: 'complete'; reminder: MaintenanceReminder }
  | null

function homeExpense(fields: Pick<Transaction, 'description' | 'amount' | 'subcategoryId' | 'dueDate' | 'paymentMethod'> & { paid: boolean }): Transaction {
  const { paid, ...rest } = fields
  return {
    id: createId(),
    type: 'despesa',
    categoryId: HOME_CATEGORY_ID,
    paymentDate: paid ? fields.dueDate : null,
    status: paid ? 'pago' : 'pendente',
    installment: null,
    recurringCostId: null,
    payTo: null,
    createdAt: nowISO(),
    ...rest,
  }
}

// ---------------------------------------------------------------------------
// Conta da casa
// ---------------------------------------------------------------------------

const billSchema = z.object({
  subcategoryId: z.string().min(1, 'Escolha a conta'),
  description: z.string().trim().min(2, 'Descreva a conta').max(80, 'Máximo de 80 caracteres'),
  amount: money('Informe o valor'),
  date,
  paid: z.boolean(),
  repeat: z.boolean(),
  paymentMethod: z.enum(PAYMENT_METHODS),
})

function BillForm({ subcategoryId: initial, onDone }: { subcategoryId?: string; onDone: () => void }) {
  const { subcategories, addTransaction, addRecurringCost } = useFinanceStore(
    useShallow((s) => ({ subcategories: s.subcategories, addTransaction: s.addTransaction, addRecurringCost: s.addRecurringCost })),
  )
  const options = subcategories
    .filter((sc) => sc.categoryId === HOME_CATEGORY_ID)
    .sort((a, b) => {
      const ia = BILL_ORDER.indexOf(a.id)
      const ib = BILL_ORDER.indexOf(b.id)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.name.localeCompare(b.name, 'pt-BR')
    })
    .map((sc) => ({ value: sc.id, label: sc.name }))
  const initialLabel = options.find((o) => o.value === initial)?.label ?? ''

  const { register, handleSubmit, control, setValue, getValues, formState } = useForm({
    resolver: zodResolver(billSchema),
    defaultValues: {
      subcategoryId: initial ?? '',
      description: initialLabel,
      amount: '',
      date: todayISO(),
      paid: false,
      repeat: false,
      paymentMethod: 'pix' as PaymentMethod,
    },
  })
  const [subcategoryId, paid, repeat, paymentMethod] = useWatch({ control, name: ['subcategoryId', 'paid', 'repeat', 'paymentMethod'] })
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        const due = v.date as ISODate
        if (v.repeat) {
          const rc: RecurringCost = {
            id: createId(),
            description: v.description,
            amount: cents(v.amount),
            type: 'despesa',
            categoryId: HOME_CATEGORY_ID,
            subcategoryId: v.subcategoryId,
            paymentMethod: v.paymentMethod,
            dueDay: Number(due.slice(8, 10)),
            autoRenew: true,
            isSubscription: false,
            active: true,
            startDate: due,
            endDate: null,
            lastGeneratedMonth: null,
            payTo: null,
            createdAt: nowISO(),
            frequency: 'mensal',
          }
          addRecurringCost(rc, v.paid)
        } else {
          addTransaction(
            homeExpense({
              description: v.description,
              amount: cents(v.amount),
              subcategoryId: v.subcategoryId,
              dueDate: due,
              paymentMethod: v.paymentMethod,
              paid: v.paid,
            }),
          )
        }
        onDone()
      })}
    >
      <div className={bodyClass}>
        <div className="flex flex-col gap-2">
          <Label>Conta</Label>
          <Choices
            label="Conta"
            value={subcategoryId}
            onChange={(id) => {
              const prev = options.find((o) => o.value === subcategoryId)?.label
              setValue('subcategoryId', id, { shouldValidate: true })
              const desc = getValues('description')
              if (!desc || desc === prev) setValue('description', options.find((o) => o.value === id)?.label ?? '')
            }}
            options={options}
          />
          <FieldError message={e.subcategoryId?.message} />
        </div>
        <Field id="b-desc" label="Descrição" error={e.description?.message}>
          <Input id="b-desc" aria-invalid={!!e.description} {...register('description')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="b-amount" label="Valor" error={e.amount?.message}>
            <Affix before="R$">
              <Input id="b-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
          <Field id="b-date" label="Vencimento" error={e.date?.message}>
            <Input id="b-date" type="date" aria-invalid={!!e.date} {...register('date')} />
          </Field>
        </div>
        <label className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-sm font-medium">Repetir todo mês</span>
            <span className="text-xs text-muted-foreground">Para aluguel, condomínio, internet. Lança os próximos meses sozinho.</span>
          </span>
          <Switch checked={repeat} onCheckedChange={(v) => setValue('repeat', v)} aria-label="Repetir todo mês" />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{repeat ? 'Este mês já está pago' : 'Já pago'}</span>
          <Switch checked={paid} onCheckedChange={(v) => setValue('paid', v)} aria-label="Já pago" />
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Pagamento</Label>
          <PaymentSelect value={paymentMethod} onChange={(v) => setValue('paymentMethod', v)} />
        </div>
      </div>
      <FormActions submitLabel={repeat ? 'Salvar conta fixa' : 'Salvar conta'} />
    </form>
  )
}

// ---------------------------------------------------------------------------
// Manutenção da casa
// ---------------------------------------------------------------------------

const reminderSchema = z.object({
  name: z.string().trim().min(2, 'Dê um nome').max(60, 'Máximo de 60 caracteres'),
  intervalMonths: z.string().trim().refine((v) => /^\d+$/.test(v) && Number(v) > 0, 'Informe de quantos em quantos meses'),
  lastDate: date,
})

function ReminderForm({ reminder, onDone }: { reminder?: MaintenanceReminder; onDone: () => void }) {
  const { saveReminder, removeReminder } = useFinanceStore(useShallow((s) => ({ saveReminder: s.saveReminder, removeReminder: s.removeReminder })))
  const existing = useFinanceStore(useShallow((s) => s.maintenance.filter((r) => r.vehicleId === null).map((r) => r.name)))
  const { register, handleSubmit, setValue, formState } = useForm({
    resolver: zodResolver(reminderSchema),
    defaultValues: {
      name: reminder?.name ?? '',
      intervalMonths: reminder?.intervalMonths ? String(reminder.intervalMonths) : '',
      lastDate: reminder?.lastDate ?? todayISO(),
    },
  })
  const e = formState.errors
  const presets = HOME_REMINDERS.filter((p) => !existing.includes(p.name))

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        saveReminder({
          id: reminder?.id ?? createId(),
          vehicleId: null,
          name: v.name,
          intervalKm: null,
          intervalMonths: Number(v.intervalMonths),
          lastKm: null,
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
                    setValue('intervalMonths', String(p.intervalMonths), { shouldValidate: true })
                  }}
                  className="h-9 rounded-full border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field id="hr-name" label="Cuidado" error={e.name?.message}>
          <Input id="hr-name" aria-invalid={!!e.name} {...register('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="hr-months" label="A cada" error={e.intervalMonths?.message}>
            <Affix after="meses">
              <Input id="hr-months" inputMode="numeric" className="pr-16" aria-invalid={!!e.intervalMonths} {...register('intervalMonths')} />
            </Affix>
          </Field>
          <Field id="hr-last" label="Última vez" error={e.lastDate?.message}>
            <Input id="hr-last" type="date" aria-invalid={!!e.lastDate} {...register('lastDate')} />
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

const completeSchema = z.object({ date, amount: optionalMoney, paymentMethod: z.enum(PAYMENT_METHODS) })

function CompleteForm({ reminder, onDone }: { reminder: MaintenanceReminder; onDone: () => void }) {
  const complete = useFinanceStore((s) => s.completeReminder)
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(completeSchema),
    defaultValues: { date: todayISO(), amount: '', paymentMethod: 'pix' as PaymentMethod },
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
          null,
          v.date as ISODate,
          value > 0
            ? homeExpense({
                description: reminder.name,
                amount: value,
                subcategoryId: HOME_MAINTENANCE_SUBCATEGORY_ID,
                dueDate: v.date as ISODate,
                paymentMethod: v.paymentMethod,
                paid: true,
              })
            : undefined,
        )
        onDone()
      })}
    >
      <div className={bodyClass}>
        <div className="grid grid-cols-2 gap-3">
          <Field id="hc-date" label="Data" error={e.date?.message}>
            <Input id="hc-date" type="date" aria-invalid={!!e.date} {...register('date')} />
          </Field>
          <Field id="hc-amount" label="Custo (opcional)" error={e.amount?.message}>
            <Affix before="R$">
              <Input id="hc-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">Com valor, o gasto entra em Lançamentos como Manutenção e reparos.</p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Pagamento</Label>
          <PaymentSelect value={paymentMethod} onChange={(v) => setValue('paymentMethod', v)} />
        </div>
      </div>
      <FormActions submitLabel="Marcar como feito" />
    </form>
  )
}

// ---------------------------------------------------------------------------

const titles = {
  bill: { title: 'Conta da casa', description: 'Entra em Lançamentos na categoria Moradia.' },
  reminder: { title: 'Lembrete da casa', description: 'O app avisa 30 dias antes de vencer.' },
  complete: { title: 'Feito', description: 'Registrar que o cuidado foi feito.' },
}

export function HomeDialogs({ state, onClose }: { state: HomeDialogState; onClose: () => void }) {
  const meta = state ? titles[state.kind] : null
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.kind === 'complete' ? state.reminder.name : state?.kind === 'reminder' && state.reminder ? 'Editar lembrete' : meta?.title}</DialogTitle>
          <DialogDescription>{meta?.description}</DialogDescription>
        </DialogHeader>
        {state?.kind === 'bill' && <BillForm subcategoryId={state.subcategoryId} onDone={onClose} />}
        {state?.kind === 'reminder' && <ReminderForm reminder={state.reminder} onDone={onClose} />}
        {state?.kind === 'complete' && <CompleteForm reminder={state.reminder} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
