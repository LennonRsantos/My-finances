import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Affix } from '@/components/ui/form-kit'
import { FieldError, Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/money'
import { MAX_PARTS, MIN_PARTS, resolveParts, spreadParts, type ReceiptPart } from '@/lib/receipt-parts'
import { cn } from '@/lib/utils'
import type { Cents, ISODate } from '@/types/finance'

/** Linhas "valor + data" da receita recebida em partes; a última fecha o total. */
export function ReceiptParts({
  parts,
  onChange,
  totalCents,
  error,
}: {
  parts: ReceiptPart[]
  onChange: (parts: ReceiptPart[]) => void
  totalCents: Cents
  error: string | null
}) {
  const { remainder } = resolveParts(parts, totalCents)
  const dates = parts.map((p) => p.date)
  const edit = (i: number, patch: Partial<ReceiptPart>) => onChange(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  // Adicionar ou tirar parte divide o total igual de novo (as datas ficam).
  const respread = (next: (ISODate | '')[]) => onChange(spreadParts(totalCents, next))

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-2 text-xs text-muted-foreground">
        <span>Valor</span>
        <span>Recebido em</span>
        <span className="w-10" />
      </div>
      {parts.map((p, i) => {
        const last = i === parts.length - 1
        return (
          <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-2">
            {last ? (
              <div
                aria-label={`Valor da parte ${i + 1} (restante)`}
                className={cn(
                  'flex h-11 items-center truncate rounded-lg border border-dashed px-3 text-base sm:text-sm',
                  !(remainder > 0) && Number.isFinite(remainder) && 'border-expense text-expense',
                )}
              >
                {Number.isFinite(remainder) ? formatMoney(remainder) : '—'}
              </div>
            ) : (
              <Affix before="R$" calc={false}>
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  aria-label={`Valor da parte ${i + 1}`}
                  className="pl-9"
                  value={p.amount}
                  onChange={(e) => edit(i, { amount: e.target.value })}
                />
              </Affix>
            )}
            <Input
              type="date"
              aria-label={`Data da parte ${i + 1}`}
              className="px-2"
              value={p.date}
              onChange={(e) => edit(i, { date: e.target.value as ISODate | '' })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              aria-label={`Tirar parte ${i + 1}`}
              disabled={parts.length <= MIN_PARTS}
              onClick={() => respread(dates.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          </div>
        )
      })}
      <p className="text-xs text-muted-foreground">A última parte é o que falta para fechar o valor total.</p>
      <FieldError message={error ?? undefined} />
      {parts.length < MAX_PARTS && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => respread([...dates, ''])}>
          <Plus />
          Adicionar parte
        </Button>
      )}
    </div>
  )
}
