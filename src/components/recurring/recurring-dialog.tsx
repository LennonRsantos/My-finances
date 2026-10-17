import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useShallow } from 'zustand/react/shallow'
import { ShareExisting, canShareExisting } from '@/components/shared/share-existing'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Affix, bodyClass, Choices, Field, FormActions, formClass, PaymentSelect } from '@/components/ui/form-kit'
import { Input, Label } from '@/components/ui/input'
import { currentYearMonth } from '@/lib/dates'
import { cents, money } from '@/lib/form-fields'
import { formatMoney, fromCents } from '@/lib/money'
import { useAuthStore } from '@/store/auth-store'
import { useFinanceStore } from '@/store/finance-store'
import { PAYMENT_METHODS, type PaymentMethod, type RecurringCost } from '@/types/finance'

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const schema = z.object({
  description: z.string().trim().min(2, 'Descreva a conta').max(80, 'Máximo de 80 caracteres'),
  amount: money('Informe o valor'),
  dueDay: z.string().trim().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 31, 'Dia de 1 a 31'),
  dueMonth: z.string(),
  frequency: z.enum(['mensal', 'anual']),
  paymentMethod: z.enum(PAYMENT_METHODS),
})

function RecurringForm({ rc, onDone }: { rc: RecurringCost; onDone: () => void }) {
  const { update, end } = useFinanceStore(useShallow((s) => ({ update: s.updateRecurringCost, end: s.endRecurringCost })))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      description: rc.description,
      amount: fromCents(rc.amount).toFixed(2).replace('.', ','),
      dueDay: String(rc.dueDay),
      dueMonth: String(rc.frequency === 'anual' ? rc.dueMonth : Number(currentYearMonth().slice(5, 7))),
      frequency: rc.frequency,
      paymentMethod: (rc.paymentMethod ?? 'pix') as PaymentMethod,
    },
  })
  const [paymentMethod, frequency] = useWatch({ control, name: ['paymentMethod', 'frequency'] })
  const yearly = frequency === 'anual'
  // Dividir parte da próxima ocorrência ainda não paga (mensal: 12 meses dali em diante).
  const signedIn = useAuthStore((s) => s.status === 'signed_in')
  const next = useFinanceStore((s) =>
    s.transactions
      .filter((t) => t.recurringCostId === rc.id && t.status !== 'pago')
      .reduce<(typeof s.transactions)[number] | undefined>((min, t) => (!min || t.dueDate < min.dueDate ? t : min), undefined),
  )
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        const base = {
          ...rc,
          description: v.description,
          amount: cents(v.amount),
          dueDay: Number(v.dueDay),
          paymentMethod: rc.type === 'receita' ? null : v.paymentMethod,
        }
        update(v.frequency === 'anual' ? { ...base, frequency: 'anual', dueMonth: Number(v.dueMonth) } : { ...base, frequency: 'mensal' })
        onDone()
      })}
    >
      <div className={bodyClass}>
        <div className="flex flex-col gap-2">
          <Label>Repete</Label>
          <Choices
            label="Repete"
            value={frequency}
            onChange={(v) => setValue('frequency', v)}
            options={[
              { value: 'mensal', label: 'Todo mês' },
              { value: 'anual', label: 'Todo ano' },
            ]}
          />
        </div>
        <Field id="rc-desc" label="Descrição" error={e.description?.message}>
          <Input id="rc-desc" aria-invalid={!!e.description} {...register('description')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="rc-amount" label={yearly ? 'Valor no ano' : 'Valor por mês'} error={e.amount?.message}>
            <Affix before="R$">
              <Input id="rc-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
          <Field id="rc-day" label="Vence no dia" error={e.dueDay?.message}>
            <Input id="rc-day" inputMode="numeric" aria-invalid={!!e.dueDay} {...register('dueDay')} />
          </Field>
        </div>
        {yearly && (
          <Field id="rc-month" label="Mês do vencimento">
            <select
              id="rc-month"
              className="h-11 rounded-xl border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register('dueMonth')}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        )}
        {rc.type === 'despesa' && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <Label>Pagamento</Label>
            <PaymentSelect value={paymentMethod} onChange={(v) => setValue('paymentMethod', v)} />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          A mudança vale do mês atual em diante, nos meses ainda não pagos. O que já foi pago continua igual.
        </p>
        {next && canShareExisting(next, signedIn) && <ShareExisting transaction={next} />}
      </div>
      {confirmDelete ? (
        <div className="flex flex-col gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-sm text-muted-foreground">Para de repetir e apaga os próximos meses ainda não pagos. Pagamentos já feitos ficam em Lançamentos.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="expense"
              className="flex-1"
              onClick={() => {
                end(rc.id)
                onDone()
              }}
            >
              Excluir conta fixa
            </Button>
          </div>
        </div>
      ) : (
        <FormActions
          submitLabel="Salvar"
          extra={
            <Button type="button" variant="outline" size="icon" className="text-expense" aria-label="Excluir conta fixa" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
            </Button>
          }
        />
      )}
    </form>
  )
}

/** Editar ou excluir um gasto fixo (mensal ou anual). */
export function RecurringDialog({ rc, onClose }: { rc: RecurringCost | null; onClose: () => void }) {
  return (
    <Dialog open={!!rc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar gasto fixo</DialogTitle>
          <DialogDescription>{rc?.description}</DialogDescription>
        </DialogHeader>
        {rc && <RecurringForm key={rc.id} rc={rc} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

const schedule = (rc: RecurringCost) =>
  rc.frequency === 'mensal' ? `todo dia ${rc.dueDay}` : `todo ano, ${rc.dueDay} de ${MONTHS[rc.dueMonth - 1]}`

/** Lista de fixos em que cada linha abre a edição. */
export function RecurringRows({ items }: { items: RecurringCost[] }) {
  const [editing, setEditing] = useState<RecurringCost | null>(null)
  return (
    <>
      <ul className="divide-y">
        {items.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setEditing(r)}
              aria-label={`Editar ${r.frequency === 'anual' ? 'gasto anual' : 'conta fixa'} ${r.description}`}
              className="flex w-full items-center gap-3 py-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.description}</span>
                <span className="block text-xs text-muted-foreground">{schedule(r)}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">{formatMoney(r.amount)}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <RecurringDialog rc={editing} onClose={() => setEditing(null)} />
    </>
  )
}
