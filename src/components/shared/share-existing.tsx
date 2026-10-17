import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SHARED_FIXED_MONTHS, ShareFields, fixedShareNote, sendShareInvite, useShare, yearlyShareNote } from '@/components/shared/share-fields'
import { Button } from '@/components/ui/button'
import { baseDescription, useFinanceStore } from '@/store/finance-store'
import type { SharedBillReplaces, Transaction } from '@/types/finance'

/** Dá para dividir despesa pendente que ainda não é compartilhada (abastecimento fica fora: perderia litros e km). */
export const canShareExisting = (t: Transaction, signedIn: boolean) =>
  signedIn && t.type === 'despesa' && !t.sharedBillId && !t.fuel && t.status !== 'pago'

/**
 * Dividir um lançamento já feito. O convite leva os ids dos originais; quando a
 * pessoa aceita, eles dão lugar às parcelas divididas (ver `replacedBy`).
 */
export function ShareExisting({ transaction: t }: { transaction: Transaction }) {
  const { transactions, recurringCosts } = useFinanceStore(useShallow((s) => ({ transactions: s.transactions, recurringCosts: s.recurringCosts })))
  const { share, setShare } = useShare()
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<{ handle: string; auto: boolean } | null>(null)

  const plan = useMemo(() => {
    const open = (x: Transaction) => x.status !== 'pago' && !x.sharedBillId
    if (t.installment) {
      // Parcelas que faltam da série, a partir desta.
      const sid = t.installment.installmentId
      const from = t.installment.number
      const rest = transactions
        .filter((x) => x.installment?.installmentId === sid && x.installment.number >= from && open(x))
        .sort((a, b) => a.installment!.number - b.installment!.number)
      return {
        total: rest.reduce((sum, x) => sum + x.amount, 0),
        installments: rest.length,
        firstDueDate: rest[0]?.dueDate ?? t.dueDate,
        replaces: { transactionIds: rest.map((x) => x.id) } as SharedBillReplaces,
        note: rest.length > 1 ? `O convite cobre as ${rest.length} parcelas que faltam.` : undefined,
      }
    }
    const rc = t.recurringCostId ? recurringCosts.find((r) => r.id === t.recurringCostId) : undefined
    if (rc?.frequency === 'mensal') {
      // Fixo mensal: 12 meses a partir deste; o fixo para de gerar quando aceito.
      const ids = transactions.filter((x) => x.recurringCostId === rc.id && x.dueDate >= t.dueDate && open(x)).map((x) => x.id)
      return {
        total: t.amount * SHARED_FIXED_MONTHS,
        installments: SHARED_FIXED_MONTHS,
        firstDueDate: t.dueDate,
        replaces: { transactionIds: ids, recurringCostId: rc.id },
        note: fixedShareNote,
      }
    }
    return {
      total: t.amount,
      installments: 1,
      firstDueDate: t.dueDate,
      replaces: { transactionIds: [t.id] },
      note: rc ? yearlyShareNote : undefined,
    }
  }, [t, transactions, recurringCosts])

  if (sentTo) {
    return (
      <p role="status" className="rounded-xl border p-3 text-sm">
        {sentTo.auto ? 'Conta dividida com ' : 'Convite enviado para '}
        <span className="font-medium">@{sentTo.handle}</span>.{' '}
        {sentTo.auto
          ? 'Aceita automaticamente: este lançamento já vai dar lugar às parcelas divididas.'
          : 'Este lançamento é trocado pelas parcelas divididas quando a pessoa aceitar.'}
      </p>
    )
  }

  const send = async () => {
    setSending(true)
    const result = await sendShareInvite(share, {
      title: baseDescription(t),
      totalAmount: plan.total,
      installments: plan.installments,
      firstDueDate: plan.firstDueDate,
      categoryId: t.categoryId,
      subcategoryId: t.subcategoryId,
      vehicleId: t.vehicleId ?? null,
      replaces: plan.replaces,
    })
    setSending(false)
    if ('error' in result) return setShare({ ...share, error: result.error })
    setSentTo(result)
  }

  return (
    <div className="flex flex-col gap-2">
      <ShareFields share={share} onChange={setShare} label="Dividir com alguém" note={plan.note} />
      {share.on && (
        <Button type="button" variant="outline" disabled={sending} onClick={send}>
          {sending ? 'Enviando…' : 'Enviar convite'}
        </Button>
      )}
    </div>
  )
}
