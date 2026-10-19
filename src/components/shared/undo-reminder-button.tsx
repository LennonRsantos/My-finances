import { CheckCircle2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cancelSharedBill } from '@/lib/shared-cloud'
import { cn } from '@/lib/utils'
import { reportSyncError } from '@/store/auth-store'
import { useFinanceStore } from '@/store/finance-store'
import { useSharedStore } from '@/store/shared-store'
import type { MaintenanceReminder } from '@/types/finance'

/**
 * Desfazer a última vez marcada como feita: volta km e data e apaga o gasto
 * lançado junto. Com custo dividido, pede confirmação e cancela para os dois.
 */
function useUndoReminder(reminder: MaintenanceReminder) {
  const undo = useFinanceStore((s) => s.undoReminder)
  // Convite enviado ao marcar, ou divisão feita depois no gasto lançado junto.
  const txBillId = useFinanceStore((s) => {
    const id = reminder.undo?.transactionId
    return id ? (s.transactions.find((t) => t.id === id)?.sharedBillId ?? null) : null
  })
  const billId = reminder.undo?.sharedBillId ?? txBillId
  const bill = useSharedStore((s) => (billId ? s.bills.find((b) => b.id === billId) : undefined))
  const activeBill = bill && (bill.status === 'PENDING' || bill.status === 'ACCEPTED') ? bill : undefined
  const [confirming, setConfirming] = useState(false)
  const run = () => {
    if (activeBill && !confirming) return setConfirming(true)
    if (activeBill) cancelSharedBill(activeBill).catch(reportSyncError)
    undo(reminder.id)
    setConfirming(false)
  }
  return { run, confirming, cancelConfirm: () => setConfirming(false) }
}

export function UndoReminderButton({ reminder }: { reminder: MaintenanceReminder }) {
  const { run, confirming, cancelConfirm } = useUndoReminder(reminder)
  if (!reminder.undo) return null
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={run}
      onBlur={cancelConfirm}
      aria-label={confirming ? `Confirmar: desfazer ${reminder.name} e cancelar a divisão` : `Desfazer ${reminder.name}`}
    >
      <Undo2 />
      {confirming ? 'Cancelar divisão?' : 'Desfazer'}
    </Button>
  )
}

/** Manutenção concluída e em dia: selo verde "Feita"; um toque desfaz a conclusão. */
export function DoneUndoButton({ reminder }: { reminder: MaintenanceReminder }) {
  const { run, confirming, cancelConfirm } = useUndoReminder(reminder)
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={run}
      onBlur={cancelConfirm}
      aria-pressed
      aria-label={confirming ? `Confirmar: desfazer ${reminder.name} e cancelar a divisão` : `${reminder.name} feita. Tocar para desfazer`}
      title="Tocar para desfazer"
      className={cn('border-income/40 bg-income-soft text-income hover:bg-income-soft hover:text-income', confirming && 'border-expense/40 bg-transparent text-expense')}
    >
      {confirming ? <Undo2 /> : <CheckCircle2 />}
      {confirming ? 'Cancelar divisão?' : 'Feita'}
    </Button>
  )
}
