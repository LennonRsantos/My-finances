import { Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Label } from '@/components/ui/input'
import { Input } from '@/components/ui/input'
import { Badge, Switch } from '@/components/ui/misc'
import { normalizeHandle, partnerOf, sharedRole, type SharedRole } from '@/lib/shared'
import { createSharedBill, lookupHandle, type NewSharedBill } from '@/lib/shared-cloud'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'
import { useSharedStore } from '@/store/shared-store'
import type { SharedPayerType, Transaction } from '@/types/finance'

export interface ShareState {
  on: boolean
  handle: string
  percent: string
  payerType: SharedPayerType
  error: string
}

/** Conta fixa mensal dividida vira convite destes meses; depois, divide de novo. */
export const SHARED_FIXED_MONTHS = 12
export const fixedShareNote = 'Conta fixa: repete todo mês, sem data para acabar. Cancele quando quiser parar.'
export const yearlyShareNote = 'Conta anual: o convite vale só para esta vez.'

export const emptyShare: ShareState = { on: false, handle: '', percent: '50', payerType: 'SPLIT_PAYMENT', error: '' }

/** Estado dos campos de divisão + se dá para dividir (login e @ escolhido). */
export function useShare() {
  const [share, setShare] = useState<ShareState>(emptyShare)
  const signedIn = useAuthStore((s) => s.status === 'signed_in')
  return { share, setShare, available: signedIn, reset: () => setShare(emptyShare) }
}

type Bill = Omit<NewSharedBill, 'creator' | 'invitee' | 'inviteePercent' | 'payerType'>

/**
 * Valida o @ e envia o convite. Devolve a mensagem de erro (mostrada nos
 * campos) ou `null` quando o convite foi criado.
 */
export async function sendShareInvite(share: ShareState, bill: Bill): Promise<{ error: string } | { id: string; handle: string; auto: boolean }> {
  const user = useAuthStore.getState().user
  const myHandle = useSharedStore.getState().handle
  if (!user || !myHandle) return { error: 'Escolha seu @ em Configurações > Conta antes de dividir.' }
  const handle = normalizeHandle(share.handle)
  const percent = Number(share.percent)
  if (!handle) return { error: 'Informe o @ da pessoa' }
  if (!(percent >= 1 && percent <= 99)) return { error: 'A parte da pessoa vai de 1% a 99%' }
  if (handle === myHandle) return { error: 'Esse é o seu @' }
  // Conta fixa: o convite leva o valor por mês (quem chama pode mandar o total de N meses).
  if (bill.recurring) bill = { ...bill, totalAmount: Math.round(bill.totalAmount / bill.installments), installments: 1 }
  // Mesmo limite das regras do Firestore.
  if (bill.installments > 120) return { error: 'Conta dividida vai até 120 parcelas (10 anos).' }
  try {
    const partner = await lookupHandle(handle)
    if (!partner) return { error: `Nenhum usuário com @${handle}` }
    const created = await createSharedBill({
      ...bill,
      payerType: share.payerType,
      inviteePercent: percent,
      creator: { uid: user.uid, handle: myHandle, name: user.name },
      invitee: { uid: partner.uid, handle, name: partner.name },
    })
    return { id: created.id, handle, auto: created.status === 'ACCEPTED' }
  } catch {
    return { error: 'Não foi possível enviar o convite. Verifique a conexão e tente de novo.' }
  }
}

export interface KnownPartner {
  uid: string
  handle: string
  name: string | null
}

/** Pessoas com quem já dividi alguma conta, da mais recente para a mais antiga. */
export function useKnownPartners(): KnownPartner[] {
  const uid = useAuthStore((s) => (s.status === 'signed_in' ? (s.user?.uid ?? null) : null))
  const bills = useSharedStore((s) => s.bills)
  return useMemo(() => {
    if (!uid) return []
    const seen = new Map<string, KnownPartner>()
    for (const bill of [...bills].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
      const p = partnerOf(bill, uid)
      if (p?.handle && !seen.has(p.handle)) seen.set(p.handle, { uid: p.userId, handle: p.handle, name: p.name })
    }
    return [...seen.values()]
  }, [bills, uid])
}

const MAX_SUGGESTIONS = 6

/** Chips com os @ conhecidos; filtra pelo que foi digitado e some quando já bate. */
function PartnerSuggestions({ value, onPick }: { value: string; onPick: (handle: string) => void }) {
  const partners = useKnownPartners()
  const typed = normalizeHandle(value)
  if (partners.some((p) => p.handle === typed)) return null
  const list = partners.filter((p) => !typed || p.handle.startsWith(typed) || p.name?.toLowerCase().includes(typed)).slice(0, MAX_SUGGESTIONS)
  if (!list.length) return null
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Já dividiu com</span>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {list.map((p) => (
          <button
            key={p.handle}
            type="button"
            onClick={() => onPick(p.handle)}
            className="flex shrink-0 items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            <span className="font-medium">@{p.handle}</span>
            {p.name && <span className="max-w-32 truncate text-muted-foreground">· {p.name}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Bloco "Dividir esta conta": @ da pessoa, parte dela e quem paga. */
export function ShareFields({
  share,
  onChange,
  label = 'Dividir esta conta',
  note,
}: {
  share: ShareState
  onChange: (s: ShareState) => void
  label?: string
  /** Aviso extra, ex.: conta fixa vira 12 parcelas mensais */
  note?: string
}) {
  const myHandle = useSharedStore((s) => s.handle)
  const set = (patch: Partial<ShareState>) => onChange({ ...share, ...patch, error: 'error' in patch ? (patch.error ?? '') : '' })
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="share">{label}</Label>
        <Switch id="share" checked={share.on} onCheckedChange={(on) => set({ on })} />
      </div>
      {share.on && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="share-handle">@ da pessoa</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  id="share-handle"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="pl-8"
                  value={share.handle}
                  onChange={(e) => set({ handle: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="share-pct">Parte dela</Label>
              <div className="relative">
                <Input id="share-pct" inputMode="numeric" className="pr-8" value={share.percent} onChange={(e) => set({ percent: e.target.value.replace(/\D/g, '') })} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <PartnerSuggestions value={share.handle} onPick={(handle) => set({ handle })} />
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Quem paga">
            {(
              [
                ['SPLIT_PAYMENT', 'Cada um a sua parte'],
                ['SINGLE_PAYER', 'Eu paguei tudo'],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={share.payerType === key}
                onClick={() => set({ payerType: key })}
                className={cn('h-9 rounded-lg text-sm font-medium transition-colors', share.payerType === key ? 'bg-card shadow-sm' : 'text-muted-foreground')}
              >
                {text}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {share.payerType === 'SPLIT_PAYMENT' ? 'Cada um paga a própria parte direto ao credor.' : 'Você pagou o total; a pessoa reembolsa a parte dela a você.'} A
            pessoa recebe um convite e as parcelas entram para os dois quando ela aceitar.
            {note && ` ${note}`}
            {!myHandle && ' Antes, escolha seu @ em Configurações > Conta.'}
          </p>
          {share.error && (
            <p role="alert" className="text-sm text-expense">
              {share.error}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Sou criador ou convidado da conta deste lançamento? (`null` se não é dividido) */
export function useSharedRole(t: Pick<Transaction, 'sharedBillId'> | undefined): SharedRole | null {
  const uid = useAuthStore((s) => (s.status === 'signed_in' ? (s.user?.uid ?? null) : null))
  const bills = useSharedStore((s) => s.bills)
  return useMemo(() => (t ? sharedRole(t, bills, uid) : null), [t, bills, uid])
}

/** @ da outra pessoa de uma conta compartilhada; `null` enquanto a conta não chegou do Firestore. */
export function useSharedPartner(billId: string | null | undefined): string | null {
  const uid = useAuthStore((s) => (s.status === 'signed_in' ? (s.user?.uid ?? null) : null))
  return useSharedStore((s) => {
    const bill = billId && uid ? s.bills.find((b) => b.id === billId) : undefined
    return (bill && uid && partnerOf(bill, uid)?.handle) || null
  })
}

/** Selo "Compartilhada com @pessoa" para lançamentos de conta dividida. */
export function SharedBadge({ billId, fallback }: { billId: string; fallback?: string | null }) {
  const handle = useSharedPartner(billId)
  const who = handle ? `@${handle}` : fallback
  return (
    <Badge tone="info">
      <Users className="size-3" aria-hidden />
      {who ? `Compartilhada com ${who}` : 'Compartilhada'}
    </Badge>
  )
}
