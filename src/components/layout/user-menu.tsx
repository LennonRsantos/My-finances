import { ChevronRight, HardDrive, Loader2, LogOut, Settings } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { signOut } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { useAuthStore, type AppUser } from '@/store/auth-store'
import { useUIStore } from '@/store/ui-store'

function Avatar({ user, className }: { user: AppUser; className?: string }) {
  const initial = (user.name ?? user.email ?? '?').trim().charAt(0).toUpperCase()
  return user.photoURL ? (
    <img src={user.photoURL} alt="" width={36} height={36} referrerPolicy="no-referrer" className={cn('size-9 shrink-0 rounded-full', className)} />
  ) : (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground', className)}>
      {initial}
    </span>
  )
}

/** Sai da conta mostrando carregamento (o Firestore fecha os listeners antes). */
function useSignOut() {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      await signOut()
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

/** Rodapé da barra lateral (desktop): quem está logado + sair. */
export function SidebarAccount() {
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const { busy, run } = useSignOut()

  if (status !== 'signed_in' || !user) {
    return (
      <p className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
        <HardDrive className="size-4" /> Modo local: dados só neste navegador
      </p>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border p-2">
      <Avatar user={user} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name ?? 'Sem nome'}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={run} disabled={busy} aria-label="Sair da conta" title="Sair da conta">
        {busy ? <Loader2 className="animate-spin" /> : <LogOut />}
      </Button>
    </div>
  )
}

/** Cabeçalho no celular: foto abre o menu da conta; sem login, vai direto para Configurações. */
export function MobileAccountButton() {
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const setView = useUIStore((s) => s.setView)
  const [open, setOpen] = useState(false)
  const { busy, run } = useSignOut()

  if (status !== 'signed_in' || !user) {
    return (
      <Button variant="ghost" size="icon" onClick={() => setView('configuracoes')} aria-label="Configurações">
        <Settings />
      </Button>
    )
  }

  const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-muted'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Conta e configurações"
        className="grid size-10 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar user={user} className="size-8" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader className="flex-row items-center gap-3">
            <Avatar user={user} className="size-11" />
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">{user.name ?? 'Sem nome'}</DialogTitle>
              <DialogDescription className="truncate">{user.email}</DialogDescription>
            </div>
          </DialogHeader>
          <nav aria-label="Conta" className="flex flex-col px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
            <button
              type="button"
              className={item}
              onClick={() => {
                setView('configuracoes')
                setOpen(false)
              }}
            >
              <Settings className="size-5 text-muted-foreground" />
              <span className="flex-1">Configurações</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
            <button type="button" className={cn(item, 'text-expense hover:bg-expense-soft')} onClick={run} disabled={busy}>
              {busy ? <Loader2 className="size-5 animate-spin" /> : <LogOut className="size-5" />}
              <span className="flex-1">Sair da conta</span>
            </button>
          </nav>
        </DialogContent>
      </Dialog>
    </>
  )
}
