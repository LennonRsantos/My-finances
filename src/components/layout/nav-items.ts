import { BarChart3, CalendarDays, Car, CreditCard, House, LayoutDashboard, Lightbulb, ListOrdered, Settings, type LucideIcon } from 'lucide-react'
import type { View } from '@/store/ui-store'

export interface NavItem {
  view: View
  label: string
  icon: LucideIcon
  /** Celular: na barra inferior (`bar`) ou na folha "Mais" (`more`) */
  mobile: 'bar' | 'more'
  /** Nome curto sob o ícone da barra */
  mobileLabel?: string
}

/** Ordem da barra lateral do computador. */
export const NAV_ITEMS: NavItem[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, mobile: 'bar', mobileLabel: 'Início' },
  { view: 'lancamentos', label: 'Lançamentos', icon: ListOrdered, mobile: 'more' },
  { view: 'calendario', label: 'Calendário', icon: CalendarDays, mobile: 'more' },
  { view: 'casa', label: 'Casa', icon: House, mobile: 'bar' },
  { view: 'veiculo', label: 'Veículo', icon: Car, mobile: 'bar' },
  { view: 'cartoes', label: 'Cartões', icon: CreditCard, mobile: 'more' },
  { view: 'inteligencia', label: 'Sair do vermelho', icon: Lightbulb, mobile: 'more', mobileLabel: 'Plano' },
  { view: 'relatorios', label: 'Relatórios', icon: BarChart3, mobile: 'more' },
  { view: 'configuracoes', label: 'Configurações', icon: Settings, mobile: 'more', mobileLabel: 'Ajustes' },
]

/** Barra do celular: Início · Casa · (+) · Veículo · Mais. */
export const BAR_ITEMS = NAV_ITEMS.filter((i) => i.mobile === 'bar')

/** Folha "Mais", na ordem de uso (Lançamentos primeiro); Configurações vem à parte. */
const MORE_ORDER: View[] = ['lancamentos', 'cartoes', 'calendario', 'relatorios', 'inteligencia']
export const MORE_ITEMS = MORE_ORDER.map((v) => NAV_ITEMS.find((i) => i.view === v)!)
export const SETTINGS_ITEM = NAV_ITEMS.find((i) => i.view === 'configuracoes')!
