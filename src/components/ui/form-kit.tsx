import { useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DialogClose } from '@/components/ui/dialog'
import { FieldError, Label } from '@/components/ui/input'
import { CalculatorPanel, CalculatorToggle } from '@/components/ui/money-calculator'
import { cn } from '@/lib/utils'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from '@/types/finance'

/** Formulário dentro de diálogo: corpo rola, ações ficam fixas embaixo. */
export const formClass = 'flex min-h-0 flex-1 flex-col'
export const bodyClass = 'flex flex-col gap-5 overflow-y-auto px-5 pb-4'

export function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError message={error} />
    </div>
  )
}

/**
 * Texto fixo dentro da caixa ("R$", "km"). Caixa de dinheiro ("R$") ganha a
 * mini calculadora no canto direito; `calc={false}` tira.
 */
export function Affix({ before, after, children, calc }: { before?: string; after?: string; children: ReactNode; calc?: boolean }) {
  const withCalc = calc ?? before === 'R$'
  const box = useRef<HTMLDivElement>(null)
  // Abre com o valor que já está na caixa (lido no clique, não no render).
  const [open, setOpen] = useState<string | null>(null)
  const field = (
    <div ref={box} className={cn('relative', withCalc && '[&_input]:pr-11')}>
      {before && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{before}</span>}
      {children}
      {after && !withCalc && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{after}</span>}
      {withCalc && (
        <CalculatorToggle
          open={open !== null}
          onToggle={() => setOpen((o) => (o !== null ? null : (box.current?.querySelector('input')?.value.trim() ?? '')))}
        />
      )}
    </div>
  )
  if (!withCalc) return field
  return (
    <div className="flex flex-col">
      {field}
      {open !== null && <CalculatorPanel fieldRef={box} initial={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** Botões em pílula para escolhas curtas (tipo, combustível, subcategoria). */
export function Choices<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function PaymentSelect({ value, onChange }: { value: PaymentMethod; onChange: (v: PaymentMethod) => void }) {
  return (
    <Choices
      label="Forma de pagamento"
      value={value}
      onChange={onChange}
      options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
    />
  )
}

export function FormActions({ submitLabel, extra }: { submitLabel: string; extra?: ReactNode }) {
  return (
    <div className="flex gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {extra ?? (
        <DialogClose asChild>
          <Button type="button" variant="outline" className="flex-1">
            Cancelar
          </Button>
        </DialogClose>
      )}
      <Button type="submit" className="flex-1">
        {submitLabel}
      </Button>
    </div>
  )
}
