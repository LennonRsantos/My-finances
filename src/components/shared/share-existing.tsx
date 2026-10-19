import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SHARED_FIXED_MONTHS, ShareFields, fixedShareNote, sendShareInvite, useShare, yearlyShareNote } from '@/components/shared/share-fields'
import { Button } from '@/components/ui/button'
import { baseDescription, useFinanceStore } from '@/store/finance-store'
import type { SharedBillReplaces, Transaction } from '@/types/finance'

/**
 * Dá para dividir despesa ainda não compartilhada (abastecimento fica fora: perderia litros e km).
 * Paga só se avulsa: a pessoa reembolsa a parte dela.
 */
export const canShareExisting = (t: Transaction, signedIn: boolean) =>
  signedIn && t.type === 'despesa' && !t.sharedBillId && !t.fuel && (t.status !== 'pago' || (!t.installment && !t.recurringCostId))

/**
 * Dividir um lançamento já feito. O convite leva os ids dos originais; quando a
 * pessoa aceita, eles dão lugar às parcelas divididas (ver `replacedBy`).
 */
export function ShareExisting({ transaction: t }: { transaction: Transaction }) {
  const { transactions, recurringCosts, save } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, recurringCosts: s.recurringCosts, save: s.saveTransaction })),
  )
  const paid = t.status === 'pago' && !t.installment && !t.recurringCostId
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
        installmentOffset: (rest[0]?.installment?.number ?? from) - 1,
        installmentTotal: t.installment.total,
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
        recurring: true,
        note: fixedShareNote,
      }
    }
    if (paid) {
      // Já pago: fica como está; a pessoa lança o reembolso da parte dela para você.
      return { total: t.amount, installments: 1, firstDueDate: t.dueDate, replaces: null, creatorPaid: true, note: undefined }
    }
    return {
      total: t.amount,
      installments: 1,
      firstDueDate: t.dueDate,
      replaces: { transactionIds: [t.id] },
      note: rc ? yearlyShareNote : undefined,
    }
  }, [t, transactions, recurringCosts, paid])

  if (sentTo) {
    return (
      <p role="status" className="rounded-xl border p-3 text-sm">
        {sentTo.auto ? 'Conta dividida com ' : 'Convite enviado para '}
        <span className="font-medium">@{sentTo.handle}</span>.{' '}
        {paid
          ? sentTo.auto
            ? 'Aceita automaticamente: o reembolso da parte dela já entrou para ela.'
            : 'Quando a pessoa aceitar, o reembolso da parte dela entra para ela.'
          : sentTo.auto
            ? 'Aceita automaticamente: este lançamento já vai dar lugar às parcelas divididas.'
            : 'Este lançamento é trocado pelas parcelas divididas quando a pessoa aceitar.'}
      </p>
    )
  }

  const send = async () => {
    setSending(true)
    const result = await sendShareInvite(paid ? { ...share, payerType: 'SINGLE_PAYER' } : share, {
      title: baseDescription(t),
      totalAmount: plan.total,
      installments: plan.installments,
      installmentOffset: 'installmentOffset' in plan ? plan.installmentOffset : null,
      installmentTotal: 'installmentTotal' in plan ? plan.installmentTotal : null,
      recurring: 'recurring' in plan ? plan.recurring : false,
      creatorPaid: 'creatorPaid' in plan ? plan.creatorPaid : false,
      firstDueDate: plan.firstDueDate,
      categoryId: t.categoryId,
      subcategoryId: t.subcategoryId,
      vehicleId: t.vehicleId ?? null,
      replaces: plan.replaces,
    })
    setSending(false)
    if ('error' in result) return setShare({ ...share, error: result.error })
    // Pago: o próprio lançamento fica ligado à conta (selo e não divide de novo).
    if (paid) save({ ...t, sharedBillId: result.id, sharedWith: `@${result.handle}`, sharedVersion: 1, sharedSuspended: false })
    setSentTo(result)
  }

  return (
    <div className="flex flex-col gap-2">
      <ShareFields share={share} onChange={setShare} label="Dividir com alguém" note={plan.note} paidByMe={paid} />
      {share.on && (
        <Button type="button" variant="outline" disabled={sending} onClick={send}>
          {sending ? 'Enviando…' : 'Enviar convite'}
        </Button>
      )}
    </div>
  )
}
