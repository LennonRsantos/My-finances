import { useFinanceStore } from '@/store/finance-store'
import { useSettingsStore } from '@/store/settings-store'
import { DEFAULT_TX_FILTERS, useUIStore } from '@/store/ui-store'
import type { TransactionFilters, TransactionType } from '@/types/finance'

/**
 * Filtros de Lançamentos por aba. Sempre ficam na sessão; com "Manter filtros
 * salvos" ligado em Configurações, também nas configurações do usuário (nuvem).
 */
export function useTxFilters(tab: TransactionType): [TransactionFilters, (f: TransactionFilters) => void] {
  const keep = useSettingsStore((s) => !!s.settings.keepFilters)
  const saved = useSettingsStore((s) => s.settings.savedFilters?.[tab])
  const session = useUIStore((s) => s.txFilters[tab])
  // Categoria salva que foi apagada depois: mostra todas.
  const categoryExists = useFinanceStore((s) => {
    const id = (keep ? saved : session)?.categoryId
    return !id || id === 'all' || s.categories.some((c) => c.id === id)
  })
  const raw = (keep ? saved : session) ?? DEFAULT_TX_FILTERS
  const filters = categoryExists ? raw : { ...raw, categoryId: 'all' }

  const set = (f: TransactionFilters) => {
    useUIStore.getState().setTxFilters(tab, f)
    const { settings, update } = useSettingsStore.getState()
    if (settings.keepFilters) update({ savedFilters: { ...settings.savedFilters, [tab]: f } })
  }
  return [filters, set]
}

/** Período de Relatórios (mês/ano), com a mesma regra dos filtros. */
export function useReportPeriod(): ['mes' | 'ano', (p: 'mes' | 'ano') => void] {
  const keep = useSettingsStore((s) => !!s.settings.keepFilters)
  const saved = useSettingsStore((s) => s.settings.savedFilters?.reportPeriod)
  const session = useUIStore((s) => s.reportPeriod)
  const set = (p: 'mes' | 'ano') => {
    useUIStore.getState().setReportPeriod(p)
    const { settings, update } = useSettingsStore.getState()
    if (settings.keepFilters) update({ savedFilters: { ...settings.savedFilters, reportPeriod: p } })
  }
  return [keep ? (saved ?? 'mes') : session, set]
}

/** Liga/desliga a opção. Ligar guarda os filtros atuais; desligar os devolve à sessão. */
export function setKeepFilters(on: boolean) {
  const { settings, update } = useSettingsStore.getState()
  const ui = useUIStore.getState()
  if (on) {
    update({
      keepFilters: true,
      savedFilters: { despesa: ui.txFilters.despesa, receita: ui.txFilters.receita, reportPeriod: ui.reportPeriod },
    })
    return
  }
  const saved = settings.savedFilters
  if (saved?.despesa) ui.setTxFilters('despesa', saved.despesa)
  if (saved?.receita) ui.setTxFilters('receita', saved.receita)
  if (saved?.reportPeriod) ui.setReportPeriod(saved.reportPeriod)
  update({ keepFilters: false, savedFilters: null })
}
