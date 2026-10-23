/**
 * Onde cada lançamento "mora": Casa, Veículo ou outros, e se o custo é fixo ou
 * variável. Regra única, usada pela Casa, Veículo, Dashboard e Relatórios.
 */
import type { CostKind, Transaction } from '@/types/finance'

// Mesmos ids de `home.ts` e `vehicle.ts` (sem importar, para não criar ciclo).
const HOME_CATEGORY_ID = 'cat-moradia'
const VEHICLE_CATEGORY_ID = 'cat-veiculo'

export type Area = 'casa' | 'veiculo' | 'outros'

export const DEFAULT_HOME_CATEGORIES: readonly string[] = [HOME_CATEGORY_ID]
export const DEFAULT_VEHICLE_CATEGORIES: readonly string[] = [VEHICLE_CATEGORY_ID]

type Linkable = Pick<Transaction, 'categoryId' | 'homeLink' | 'vehicleId'>

/** Vinculado à Casa: escolha do lançamento, senão a categoria marcada como da casa. */
export const isHome = (t: Linkable, homeCats: ReadonlySet<string>) => t.homeLink ?? homeCats.has(t.categoryId)

export const isVehicle = (t: Linkable) => !!t.vehicleId || t.categoryId === VEHICLE_CATEGORY_ID

export const areaOf = (t: Linkable, homeCats: ReadonlySet<string>): Area => (isHome(t, homeCats) ? 'casa' : isVehicle(t) ? 'veiculo' : 'outros')

/** Fixo: conta fixa ou parcela, a menos que o lançamento diga outra coisa. */
export const costKindOf = (t: Pick<Transaction, 'costKind' | 'recurringCostId' | 'installment'>): CostKind =>
  t.costKind ?? (t.recurringCostId || t.installment ? 'fixo' : 'variavel')

export const COST_KIND_LABEL: Record<CostKind, string> = { fixo: 'Fixo', variavel: 'Variável' }

/** Soma por fixo/variável. */
export function costSplit(list: Pick<Transaction, 'amount' | 'costKind' | 'recurringCostId' | 'installment'>[]) {
  let fixo = 0
  let variavel = 0
  for (const t of list) {
    if (costKindOf(t) === 'fixo') fixo += t.amount
    else variavel += t.amount
  }
  return { fixo, variavel }
}

// ---------------------------------------------------------------------------
// Vínculo escolhido no formulário
// ---------------------------------------------------------------------------

export type LinkTarget = 'nenhum' | 'casa' | 'veiculo'

/** Vínculo sugerido pela categoria (Configurações > Categorias). */
export function defaultLink(categoryId: string, homeCats: ReadonlySet<string>, vehicleCats: ReadonlySet<string>, hasVehicles: boolean): LinkTarget {
  if (homeCats.has(categoryId)) return 'casa'
  if (hasVehicles && vehicleCats.has(categoryId)) return 'veiculo'
  return 'nenhum'
}

/** Vínculo atual de um lançamento já salvo. */
export function currentLink(t: Pick<Transaction, 'categoryId' | 'homeLink' | 'vehicleId'>, homeCats: ReadonlySet<string>): LinkTarget {
  if (t.homeLink ?? homeCats.has(t.categoryId)) return 'casa'
  return t.vehicleId ? 'veiculo' : 'nenhum'
}

/**
 * O que gravar: `homeLink` só quando difere da categoria (assim marcar/desmarcar
 * a categoria nas Configurações continua valendo); `costKind` só quando foi
 * trocado do automático. `null` limpa o campo numa edição.
 */
export function linkPayload(
  categoryId: string,
  link: LinkTarget,
  vehicleId: string | null,
  kind: CostKind,
  autoKind: CostKind,
  homeCats: ReadonlySet<string>,
): Pick<Transaction, 'homeLink' | 'costKind' | 'vehicleId'> {
  const byCategory = homeCats.has(categoryId)
  const home = link === 'casa'
  return {
    homeLink: home === byCategory ? null : home,
    costKind: link !== 'nenhum' && kind !== autoKind ? kind : null,
    vehicleId: link === 'veiculo' ? vehicleId : null,
  }
}

/** Some com os campos nulos (lançamento novo não precisa gravá-los). */
export const compactLink = (p: Pick<Transaction, 'homeLink' | 'costKind' | 'vehicleId'>) => ({
  ...(p.homeLink != null ? { homeLink: p.homeLink } : {}),
  ...(p.costKind ? { costKind: p.costKind } : {}),
  vehicleId: p.vehicleId ?? null,
})
