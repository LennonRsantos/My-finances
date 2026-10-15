import { zodResolver } from '@hookform/resolvers/zod'
import { AtSign, Check, Loader2, Pencil, Users, X } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Affix, bodyClass, Choices, Field, FormActions, formClass } from '@/components/ui/form-kit'
import { Input, Label } from '@/components/ui/input'
import { Badge, type Tone } from '@/components/ui/misc'
import { formatDateShort } from '@/lib/dates'
import { cents, date, money } from '@/lib/form-fields'
import { formatMoney, fromCents } from '@/lib/money'
import { displayName, handleError, myTotal, normalizeHandle, partnerOf, pendingInvites, suggestHandle, unseenRejections } from '@/lib/shared'
import { acknowledgeSharedBill, cancelSharedBill, claimHandle, lookupHandle, respondSharedBill, updateSharedBill } from '@/lib/shared-cloud'
import { reportSyncError, useAuthStore } from '@/store/auth-store'
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
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escolha seu @</DialogTitle>
          <DialogDescription>Único no app, como em redes sociais.</DialogDescription>
        </DialogHeader>
        {open && <HandleForm onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Avisos no topo: @, convites, recusas
// ---------------------------------------------------------------------------

const payerLabel: Record<SharedPayerType, string> = {
  SPLIT_PAYMENT: 'cada um paga sua parte',
  SINGLE_PAYER: 'quem convidou pagou tudo; você reembolsa',
}

function InviteCard({ bill, uid }: { bill: SharedBill; uid: string }) {
  const [busy, setBusy] = useState<'ACCEPT' | 'REJECT' | null>(null)
  const creator = bill.participants[0]
  const me = bill.participants[1]
  const respond = async (action: 'ACCEPT' | 'REJECT') => {
    setBusy(action)
    try {
      await respondSharedBill(bill, action)
    } catch (e) {
      reportSyncError(e)
    } finally {
      setBusy(null)
    }
  }
  const total = myTotal(bill, uid)
  return (
    <div role="alert" className="flex flex-col gap-3 border-b border-info/30 bg-info-soft px-4 py-3 text-sm">
      <p>
        <span className="font-semibold">{displayName(creator)}</span> está te convidando para divisão de uma conta:{' '}
        <span className="font-semibold">{bill.title}</span>
        {bill.version > 1 && <span className="text-muted-foreground"> (alterada, precisa de nova confirmação)</span>}
      </p>
      <p className="text-muted-foreground">
        Total {formatMoney(bill.totalAmount)} em {bill.installments}x a partir de {formatDateShort(bill.firstDueDate)}. Sua parte: {me.splitPercentage}% ={' '}
        <span className="font-medium text-foreground">{formatMoney(total)}</span>
        {bill.installments > 1 && <> ({bill.installments}x de ~{formatMoney(Math.round(total / bill.installments))})</>}, {payerLabel[bill.payerType]}.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => respond('REJECT')}>
          {busy === 'REJECT' ? <Loader2 className="animate-spin" /> : <X />}
          Recusar
        </Button>
        <Button size="sm" disabled={!!busy} onClick={() => respond('ACCEPT')}>
          {busy === 'ACCEPT' ? <Loader2 className="animate-spin" /> : <Check />}
          Aceitar
        </Button>
      </div>
    </div>
  )
}

/** Faixas no topo do app: escolher o @, convites pendentes e recusas. */
export function SharedBanners() {
  const uid = useAuthStore((s) => (s.status === 'signed_in' ? s.user?.uid : null))
  const { bills, handle, handleLoaded, rulesMissing } = useSharedStore()
  const [handleOpen, setHandleOpen] = useState(false)
  const [dismissedHandle, setDismissedHandle] = useState(false)
  if (!uid) return null
  if (rulesMissing)
    return (
      <div role="status" className="flex items-center gap-3 border-b px-4 py-2 text-sm text-muted-foreground">
        <Users className="size-4 shrink-0" />
        <span className="flex-1">
          Contas compartilhadas indisponíveis: publique o arquivo firestore.rules em Firebase Console &gt; Firestore &gt; Regras.
        </span>
      </div>
    )
  const invites = pendingInvites(bills, uid)
  const rejections = unseenRejections(bills, uid)

  return (
    <>
      {handleLoaded && !handle && !dismissedHandle && (
        <div className="flex items-center gap-3 border-b px-4 py-2 text-sm">
          <AtSign className="size-4 shrink-0 text-info" />
          <span className="flex-1">Escolha seu @ para dividir contas com outras pessoas.</span>
          <Button size="sm" onClick={() => setHandleOpen(true)}>
            Escolher
          </Button>
          <button type="button" aria-label="Agora não" className="grid size-8 place-items-center rounded-lg text-muted-foreground" onClick={() => setDismissedHandle(true)}>
            <X className="size-4" />
          </button>
        </div>
      )}
      {invites.map((b) => (
        <InviteCard key={b.id} bill={b} uid={uid} />
      ))}
      {rejections.map((b) => {
        const partner = partnerOf(b, uid)
        return (
          <div key={b.id} role="status" className="flex items-center gap-3 border-b border-expense/30 bg-expense-soft px-4 py-2 text-sm text-expense">
            <span className="flex-1">
              {partner ? displayName(partner) : 'O convidado'} recusou a divisão de “{b.title}”.
            </span>
            <Button size="sm" variant="outline" onClick={() => acknowledgeSharedBill(b).catch(reportSyncError)}>
              Ok
            </Button>
          </div>
        )
      })}
      <HandleDialog open={handleOpen} onClose={() => setHandleOpen(false)} />
    </>
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
})

function EditForm({ bill, onDone }: { bill: SharedBill; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const { register, handleSubmit, control, setValue, formState } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: bill.title,
      amount: fromCents(bill.totalAmount).toFixed(2).replace('.', ','),
      installments: String(bill.installments),
      date: bill.firstDueDate,
      percent: String(bill.participants[1].splitPercentage),
      payerType: bill.payerType as SharedPayerType,
    },
  })
  const payerType = useWatch({ control, name: 'payerType' })
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
            installments: Number(v.installments),
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
        <div className="grid grid-cols-2 gap-3">
          <Field id="sb-amount" label="Valor total" error={e.amount?.message}>
            <Affix before="R$">
              <Input id="sb-amount" inputMode="decimal" className="pl-10" aria-invalid={!!e.amount} {...register('amount')} />
            </Affix>
          </Field>
          <Field id="sb-inst" label="Parcelas" error={e.installments?.message}>
            <Input id="sb-inst" inputMode="numeric" aria-invalid={!!e.installments} {...register('installments')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="sb-date" label="1ª parcela" error={e.date?.message}>
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
            Mudar valor, parcelas, data, divisão ou quem paga manda a conta de volta para aprovação. As parcelas atuais ficam em espera até o
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

/** Card em Lançamentos: contas compartilhadas que criei e que recebi. */
export function SharedBillsCard() {
  const uid = useAuthStore((s) => (s.status === 'signed_in' ? s.user?.uid : null))
  const { bills, handle } = useSharedStore()
  const [editing, setEditing] = useState<SharedBill | null>(null)
  const [handleOpen, setHandleOpen] = useState(false)
  if (!uid) return null
  const visible = bills.filter((b) => b.status !== 'CANCELLED')

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Contas compartilhadas
          </CardTitle>
          <CardDescription>
            {handle ? (
              <>
                Seu @ é <span className="font-medium text-foreground">@{handle}</span>. Para dividir, use “Dividir esta conta” em Nova despesa.
              </>
            ) : (
              'Escolha seu @ para dividir contas e receber convites.'
            )}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setHandleOpen(true)}>
          <AtSign />
          {handle ? 'Mudar @' : 'Escolher @'}
        </Button>
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
                      {mine ? 'Com' : 'De'} {partner ? displayName(partner) : '—'} · {formatMoney(b.totalAmount)} em {b.installments}x · sua parte{' '}
                      {formatMoney(myTotal(b, uid))}
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
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar conta compartilhada</DialogTitle>
            <DialogDescription>{editing && partnerOf(editing, uid) ? `Com ${displayName(partnerOf(editing, uid)!)}` : ''}</DialogDescription>
          </DialogHeader>
          {editing && <EditForm key={editing.id} bill={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <HandleDialog open={handleOpen} onClose={() => setHandleOpen(false)} />
    </Card>
  )
}
