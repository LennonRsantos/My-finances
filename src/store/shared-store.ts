import { create } from 'zustand'
import type { SharedBill } from '@/types/finance'

interface SharedState {
  /** Contas que criei e que recebi (vêm do Firestore em tempo real) */
  bills: SharedBill[]
  /** Meu @ único, sem o "@"; `null` = ainda não escolhido */
  handle: string | null
  /** O perfil já chegou do Firestore (evita pedir o @ antes da hora) */
  handleLoaded: boolean
  /** Regras do Firestore sem as coleções compartilhadas (não publicadas): recurso indisponível */
  rulesMissing: boolean
}

/** Só existe com login; não vai para o navegador. */
export const useSharedStore = create<SharedState>()(() => ({ bills: [], handle: null, handleLoaded: false, rulesMissing: false }))

export const resetShared = () => useSharedStore.setState({ bills: [], handle: null, handleLoaded: false, rulesMissing: false })
