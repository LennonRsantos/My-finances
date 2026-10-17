import { Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cancelSharedBill } from '@/lib/shared-cloud'
import { reportSyncError } from '@/store/auth-store'
import { useFinanceStore } from '@/store/finance-store'
import { useSharedStore } from '@/store/shared-store'
import type { MaintenanceReminder } from '@/types/finance'

/**
 * Desfaz a última vez marcada como feita: volta km e data e apaga o gasto
 * lançado junto. Com custo dividido, pede confirmação e cancela para os dois.
 */
export function UndoReminderButton({ reminder }: { reminder: MaintenanceReminder }) {
  const undo = useFinanceStore((s) => s.undoReminder)
  const billId = reminder.undo?.sharedBillId
  const bill = useSharedStore((s) => (billId ? s.bills.find((b) => b.id === billId) : undefined))
  const activeBill = bill && (bill.status === 'PENDING' || bill.status === 'ACCEPTED') ? bill : undefined
  const [confirming, setConfirming] = useState(false)
  if (!reminder.undo) return null

  const run = () => {
    if (activeBill && !confirming) return setConfirming(true)
    if (activeBill) cancelSharedBill(activeBill).catch(reportSyncError)
    undo(reminder.id)
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={run}
      onBlur={() => setConfirming(false)}
      aria-label={confirming ? `Confirmar: desfazer ${reminder.name} e cancelar a divisão` : `Desfazer ${reminder.name}`}
    >
      <Undo2 />
      {confirming ? 'Cancelar divisão?' : 'Desfazer'}
    </Button>
  )
}
