import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Affix, bodyClass, Choices, Field, FormActions, formClass } from '@/components/ui/form-kit'
import { Input, Label } from '@/components/ui/input'
import { formatDateShort, todayISO } from '@/lib/dates'
import { cents, date, money, nowISO, optionalMoney } from '@/lib/form-fields'
import { goalProgress } from '@/lib/goals'
import { formatMoney, fromCents } from '@/lib/money'
import { cn, createId } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import type { Goal, ISODate } from '@/types/finance'

export type GoalDialogState = { kind: 'goal'; goal?: Goal } | { kind: 'deposit'; goal: Goal } | null

const moneyText = (c: number) => fromCents(c).toFixed(2).replace('.', ',')
const optionalDate = z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Data inválida')

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const goalSchema = z.object({
  name: z.string().trim().min(2, 'Dê um nome').max(40, 'Máximo de 40 caracteres'),
  target: money('Informe quanto quer juntar'),
  deadline: optionalDate,
  saved: optionalMoney,
})

function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
  const { saveGoal, removeGoal, removeGoalDeposit } = useFinanceStore(
    useShallow((s) => ({ saveGoal: s.saveGoal, removeGoal: s.removeGoal, removeGoalDeposit: s.removeGoalDeposit })),
  )
  const live = useFinanceStore((s) => (goal ? s.goals.find((g) => g.id === goal.id) : undefined)) ?? goal
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { register, handleSubmit, control, formState } = useForm({
    resolver: zodResolver(goalSchema),
    defaultValues: { name: goal?.name ?? '', target: goal ? moneyText(goal.target) : '', deadline: goal?.deadline ?? '', saved: '' },
  })
  const [target, deadline, saved] = useWatch({ control, name: ['target', 'deadline', 'saved'] })
  const e = formState.errors
  // Prévia ao vivo de quanto guardar por mês.
  const preview =
    cents(target) > 0
      ? goalProgress(
          {
            id: 'preview',
            name: '',
            target: cents(target),
            deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? (deadline as ISODate) : null,
            deposits: goal?.deposits ?? (cents(saved) > 0 ? [{ id: 'x', date: todayISO(), amount: cents(saved), initial: true }] : []),
            createdAt: '',
          },
          todayISO(),
        )
      : null

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        const first = !goal && v.saved && cents(v.saved) > 0 ? [{ id: createId(), date: todayISO(), amount: cents(v.saved), initial: true }] : []
        saveGoal({
          id: goal?.id ?? createId(),
          name: v.name,
          target: cents(v.target),
          deadline: v.deadline ? (v.deadline as ISODate) : null,
          deposits: live?.deposits ?? first,
          createdAt: goal?.createdAt ?? nowISO(),
        })
        onDone()
      })}
    >
      <div className={bodyClass}>
        <Field id="g-name" label="Para quê" error={e.name?.message}>
          <Input id="g-name" placeholder="Ex.: Viagem, reserva de emergência" aria-invalid={!!e.name} {...register('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="g-target" label="Quanto juntar" error={e.target?.message}>
            <Affix before="R$">
              <Input id="g-target" inputMode="decimal" className="pl-10" aria-invalid={!!e.target} {...register('target')} />
            </Affix>
          </Field>
          <Field id="g-deadline" label="Até (opcional)" error={e.deadline?.message}>
            <Input id="g-deadline" type="date" aria-invalid={!!e.deadline} {...register('deadline')} />
          </Field>
        </div>
        {!goal && (
          <Field id="g-saved" label="Já tenho guardado (opcional)" error={e.saved?.message}>
            <Affix before="R$">
              <Input id="g-saved" inputMode="decimal" className="pl-10" aria-invalid={!!e.saved} {...register('saved')} />
            </Affix>
          </Field>
        )}
        {preview && (
          <p role="status" className="rounded-xl bg-info-soft px-3 py-2 text-sm text-info">
            {preview.status === 'concluida'
              ? 'Você já tem o valor todo.'
              : preview.perMonth !== null && preview.monthsLeft
                ? `Guarde ${formatMoney(preview.perMonth)} por mês durante ${preview.monthsLeft} ${preview.monthsLeft === 1 ? 'mês' : 'meses'}.`
                : preview.status === 'vencida'
                  ? 'O prazo já passou: escolha uma data futura.'
                  : `Faltam ${formatMoney(preview.remaining)}. Com um prazo, o app calcula quanto guardar por mês.`}
          </p>
        )}

        {live && live.deposits.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label>Histórico</Label>
            <ul className="flex flex-col divide-y rounded-xl border text-sm">
              {[...live.deposits]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-1.5">
                    <span className="flex-1">
                      {formatDateShort(d.date)}
                      {d.initial && <span className="text-muted-foreground"> · já guardado</span>}
                    </span>
                    <span className={cn('tabular-nums', d.amount < 0 ? 'text-expense' : 'text-income')}>
                      {d.amount < 0 ? '−' : '+'} {formatMoney(Math.abs(d.amount))}
                    </span>
                    <Button type="button" variant="ghost" size="icon" aria-label="Tirar do histórico" onClick={() => removeGoalDeposit(live.id, d.id)}>
                      <X />
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
      {confirmDelete && goal ? (
        <div className="flex flex-col gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-sm text-muted-foreground">A meta e o histórico somem. Seus lançamentos não mudam.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="expense"
              className="flex-1"
              onClick={() => {
                removeGoal(goal.id)
                onDone()
              }}
            >
              Excluir meta
            </Button>
          </div>
        </div>
      ) : (
        <FormActions
          submitLabel={goal ? 'Salvar' : 'Criar meta'}
          extra={
            goal ? (
              <Button type="button" variant="outline" size="icon" className="text-expense" aria-label="Excluir meta" onClick={() => setConfirmDelete(true)}>
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
// Guardar / retirar
// ---------------------------------------------------------------------------

const depositSchema = z.object({ amount: money('Informe o valor'), date, kind: z.enum(['guardar', 'retirar']) })

function DepositForm({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const add = useFinanceStore((s) => s.addGoalDeposit)
  const p = goalProgress(goal, todayISO())
  const suggestion = p.perMonth && p.perMonth > p.savedThisMonth ? p.perMonth - Math.max(0, p.savedThisMonth) : null
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(depositSchema),
    defaultValues: { amount: suggestion ? moneyText(suggestion) : '', date: todayISO(), kind: 'guardar' as 'guardar' | 'retirar' },
  })
  const kind = useWatch({ control, name: 'kind' })
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        const value = cents(v.amount)
        add(goal.id, { id: createId(), date: v.date as ISODate, amount: v.kind === 'retirar' ? -value : value })
        onDone()
      })}
    >
      <div className={bodyClass}>
        <Choices
          label="Guardar ou retirar"
          value={kind}
          onChange={(x) => setValue('kind', x)}
          options={[
            { value: 'guardar', label: 'Guardar' },
            { value: 'retirar', label: 'Retirar' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field id="d-amount" label="Valor" error={e.amount?.message}>
            <Affix before="R$">
              <Input id="d-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
          <Field id="d-date" label="Data" error={e.date?.message}>
            <Input id="d-date" type="date" aria-invalid={!!e.date} {...register('date')} />
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          {kind === 'guardar'
            ? suggestion
              ? `Falta ${formatMoney(suggestion)} neste mês para ficar no ritmo.`
              : `Já tem ${formatMoney(p.saved)} de ${formatMoney(goal.target)}.`
            : `Na meta hoje: ${formatMoney(p.saved)}.`}{' '}
          Só registra na meta; não entra em Lançamentos.
        </p>
      </div>
      <FormActions submitLabel={kind === 'guardar' ? 'Guardar' : 'Retirar'} />
    </form>
  )
}

export function GoalDialogs({ state, onClose }: { state: GoalDialogState; onClose: () => void }) {
  const title = !state ? '' : state.kind === 'goal' ? (state.goal ? 'Editar meta' : 'Nova meta') : state.goal.name
  const description = !state ? '' : state.kind === 'goal' ? 'Um objetivo para juntar dinheiro.' : 'Dinheiro separado para esta meta.'
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {state?.kind === 'goal' && <GoalForm key={state.goal?.id ?? 'new'} goal={state.goal} onDone={onClose} />}
        {state?.kind === 'deposit' && <DepositForm key={state.goal.id} goal={state.goal} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
