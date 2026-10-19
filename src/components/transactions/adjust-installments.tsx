import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Affix } from '@/components/ui/form-kit'
import { FieldError, Input, Label } from '@/components/ui/input'
import { formatMoney, fromCents, toCents } from '@/lib/money'
import { parseMoneyInput } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import type { Transaction } from '@/types/finance'

/**
 * Ajustar o parcelamento inteiro: valor da parcela, qual é a próxima a pagar e
 * quantas são. Fica fora do formulário do lançamento (botões `type="button"`).
 * Conta dividida não entra: quem ajusta é a conta compartilhada.
 */
export function AdjustInstallments({ transaction: t, onDone }: { transaction: Transaction; onDone: () => void }) {
  const adjust = useFinanceStore((s) => s.adjustInstallments)
  const series = useFinanceStore(
    useShallow((s) => {
      const id = t.installment?.installmentId
      return id ? s.transactions.filter((x) => x.installment?.installmentId === id) : []
    }),
  )
  const firstOpen = series.filter((x) => x.status !== 'pago').sort((a, b) => a.installment!.number - b.installment!.number)[0]
  const paidCount = series.filter((x) => x.status === 'pago').length
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(fromCents(firstOpen?.amount ?? t.amount).toFixed(2).replace('.', ','))
  const [next, setNext] = useState(String(firstOpen?.installment?.number ?? (t.installment?.number ?? 1)))
  const [total, setTotal] = useState(String(t.installment?.total ?? 1))
  const [error, setError] = useState('')
  if (!t.installment || t.sharedBillId) return null

  const value = toCents(parseMoneyInput(amount))
  const n = Number(next)
  const N = Number(total)
  const valid = value > 0 && Number.isInteger(n) && Number.isInteger(N) && N >= 1 && N <= 240 && n >= 1 && n <= N
  const remaining = valid ? N - n + 1 : 0

  const apply = () => {
    if (!(value > 0)) return setError('Informe o valor da parcela')
    if (!(Number.isInteger(N) && N >= 1 && N <= 240)) return setError('Total de 1 a 240 parcelas')
    if (!(Number.isInteger(n) && n >= 1 && n <= N)) return setError(`A próxima vai de 1 a ${N}`)
    adjust(t.installment!.installmentId, { amount: value, next: n, total: N })
    onDone()
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <SlidersHorizontal />
        Ajustar parcelamento
      </Button>
    )
  }

  const field = (id: string, label: string, v: string, set: (x: string) => void, props: { prefix?: string; numeric?: boolean; className?: string }) => (
    <div className={cn('flex flex-col gap-1.5', props.className)}>
      <Label htmlFor={id}>{label}</Label>
      <Affix before={props.prefix}>
        <Input
          id={id}
          inputMode={props.numeric ? 'numeric' : 'decimal'}
          className={props.prefix ? 'pl-10' : undefined}
          value={v}
          onChange={(e) => {
            set(props.numeric ? e.target.value.replace(/\D/g, '') : e.target.value)
            setError('')
          }}
        />
      </Affix>
    </div>
  )

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <p className="text-sm font-medium">Ajustar parcelamento</p>
      <div className="grid grid-cols-2 gap-2">
        {field('adj-amount', 'Valor da parcela', amount, setAmount, { prefix: 'R$', className: 'col-span-2' })}
        {field('adj-next', 'Próxima é a', next, setNext, { numeric: true })}
        {field('adj-total', 'De quantas', total, setTotal, { numeric: true })}
      </div>
      <p className="text-xs text-muted-foreground">
        {valid
          ? `Faltam ${remaining} ${remaining === 1 ? 'parcela' : 'parcelas'} de ${formatMoney(value)}: ${formatMoney(value * remaining)}. Termina na ${N}ª.`
          : 'Ex.: na 11ª de 36, preencha 11 e 36.'}
        {paidCount > 0 && ` As ${paidCount} já pagas ficam como estão.`}
      </p>
      <FieldError message={error} />
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
          Voltar
        </Button>
        <Button type="button" className="flex-1" onClick={apply}>
          Aplicar
        </Button>
      </div>
    </div>
  )
}
