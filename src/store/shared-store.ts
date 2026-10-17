import { create } from 'zustand'
import type { SharedBill, Transfer } from '@/types/finance'

interface SharedState {
  /** Contas que criei e que recebi (vêm do Firestore em tempo real) */
  bills: SharedBill[]
  /** Meu @ único, sem o "@"; `null` = ainda não escolhido */
  handle: string | null
  /** O perfil já chegou do Firestore (evita pedir o @ antes da hora) */
  handleLoaded: boolean
  /** Regras do Firestore sem as coleções compartilhadas (não publicadas): recurso indisponível */
  rulesMissing: boolean
  /** Meus espelhos de "Enviar para @usuário" */
  outgoing: Transfer[]
  /** O que outras pessoas devem me enviar */
  incoming: Transfer[]
  /** Os espelhos já chegaram do Firestore (antes disso, não sincroniza) */
  transfersLoaded: boolean
}

const empty = { bills: [], handle: null, handleLoaded: false, rulesMissing: false, outgoing: [], incoming: [], transfersLoaded: false }

/** Só existe com login; não vai para o navegador. */
export const useSharedStore = create<SharedState>()(() => ({ ...empty }))

export const resetShared = () => useSharedStore.setState({ ...empty })
