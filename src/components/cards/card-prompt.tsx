import { CreditCard as CardIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/store/auth-store'
import { baseDescription, useFinanceStore } from '@/store/finance-store'
import type { Transaction } from '@/types/finance'

/** Criado agora há pouco (não veio de outro aparelho nem é antigo). */
const RECENT_MS = 2 * 60_000

const needsCard = (t: Transaction) =>
  t.type === 'despesa' && t.paymentMethod === 'cartao_credito' && !t.cardId && !t.sharedBillId && !t.id.startsWith('mock-')

/**
 * Com dois ou mais cartões, todo lançamento novo pago no cartão sem dizer qual
 * (Casa, Veículo, conta fixa...) pergunta "Qual cartão você usou?" logo depois
 * de salvar. Parcelas e meses criados juntos entram numa pergunta só.
 */
export function CardPrompt() {
  const ready = useAuthStore((s) => s.status === 'local' || (s.status === 'signed_in' && s.dataLoaded))
  const { transactions, cards, assignCard } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, cards: s.cards, assignCard: s.assignCard })),
  )
  const active = cards.filter((c) => c.active)
  const [pending, setPending] = useState<string[]>([])
  const known = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!ready) return
    // O que já existia ao abrir não pergunta.
    known.current = new Set(useFinanceStore.getState().transactions.map((t) => t.id))
    return useFinanceStore.subscribe((s, prev) => {
      if (s.transactions === prev.transactions || !known.current) return
      const seen = known.current
      const fresh = s.transactions.filter((t) => !seen.has(t.id))
      for (const t of fresh) seen.add(t.id)
      if (s.cards.filter((c) => c.active).length < 2) return
      const now = Date.now()
      const ask = fresh.filter((t) => needsCard(t) && now - new Date(t.createdAt).getTime() < RECENT_MS).map((t) => t.id)
      if (ask.length) setPending((p) => [...p, ...ask])
    })
  }, [ready])

  // Só os que continuam sem cartão (podem ter sido atribuídos em outro lugar).
  const items = transactions.filter((t) => pending.includes(t.id) && !t.cardId)
  const open = items.length > 0 && active.length >= 2
  const first = items[0]
  const close = () => setPending([])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      {/* Sem foco automático: o primeiro cartão pareceria já escolhido. */}
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Qual cartão você usou?</DialogTitle>
          <DialogDescription>
            {first ? `${baseDescription(first)} · ${formatMoney(first.amount)}` : ''}
            {items.length > 1 && ` · e mais ${items.length - 1} ${items.length === 2 ? 'lançamento' : 'lançamentos'} (parcelas ou meses)`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {active.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                assignCard(
                  items.map((t) => t.id),
                  c.id,
                )
                close()
              }}
              className="flex h-14 items-center gap-3 rounded-xl border px-4 text-left text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid h-8 w-11 shrink-0 place-items-center rounded-md text-white" style={{ background: c.color }}>
                <CardIcon className="size-4" />
              </span>
              <span className="flex-1">
                {c.name}
                {c.last4 && <span className="text-muted-foreground"> •••• {c.last4}</span>}
              </span>
            </button>
          ))}
          <Button variant="ghost" onClick={close}>
            Depois
          </Button>
          <p className="text-center text-xs text-muted-foreground">Sem escolher, fica em Cartões &gt; "sem cartão definido".</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
