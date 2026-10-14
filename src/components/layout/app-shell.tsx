import { Monitor, Moon, Plus, Sun, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { NAV_ITEMS, type NavItem } from './nav-items'
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

/** Barra inferior do celular: só ícones; o nome da tela aparece no cabeçalho. */
function BottomNav() {
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const openForm = useUIStore((s) => s.setTransactionDialogOpen)
  const items = NAV_ITEMS.filter((i) => i.mobile)
  const left = items.slice(0, Math.ceil(items.length / 2))
  const right = items.slice(left.length)

  const renderItem = ({ view: v, label, icon: Icon }: NavItem) => (
    <button
      key={v}
      onClick={() => setView(v)}
      aria-current={view === v ? 'page' : undefined}
      aria-label={label}
      title={label}
      className={cn(
        'relative flex min-w-0 flex-1 items-center justify-center outline-none transition-colors focus-visible:bg-muted',
        view === v ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <Icon className="size-[22px]" strokeWidth={view === v ? 2.1 : 1.6} />
      <span
        aria-hidden
        className={cn(
          'absolute bottom-2 h-[3px] w-4 rounded-full bg-foreground transition-opacity',
          view === v ? 'opacity-100' : 'opacity-0',
        )}
      />
    </button>
  )

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(3.75rem+env(safe-area-inset-bottom))] items-stretch border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      {left.map(renderItem)}
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
      {right.map(renderItem)}
    </nav>
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
