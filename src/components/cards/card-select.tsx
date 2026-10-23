import { FieldError, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CreditCard } from '@/types/finance'

/** Qual cartão de crédito foi usado (aba Cartões). */
export function CardSelect({
  cards,
  value,
  onChange,
  error,
}: {
  cards: CreditCard[]
  value: string | null
  onChange: (id: string | null) => void
  error?: string | null
}) {
  // Com vários cartões a escolha é obrigatória: começa vazio, sem "Sem cartão".
  const required = cards.length > 1
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="card-select">{required ? 'Qual cartão?' : 'Cartão'}</Label>
      <Select value={value ?? (required ? '' : 'none')} onValueChange={(v) => onChange(v === 'none' ? null : v)}>
        <SelectTrigger id="card-select" aria-label="Cartão" aria-invalid={!!error}>
          <SelectValue placeholder="Escolha o cartão" />
        </SelectTrigger>
        <SelectContent>
          {cards.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
              {c.last4 ? ` •••• ${c.last4}` : ''}
            </SelectItem>
          ))}
          {!required && <SelectItem value="none">Sem cartão cadastrado</SelectItem>}
        </SelectContent>
      </Select>
      <FieldError message={error ?? undefined} />
    </div>
  )
}
