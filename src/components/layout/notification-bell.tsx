import { Bell, BellOff, Check, ChevronRight, Loader2, X } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { HandleDialog } from '@/components/shared/shared-ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { todayISO } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { buildNotifications, type AppNotification } from '@/lib/notifications'
import { acknowledgeSharedBill, respondSharedBill } from '@/lib/shared-cloud'
import { cn } from '@/lib/utils'
import { reportSyncError, useAuthStore } from '@/store/auth-store'
import { useFinanceStore } from '@/store/finance-store'
import { useSettingsStore } from '@/store/settings-store'
import { useSharedStore } from '@/store/shared-store'
import { useUIStore } from '@/store/ui-store'

const SEEN_KEY = 'financas-notificacoes-vistas'

/** Ids já vistos neste aparelho: só os novos contam no número do sino. */
function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function writeSeen(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids))
  } catch {
    // Sem armazenamento (aba anônima): o número só não fica lembrado.
  }
}

function useNotifications(): AppNotification[] {
  const uid = useAuthStore((s) => (s.status === 'signed_in' ? (s.user?.uid ?? null) : null))
  const shared = useSharedStore()
  const { transactions, maintenance, vehicles } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, maintenance: s.maintenance, vehicles: s.vehicles })),
  )
  const dueSoonDays = useSettingsStore((s) => s.settings.notifications.dueSoonDays)
  return buildNotifications({
    uid,
    bills: shared.bills,
    handle: shared.handle,
    handleLoaded: shared.handleLoaded,
    rulesMissing: shared.rulesMissing,
    transactions,
    maintenance,
    vehicles,
    today: todayISO(),
    dueSoonDays,
    formatMoney,
  })
}

const toneDot = { expense: 'bg-expense', warning: 'bg-warning', info: 'bg-info' }

function NotificationItem({ n, onNavigate, onHandle }: { n: AppNotification; onNavigate: (view: NonNullable<AppNotification['view']>) => void; onHandle: () => void }) {
  const [busy, setBusy] = useState<'ACCEPT' | 'REJECT' | null>(null)
  const respond = async (action: 'ACCEPT' | 'REJECT') => {
    if (!n.bill) return
    setBusy(action)
    try {
      await respondSharedBill(n.bill, action)
    } catch (e) {
      reportSyncError(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="flex gap-3 px-4 py-3">
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', toneDot[n.tone])} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="text-sm font-medium">{n.title}</p>
          {n.detail && <p className="text-xs text-muted-foreground">{n.detail}</p>}
        </div>
        {n.kind === 'invite' && (
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
        )}
        {n.kind === 'rejection' && n.bill && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => acknowledgeSharedBill(n.bill!).catch(reportSyncError)}>
              Ok
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('lancamentos')}>
              Ver conta
            </Button>
          </div>
        )}
        {n.kind === 'handle' && (
          <div>
            <Button size="sm" onClick={onHandle}>
              Escolher @
            </Button>
          </div>
        )}
      </div>
      {n.view && n.kind !== 'rejection' && (
        <button
          type="button"
          onClick={() => onNavigate(n.view!)}
          aria-label={`Abrir: ${n.title}`}
          className="grid size-8 shrink-0 place-items-center self-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </li>
  )
}

/** Sino no cabeçalho: avisos de contas, manutenções e convites de contas compartilhadas. */
export function NotificationBell() {
  const items = useNotifications()
  const setView = useUIStore((s) => s.setView)
  const [open, setOpen] = useState(false)
  const [handleOpen, setHandleOpen] = useState(false)
  const [seen, setSeen] = useState(readSeen)
  const unseen = items.filter((n) => !seen.has(n.id)).length

  const openPanel = () => {
    setOpen(true)
    // Abrir o sino marca o que está na lista como visto.
    const ids = items.map((n) => n.id)
    setSeen(new Set(ids))
    writeSeen(ids)
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-label={unseen ? `Notificações: ${unseen} novas` : 'Notificações'}
        className="relative grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="size-5" />
        {unseen > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-expense px-1 text-[10px] font-semibold leading-4 text-white tabular-nums">
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Sem foco automático no 1º botão: um Enter sem querer não recusa um convite. */}
        <DialogContent side="corner" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Notificações</DialogTitle>
            <DialogDescription>{items.length ? `${items.length} ${items.length === 1 ? 'aviso' : 'avisos'}` : 'Tudo em dia.'}</DialogDescription>
          </DialogHeader>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 pb-8 pt-4 text-center text-sm text-muted-foreground">
              <BellOff className="size-6" />
              Nenhuma conta atrasada, convite ou manutenção pendente.
            </div>
          ) : (
            <ul className="max-h-[70dvh] divide-y overflow-y-auto pb-2">
              {items.map((n) => (
                <NotificationItem
                  key={n.id}
                  n={n}
                  onNavigate={(view) => {
                    setView(view)
                    setOpen(false)
                  }}
                  onHandle={() => {
                    setOpen(false)
                    setHandleOpen(true)
                  }}
                />
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      <HandleDialog open={handleOpen} onClose={() => setHandleOpen(false)} />
    </>
  )
}
