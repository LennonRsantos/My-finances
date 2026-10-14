import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Lightbulb,
  ListOrdered,
  Monitor,
  Moon,
  Plus,
  Settings,
  Sun,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/store/settings-store'
import { useUIStore, type View } from '@/store/ui-store'
import type { ThemePreference } from '@/types/finance'

export const NAV_ITEMS: { view: View; label: string; icon: LucideIcon; mobile: boolean }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, mobile: true },
  { view: 'lancamentos', label: 'Lançamentos', icon: ListOrdered, mobile: true },
  { view: 'calendario', label: 'Calendário', icon: CalendarDays, mobile: true },
  { view: 'inteligencia', label: 'Sair do vermelho', icon: Lightbulb, mobile: true },
  { view: 'relatorios', label: 'Relatórios', icon: BarChart3, mobile: false },
  { view: 'configuracoes', label: 'Configurações', icon: Settings, mobile: false },
]

const themeCycle: Record<ThemePreference, { next: ThemePreference; icon: LucideIcon; label: string }> = {
  system: { next: 'light', icon: Monitor, label: 'Tema do sistema' },
  light: { next: 'dark', icon: Sun, label: 'Tema claro' },
  dark: { next: 'system', icon: Moon, label: 'Tema escuro' },
}

export function ThemeToggle() {
  const theme = useSettingsStore((s) => s.settings.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const { next, icon: Icon, label } = themeCycle[theme]
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(next)} aria-label={`${label} (alternar)`} title={label}>
      <Icon />
    </Button>
  )
}

function Sidebar() {
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const openForm = useUIStore((s) => s.setTransactionDialogOpen)

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card p-4 lg:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Wallet className="size-5" />
        </span>
        <span className="text-lg font-semibold">Finanças</span>
      </div>
      <Button className="mb-4 w-full" onClick={() => openForm(true)}>
        <Plus /> Novo lançamento
      </Button>
      <nav className="flex flex-col gap-1" aria-label="Principal">
        {NAV_ITEMS.map(({ view: v, label, icon: Icon }) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-current={view === v ? 'page' : undefined}
            className={cn(
              'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
              view === v ? 'bg-info-soft text-info' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-[18px]" />
            {label}
          </button>
        ))}
      </nav>
      <div className="mt-auto flex items-center justify-between px-2 text-sm text-muted-foreground">
        Tema
        <ThemeToggle />
      </div>
    </aside>
  )
}

function BottomNav() {
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const openForm = useUIStore((s) => s.setTransactionDialogOpen)
  const items = NAV_ITEMS.filter((i) => i.mobile)
  const left = items.slice(0, 2)
  const right = items.slice(2)

  const renderItem = ({ view: v, label, icon: Icon }: (typeof NAV_ITEMS)[number]) => (
    <button
      key={v}
      onClick={() => setView(v)}
      aria-current={view === v ? 'page' : undefined}
      className={cn(
        'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium min-[360px]:text-[11px]',
        view === v ? 'text-primary' : 'text-muted-foreground',
      )}
    >
      <Icon className="size-5" />
      <span className="line-clamp-2 max-w-full px-0.5 text-center leading-tight tracking-tight">{label}</span>
    </button>
  )

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {left.map(renderItem)}
      <div className="flex flex-1 items-start justify-center">
        <button
          onClick={() => openForm(true)}
          aria-label="Novo lançamento"
          className="-mt-5 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-4 ring-background active:scale-95"
        >
          <Plus className="size-6" />
        </button>
      </div>
      {right.map(renderItem)}
    </nav>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>
      <BottomNav />
    </div>
  )
}
