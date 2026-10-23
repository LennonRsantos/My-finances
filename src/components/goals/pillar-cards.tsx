import { ChartPie, Landmark, Pencil, Plus, ReceiptText, ShieldCheck, TrendingUp, TreePalm, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, Progress } from '@/components/ui/misc'
import { durationLabel, formatMonthLabel } from '@/lib/dates'
import { goalProgress } from '@/lib/goals'
import { formatMoney } from '@/lib/money'
import {
  allocation,
  ASSET_LABELS,
  depositsInMonth,
  expensiveDebts,
  KIND_LABELS,
  monthsToReach,
  savedIn,
  type IncomeGrowth,
  type PlanTargets,
  type SeasonalItem,
} from '@/lib/plan'
import { HIGH_INTEREST } from '@/lib/recovery'
import { useUIStore } from '@/store/ui-store'
import type { Debt, Goal, GoalPlan, ISODate, YearMonth } from '@/types/finance'
import type { GoalDialogState } from './goal-dialogs'

type Open = (s: GoalDialogState) => void

const pct = (v: number) => `${Math.round(v * 100)}%`
const decimal = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

function Pillar({
  icon: Icon,
  title,
  description,
  badge,
  actions,
  children,
}: {
  icon: LucideIcon
  title: string
  description?: string
  badge?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <Icon className="size-4" />
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {badge}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {children}
        {actions && <div className="mt-auto flex flex-wrap gap-2 pt-1">{actions}</div>}
      </CardContent>
    </Card>
  )
}

const Big = ({ children }: { children: ReactNode }) => <p className="text-2xl font-semibold tracking-[-0.01em] tabular-nums">{children}</p>
const Note = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>

/** Guardado × alvo, com Guardar e Editar. */
function GoalBlock({ goal, today, onOpen, children }: { goal: Goal; today: ISODate; onOpen: Open; children?: ReactNode }) {
  const p = goalProgress(goal, today)
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm tabular-nums">
          <span className="text-2xl font-semibold tracking-[-0.01em]">{formatMoney(p.saved)}</span>
          <span className="text-muted-foreground"> de {formatMoney(goal.target)}</span>
        </p>
        <Progress value={p.ratio} color="var(--income)" label={`${goal.name}: ${pct(p.ratio)} juntado`} />
      </div>
      {children}
      <GoalActions goal={goal} onOpen={onOpen} done={p.status === 'concluida'} />
    </>
  )
}

function GoalActions({ goal, onOpen, done }: { goal: Goal; onOpen: Open; done: boolean }) {
  return (
    <div className="mt-auto flex flex-wrap gap-2 pt-1">
      {!done && (
        <Button size="sm" onClick={() => onOpen({ kind: 'deposit', goal })}>
          Guardar
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => onOpen({ kind: 'goal', goal })}>
        <Pencil />
        Editar
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reserva de emergência
// ---------------------------------------------------------------------------

export function ReserveCard({ goal, targets, plan, today, onOpen }: { goal?: Goal; targets: PlanTargets; plan: GoalPlan; today: ISODate; onOpen: Open }) {
  const base = plan.reserveBase === 'renda' || targets.living === 0 ? 'renda' : 'custo de vida'
  const formula = `${formatMoney(targets.reserveMonthly)} de ${base} × ${plan.reserveMonths} meses`
  const where = 'Deixe num investimento de liquidez diária e baixo risco, como Tesouro Selic ou CDB 100% do CDI.'

  if (!goal) {
    const preset = targets.reserve > 0 ? { target: targets.reserve, autoTarget: true } : {}
    return (
      <Pillar
        icon={ShieldCheck}
        title={KIND_LABELS.reserva}
        description={`${plan.reserveMonths} meses de ${base} guardados para imprevistos.`}
        actions={
          <Button size="sm" onClick={() => onOpen({ kind: 'goal', preset: { kind: 'reserva', name: KIND_LABELS.reserva, asset: 'renda_fixa', ...preset } })}>
            <Plus />
            Criar reserva
          </Button>
        }
      >
        {targets.reserve > 0 ? (
          <div>
            <Big>{formatMoney(targets.reserve)}</Big>
            <Note>{formula}</Note>
          </div>
        ) : (
          <Note>Lance sua renda e seus gastos para o app calcular o valor.</Note>
        )}
        <Note>{where}</Note>
      </Pillar>
    )
  }

  const p = goalProgress(goal, today)
  const covered = targets.reserveMonthly > 0 ? p.saved / targets.reserveMonthly : null
  return (
    <Pillar
      icon={ShieldCheck}
      title={KIND_LABELS.reserva}
      description={goal.autoTarget ? formula : `${plan.reserveMonths} meses de ${base} guardados para imprevistos.`}
      badge={p.status === 'concluida' ? <Badge tone="income">Completa</Badge> : <Badge>{pct(p.ratio)}</Badge>}
    >
      <GoalBlock goal={goal} today={today} onOpen={onOpen}>
        {covered !== null && (
          <Note>
            Cobre <span className="font-medium text-foreground">{decimal(covered)}</span> de {plan.reserveMonths} meses de {base}.
            {p.status !== 'concluida' && ' Guarde aqui parte dos seus investimentos até completar.'}
          </Note>
        )}
        {!goal.asset && <Note>{where}</Note>}
      </GoalBlock>
    </Pillar>
  )
}

// ---------------------------------------------------------------------------
// Liberdade financeira
// ---------------------------------------------------------------------------

export function FreedomCard({ goal, targets, plan, today, onOpen }: { goal?: Goal; targets: PlanTargets; plan: GoalPlan; today: ISODate; onOpen: Open }) {
  const target = goal?.target ?? targets.freedom
  const saved = goal ? savedIn(goal) : 0
  const income = targets.income.value
  const formula = `${formatMoney(targets.freedomIncome)} por mês × ${plan.freedomMultiplier}`
  const rates = [...new Set([plan.split.investir, 15, 20])].filter((r) => r > 0).sort((a, b) => a - b)

  const eta =
    income > 0 && target > 0 && saved < target ? (
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">Quanto tempo leva, rendendo 0,5% ao mês acima da inflação:</p>
        <ul className="flex flex-col divide-y rounded-xl border text-sm">
          {rates.map((r) => {
            const monthly = Math.round((income * r) / 100)
            const months = monthsToReach(saved, target, monthly)
            return (
              <li key={r} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span>
                  {r}% da renda <span className="text-muted-foreground">({formatMoney(monthly)}/mês)</span>
                </span>
                <span className="whitespace-nowrap font-medium tabular-nums">{months === null ? '+100 anos' : durationLabel(months)}</span>
              </li>
            )
          })}
        </ul>
      </div>
    ) : null

  const why = `Retirando ${decimal(100 / plan.freedomMultiplier)}% ao mês (cerca de ${decimal(1200 / plan.freedomMultiplier)}% ao ano acima da inflação), o patrimônio paga ${formatMoney(Math.round(target / plan.freedomMultiplier))} por mês sem acabar.`

  if (!goal)
    return (
      <Pillar
        icon={TreePalm}
        title={KIND_LABELS.liberdade}
        description="Patrimônio para viver de rendimentos."
        actions={
          <Button
            size="sm"
            onClick={() =>
              onOpen({ kind: 'goal', preset: { kind: 'liberdade', name: KIND_LABELS.liberdade, ...(targets.freedom > 0 ? { target: targets.freedom, autoTarget: true } : {}) } })
            }
          >
            <Plus />
            Criar meta
          </Button>
        }
      >
        {target > 0 ? (
          <div>
            <Big>{formatMoney(target)}</Big>
            <Note>{formula}</Note>
          </div>
        ) : (
          <Note>Lance sua renda ou informe no plano quanto quer receber por mês.</Note>
        )}
        {eta}
        {target > 0 && <Note>{why}</Note>}
      </Pillar>
    )

  return (
    <Pillar
      icon={TreePalm}
      title={KIND_LABELS.liberdade}
      description={goal.autoTarget ? formula : 'Patrimônio para viver de rendimentos.'}
      badge={<Badge tone={saved >= target ? 'income' : 'neutral'}>{pct(target > 0 ? Math.min(1, saved / target) : 0)}</Badge>}
    >
      <GoalBlock goal={goal} today={today} onOpen={onOpen}>
        {eta}
        <Note>{why}</Note>
      </GoalBlock>
    </Pillar>
  )
}

// ---------------------------------------------------------------------------
// Despesas anuais
// ---------------------------------------------------------------------------

export function SeasonalCard({ items, goal, month, onOpen }: { items: SeasonalItem[]; goal?: Goal; month: YearMonth; onOpen: Open }) {
  const monthly = items.reduce((a, i) => a + i.monthly, 0)
  const shown = items.slice(0, 5)
  const savedMonth = goal ? depositsInMonth([goal], month) : 0
  const monthName = formatMonthLabel(month).toLowerCase()

  return (
    <Pillar
      icon={ReceiptText}
      title={KIND_LABELS.anual}
      description={monthly > 0 ? `${formatMoney(monthly * 12)} por ano. Guarde 1/12 todo mês.` : 'IPVA, IPTU, seguros, revisões e compras de fim de ano.'}
      badge={goal && monthly > 0 ? <Badge tone={savedMonth >= monthly ? 'income' : 'warning'}>{savedMonth >= monthly ? 'Mês em dia' : 'Falta no mês'}</Badge> : undefined}
      actions={
        goal ? undefined : (
          <Button size="sm" onClick={() => onOpen({ kind: 'goal', preset: { kind: 'anual', name: KIND_LABELS.anual, ...(monthly > 0 ? { target: monthly * 12 } : {}) } })}>
            <Plus />
            Criar caixinha
          </Button>
        )
      }
    >
      {monthly > 0 ? (
        <>
          <div>
            <Big>{formatMoney(monthly)}/mês</Big>
            <Note>{goal ? `Guardado em ${monthName}: ${formatMoney(savedMonth)} · na caixinha: ${formatMoney(savedIn(goal))}` : 'É quanto separar todo mês para essas contas não pesarem quando chegam.'}</Note>
          </div>
          {goal && <Progress value={savedMonth / monthly} color="var(--income)" label={`Despesas anuais: ${pct(savedMonth / monthly)} do mês guardado`} />}
          <ul className="flex flex-col divide-y rounded-xl border text-sm">
            {shown.map((i) => (
              <li key={`${i.owner}-${i.label}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{i.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {formatMoney(i.amount)} {i.when}
                    {i.owner && ` · ${i.owner}`}
                  </span>
                </span>
                <span className="whitespace-nowrap tabular-nums">{formatMoney(i.monthly)}/mês</span>
              </li>
            ))}
          </ul>
          {items.length > shown.length && <Note>E mais {items.length - shown.length}.</Note>}
        </>
      ) : (
        <Note>Cadastre IPVA, IPTU e seguros como gasto fixo anual, e o custo das manutenções no Veículo e na Casa: o app soma e divide por 12.</Note>
      )}
      {goal && <GoalActions goal={goal} onOpen={onOpen} done={false} />}
    </Pillar>
  )
}

// ---------------------------------------------------------------------------
// Dívidas caras
// ---------------------------------------------------------------------------

export function DebtCard({ debts, overdue, overdueCount }: { debts: Debt[]; overdue: number; overdueCount: number }) {
  const setView = useUIStore((s) => s.setView)
  const expensive = expensiveDebts(debts)
  const total = expensive.reduce((a, d) => a + d.currentBalance, 0)
  const ok = expensive.length === 0 && overdue === 0

  return (
    <Pillar
      icon={Landmark}
      title="Dívidas caras"
      description="Rotativo do cartão, cheque especial, empréstimo pessoal."
      badge={ok ? <Badge tone="income">Zero</Badge> : <Badge tone="expense">Prioridade</Badge>}
      actions={
        <Button size="sm" variant="outline" onClick={() => setView('inteligencia')}>
          {ok ? 'Ver dívidas' : 'Plano de quitação'}
        </Button>
      }
    >
      {ok ? (
        <Note>Nenhuma dívida de juros alto cadastrada e nenhuma conta atrasada. Mantenha assim: é a base para investir.</Note>
      ) : (
        <>
          {total > 0 && <Big>{formatMoney(total)}</Big>}
          <ul className="flex flex-col divide-y rounded-xl border text-sm">
            {expensive.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{d.creditorName}</span>
                  <span className="text-xs text-expense">{d.monthlyInterestRate.toLocaleString('pt-BR')}% ao mês</span>
                </span>
                <span className="whitespace-nowrap tabular-nums">{formatMoney(d.currentBalance)}</span>
              </li>
            ))}
            {overdue > 0 && (
              <li className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span>{overdueCount === 1 ? '1 conta atrasada' : `${overdueCount} contas atrasadas`}</span>
                <span className="whitespace-nowrap tabular-nums text-expense">{formatMoney(overdue)}</span>
              </li>
            )}
          </ul>
          <Note>Quite antes de investir: juros de {HIGH_INTEREST}% ao mês ou mais crescem mais rápido do que qualquer investimento rende.</Note>
        </>
      )}
    </Pillar>
  )
}

// ---------------------------------------------------------------------------
// Aumento de renda
// ---------------------------------------------------------------------------

export function IncomeGrowthCard({ growth, target, onAdjust }: { growth: IncomeGrowth; target: number | null; onAdjust: () => void }) {
  const { current, previous, change, until } = growth
  const lastYear = String(Number(until.slice(0, 4)) - 1)
  const goal = target !== null ? target / 100 : null
  const hit = change !== null && goal !== null && change >= goal
  const missing = goal !== null && previous > 0 ? Math.max(0, Math.round(previous * (1 + goal)) - current) : 0

  return (
    <Pillar
      icon={TrendingUp}
      title="Aumento de renda"
      description={`De janeiro a ${formatMonthLabel(until).toLowerCase()}, comparado com ${lastYear}.`}
      badge={
        change !== null ? (
          <Badge tone={hit ? 'income' : change < 0 ? 'expense' : 'neutral'}>
            {change >= 0 ? '+' : '−'}
            {decimal(Math.abs(change) * 100)}%
          </Badge>
        ) : undefined
      }
      actions={
        <Button size="sm" variant="outline" onClick={onAdjust}>
          {target === null ? 'Definir meta' : 'Mudar meta'}
        </Button>
      }
    >
      <div>
        <Big>{formatMoney(current)}</Big>
        <Note>{previous > 0 ? `Mesmo período de ${lastYear}: ${formatMoney(previous)}` : `Sem receitas lançadas em ${lastYear} para comparar.`}</Note>
      </div>
      {goal !== null && change !== null && (
        <div className="flex flex-col gap-1.5">
          <Progress value={goal > 0 ? Math.max(0, change) / goal : 1} color="var(--income)" label={`Aumento de renda: ${pct(goal > 0 ? Math.max(0, change) / goal : 1)} da meta`} />
          <p className="text-xs text-muted-foreground">{hit ? `Meta de +${target}% batida.` : `Meta: +${target}% · faltam ${formatMoney(missing)} no ano.`}</p>
        </div>
      )}
      <Note>Renda extra, cursos, novos projetos: cada aumento também faz crescer seus investimentos do mês.</Note>
    </Pillar>
  )
}

// ---------------------------------------------------------------------------
// Diversificação
// ---------------------------------------------------------------------------

const ASSET_COLORS = { renda_fixa: 'var(--info)', renda_variavel: 'var(--income)', sem_tipo: 'var(--muted-foreground)' }

export function AllocationCard({ goals, reserveDone }: { goals: Goal[]; reserveDone: boolean }) {
  const a = allocation(goals)
  const total = a.renda_fixa + a.renda_variavel + a.sem_tipo
  const parts = (['renda_fixa', 'renda_variavel', 'sem_tipo'] as const).filter((k) => a[k] > 0)

  return (
    <Pillar
      icon={ChartPie}
      title="Diversificação"
      description={reserveDone ? 'Divida os aportes entre proteção e crescimento.' : 'Começa quando a reserva estiver completa.'}
    >
      {total > 0 ? (
        <>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            {parts.map((k) => (
              <div key={k} className="h-full" style={{ width: `${(a[k] / total) * 100}%`, background: ASSET_COLORS[k] }} />
            ))}
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {parts.map((k) => (
              <li key={k} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: ASSET_COLORS[k] }} aria-hidden />
                  {k === 'sem_tipo' ? 'Sem tipo marcado' : ASSET_LABELS[k]}
                </span>
                <span className="whitespace-nowrap tabular-nums">
                  {formatMoney(a[k])} <span className="text-muted-foreground">· {pct(a[k] / total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Note>Marque em cada caixinha onde o dinheiro está aplicado para ver a divisão.</Note>
      )}
      <Note>
        {reserveDone
          ? 'Renda fixa traz proteção e previsibilidade. Renda variável (ações, fundos imobiliários) busca crescimento e dividendos.'
          : 'Até lá, mantenha tudo em renda fixa com liquidez diária: a reserva vem antes de buscar rendimento maior.'}
      </Note>
    </Pillar>
  )
}
