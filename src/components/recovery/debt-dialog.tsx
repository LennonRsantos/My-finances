import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { fromCents, toCents } from '@/lib/money'
import { parseMoneyInput } from '@/lib/schemas'
import { createId } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import type { Debt } from '@/types/finance'

const money = (min: number, msg: string) =>
  z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(parseMoneyInput(v)) && parseMoneyInput(v) >= min, msg)

const schema = z.object({
  creditorName: z.string().trim().min(1, 'Informe a dívida').max(40, 'Máximo de 40 caracteres'),
  balance: money(0.01, 'Informe o saldo devedor'),
  rate: money(0, 'Informe os juros (use 0 se não houver)'),
  minimum: money(0.01, 'Informe quanto paga por mês'),
})
type Values = z.infer<typeof schema>

const toText = (cents: number) => fromCents(cents).toFixed(2).replace('.', ',')

function DebtForm({ debt, onDone }: { debt?: Debt; onDone: () => void }) {
  const saveDebt = useFinanceStore((s) => s.saveDebt)
  const removeDebt = useFinanceStore((s) => s.removeDebt)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      creditorName: debt?.creditorName ?? '',
      balance: debt ? toText(debt.currentBalance) : '',
      rate: debt ? String(debt.monthlyInterestRate).replace('.', ',') : '',
      minimum: debt ? toText(debt.minimumPayment) : '',
    },
  })

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit((v) => {
        const now = new Date().toISOString()
        saveDebt({
          id: debt?.id ?? createId(),
          creditorName: v.creditorName,
          currentBalance: toCents(parseMoneyInput(v.balance)),
          monthlyInterestRate: parseMoneyInput(v.rate),
          minimumPayment: toCents(parseMoneyInput(v.minimum)),
          createdAt: debt?.createdAt ?? now,
        })
        onDone()
      })}
    >
      <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="debt-name">Dívida</Label>
          <Input id="debt-name" placeholder="Ex.: Cartão Nubank, Empréstimo Itaú" aria-invalid={!!errors.creditorName} {...register('creditorName')} />
          <FieldError message={errors.creditorName?.message} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="debt-balance">Quanto deve hoje</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
            <Input id="debt-balance" inputMode="decimal" className="pl-10" aria-invalid={!!errors.balance} {...register('balance')} />
          </div>
          <FieldError message={errors.balance?.message} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="debt-rate">Juros ao mês</Label>
            <div className="relative">
              <Input id="debt-rate" inputMode="decimal" placeholder="Ex.: 12,5" className="pr-9" aria-invalid={!!errors.rate} {...register('rate')} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
            <FieldError message={errors.rate?.message} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="debt-minimum">Paga por mês</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
              <Input id="debt-minimum" inputMode="decimal" className="pl-10" aria-invalid={!!errors.minimum} {...register('minimum')} />
            </div>
            <FieldError message={errors.minimum?.message} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Os juros estão no contrato, na fatura ou no app do banco (CET mensal). Rotativo do cartão e cheque especial costumam
          passar de 8% ao mês.
        </p>
      </div>
      <div className="flex gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {confirmDelete && debt ? (
          <>
            <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="expense"
              className="flex-[2]"
              onClick={() => {
                removeDebt(debt.id)
                onDone()
              }}
            >
              Confirmar exclusão
            </Button>
          </>
        ) : (
          <>
            {debt ? (
              <Button type="button" variant="outline" size="icon" className="text-expense" aria-label="Excluir" onClick={() => setConfirmDelete(true)}>
                <Trash2 />
              </Button>
            ) : (
              <DialogClose asChild>
                <Button type="button" variant="outline" className="flex-1">
                  Cancelar
                </Button>
              </DialogClose>
            )}
            <Button type="submit" className="flex-1">
              {debt ? 'Salvar' : 'Adicionar dívida'}
            </Button>
          </>
        )}
      </div>
    </form>
  )
}

/** `debt` undefined + `open` = nova dívida. */
export function DebtDialog({ open, debt, onClose }: { open: boolean; debt?: Debt; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{debt ? 'Editar dívida' : 'Nova dívida'}</DialogTitle>
          <DialogDescription>Cartão, empréstimo, cheque especial, acordo... tudo que cobra juros.</DialogDescription>
        </DialogHeader>
        {open && <DebtForm key={debt?.id ?? 'new'} debt={debt} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
