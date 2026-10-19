import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Pencil, Users } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Affix, bodyClass, Choices, Field, FormActions, formClass } from '@/components/ui/form-kit'
import { Input, Label } from '@/components/ui/input'
import { Badge, Switch, type Tone } from '@/components/ui/misc'
import { useKnownPartners } from '@/components/shared/share-fields'
import { cents, date, money } from '@/lib/form-fields'
import { formatMoney, fromCents } from '@/lib/money'
import { billTerms, displayName, handleError, myTotal, normalizeHandle, partnerOf, suggestHandle } from '@/lib/shared'
import { cancelSharedBill, claimHandle, lookupHandle, updateSharedBill } from '@/lib/shared-cloud'
import { reportSyncError, useAuthStore } from '@/store/auth-store'
import { NO_AUTO_ACCEPT, useSettingsStore } from '@/store/settings-store'
import { useSharedStore } from '@/store/shared-store'
import type { ISODate, SharedBill, SharedBillStatus, SharedPayerType } from '@/types/finance'

// ---------------------------------------------------------------------------
// @ único
// ---------------------------------------------------------------------------

function HandleForm({ onDone }: { onDone: () => void }) {
  const user = useAuthStore((s) => s.user)
  const current = useSharedStore((s) => s.handle)
  const [value, setValue] = useState(() => current ?? suggestHandle(user?.name ?? null, user?.email ?? null))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const handle = normalizeHandle(value)

  const submit = async () => {
    const invalid = handleError(handle)
    if (invalid) return setError(invalid)
    if (!user) return
    if (handle === current) return onDone()
    setBusy(true)
    setError(null)
    try {
      const owner = await lookupHandle(handle)
      if (owner && owner.uid !== user.uid) {
        setError(`@${handle} já está em uso. Tente outro.`)
        return
      }
      await claimHandle(user.uid, user.name, handle, current)
      onDone()
    } catch {
      setError('Não foi possível salvar. Esse @ pode ter sido escolhido agora por outra pessoa; tente outro.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className={bodyClass}>
        <Field id="handle" label="Seu @" error={error ?? undefined} hint="É como as outras pessoas encontram você para dividir uma conta. Só letras minúsculas, números, ponto e _.">
          <Affix before="@">
            <Input
              id="handle"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="pl-8"
              value={value}
              aria-invalid={!!error}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
            />
          </Affix>
        </Field>
      </div>
      <div className="flex gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          Salvar @
        </Button>
      </div>
    </form>
  )
}

export function HandleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useSharedStore((s) => s.handle)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{current ? 'Alterar seu @' : 'Escolha seu @'}</DialogTitle>
          <DialogDescription>
            {current
              ? `Hoje é @${current}. Ao trocar, @${current} fica livre para outra pessoa; contas já compartilhadas continuam valendo.`
              : 'Único no app, como em redes sociais.'}
          </DialogDescription>
        </DialogHeader>
        {open && <HandleForm onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Aceite automático
// ---------------------------------------------------------------------------

function AutoAcceptForm() {
  const people = useSettingsStore((s) => s.settings.autoAcceptFrom ?? NO_AUTO_ACCEPT)
  const setAutoAccept = useSettingsStore((s) => s.setAutoAccept)
  const known = useKnownPartners()
  const myHandle = useSharedStore((s) => s.handle)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Conhecidos + quem já foi adicionado à mão, sem repetir.
  const rows = [...known, ...people.filter((p) => !known.some((k) => k.uid === p.uid))]
  const allowed = new Set(people.map((p) => p.uid))
  const toggle = (p: (typeof rows)[number], on: boolean) =>
    setAutoAccept(on ? [...people, { uid: p.uid, handle: p.handle, name: p.name }] : people.filter((x) => x.uid !== p.uid))

  const add = async () => {
    const handle = normalizeHandle(value)
    if (!handle) return setError('Informe o @ da pessoa')
    if (handle === myHandle) return setError('Esse é o seu @')
    const existing = rows.find((r) => r.handle === handle)
    if (existing) {
      if (!allowed.has(existing.uid)) toggle(existing, true)
      setValue('')
      return setError(null)
    }
    setBusy(true)
    try {
      const owner = await lookupHandle(handle)
      if (!owner) return setError(`Nenhum usuário com @${handle}`)
      setAutoAccept([...people, { uid: owner.uid, handle, name: owner.name }])
      setValue('')
      setError(null)
    } catch {
      setError('Não foi possível buscar o @. Verifique a conexão.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 pb-5">
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-xl border">
          {rows.map((p) => (
            <li key={p.uid} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">@{p.handle}</span>
                {p.name && <span className="truncate text-xs text-muted-foreground">{p.name}</span>}
              </span>
              <Switch checked={allowed.has(p.uid)} onCheckedChange={(on) => toggle(p, on)} aria-label={`Aceitar automaticamente de @${p.handle}`} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Você ainda não dividiu contas com ninguém. Adicione um @ abaixo.</p>
      )}
      <form
        noValidate
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Label htmlFor="auto-handle">Adicionar pessoa</Label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
            <Input
              id="auto-handle"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="pl-8"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
            />
          </div>
          <Button type="submit" variant="outline" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : 'Adicionar'}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-expense">
            {error}
          </p>
        )}
      </form>
      <p className="text-xs text-muted-foreground">
        Contas enviadas por essas pessoas entram direto nos seus lançamentos, sem convite. Se a pessoa cancelar, elas somem também. Parcelas
        que você já pagou continuam.
      </p>
    </div>
  )
}

export function AutoAcceptDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aceitar automaticamente</DialogTitle>
          <DialogDescription>Escolha quem pode dividir contas com você sem pedir aceite.</DialogDescription>
        </DialogHeader>
        {open && <AutoAcceptForm />}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Lista e edição
// ---------------------------------------------------------------------------

const statusTone: Record<SharedBillStatus, Tone> = { PENDING: 'warning', ACCEPTED: 'income', REJECTED: 'expense', CANCELLED: 'neutral' }
const statusLabel: Record<SharedBillStatus, string> = { PENDING: 'Aguardando', ACCEPTED: 'Aceita', REJECTED: 'Recusada', CANCELLED: 'Cancelada' }

const editSchema = z.object({
  title: z.string().trim().min(2, 'Dê um nome').max(60, 'Máximo de 60 caracteres'),
  amount: money('Informe o valor total'),
  installments: z.string().trim().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 120, 'De 1 a 120'),
  date,
  percent: z.string().trim().refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 99, 'De 1 a 99'),
  payerType: z.enum(['SPLIT_PAYMENT', 'SINGLE_PAYER']),
  kind: z.enum(['parcelada', 'fixa']),
})

function EditForm({ bill, onDone }: { bill: SharedBill; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const { register, handleSubmit, control, setValue, getValues, formState } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: bill.title,
      amount: fromCents(bill.totalAmount).toFixed(2).replace('.', ','),
      installments: String(bill.installments),
      date: bill.firstDueDate,
      percent: String(bill.participants[1].splitPercentage),
      payerType: bill.payerType as SharedPayerType,
      kind: (bill.recurring ? 'fixa' : 'parcelada') as 'parcelada' | 'fixa',
    },
  })
  const [payerType, kind] = useWatch({ control, name: ['payerType', 'kind'] })
  const fixed = kind === 'fixa'
  // Trocar o tipo converte o valor: fixa usa o valor por mês; parcelada, o total.
  const changeKind = (next: 'parcelada' | 'fixa') => {
    if (next === kind) return
    const value = cents(getValues('amount'))
    const n = Math.max(1, Number(getValues('installments')) || 1)
    const converted = next === 'fixa' ? Math.round(value / n) : value * n
    if (value > 0) setValue('amount', fromCents(converted).toFixed(2).replace('.', ','))
    setValue('kind', next)
  }
  const e = formState.errors
  const accepted = bill.status === 'ACCEPTED'

  return (
    <form
      noValidate
      className={formClass}
      onSubmit={handleSubmit(async (v) => {
        setBusy(true)
        try {
          await updateSharedBill(bill, {
            title: v.title,
            totalAmount: cents(v.amount),
            installments: v.kind === 'fixa' ? 1 : Number(v.installments),
            recurring: v.kind === 'fixa',
            firstDueDate: v.date as ISODate,
            payerType: v.payerType,
            inviteePercent: Number(v.percent),
          })
          onDone()
        } catch (err) {
          reportSyncError(err)
        } finally {
          setBusy(false)
        }
      })}
    >
      <div className={bodyClass}>
        <Field id="sb-title" label="Conta" error={e.title?.message}>
          <Input id="sb-title" aria-invalid={!!e.title} {...register('title')} />
        </Field>
        <div className="flex flex-col gap-2">
          <Label>Tipo</Label>
          <Choices
            label="Tipo"
            value={kind}
            onChange={changeKind}
            options={[
              { value: 'parcelada', label: 'Parcelada' },
              { value: 'fixa', label: 'Fixa todo mês' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="sb-amount" label={fixed ? 'Valor por mês' : 'Valor total'} error={e.amount?.message}>
            <Affix before="R$">
              <Input id="sb-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
          {!fixed && (
            <Field id="sb-inst" label="Parcelas" error={e.installments?.message}>
              <Input id="sb-inst" inputMode="numeric" aria-invalid={!!e.installments} {...register('installments')} />
            </Field>
          )}
        </div>
        {fixed && <p className="-mt-3 text-xs text-muted-foreground">Repete todo mês, sem data para acabar. Para parar, cancele a conta.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field id="sb-date" label={fixed ? '1º mês' : '1ª parcela'} error={e.date?.message}>
            <Input id="sb-date" type="date" aria-invalid={!!e.date} {...register('date')} />
          </Field>
          <Field id="sb-pct" label="Parte do parceiro" error={e.percent?.message}>
            <Affix after="%">
              <Input id="sb-pct" inputMode="numeric" className="pr-8" aria-invalid={!!e.percent} {...register('percent')} />
            </Affix>
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Quem paga</Label>
          <Choices
            label="Quem paga"
            value={payerType}
            onChange={(x) => setValue('payerType', x)}
            options={[
              { value: 'SPLIT_PAYMENT', label: 'Cada um a sua parte' },
              { value: 'SINGLE_PAYER', label: 'Eu paguei tudo' },
            ]}
          />
        </div>
        {accepted && (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
            Mudar tipo, valor, parcelas, data, divisão ou quem paga manda a conta de volta para aprovação. As parcelas atuais ficam em espera até o
            parceiro aceitar de novo.
          </p>
        )}
      </div>
      {confirmCancel ? (
        <div className="flex flex-col gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-sm text-muted-foreground">As parcelas não pagas somem das duas contas. Pagas continuam no histórico.</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmCancel(false)}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="expense"
              className="flex-1"
              onClick={() => {
                cancelSharedBill(bill).catch(reportSyncError)
                onDone()
              }}
            >
              Cancelar conta
            </Button>
          </div>
        </div>
      ) : (
        <FormActions
          submitLabel={busy ? 'Salvando…' : 'Salvar'}
          extra={
            <Button type="button" variant="outline" className="text-expense" onClick={() => setConfirmCancel(true)}>
              Cancelar conta
            </Button>
          }
        />
      )}
    </form>
  )
}

/** Card de contas compartilhadas que criei e que recebi (todas, ou só as que passam em `filter`). */
export function SharedBillsCard({
  filter,
  title = 'Contas compartilhadas',
  description = 'Contas divididas com outras pessoas.',
}: {
  filter?: (bill: SharedBill) => boolean
  title?: string
  description?: string
} = {}) {
  const uid = useAuthStore((s) => (s.status === 'signed_in' ? s.user?.uid : null))
  const bills = useSharedStore((s) => s.bills)
  const [editing, setEditing] = useState<SharedBill | null>(null)
  const visible = bills.filter((b) => b.status !== 'CANCELLED' && (!filter || filter(b)))
  // Sem contas compartilhadas, o card não aparece (o @ fica em Configurações > Conta).
  if (!uid || visible.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {visible.length > 0 && (
        <CardContent>
          <ul className="divide-y">
            {visible.map((b) => {
              const partner = partnerOf(b, uid)
              const mine = b.createdBy === uid
              return (
                <li key={b.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {b.title}
                      <Badge tone={statusTone[b.status]}>{statusLabel[b.status]}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {mine ? 'Compartilhada com' : 'Compartilhada por'} {partner ? `@${partner.handle}` : '—'} · {billTerms(b, formatMoney)} · sua
                      parte {formatMoney(myTotal(b, uid))}
                      {b.recurring ? '/mês' : ''}
                    </p>
                  </div>
                  {mine && (
                    <Button size="icon" variant="ghost" aria-label={`Editar ${b.title}`} onClick={() => setEditing(b)}>
                      <Pencil />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </CardContent>
      )}
      <SharedBillDialog bill={editing} onClose={() => setEditing(null)} />
    </Card>
  )
}

/** Editar conta compartilhada (só quem criou). */
export function SharedBillDialog({ bill, onClose }: { bill: SharedBill | null; onClose: () => void }) {
  const uid = useAuthStore((s) => (s.status === 'signed_in' ? s.user?.uid : null))
  const partner = bill && uid ? partnerOf(bill, uid) : null
  return (
    <Dialog open={!!bill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar conta compartilhada</DialogTitle>
          <DialogDescription>{partner ? `Com ${displayName(partner)}` : ''}</DialogDescription>
        </DialogHeader>
        {bill && <EditForm key={bill.id} bill={bill} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
