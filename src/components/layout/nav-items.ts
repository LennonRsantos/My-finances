import { BarChart3, CalendarDays, Car, House, LayoutDashboard, Lightbulb, ListOrdered, Settings, type LucideIcon } from 'lucide-react'
import type { View } from '@/store/ui-store'

export interface NavItem {
  view: View
  label: string
  icon: LucideIcon
  /** Na barra inferior do celular; os demais ficam no menu do cabeçalho */
  mobile: boolean
  mobileLabel?: string
}

export const NAV_ITEMS: NavItem[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, mobile: true },
  // Hífen opcional: em telas de 320 px quebra como "Lança-mentos".
  { view: 'lancamentos', label: 'Lançamentos', icon: ListOrdered, mobile: true, mobileLabel: 'Lança\u00admentos' },
  { view: 'calendario', label: 'Calendário', icon: CalendarDays, mobile: false },
  { view: 'casa', label: 'Casa', icon: House, mobile: true },
  { view: 'veiculo', label: 'Veículo', icon: Car, mobile: true },
  { view: 'inteligencia', label: 'Sair do vermelho', icon: Lightbulb, mobile: true },
  { view: 'relatorios', label: 'Relatórios', icon: BarChart3, mobile: false },
  { view: 'configuracoes', label: 'Configurações', icon: Settings, mobile: false },
]
