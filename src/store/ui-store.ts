import { create } from 'zustand'
import type { TransactionType, YearMonth } from '@/types/finance'
import { currentYearMonth, shiftMonth } from '@/lib/dates'

export type View = 'dashboard' | 'lancamentos' | 'calendario' | 'casa' | 'veiculo' | 'inteligencia' | 'relatorios' | 'configuracoes'

interface UIState {
  view: View
  selectedMonth: YearMonth
  transactionDialogOpen: boolean
  /** Tipo pré-selecionado ao abrir o formulário */
  transactionDialogType: TransactionType
  /** Aba ativa em Lançamentos (despesas ou receitas) */
  transactionsTab: TransactionType
  /** Lançamento aberto no diálogo de edição */
  editingTransactionId: string | null
  setView: (view: View) => void
  setMonth: (month: YearMonth) => void
  shiftMonth: (delta: number) => void
  /** Sem `type`, usa a aba atual de Lançamentos (ou despesa nas outras telas). */
  setTransactionDialogOpen: (open: boolean, type?: TransactionType) => void
  setTransactionsTab: (tab: TransactionType) => void
  setEditingTransaction: (id: string | null) => void
}

export const useUIStore = create<UIState>()((set) => ({
  view: 'dashboard',
  selectedMonth: currentYearMonth(),
  transactionDialogOpen: false,
  transactionDialogType: 'despesa',
  transactionsTab: 'despesa',
  editingTransactionId: null,
  setView: (view) => set({ view }),
  setMonth: (selectedMonth) => set({ selectedMonth }),
  shiftMonth: (delta) => set((s) => ({ selectedMonth: shiftMonth(s.selectedMonth, delta) })),
  setTransactionDialogOpen: (transactionDialogOpen, type) =>
    set((s) =>
      transactionDialogOpen
        ? {
            transactionDialogOpen,
            transactionDialogType: type ?? (s.view === 'lancamentos' ? s.transactionsTab : 'despesa'),
          }
        : { transactionDialogOpen },
    ),
  setTransactionsTab: (transactionsTab) => set({ transactionsTab }),
  setEditingTransaction: (editingTransactionId) => set({ editingTransactionId }),
}))
