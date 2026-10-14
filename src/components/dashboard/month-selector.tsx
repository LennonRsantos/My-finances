import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { currentYearMonth, formatMonthLabel } from '@/lib/dates'
import { useUIStore } from '@/store/ui-store'

export function MonthSelector() {
  const month = useUIStore((s) => s.selectedMonth)
  const shift = useUIStore((s) => s.shiftMonth)
  const setMonth = useUIStore((s) => s.setMonth)
  const isCurrent = month === currentYearMonth()

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Mês anterior">
        <ChevronLeft />
      </Button>
      <button
        onClick={() => setMonth(currentYearMonth())}
        disabled={isCurrent}
        title={isCurrent ? undefined : 'Voltar para o mês atual'}
        className="min-w-36 rounded-xl px-2 py-1 text-center text-sm font-semibold enabled:hover:bg-muted"
      >
        {formatMonthLabel(month)}
      </button>
      <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Próximo mês">
        <ChevronRight />
      </Button>
    </div>
  )
}
