import { Car, ChevronRight, House, Layers, type LucideIcon } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui-store'

type Area = 'casa' | 'veiculo' | 'outros'

const AREAS: { key: Area; label: string; icon: LucideIcon; view?: 'casa' | 'veiculo' }[] = [
  { key: 'casa', label: 'Casa', icon: House, view: 'casa' },
  { key: 'veiculo', label: 'Veículo', icon: Car, view: 'veiculo' },
  { key: 'outros', label: 'Outros gastos', icon: Layers },
]

/** Quanto do mês foi para a casa, para o veículo e para o resto; casa e veículo abrem a aba deles. */
export function AreaStrip({ byArea, total }: { byArea: Record<Area, number>; total: number }) {
  const setView = useUIStore((s) => s.setView)
  return (
    // Abaixo de 360px: uma linha por área (nome à esquerda, valor à direita), sem cortar o valor.
    <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
      {AREAS.map(({ key, label, icon: Icon, view }) => {
        const share = total ? Math.round((byArea[key] / total) * 100) : 0
        const content = (
          <>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{label}</span>
              {view && <ChevronRight className="ml-auto size-3.5 shrink-0 max-[359px]:hidden" aria-hidden />}
            </span>
            <span className="truncate text-sm font-semibold tabular-nums max-[359px]:ml-auto sm:text-base">{formatMoney(byArea[key])}</span>
            <span className="text-xs text-muted-foreground max-[359px]:w-10 max-[359px]:text-right">{share}%<span className="max-[359px]:hidden"> do mês</span></span>
          </>
        )
        const cls = 'flex min-w-0 flex-col gap-0.5 rounded-xl border bg-card p-3 text-left max-[359px]:flex-row max-[359px]:items-center max-[359px]:gap-2 max-[359px]:py-2.5'
        return view ? (
          <button
            key={key}
            type="button"
            onClick={() => setView(view)}
            aria-label={`${label}: ${formatMoney(byArea[key])}. Abrir ${label}`}
            className={cn(cls, 'transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring')}
          >
            {content}
          </button>
        ) : (
          <div key={key} className={cls}>
            {content}
          </div>
        )
      })}
    </div>
  )
}
