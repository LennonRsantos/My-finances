import { CloudOff, HardDrive, Loader2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { LoginScreen } from '@/components/auth/login-screen'
import { isFirebaseConfigured } from '@/lib/firebase'
import { useAuthStore } from '@/store/auth-store'

export function SyncErrorBanner() {
  const error = useAuthStore((s) => s.syncError)
  const set = useAuthStore((s) => s.set)
  if (!error) return null
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-expense/30 bg-expense-soft px-4 py-2 text-sm text-expense">
      <CloudOff className="size-4 shrink-0" />
      <span className="flex-1">{error}</span>
      <button onClick={() => set({ syncError: null })} aria-label="Fechar aviso" className="grid size-8 place-items-center rounded-lg">
        <X className="size-4" />
      </button>
    </div>
  )
}

/** Sem Firebase configurado, nada vai para o banco: deixa isso visível. */
export function LocalModeBanner() {
  if (isFirebaseConfigured) return null
  return (
    <div role="status" className="flex items-center gap-3 border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning">
      <HardDrive className="size-4 shrink-0" />
      <span className="flex-1">
        Modo local: os dados ficam só neste navegador e não vão para o banco. Configure o Firebase no .env.local para salvar na nuvem.
      </span>
    </div>
  )
}

/** Exige login quando o Firebase está configurado; senão libera o modo local. */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status)
  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center" aria-busy aria-label="Carregando">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (status === 'signed_out') return <LoginScreen />
  return children
}
