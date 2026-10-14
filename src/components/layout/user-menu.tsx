import { HardDrive, Loader2, LogOut } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { useAuthStore, type AppUser } from '@/store/auth-store'

export function Avatar({ user, className }: { user: AppUser; className?: string }) {
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
export function useSignOut() {
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
    <div className="flex items-center gap-3 border-t px-1 pt-3">
      <Avatar user={user} className="size-8" />
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
