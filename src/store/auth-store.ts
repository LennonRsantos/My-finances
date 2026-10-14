import { create } from 'zustand'
import { isFirebaseConfigured } from '@/lib/firebase'

export interface AppUser {
  uid: string
  name: string | null
  email: string | null
  photoURL: string | null
}

type AuthStatus = 'local' | 'loading' | 'signed_out' | 'signed_in'

interface AuthState {
  /** `local` = Firebase não configurado; dados só no navegador */
  status: AuthStatus
  user: AppUser | null
  /** Primeiro snapshot do Firestore já chegou */
  dataLoaded: boolean
  /** Primeiro snapshot dos gastos fixos já chegou */
  recurringLoaded: boolean
  syncError: string | null
  set: (patch: Partial<Omit<AuthState, 'set'>>) => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: isFirebaseConfigured ? 'loading' : 'local',
  user: null,
  dataLoaded: false,
  recurringLoaded: false,
  syncError: null,
  set: (patch) => set(patch),
}))

/** uid do usuário logado, ou null em modo local / deslogado. */
export function currentUid(): string | null {
  return useAuthStore.getState().user?.uid ?? null
}

export function reportSyncError(error: unknown) {
  console.error('[firestore]', error)
  const code = (error as { code?: string })?.code
  const message =
    code === 'permission-denied'
      ? 'Sem permissão no Firestore. Confira as regras de segurança.'
      : 'Falha ao sincronizar com a nuvem. Suas alterações podem não ter sido salvas.'
  useAuthStore.getState().set({ syncError: message })
}
