import { ChevronLeft, ChevronRight, HardDrive, Loader2, LogOut, Settings, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { SETTINGS_SECTIONS, SettingsSectionContent, type Section } from '@/pages/settings-page'
import { useAuthStore } from '@/store/auth-store'
import { useUIStore } from '@/store/ui-store'
import { NAV_ITEMS } from './nav-items'
import { Avatar, useSignOut } from './user-menu'

/** Telas que não cabem na barra inferior (Calendário, Relatórios). */
const EXTRA_VIEWS = NAV_ITEMS.filter((i) => !i.mobile && !i.desktopOnly && i.view !== 'configuracoes')

function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1 text-[13px] font-medium text-muted-foreground">{title}</h3>
      <div className="divide-y overflow-hidden rounded-lg border">{children}</div>
    </section>
  )
}

function MenuRow({
  icon: Icon,
  label,
  onClick,
  active,
  trailing = <ChevronRight className="size-4 text-muted-foreground" aria-hidden />,
  className,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  active?: boolean
  trailing?: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-12 w-full items-center gap-3 px-3.5 text-left text-sm font-medium transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted',
        className,
      )}
    >
      <Icon className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <span className="flex-1">{label}</span>
      {trailing}
    </button>
  )
}

function Identity() {
  const user = useAuthStore((s) => s.user)
  const signedIn = useAuthStore((s) => s.status === 'signed_in')

  if (!signedIn || !user) {
    return (
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
          <HardDrive className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <DialogTitle className="text-base">Modo local</DialogTitle>
          <DialogDescription>Dados só neste navegador</DialogDescription>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar user={user} className="size-10" />
      <div className="min-w-0">
        <DialogTitle className="truncate text-base">{user.name ?? 'Sem nome'}</DialogTitle>
        <DialogDescription className="truncate">{user.email}</DialogDescription>
      </div>
    </div>
  )
}

/**
 * Botão do canto superior direito no celular. Abre um painel ancorado ali com
 * as telas extras, as seções de Configurações (abertas no próprio painel) e sair.
 */
export function MobileMenu() {
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const signedIn = useAuthStore((s) => s.status === 'signed_in')
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<Section | null>(null)
  const { busy, run } = useSignOut()
  const current = SETTINGS_SECTIONS.find((s) => s.id === section)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menu e configurações"
        aria-haspopup="dialog"
        className="grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
      >
        <Settings className="size-5" strokeWidth={1.75} />
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setSection(null)
        }}
      >
        <DialogContent side="corner" className="overflow-hidden">
          {current ? (
            <>
              <header className="flex h-14 shrink-0 items-center gap-1 border-b px-2 pr-14">
                <button
                  type="button"
                  onClick={() => setSection(null)}
                  aria-label="Voltar"
                  className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <div className="min-w-0">
                  <DialogTitle className="truncate text-base">{current.label}</DialogTitle>
                  <DialogDescription className="sr-only">{current.description}</DialogDescription>
                </div>
              </header>
              <div className="overflow-y-auto px-4 py-5">
                <SettingsSectionContent section={current.id} />
              </div>
            </>
          ) : (
            <>
              <header className="shrink-0 border-b px-4 py-4 pr-14">
                <Identity />
              </header>
              <div className="flex flex-col gap-5 overflow-y-auto p-4">
                <MenuGroup title="Mais telas">
                  {EXTRA_VIEWS.map(({ view: v, label, icon }) => (
                    <MenuRow
                      key={v}
                      icon={icon}
                      label={label}
                      active={view === v}
                      onClick={() => {
                        setView(v)
                        setOpen(false)
                      }}
                    />
                  ))}
                </MenuGroup>
                <MenuGroup title="Configurações">
                  {SETTINGS_SECTIONS.map(({ id, label, icon }) => (
                    <MenuRow key={id} icon={icon} label={label} onClick={() => setSection(id)} />
                  ))}
                </MenuGroup>
                {signedIn && (
                  <div className="overflow-hidden rounded-lg border">
                    <MenuRow
                      icon={busy ? Loader2 : LogOut}
                      label="Sair da conta"
                      onClick={run}
                      trailing={null}
                      className="text-expense [&>svg]:text-expense"
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
