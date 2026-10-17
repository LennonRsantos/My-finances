import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SHARED_FIXED_MONTHS, ShareFields, fixedShareNote, sendShareInvite, useShare } from '@/components/shared/share-fields'
import { Affix, bodyClass, Choices, Field, FormActions, formClass, PaymentSelect } from '@/components/ui/form-kit'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Switch } from '@/components/ui/misc'
import { todayISO } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cents, date, money, nowISO, optionalMoney } from '@/lib/form-fields'
import {
  BILL_ORDER,
  FINANCING_SUBCATEGORY_ID,
  HOME_CATEGORY_ID,
  HOME_MAINTENANCE_SUBCATEGORY_ID,
  HOME_REMINDERS,
  IPTU_SUBCATEGORY_ID,
  PURCHASE_SUBCATEGORIES,
  RENT_SUBCATEGORY_ID,
} from '@/lib/home'
import { createId } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import { PAYMENT_METHODS, type Cents, type ISODate, type MaintenanceReminder, type PaymentMethod, type RecurringCost, type Transaction } from '@/types/finance'

export type HomeDialogState =
  | { kind: 'bill'; subcategoryId?: string }
  | { kind: 'reminder'; reminder?: MaintenanceReminder }
  | { kind: 'complete'; reminder: MaintenanceReminder }
  | { kind: 'rent' }
  | { kind: 'financing' }
  | { kind: 'iptu' }
  | { kind: 'purchase' }
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
// Divisão com outra pessoa
// ---------------------------------------------------------------------------

/** Conta fixa dividida vira parcelas mensais: o convite cobre este tanto de meses. */

/**
 * Campos "Dividir" dos formulários da casa. Com a divisão ligada, o gasto não
 * é lançado direto: vira convite, e as parcelas entram para os dois quando a
 * pessoa aceitar.
 */
function useHomeShare() {
  const { share, setShare, available } = useShare()
  const send = async (bill: { title: string; total: Cents; installments: number; due: ISODate; subcategoryId: string }) => {
    const result = await sendShareInvite(share, {
      title: bill.title,
      totalAmount: bill.total,
      installments: bill.installments,
      firstDueDate: bill.due,
      categoryId: HOME_CATEGORY_ID,
      subcategoryId: bill.subcategoryId,
    })
    if ('error' in result) {
      setShare({ ...share, error: result.error })
      return null
    }
    return result.id
  }
  return { share, setShare, available, on: available && share.on, send }
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
    .filter((sc) => sc.categoryId === HOME_CATEGORY_ID && !PURCHASE_SUBCATEGORIES.includes(sc.id) && sc.id !== FINANCING_SUBCATEGORY_ID)
    .sort((a, b) => {
      const ia = BILL_ORDER.indexOf(a.id)
      const ib = BILL_ORDER.indexOf(b.id)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.name.localeCompare(b.name, 'pt-BR')
    })
    .map((sc) => ({ value: sc.id, label: sc.name }))
  const initialLabel = options.find((o) => o.value === initial)?.label ?? ''
  const sharing = useHomeShare()

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
      onSubmit={handleSubmit(async (v) => {
        const due = v.date as ISODate
        if (sharing.on) {
          const ok = await sharing.send({
            title: v.description,
            total: cents(v.amount) * (v.repeat ? SHARED_FIXED_MONTHS : 1),
            installments: v.repeat ? SHARED_FIXED_MONTHS : 1,
            due,
            subcategoryId: v.subcategoryId,
          })
          if (ok) onDone()
          return
        }
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
        {!sharing.on && (
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{repeat ? 'Este mês já está pago' : 'Já pago'}</span>
            <Switch checked={paid} onCheckedChange={(v) => setValue('paid', v)} aria-label="Já pago" />
          </label>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Pagamento</Label>
          <PaymentSelect value={paymentMethod} onChange={(v) => setValue('paymentMethod', v)} />
        </div>
        {sharing.available && <ShareFields share={sharing.share} onChange={sharing.setShare} note={repeat ? fixedShareNote : undefined} />}
      </div>
      <FormActions submitLabel={sharing.on ? 'Enviar convite' : repeat ? 'Salvar conta fixa' : 'Salvar conta'} />
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
  const sharing = useHomeShare()
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(completeSchema),
    defaultValues: { date: todayISO(), amount: '', paymentMethod: 'pix' as PaymentMethod },
  })
  const [paymentMethod, amount] = useWatch({ control, name: ['paymentMethod', 'amount'] })
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit(async (v) => {
        const value = v.amount ? cents(v.amount) : 0
        if (sharing.on && value > 0) {
          const billId = await sharing.send({
            title: reminder.name,
            total: value,
            installments: 1,
            due: v.date as ISODate,
            subcategoryId: HOME_MAINTENANCE_SUBCATEGORY_ID,
          })
          if (!billId) return
          complete(reminder.id, null, v.date as ISODate, undefined, billId)
          onDone()
          return
        }
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
        {sharing.available && <ShareFields share={sharing.share} onChange={sharing.setShare} label="Dividir o custo" />}
      </div>
      <FormActions submitLabel={sharing.on && cents(amount) > 0 ? 'Feito e enviar convite' : 'Marcar como feito'} />
    </form>
  )
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Moradia: aluguel, financiamento, IPTU
// ---------------------------------------------------------------------------

/** Fixo da casa a partir de um vencimento. */
function homeRecurring(
  fields: { description: string; amount: number; subcategoryId: string; due: ISODate; paymentMethod: PaymentMethod },
  frequency: 'mensal' | 'anual',
): RecurringCost {
  const base = {
    id: createId(),
    description: fields.description,
    amount: fields.amount,
    type: 'despesa' as const,
    categoryId: HOME_CATEGORY_ID,
    subcategoryId: fields.subcategoryId,
    paymentMethod: fields.paymentMethod,
    dueDay: Number(fields.due.slice(8, 10)),
    autoRenew: true,
    isSubscription: false,
    active: true,
    startDate: fields.due,
    endDate: null,
    lastGeneratedMonth: null,
    payTo: null,
    createdAt: nowISO(),
  }
  return frequency === 'mensal' ? { ...base, frequency: 'mensal' } : { ...base, frequency: 'anual', dueMonth: Number(fields.due.slice(5, 7)) }
}

const rentSchema = z.object({ amount: money('Informe o valor do aluguel'), date, paid: z.boolean(), paymentMethod: z.enum(PAYMENT_METHODS) })

function RentForm({ onDone }: { onDone: () => void }) {
  const addRecurringCost = useFinanceStore((s) => s.addRecurringCost)
  const sharing = useHomeShare()
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(rentSchema),
    defaultValues: { amount: '', date: todayISO(), paid: false, paymentMethod: 'pix' as PaymentMethod },
  })
  const [paid, paymentMethod] = useWatch({ control, name: ['paid', 'paymentMethod'] })
  const e = formState.errors
  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit(async (v) => {
        if (sharing.on) {
          const ok = await sharing.send({
            title: 'Aluguel',
            total: cents(v.amount) * SHARED_FIXED_MONTHS,
            installments: SHARED_FIXED_MONTHS,
            due: v.date as ISODate,
            subcategoryId: RENT_SUBCATEGORY_ID,
          })
          if (ok) onDone()
          return
        }
        addRecurringCost(
          homeRecurring(
            { description: 'Aluguel', amount: cents(v.amount), subcategoryId: RENT_SUBCATEGORY_ID, due: v.date as ISODate, paymentMethod: v.paymentMethod },
            'mensal',
          ),
          v.paid,
        )
        onDone()
      })}
    >
      <div className={bodyClass}>
        <div className="grid grid-cols-2 gap-3">
          <Field id="rent-amount" label="Valor por mês" error={e.amount?.message}>
            <Affix before="R$">
              <Input id="rent-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
          <Field id="rent-date" label="Próximo vencimento" error={e.date?.message}>
            <Input id="rent-date" type="date" aria-invalid={!!e.date} {...register('date')} />
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">Repete todo mês. Condomínio, se houver, cadastre em Conta &gt; Condomínio.</p>
        {!sharing.on && (
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Este mês já está pago</span>
            <Switch checked={paid} onCheckedChange={(x) => setValue('paid', x)} aria-label="Este mês já está pago" />
          </label>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Pagamento</Label>
          <PaymentSelect value={paymentMethod} onChange={(x) => setValue('paymentMethod', x)} />
        </div>
        {sharing.available && <ShareFields share={sharing.share} onChange={sharing.setShare} label="Dividir o aluguel" note={fixedShareNote} />}
      </div>
      <FormActions submitLabel={sharing.on ? 'Enviar convite' : 'Salvar aluguel'} />
    </form>
  )
}

const wholeNumber = (v: string) => /^\d+$/.test(v)

const financingSchema = z
  .object({
    bank: z.string().trim().max(40),
    amount: money('Informe o valor da parcela'),
    current: z.string().trim().refine((v) => wholeNumber(v) && Number(v) >= 1, 'Número da parcela'),
    total: z.string().trim().refine((v) => wholeNumber(v) && Number(v) >= 2 && Number(v) <= 480, 'De 2 a 480'),
    date,
    paymentMethod: z.enum(PAYMENT_METHODS),
  })
  .refine((v) => Number(v.current) <= Number(v.total), { path: ['current'], message: 'Maior que o total' })

function FinancingForm({ onDone }: { onDone: () => void }) {
  const add = useFinanceStore((s) => s.addInstallmentPurchase)
  const sharing = useHomeShare()
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(financingSchema),
    defaultValues: { bank: '', amount: '', current: '1', total: '', date: todayISO(), paymentMethod: 'boleto' as PaymentMethod },
  })
  const [paymentMethod, current, total] = useWatch({ control, name: ['paymentMethod', 'current', 'total'] })
  const remaining = Number(total) >= Number(current) && Number(current) >= 1 ? Number(total) - Number(current) + 1 : null
  const e = formState.errors
  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit(async (v) => {
        const parcela = cents(v.amount)
        if (sharing.on) {
          // Dividido: o convite cobre só as parcelas que faltam.
          const ok = await sharing.send({
            title: 'Financiamento do imóvel',
            total: parcela * (Number(v.total) - Number(v.current) + 1),
            installments: Number(v.total) - Number(v.current) + 1,
            due: v.date as ISODate,
            subcategoryId: FINANCING_SUBCATEGORY_ID,
          })
          if (ok) onDone()
          return
        }
        add({
          description: 'Financiamento do imóvel',
          totalAmount: parcela * Number(v.total),
          totalInstallments: Number(v.total),
          startAt: Number(v.current),
          firstDueDate: v.date as ISODate,
          categoryId: HOME_CATEGORY_ID,
          subcategoryId: FINANCING_SUBCATEGORY_ID,
          paymentMethod: v.paymentMethod,
          accountName: v.bank || 'Financiamento',
        })
        onDone()
      })}
    >
      <div className={bodyClass}>
        <Field id="fin-bank" label="Banco (opcional)">
          <Input id="fin-bank" placeholder="Ex.: Caixa, Itaú" {...register('bank')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="fin-amount" label="Valor da parcela" error={e.amount?.message}>
            <Affix before="R$">
              <Input id="fin-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
          <Field id="fin-date" label="Vencimento da próxima" error={e.date?.message}>
            <Input id="fin-date" type="date" aria-invalid={!!e.date} {...register('date')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="fin-current" label="Próxima parcela é a" error={e.current?.message}>
            <Input id="fin-current" inputMode="numeric" aria-invalid={!!e.current} {...register('current')} />
          </Field>
          <Field id="fin-total" label="De quantas" error={e.total?.message}>
            <Input id="fin-total" inputMode="numeric" placeholder="Ex.: 360" aria-invalid={!!e.total} {...register('total')} />
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          {remaining ? `Lança as ${remaining} parcelas que faltam, uma por mês.` : 'Ex.: na 25ª de 360 parcelas, preencha 25 e 360.'} Se a parcela muda
          de valor (SAC), ajuste depois em Lançamentos.
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Pagamento</Label>
          <PaymentSelect value={paymentMethod} onChange={(x) => setValue('paymentMethod', x)} />
        </div>
        {sharing.available && <ShareFields share={sharing.share} onChange={sharing.setShare} label="Dividir as parcelas" />}
      </div>
      <FormActions submitLabel={sharing.on ? 'Enviar convite' : 'Salvar financiamento'} />
    </form>
  )
}

const iptuSchema = z
  .object({
    amount: money('Informe o valor do IPTU'),
    mode: z.enum(['avista', 'parcelado']),
    quotas: z.string().trim(),
    date,
    paymentMethod: z.enum(PAYMENT_METHODS),
  })
  .refine((v) => v.mode === 'avista' || (wholeNumber(v.quotas) && Number(v.quotas) >= 2 && Number(v.quotas) <= 12), {
    path: ['quotas'],
    message: 'De 2 a 12 cotas',
  })

function IptuForm({ onDone }: { onDone: () => void }) {
  const { addRecurringCost, addInstallmentPurchase } = useFinanceStore(
    useShallow((s) => ({ addRecurringCost: s.addRecurringCost, addInstallmentPurchase: s.addInstallmentPurchase })),
  )
  const sharing = useHomeShare()
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(iptuSchema),
    defaultValues: { amount: '', mode: 'avista' as 'avista' | 'parcelado', quotas: '10', date: todayISO(), paymentMethod: 'boleto' as PaymentMethod },
  })
  const [mode, paymentMethod, amount, quotas] = useWatch({ control, name: ['mode', 'paymentMethod', 'amount', 'quotas'] })
  const e = formState.errors
  const perQuota = mode === 'parcelado' && cents(amount) > 0 && Number(quotas) >= 2 ? Math.round(cents(amount) / Number(quotas)) : null
  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit(async (v) => {
        const due = v.date as ISODate
        if (sharing.on) {
          const quotas = v.mode === 'avista' ? 1 : Number(v.quotas)
          const ok = await sharing.send({
            title: `IPTU ${due.slice(0, 4)}`,
            total: cents(v.amount),
            installments: quotas,
            due,
            subcategoryId: IPTU_SUBCATEGORY_ID,
          })
          if (ok) onDone()
          return
        }
        if (v.mode === 'avista') {
          addRecurringCost(
            homeRecurring({ description: 'IPTU', amount: cents(v.amount), subcategoryId: IPTU_SUBCATEGORY_ID, due, paymentMethod: v.paymentMethod }, 'anual'),
            false,
          )
        } else {
          addInstallmentPurchase({
            description: `IPTU ${due.slice(0, 4)}`,
            totalAmount: cents(v.amount),
            totalInstallments: Number(v.quotas),
            firstDueDate: due,
            categoryId: HOME_CATEGORY_ID,
            subcategoryId: IPTU_SUBCATEGORY_ID,
            paymentMethod: v.paymentMethod,
            accountName: 'Prefeitura',
          })
        }
        onDone()
      })}
    >
      <div className={bodyClass}>
        <div className="flex flex-col gap-2">
          <Label>Como você paga</Label>
          <Choices
            label="Como você paga"
            value={mode}
            onChange={(x) => setValue('mode', x)}
            options={[
              { value: 'avista', label: 'À vista' },
              { value: 'parcelado', label: 'Em cotas' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="iptu-amount" label="Valor total do ano" error={e.amount?.message}>
            <Affix before="R$">
              <Input id="iptu-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
          <Field id="iptu-date" label={mode === 'avista' ? 'Vencimento' : 'Vencimento da 1ª cota'} error={e.date?.message}>
            <Input id="iptu-date" type="date" aria-invalid={!!e.date} {...register('date')} />
          </Field>
        </div>
        {mode === 'parcelado' && (
          <Field id="iptu-quotas" label="Número de cotas" error={e.quotas?.message} hint={perQuota ? `${formatMoney(perQuota)} por cota, uma por mês.` : undefined}>
            <Input id="iptu-quotas" inputMode="numeric" aria-invalid={!!e.quotas} {...register('quotas')} />
          </Field>
        )}
        <p className="-mt-3 text-xs text-muted-foreground">
          {sharing.on
            ? 'Dividido, vale só para este ano. No ano que vem, divida o novo IPTU.'
            : mode === 'avista'
              ? 'Repete todo ano no mesmo dia.'
              : 'Lança as cotas deste ano. No ano que vem, cadastre o novo carnê.'}
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Pagamento</Label>
          <PaymentSelect value={paymentMethod} onChange={(x) => setValue('paymentMethod', x)} />
        </div>
        {sharing.available && <ShareFields share={sharing.share} onChange={sharing.setShare} label="Dividir o IPTU" />}
      </div>
      <FormActions submitLabel={sharing.on ? 'Enviar convite' : 'Salvar IPTU'} />
    </form>
  )
}

// ---------------------------------------------------------------------------
// Compras da casa
// ---------------------------------------------------------------------------

const purchaseSchema = z.object({
  subcategoryId: z.string().min(1, 'Escolha o tipo'),
  description: z.string().trim().min(2, 'O que foi comprado?').max(80, 'Máximo de 80 caracteres'),
  amount: money('Informe o valor'),
  date,
  repeat: z.enum(['nao', 'mensal', 'anual']),
  paymentMethod: z.enum(PAYMENT_METHODS),
})

function PurchaseForm({ onDone }: { onDone: () => void }) {
  const { subcategories, addTransaction, addRecurringCost } = useFinanceStore(
    useShallow((s) => ({ subcategories: s.subcategories, addTransaction: s.addTransaction, addRecurringCost: s.addRecurringCost })),
  )
  const options = PURCHASE_SUBCATEGORIES.map((id) => subcategories.find((sc) => sc.id === id))
    .filter((sc): sc is NonNullable<typeof sc> => !!sc)
    .map((sc) => ({ value: sc.id, label: sc.name }))
  const sharing = useHomeShare()
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      subcategoryId: '',
      description: '',
      amount: '',
      date: todayISO(),
      repeat: 'nao' as 'nao' | 'mensal' | 'anual',
      paymentMethod: 'pix' as PaymentMethod,
    },
  })
  const [subcategoryId, repeat, paymentMethod] = useWatch({ control, name: ['subcategoryId', 'repeat', 'paymentMethod'] })
  const e = formState.errors
  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit(async (v) => {
        if (sharing.on) {
          const ok = await sharing.send({
            title: v.description,
            total: cents(v.amount) * (v.repeat === 'mensal' ? SHARED_FIXED_MONTHS : 1),
            installments: v.repeat === 'mensal' ? SHARED_FIXED_MONTHS : 1,
            due: v.date as ISODate,
            subcategoryId: v.subcategoryId,
          })
          if (ok) onDone()
          return
        }
        const fields = { description: v.description, amount: cents(v.amount), subcategoryId: v.subcategoryId, paymentMethod: v.paymentMethod }
        if (v.repeat === 'nao') addTransaction(homeExpense({ ...fields, dueDate: v.date as ISODate, paid: true }))
        else addRecurringCost(homeRecurring({ ...fields, due: v.date as ISODate }, v.repeat), true)
        onDone()
      })}
    >
      <div className={bodyClass}>
        <div className="flex flex-col gap-2">
          <Label>Tipo</Label>
          <Choices label="Tipo" value={subcategoryId} onChange={(x) => setValue('subcategoryId', x, { shouldValidate: true })} options={options} />
          <FieldError message={e.subcategoryId?.message} />
        </div>
        <Field id="p-desc" label="O que foi comprado" error={e.description?.message}>
          <Input id="p-desc" placeholder="Ex.: produtos de limpeza, panela, geladeira" aria-invalid={!!e.description} {...register('description')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="p-amount" label="Valor" error={e.amount?.message}>
            <Affix before="R$">
              <Input id="p-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
          <Field id="p-date" label="Data" error={e.date?.message}>
            <Input id="p-date" type="date" aria-invalid={!!e.date} {...register('date')} />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Compra que se repete?</Label>
          <Choices
            label="Compra que se repete?"
            value={repeat}
            onChange={(x) => setValue('repeat', x)}
            options={[
              { value: 'nao', label: 'Não' },
              { value: 'mensal', label: 'Todo mês' },
              { value: 'anual', label: 'Todo ano' },
            ]}
          />
          <p className="text-xs text-muted-foreground">Ex.: produtos de limpeza todo mês. Compra parcelada: use Lançamentos &gt; Parcelado.</p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <Label>Pagamento</Label>
          <PaymentSelect value={paymentMethod} onChange={(x) => setValue('paymentMethod', x)} />
        </div>
        {sharing.available && (
          <ShareFields
            share={sharing.share}
            onChange={sharing.setShare}
            label="Dividir a compra"
            note={repeat === 'mensal' ? fixedShareNote : repeat === 'anual' ? 'Compra anual: o convite vale só para esta vez.' : undefined}
          />
        )}
      </div>
      <FormActions submitLabel={sharing.on ? 'Enviar convite' : 'Salvar compra'} />
    </form>
  )
}

const titles = {
  bill: { title: 'Conta da casa', description: 'Entra em Lançamentos na categoria Moradia.' },
  reminder: { title: 'Lembrete da casa', description: 'O app avisa 30 dias antes de vencer.' },
  complete: { title: 'Feito', description: 'Registrar que o cuidado foi feito.' },
  rent: { title: 'Aluguel', description: 'Lançado todo mês na categoria Moradia.' },
  financing: { title: 'Financiamento do imóvel', description: 'As parcelas entram em Lançamentos e no Sair do vermelho.' },
  iptu: { title: 'IPTU', description: 'Imposto anual do imóvel.' },
  purchase: { title: 'Compra para a casa', description: 'Itens da casa, não pessoais.' },
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
        {state?.kind === 'rent' && <RentForm onDone={onClose} />}
        {state?.kind === 'financing' && <FinancingForm onDone={onClose} />}
        {state?.kind === 'iptu' && <IptuForm onDone={onClose} />}
        {state?.kind === 'purchase' && <PurchaseForm onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
