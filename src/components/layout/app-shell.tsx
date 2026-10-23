import { LayoutGrid, Monitor, Moon, Plus, Sun, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MoreSheet } from './more-sheet'
import { BAR_ITEMS, MORE_ITEMS, NAV_ITEMS, SETTINGS_ITEM, type NavItem } from './nav-items'
import { SidebarAccount } from './user-menu'
import { useSettingsStore } from '@/store/settings-store'
import { useUIStore } from '@/store/ui-store'
import type { ThemePreference } from '@/types/finance'

export { NAV_ITEMS } from './nav-items'

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
  const main = NAV_ITEMS.filter((i) => i.view !== 'configuracoes')
  const settings = NAV_ITEMS.find((i) => i.view === 'configuracoes')

  const item = ({ view: v, label, icon: Icon }: NavItem) => (
    <button
      key={v}
      onClick={() => setView(v)}
      aria-current={view === v ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
        view === v ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <Icon className="size-[18px]" strokeWidth={view === v ? 2 : 1.75} />
      {label}
    </button>
  )

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r px-3 py-4 lg:flex">
      <p className="mb-5 px-2.5 text-[15px] font-semibold tracking-[-0.01em]">Finanças</p>
      <Button className="mb-5 w-full" onClick={() => openForm(true)}>
        <Plus /> Novo lançamento
      </Button>
      <nav className="flex flex-col gap-0.5" aria-label="Principal">
        {main.map(item)}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5">
        {settings && item(settings)}
        <div className="flex h-9 items-center justify-between pl-2.5 text-sm text-muted-foreground">
          Tema
          <ThemeToggle />
        </div>
        <div className="mt-2">
          <SidebarAccount />
        </div>
      </div>
    </aside>
  )
}

/** Barra inferior do celular: Início · Casa · (+) · Veículo · Mais, com nome curto sob cada ícone. */
function BottomNav() {
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const openForm = useUIStore((s) => s.setTransactionDialogOpen)
  const [moreOpen, setMoreOpen] = useState(false)
  // Tela aberta pelo "Mais": o botão fica aceso e mostra o nome dela.
  const fromMore = MORE_ITEMS.find((i) => i.view === view) ?? (view === SETTINGS_ITEM.view ? SETTINGS_ITEM : null)

  const tab = (key: string, label: string, Icon: LucideIcon, active: boolean, onClick: () => void, extra?: { expanded?: boolean }) => (
    <button
      key={key}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-expanded={extra?.expanded}
      aria-label={label}
      className={cn(
        'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1 outline-none transition-colors focus-visible:bg-muted',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <Icon className="size-[21px]" strokeWidth={active ? 2.1 : 1.6} />
      <span className={cn('max-w-full truncate px-0.5 text-[11px] leading-tight', active && 'font-medium')}>{label}</span>
      <span aria-hidden className={cn('absolute bottom-1 h-[3px] w-4 rounded-full bg-foreground transition-opacity', active ? 'opacity-100' : 'opacity-0')} />
    </button>
  )
  const barTab = (i: NavItem) => tab(i.view, i.mobileLabel ?? i.label, i.icon, view === i.view, () => setView(i.view))
  const [first, second, third] = BAR_ITEMS

  return (
    <>
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(3.75rem+env(safe-area-inset-bottom))] items-stretch border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {first && barTab(first)}
        {second && barTab(second)}
        <div className="flex shrink-0 items-center justify-center px-1.5">
          <button
            onClick={() => openForm(true)}
            aria-label="Novo lançamento"
            title="Novo lançamento"
            className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground transition-transform outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95"
          >
            <Plus className="size-[22px]" strokeWidth={2.2} />
          </button>
        </div>
        {third && barTab(third)}
        {tab('mais', fromMore ? (fromMore.mobileLabel ?? fromMore.label) : 'Mais', fromMore ? fromMore.icon : LayoutGrid, !!fromMore, () => setMoreOpen(true), { expanded: moreOpen })}
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>
      <BottomNav />
    </div>
  )
}
