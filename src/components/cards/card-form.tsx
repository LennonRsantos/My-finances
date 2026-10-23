import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Affix, bodyClass, Field, FormActions, formClass } from '@/components/ui/form-kit'
import { Input, Label } from '@/components/ui/input'
import { CARD_COLORS } from '@/lib/cards'
import { cents, nowISO, optionalMoney } from '@/lib/form-fields'
import { fromCents } from '@/lib/money'
import { cn, createId } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import type { CreditCard, HexColor } from '@/types/finance'

const day = z.string().trim().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 31, 'Dia de 1 a 31')

const schema = z.object({
  name: z.string().trim().min(2, 'Dê um nome').max(30, 'Máximo de 30 caracteres'),
  bank: z.string().trim().max(30),
  last4: z.string().trim().refine((v) => v === '' || /^\d{4}$/.test(v), 'Os 4 últimos números'),
  closingDay: day,
  dueDay: day,
  limit: optionalMoney,
})

/** Cadastro e edição do cartão: fechamento e vencimento definem em que fatura cai cada compra. */
export function CardForm({ card, onDone }: { card?: CreditCard; onDone: (saved?: CreditCard) => void }) {
  const { saveCard, removeCard } = useFinanceStore(useShallow((s) => ({ saveCard: s.saveCard, removeCard: s.removeCard })))
  // Cartão novo: primeira cor ainda não usada, para distinguir dos outros.
  const usedColors = useFinanceStore(useShallow((s) => s.cards.filter((c) => c.active).map((c) => c.color)))
  const [color, setColor] = useState<HexColor>(() => card?.color ?? CARD_COLORS.find((c) => !usedColors.includes(c)) ?? CARD_COLORS[0])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { register, handleSubmit, control, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: card?.name ?? '',
      bank: card?.bank ?? '',
      last4: card?.last4 ?? '',
      closingDay: card ? String(card.closingDay) : '',
      dueDay: card ? String(card.dueDay) : '',
      limit: card?.limit ? fromCents(card.limit).toFixed(2).replace('.', ',') : '',
    },
  })
  const [closingDay, dueDay] = useWatch({ control, name: ['closingDay', 'dueDay'] })
  const e = formState.errors

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit((v) => {
        const saved: CreditCard = {
          id: card?.id ?? createId(),
          name: v.name,
          bank: v.bank || null,
          last4: v.last4 || null,
          closingDay: Number(v.closingDay),
          dueDay: Number(v.dueDay),
          limit: v.limit ? cents(v.limit) : null,
          color,
          active: true,
          createdAt: card?.createdAt ?? nowISO(),
        }
        saveCard(saved)
        onDone(saved)
      })}
    >
      <div className={bodyClass}>
        <div className="grid grid-cols-2 gap-3">
          <Field id="cc-name" label="Nome" error={e.name?.message}>
            <Input id="cc-name" placeholder="Ex.: Nubank" aria-invalid={!!e.name} {...register('name')} />
          </Field>
          <Field id="cc-bank" label="Banco (opcional)">
            <Input id="cc-bank" placeholder="Ex.: Nu Pagamentos" {...register('bank')} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field id="cc-close" label="Fecha dia" error={e.closingDay?.message}>
            <Input id="cc-close" inputMode="numeric" aria-invalid={!!e.closingDay} {...register('closingDay')} />
          </Field>
          <Field id="cc-due" label="Vence dia" error={e.dueDay?.message}>
            <Input id="cc-due" inputMode="numeric" aria-invalid={!!e.dueDay} {...register('dueDay')} />
          </Field>
          <Field id="cc-last4" label="Final" error={e.last4?.message}>
            <Input id="cc-last4" inputMode="numeric" maxLength={4} placeholder="1234" aria-invalid={!!e.last4} {...register('last4')} />
          </Field>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          {/^\d+$/.test(closingDay) && /^\d+$/.test(dueDay)
            ? `Compras até o dia ${closingDay} entram na fatura do mês; depois dele, na do mês seguinte. Vence dia ${dueDay}.`
            : 'Veja no app do banco o dia em que a fatura fecha e o dia do vencimento.'}
        </p>
        <Field id="cc-limit" label="Limite (opcional)" error={e.limit?.message}>
          <Affix before="R$">
            <Input id="cc-limit" inputMode="decimal" className="pl-10" aria-invalid={!!e.limit} {...register('limit')} />
          </Affix>
        </Field>
        <div className="flex flex-col gap-2">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do cartão">
            {CARD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`Cor ${c}`}
                onClick={() => setColor(c)}
                className={cn('grid size-9 place-items-center rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-ring', color === c && 'ring-2 ring-foreground ring-offset-2 ring-offset-card')}
                style={{ background: c }}
              >
                {color === c && <Check className="size-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>
      {confirmDelete && card ? (
        <div className="flex flex-col gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-sm text-muted-foreground">As compras continuam em Lançamentos. Com compras lançadas, o cartão só sai da lista.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="expense"
              className="flex-1"
              onClick={() => {
                removeCard(card.id)
                onDone()
              }}
            >
              Excluir cartão
            </Button>
          </div>
        </div>
      ) : (
        <FormActions
          submitLabel={card ? 'Salvar' : 'Cadastrar cartão'}
          extra={
            card ? (
              <Button type="button" variant="outline" size="icon" className="text-expense" aria-label="Excluir cartão" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
              </Button>
            ) : undefined
          }
        />
      )}
    </form>
  )
}
