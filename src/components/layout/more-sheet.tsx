import { ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui-store'
import { MORE_ITEMS, SETTINGS_ITEM } from './nav-items'

/** Folha "Mais" do celular: as telas que não estão na barra, em atalhos grandes. */
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const view = useUIStore((s) => s.view)
  const setView = useUIStore((s) => s.setView)
  const go = (v: typeof view) => {
    setView(v)
    onClose()
  }
  const Settings = SETTINGS_ITEM.icon

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* Sem foco automático: o primeiro atalho pareceria selecionado. */}
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Mais telas</DialogTitle>
          <DialogDescription className="sr-only">Escolha uma tela para abrir.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-3 gap-2">
            {MORE_ITEMS.map(({ view: v, label, icon: Icon }, i) => {
              const active = view === v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => go(v)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-3 text-center text-[13px] font-medium leading-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    // Lançamentos: o mais usado dos que saíram da barra.
                    i === 0 && 'col-span-3 min-h-14 flex-row gap-2.5 text-sm',
                    active ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted',
                  )}
                >
                  <Icon className={cn('size-5 shrink-0', !active && 'text-muted-foreground')} strokeWidth={1.8} />
                  {label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => go(SETTINGS_ITEM.view)}
            aria-current={view === SETTINGS_ITEM.view ? 'page' : undefined}
            className="flex h-12 items-center gap-3 rounded-xl border px-3.5 text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings className="size-[18px] text-muted-foreground" strokeWidth={1.75} />
            <span className="flex-1 text-left">{SETTINGS_ITEM.label}</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
