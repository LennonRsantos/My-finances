import { create } from 'zustand'
import type { TransactionFilters, TransactionType, YearMonth } from '@/types/finance'
import { currentYearMonth, shiftMonth } from '@/lib/dates'

export type View = 'dashboard' | 'lancamentos' | 'calendario' | 'casa' | 'veiculo' | 'cartoes' | 'inteligencia' | 'relatorios' | 'configuracoes'

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
  /** Filtros da sessão (sobrevivem à troca de tela; salvos só com a opção ligada) */
  txFilters: Record<TransactionType, TransactionFilters>
  reportPeriod: 'mes' | 'ano'
  setTxFilters: (tab: TransactionType, filters: TransactionFilters) => void
  setReportPeriod: (period: 'mes' | 'ano') => void
  setView: (view: View) => void
  setMonth: (month: YearMonth) => void
  shiftMonth: (delta: number) => void
  /** Sem `type`, usa a aba atual de Lançamentos (ou despesa nas outras telas). */
  setTransactionDialogOpen: (open: boolean, type?: TransactionType) => void
  setTransactionsTab: (tab: TransactionType) => void
  setEditingTransaction: (id: string | null) => void
}

export const DEFAULT_TX_FILTERS: TransactionFilters = { sort: 'date_desc', categoryId: 'all', status: 'all' }

export const useUIStore = create<UIState>()((set) => ({
  view: 'dashboard',
  selectedMonth: currentYearMonth(),
  transactionDialogOpen: false,
  transactionDialogType: 'despesa',
  transactionsTab: 'despesa',
  editingTransactionId: null,
  txFilters: { despesa: DEFAULT_TX_FILTERS, receita: DEFAULT_TX_FILTERS },
  reportPeriod: 'mes',
  setTxFilters: (tab, filters) => set((s) => ({ txFilters: { ...s.txFilters, [tab]: filters } })),
  setReportPeriod: (reportPeriod) => set({ reportPeriod }),
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
