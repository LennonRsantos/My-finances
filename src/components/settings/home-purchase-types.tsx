import { ShoppingBasket } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { NameListCard, type NamedItem } from '@/components/settings/name-list-card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { HOME_CATEGORY_ID, HOME_MAINTENANCE_SUBCATEGORY_ID, PURCHASE_ID_PREFIX, purchaseTypes } from '@/lib/home'
import { createId } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'

/** Excluir tipo em uso pede outro tipo: sem tipo, a compra cairia em Contas do mês. */
function RemoveType({ type, others, onDone }: { type: NamedItem; others: NamedItem[]; onDone: () => void }) {
  const deleteSubcategory = useFinanceStore((s) => s.deleteSubcategory)
  const usage = useFinanceStore(
    (s) => s.transactions.filter((t) => t.subcategoryId === type.id).length + s.recurringCosts.filter((r) => r.subcategoryId === type.id).length,
  )
  const [moveTo, setMoveTo] = useState('')
  const blocked = usage > 0 && !moveTo
  return (
    <>
      <span className="text-sm">
        Excluir {type.name}?
        {usage > 0 && (
          <span className="text-muted-foreground">
            {' '}
            {usage} {usage === 1 ? 'lançamento vai' : 'lançamentos vão'} para:
          </span>
        )}
      </span>
      {usage > 0 && (
        <Select value={moveTo || undefined} onValueChange={setMoveTo}>
          <SelectTrigger aria-label="Mover para o tipo" className="h-9">
            <SelectValue placeholder="Escolha o tipo" />
          </SelectTrigger>
          <SelectContent>
            {others.map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {x.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Não
        </Button>
        <Button
          type="button"
          variant="expense"
          size="sm"
          disabled={blocked}
          onClick={() => {
            deleteSubcategory(type.id, moveTo || null)
            onDone()
          }}
        >
          Excluir
        </Button>
      </div>
    </>
  )
}

/**
 * Tipos de compra da casa (subcategorias de Moradia que vão para Casa > Compras).
 * Manutenção e reparos só renomeia: a manutenção da casa lança nele.
 */
export function HomePurchaseTypesCard() {
  const { subcategories, saveSubcategory } = useFinanceStore(
    useShallow((s) => ({ subcategories: s.subcategories, saveSubcategory: s.saveSubcategory })),
  )
  const types = useMemo(() => purchaseTypes(subcategories), [subcategories])
  return (
    <NameListCard
      title="Tipos de compra"
      icon={ShoppingBasket}
      description="Aparecem em Tipo ao lançar uma compra para a casa."
      items={types}
      placeholder="Novo tipo (ex.: Cama, mesa e banho)"
      addLabel="Novo tipo de compra"
      footer={<p className="text-xs text-muted-foreground">Contas (aluguel, luz...) ficam em Categorias &gt; Moradia.</p>}
      onAdd={(name) => saveSubcategory({ id: `${PURCHASE_ID_PREFIX}${createId()}`, categoryId: HOME_CATEGORY_ID, name, monthlyBudget: null })}
      onRename={(id, name) => {
        const sc = types.find((x) => x.id === id)
        if (sc) saveSubcategory({ ...sc, name })
      }}
      canRemove={(x) => x.id !== HOME_MAINTENANCE_SUBCATEGORY_ID}
      renderRemove={(item, close) => <RemoveType type={item} others={types.filter((x) => x.id !== item.id)} onDone={close} />}
    />
  )
}
