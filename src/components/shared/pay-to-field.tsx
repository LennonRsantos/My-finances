import { Loader2, Send, UserCheck, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useKnownPartners } from '@/components/shared/share-fields'
import { FieldError, Input, Label } from '@/components/ui/input'
import { normalizeHandle } from '@/lib/shared'
import { lookupHandle } from '@/lib/shared-cloud'
import { useAuthStore } from '@/store/auth-store'
import { useFinanceStore } from '@/store/finance-store'
import { useSharedStore } from '@/store/shared-store'
import type { Transaction } from '@/types/finance'

/** Usuário do app escolhido em "Enviar para". */
export interface PayLink {
  uid: string
  handle: string
  name: string | null
}

export const payLinkOf = (t: Pick<Transaction, 'payToUid' | 'payToHandle' | 'payTo'>): PayLink | null =>
  t.payToUid && t.payToHandle ? { uid: t.payToUid, handle: t.payToHandle, name: t.payTo ?? null } : null

const labelOf = (p: PayLink) => p.name || `@${p.handle}`
const MAX_CHIPS = 6

/** Pessoas com quem já dividi contas ou para quem já enviei, sem repetir. */
function usePayTargets(): PayLink[] {
  const known = useKnownPartners()
  const transactions = useFinanceStore((s) => s.transactions)
  return useMemo(() => {
    const seen = new Map<string, PayLink>()
    for (const k of known) seen.set(k.uid, k)
    for (const t of transactions) {
      const l = payLinkOf(t)
      if (l && !seen.has(l.uid)) seen.set(l.uid, l)
    }
    return [...seen.values()]
  }, [known, transactions])
}

/**
 * Campo "Enviar para": nome livre (como antes) ou um usuário do app, que passa
 * a ver no Dashboard dele quanto você deve enviar.
 */
export function PayToField({
  id,
  value,
  onChange,
  link,
  onLinkChange,
  suggestions,
  error,
}: {
  id: string
  value: string
  onChange: (name: string) => void
  link: PayLink | null
  onLinkChange: (link: PayLink | null) => void
  /** Nomes livres já usados, para autocompletar */
  suggestions: string[]
  error?: string
}) {
  const signedIn = useAuthStore((s) => s.status === 'signed_in')
  const myHandle = useSharedStore((s) => s.handle)
  const targets = usePayTargets()
  const [busy, setBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const pick = (p: PayLink) => {
    onLinkChange(p)
    onChange(labelOf(p))
    setLookupError(null)
  }

  // "@isadora" ao sair do campo: liga ao usuário, se existir.
  const resolve = async () => {
    const text = value.trim()
    if (!signedIn || link || !text.startsWith('@')) return
    const handle = normalizeHandle(text)
    if (!handle) return
    if (handle === myHandle) return setLookupError('Esse é o seu @')
    const known = targets.find((t) => t.handle === handle)
    if (known) return pick(known)
    setBusy(true)
    try {
      const owner = await lookupHandle(handle)
      if (owner) pick({ uid: owner.uid, handle, name: owner.name })
      else setLookupError(`Nenhum usuário com @${handle}`)
    } catch {
      setLookupError('Não foi possível buscar o @. Verifique a conexão.')
    } finally {
      setBusy(false)
    }
  }

  const typed = value.trim().replace(/^@/, '').toLocaleLowerCase('pt-BR')
  const chips =
    signedIn && !link
      ? targets
          .filter((t) => !typed || t.handle.startsWith(typed) || t.name?.toLocaleLowerCase('pt-BR').includes(typed))
          .slice(0, MAX_CHIPS)
      : []

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        <Send className="size-3.5 text-muted-foreground" /> Enviar para (opcional)
      </Label>
      <div className="relative">
        <Input
          id={id}
          list={`${id}-suggestions`}
          autoComplete="off"
          autoCapitalize="none"
          placeholder={signedIn ? 'Nome ou @usuário' : 'Ex.: Isadora'}
          aria-invalid={!!error || !!lookupError}
          className={busy ? 'pr-9' : undefined}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setLookupError(null)
            // Mudou o texto: deixa de ser o usuário escolhido.
            if (link && e.target.value !== labelOf(link)) onLinkChange(null)
          }}
          onBlur={resolve}
        />
        {busy && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      <datalist id={`${id}-suggestions`}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {chips.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {chips.map((p) => (
            <button
              key={p.uid}
              type="button"
              onClick={() => pick(p)}
              className="flex shrink-0 items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted"
            >
              <span className="font-medium">@{p.handle}</span>
              {p.name && <span className="max-w-32 truncate text-muted-foreground">· {p.name}</span>}
            </button>
          ))}
        </div>
      )}

      {link ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5">
            <UserCheck className="size-3.5 shrink-0 text-income" />
            <span className="min-w-0">
              <span className="font-medium">@{link.handle}</span> também vê este valor no Dashboard.
            </span>
          </span>
          <button
            type="button"
            onClick={() => onLinkChange(null)}
            aria-label="Usar só o nome, sem avisar a pessoa"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          O valor entra no total "Você precisa enviar" do Dashboard.
          {signedIn && ' Use @ para escolher um usuário do app: ele também vê.'}
        </p>
      )}
      <FieldError message={lookupError ?? error} />
    </div>
  )
}
