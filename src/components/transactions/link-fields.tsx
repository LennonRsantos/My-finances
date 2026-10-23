import { Choices } from '@/components/ui/form-kit'
import { Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { COST_KIND_LABEL, type LinkTarget } from '@/lib/areas'
import type { CostKind, Vehicle } from '@/types/finance'

/** "Vincular a: Nenhum / Casa / Veículo" e, com vínculo, "Custo: Fixo / Variável". */
export function LinkFields({
  link,
  onLink,
  vehicles,
  vehicleId,
  onVehicle,
  kind,
  onKind,
  autoKind,
}: {
  link: LinkTarget
  onLink: (v: LinkTarget) => void
  vehicles: Vehicle[]
  vehicleId: string | null
  onVehicle: (id: string) => void
  kind: CostKind
  onKind: (k: CostKind) => void
  autoKind: CostKind
}) {
  const options: { value: LinkTarget; label: string }[] = [
    { value: 'nenhum', label: 'Nenhum' },
    { value: 'casa', label: 'Casa' },
    ...(vehicles.length ? [{ value: 'veiculo' as const, label: 'Veículo' }] : []),
  ]
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-col gap-2">
        <Label>Vincular a</Label>
        <Choices label="Vincular a" value={link} onChange={onLink} options={options} />
        <p className="text-xs text-muted-foreground">
          {link === 'casa'
            ? 'Aparece também em Casa, para organizar os gastos da casa.'
            : link === 'veiculo'
              ? 'Aparece também na aba Veículo.'
              : 'Fica só em Lançamentos.'}
        </p>
      </div>
      {link === 'veiculo' && vehicles.length > 1 && (
        <div className="flex flex-col gap-2">
          <Label>Veículo</Label>
          <Select value={vehicleId ?? vehicles[0]!.id} onValueChange={onVehicle}>
            <SelectTrigger aria-label="Veículo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {link !== 'nenhum' && (
        <div className="flex flex-col gap-2">
          <Label>Custo</Label>
          <Choices
            label="Custo"
            value={kind}
            onChange={onKind}
            options={[
              { value: 'fixo', label: COST_KIND_LABEL.fixo },
              { value: 'variavel', label: COST_KIND_LABEL.variavel },
            ]}
          />
          {kind === autoKind && (
            <p className="text-xs text-muted-foreground">{autoKind === 'fixo' ? 'Fixo porque repete ou é parcelado.' : 'Variável: muda de um mês para outro.'}</p>
          )}
        </div>
      )}
    </div>
  )
}
