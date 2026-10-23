import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addMonthsISO, parseDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import type { Transaction } from '@/types/finance'

const monthShort = (iso: string) => format(parseDate(iso as Parameters<typeof parseDate>[0]), 'MMM/yy', { locale: ptBR })

/**
 * "Parcela [5] de [10]" editável na própria parcela. Mudar o número só
 * renumera a série (esta passa a ser a 6ª e termina um mês antes); valores e
 * datas ficam. Mudar o total cria ou tira parcelas no fim. Fica dentro do
 * formulário do lançamento: botões `type="button"`. Conta dividida não entra.
 */
export function InstallmentProgressEditor({ transaction: t, onDone }: { transaction: Transaction; onDone: () => void }) {
  const adjust = useFinanceStore((s) => s.adjustInstallments)
  const series = useFinanceStore(
    useShallow((s) => {
      const id = t.installment?.installmentId
      return id ? s.transactions.filter((x) => x.installment?.installmentId === id) : []
    }),
  )
  const [number, setNumber] = useState(String(t.installment?.number ?? 1))
  const [total, setTotal] = useState(String(t.installment?.total ?? 1))
  if (!t.installment) return null

  const byNumber = [...series].sort((a, b) => a.installment!.number - b.installment!.number)
  const open = byNumber.filter((x) => x.status !== 'pago')
  const paidCount = byNumber.length - open.length
  const firstOpen = open[0]
  const lastPaid = [...byNumber].reverse().find((x) => x.status === 'pago')

  const n = Number(number)
  const N = Number(total)
  const changed = n !== t.installment.number || N !== t.installment.total
  // Tudo anda junto: a próxima pendente se move tanto quanto esta parcela.
  const delta = n - t.installment.number
  const next = (firstOpen?.installment!.number ?? (lastPaid?.installment!.number ?? 0) + 1) + delta
  const remaining = N - next + 1
  const error = !changed
    ? ''
    : !(Number.isInteger(N) && N >= 1 && N <= 240)
      ? 'O total vai de 1 a 240 parcelas.'
      : !(Number.isInteger(n) && n >= 1 && n <= N)
        ? `A parcela vai de 1 a ${N}.`
        : next < paidCount + 1
          ? `Já há ${paidCount} ${paidCount === 1 ? 'paga' : 'pagas'}: a próxima a pagar precisa ser a ${paidCount + 1}ª ou depois.`
          : ''
  const start = firstOpen?.dueDate ?? (lastPaid ? addMonthsISO(lastPaid.dueDate, 1) : t.dueDate)
  const preview =
    remaining <= 0 ? 'Fica quitado: as parcelas pendentes saem.' : `Faltam ${remaining} ${remaining === 1 ? 'parcela' : 'parcelas'}, termina em ${monthShort(addMonthsISO(start, remaining - 1))}.`

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 3)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <label htmlFor="inst-number">Parcela</label>
        <Input
          id="inst-number"
          inputMode="numeric"
          aria-label="Número desta parcela"
          className="h-9 w-14 px-2 text-center tabular-nums"
          value={number}
          onChange={(e) => setNumber(digits(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        />
        <label htmlFor="inst-total">de</label>
        <Input
          id="inst-total"
          inputMode="numeric"
          aria-label="Total de parcelas"
          className="h-9 w-14 px-2 text-center tabular-nums"
          value={total}
          onChange={(e) => setTotal(digits(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        />
      </div>
      {changed && (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-2.5">
          <p role={error ? 'alert' : 'status'} className={cn('text-xs', error ? 'text-expense' : 'text-muted-foreground')}>
            {error || `Esta vira a ${n}ª de ${N}. ${preview} Valores e datas continuam.`}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                setNumber(String(t.installment!.number))
                setTotal(String(t.installment!.total))
              }}
            >
              Desfazer
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={!!error}
              onClick={() => {
                adjust(t.installment!.installmentId, { next, total: N })
                onDone()
              }}
            >
              Salvar andamento
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
