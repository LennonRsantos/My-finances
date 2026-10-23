import { Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CreditCard } from '@/types/finance'

/** Qual cartão de crédito foi usado (aba Cartões). */
export function CardSelect({ cards, value, onChange }: { cards: CreditCard[]; value: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="card-select">Cartão</Label>
      <Select value={value ?? 'none'} onValueChange={(v) => onChange(v === 'none' ? null : v)}>
        <SelectTrigger id="card-select" aria-label="Cartão">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {cards.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
              {c.last4 ? ` •••• ${c.last4}` : ''}
            </SelectItem>
          ))}
          <SelectItem value="none">Sem cartão cadastrado</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
