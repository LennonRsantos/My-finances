import { CircleCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUIStore } from '@/store/ui-store'
import { TransactionForm } from './transaction-form'

export function TransactionDialog() {
  const open = useUIStore((s) => s.transactionDialogOpen)
  const setOpen = useUIStore((s) => s.setTransactionDialogOpen)
  const initialType = useUIStore((s) => s.transactionDialogType)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(id)
  }, [toast])

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => setOpen(o)}>
        <DialogContent aria-describedby="tx-desc">
          <DialogHeader>
            <DialogTitle>Novo lançamento</DialogTitle>
            <DialogDescription id="tx-desc">Registre um gasto, receita ou compra parcelada.</DialogDescription>
          </DialogHeader>
          <TransactionForm
            key={initialType}
            initialType={initialType}
            onCancel={() => setOpen(false)}
            onSuccess={(msg) => {
              setOpen(false)
              setToast(msg)
            }}
          />
        </DialogContent>
      </Dialog>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-6">
        {toast && (
          <div className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm text-background shadow-lg">
            <CircleCheck className="size-4 text-income" />
            {toast}
          </div>
        )}
      </div>
    </>
  )
}
