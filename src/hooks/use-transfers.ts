import { useEffect, useRef } from 'react'
import { todayISO } from '@/lib/dates'
import { writeTransfers } from '@/lib/shared-cloud'
import { desiredTransfers, diffTransfers } from '@/lib/transfers'
import { reportSyncError, useAuthStore } from '@/store/auth-store'
import { useFinanceStore } from '@/store/finance-store'
import { useSharedStore } from '@/store/shared-store'

/**
 * Mantém os espelhos de "Enviar para @usuário" iguais aos meus lançamentos:
 * criar, trocar a pessoa, mudar valor/data, marcar enviado e excluir chegam
 * sozinhos para quem recebe.
 */
export function useTransferSync() {
  const user = useAuthStore((s) => (s.status === 'signed_in' && s.dataLoaded ? s.user : null))
  const transactions = useFinanceStore((s) => s.transactions)
  const { outgoing, transfersLoaded, handle } = useSharedStore()
  // Mesma diferença não é reenviada (se a gravação falhar, não fica em laço).
  const last = useRef('')

  useEffect(() => {
    if (!user || !transfersLoaded) return
    const desired = desiredTransfers(transactions, { uid: user.uid, handle, name: user.name }, todayISO())
    const { upserts, deletes } = diffTransfers(desired, outgoing)
    if (!upserts.length && !deletes.length) return
    const key = JSON.stringify([upserts, deletes])
    if (key === last.current) return
    last.current = key
    writeTransfers(upserts, deletes).catch(reportSyncError)
  }, [user, transactions, outgoing, transfersLoaded, handle])
}
