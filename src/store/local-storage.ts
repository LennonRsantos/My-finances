import { createJSONStorage } from 'zustand/middleware'
import { isFirebaseConfigured } from '@/lib/firebase'

/**
 * `localStorage` só no modo sem Firebase. Com Firebase, os dados vivem no
 * Firestore (com cache offline próprio) e o app exige login; gravar uma
 * cópia no navegador só criaria dados desatualizados. A leitura continua
 * liberada para levar ao banco, no primeiro login, o que já estava aqui.
 */
export const localOnlyStorage = createJSONStorage(() => ({
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (!isFirebaseConfigured) localStorage.setItem(key, value)
  },
  removeItem: (key: string) => {
    if (!isFirebaseConfigured) localStorage.removeItem(key)
  },
}))
