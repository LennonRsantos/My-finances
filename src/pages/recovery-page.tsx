import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Landmark,
  ListChecks,
  Mountain,
  Plus,
  RotateCcw,
  Scissors,
  Snowflake,
  Sparkles,
  TrendingDown,
  Wallet,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useMemo, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { DebtDialog } from '@/components/recovery/debt-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge, EmptyState, Switch, type Tone } from '@/components/ui/misc'
import { currentYearMonth, formatMonthLabel, todayISO, yearMonthToDate } from '@/lib/dates'
import { categoryIconMap } from '@/lib/icons'
import { formatMoney, fromCents, toCents } from '@/lib/money'
import {
  cancellableCosts,
  cutBases,
  computeDiagnosis,
  endingInstallments,
  evaluatePlan,
  GROUP_LABELS,
  GROUP_LIMITS,
  healthOf,
  HIGH_INTEREST,
  minimumBelowInterest,
  monthAfter,
  monthlyAmount,
  simulatePayoff,
  suggestCuts,
  sumMinimums,
  type Diagnosis,
  type HealthLevel,
  type PayoffResult,
  type PlanResult,
  type SpendingGroup,
} from '@/lib/recovery'
import { parseMoneyInput } from '@/lib/schemas'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import { useRecoveryStore } from '@/store/recovery-store'
import { useUIStore } from '@/store/ui-store'
import type { Debt, DebtStrategy, RecurringCost, YearMonth } from '@/types/finance'
import { PageHeader } from './dashboard-page'

const monthShort = (m: YearMonth) => format(yearMonthToDate(m), 'MMM/yy', { locale: ptBR })
const pct = (v: number) => `${Math.round(v * 100)}%`

const durationLabel = (months: number) => {
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'}`
  const y = Math.floor(months / 12)
  const m = months % 12
  return `${y} ${y === 1 ? 'ano' : 'anos'}${m ? ` e ${m} ${m === 1 ? 'mês' : 'meses'}` : ''}`
}

const groupColor: Record<SpendingGroup, string> = {
  essencial: 'var(--info)',
  dividas: 'var(--warning)',
  estilo: 'var(--expense)',
}
const groupTone: Record<SpendingGroup, Tone> = { essencial: 'info', dividas: 'warning', estilo: 'expense' }

/** Campo de dinheiro que só grava ao sair do campo (deixa digitar "12," sem brigar). */
function MoneyField({ value, onChange, id, label }: { value: number; onChange: (cents: number) => void; id: string; label: string }) {
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? (value ? fromCents(value).toFixed(2).replace('.', ',') : '')
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input
        id={id}
        aria-label={label}
        inputMode="decimal"
        placeholder="0,00"
        className="pl-10"
        value={shown}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === null) return
          const parsed = parseMoneyInput(text)
          onChange(Number.isNaN(parsed) || parsed < 0 ? 0 : toCents(parsed))
          setText(null)
        }}
      />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'income' | 'expense' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-lg font-semibold', tone === 'income' && 'text-income', tone === 'expense' && 'text-expense')}>
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diagnóstico
// ---------------------------------------------------------------------------

const healthCopy: Record<Exclude<HealthLevel, 'sem_dados'>, { title: string; tone: Tone; icon: typeof AlertTriangle }> = {
  vermelho: { title: 'No vermelho', tone: 'expense', icon: AlertTriangle },
  limite: { title: 'No limite', tone: 'warning', icon: TrendingDown },
  positivo: { title: 'Sobrando dinheiro', tone: 'income', icon: CheckCircle2 },
}

function DiagnosisCard({ d, health }: { d: Diagnosis; health: Exclude<HealthLevel, 'sem_dados'> }) {
  const { title, tone, icon: Icon } = healthCopy[health]
  const [first, last] = [d.months[0]!, d.months[d.months.length - 1]!]
  const period = first === last ? monthShort(first) : `${monthShort(first)} a ${monthShort(last)}`
  const over = d.income > 0 ? -d.balance / d.income : 0

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Badge tone={tone} className="w-fit">
              <Icon className="size-3.5" />
              {title}
            </Badge>
            <p className="text-2xl font-semibold">
              {health === 'vermelho' ? (
                <>
                  Você gasta <span className="text-expense">{formatMoney(-d.balance)}</span> a mais do que ganha por mês
                </>
              ) : health === 'limite' ? (
                <>
                  Sobram só <span className="text-warning">{formatMoney(d.balance)}</span> por mês
                </>
              ) : (
                <>
                  Sobram <span className="text-income">{formatMoney(d.balance)}</span> por mês
                </>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              Média de {period}
              {health === 'vermelho' && d.income > 0 && <> · gastos {pct(over)} acima da renda</>}
              {health === 'limite' && <> · qualquer imprevisto vira dívida</>}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Renda média" value={formatMoney(d.income)} tone="income" />
          <Stat label="Gastos médios" value={formatMoney(d.expenses)} tone="expense" />
          <Stat label="Contas atrasadas" value={formatMoney(d.overdue)} tone={d.overdue > 0 ? 'expense' : undefined} />
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Para onde vai a renda</p>
          {(Object.keys(GROUP_LIMITS) as SpendingGroup[]).map((g) => {
            const share = d.income > 0 ? d.groups[g] / d.income : d.groups[g] > 0 ? 1 : 0
            const limit = GROUP_LIMITS[g]
            const above = share > limit
            return (
              <div key={g} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{GROUP_LABELS[g]}</span>
                  <span className="text-muted-foreground">
                    {formatMoney(d.groups[g])} ·{' '}
                    <span className={cn('font-medium', above ? 'text-expense' : 'text-foreground')}>{pct(share)}</span>
                    <span className="text-xs"> (ideal até {pct(limit)})</span>
                  </span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(share, 1) * 100}%`, background: groupColor[g] }} />
                  <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${limit * 100}%` }} aria-hidden />
                </div>
              </div>
            )
          })}
          <p className="text-xs text-muted-foreground">
            Referência 50/30/20: até 50% da renda no essencial, 30% no estilo de vida e 20% em dívidas. A linha marca o teto.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Próximos passos
// ---------------------------------------------------------------------------

interface Step {
  title: string
  detail: string
}

function buildSteps(d: Diagnosis, plan: PlanResult, debts: Debt[], payoff: PayoffResult | null, health: HealthLevel): Step[] {
  const steps: Step[] = []
  if (d.overdue > 0)
    steps.push({
      title:
        d.overdueCount === 1
          ? `Negocie a conta atrasada (${formatMoney(d.overdue)})`
          : `Negocie as ${d.overdueCount} contas atrasadas (${formatMoney(d.overdue)})`,
      detail: 'Atraso soma multa, juros e pode negativar. Ligue para o credor e peça desconto à vista ou parcelamento sem juros.',
    })

  const expensive = debts.filter((x) => x.monthlyInterestRate >= HIGH_INTEREST)
  if (expensive.length)
    steps.push({
      title: `Troque a dívida cara: ${expensive.map((x) => x.creditorName).join(', ')}`,
      detail: `Juros acima de ${HIGH_INTEREST}% ao mês dobram a dívida rápido. Busque consignado, portabilidade ou empréstimo com garantia (juros bem menores) para quitar de uma vez.`,
    })

  const growing = debts.filter(minimumBelowInterest)
  if (growing.length)
    steps.push({
      title: `Pare a bola de neve: ${growing.map((x) => x.creditorName).join(', ')}`,
      detail: 'O que você paga por mês não cobre nem os juros, então a dívida só cresce. Essa é a primeira a renegociar.',
    })

  if (health === 'vermelho' || health === 'limite') {
    steps.push(
      plan.freed === 0
        ? {
            title: 'Monte seu plano de cortes abaixo',
            detail: `Use "Sugerir plano" para ver onde cortar ${formatMoney(Math.max(0, -d.balance))} por mês. Comece pelo estilo de vida.`,
          }
        : plan.newBalance < 0
          ? {
              title: `Seu plano ainda deixa ${formatMoney(-plan.newBalance)} de déficit`,
              detail: 'Aumente os cortes, cancele mais assinaturas ou busque renda extra até o saldo mensal ficar positivo.',
            }
          : {
              title: `Siga o plano: libera ${formatMoney(plan.freed)} por mês`,
              detail: `Saldo mensal vai para ${formatMoney(plan.newBalance)}. Coloque os cortes em prática já no próximo mês.`,
            },
    )
  }

  if (d.income > 0 && d.groups.dividas / d.income > GROUP_LIMITS.dividas)
    steps.push({
      title: 'Não faça parcelas novas por enquanto',
      detail: `Parcelas e dívidas já levam ${pct(d.groups.dividas / d.income)} da renda. Cada parcela nova empurra a saída do vermelho para mais longe.`,
    })

  if (payoff?.months && debts.length) {
    const first = debts.find((x) => x.id === payoff.order[0])
    steps.push({
      title: `Quite as dívidas em ${durationLabel(payoff.months)}`,
      detail: `Pague o mínimo de todas e jogue todo o extra em ${first?.creditorName ?? 'na primeira da lista'}. Quando ela zerar, a parcela dela vai para a próxima.`,
    })
  }

  steps.push({
    title: `Monte uma reserva de emergência de ${formatMoney(d.expenses * 3)}`,
    detail: 'São 3 meses de gastos. Com ela, imprevisto deixa de virar dívida. Comece com pouco, logo depois de quitar as dívidas caras.',
  })
  return steps
}

function StepsCard({ steps }: { steps: Step[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-5" />
          Próximos passos
        </CardTitle>
        <CardDescription>Na ordem em que fazem mais diferença.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Plano de cortes
// ---------------------------------------------------------------------------

function CutPlanCard({ d, result, cancellable }: { d: Diagnosis; result: PlanResult; cancellable: RecurringCost[] }) {
  const recurringCosts = useFinanceStore((s) => s.recurringCosts)
  const plan = useRecoveryStore(useShallow((s) => ({ cuts: s.cuts, cancelled: s.cancelled, extraIncome: s.extraIncome })))
  const { setCut, setCuts, toggleCancelled, setExtraIncome, reset } = useRecoveryStore(
    useShallow((s) => ({ setCut: s.setCut, setCuts: s.setCuts, toggleCancelled: s.toggleCancelled, setExtraIncome: s.setExtraIncome, reset: s.reset })),
  )
  const bases = cutBases(d, plan, recurringCosts)
  const cuttable = d.categories.filter((c) => c.cuttable > 0)
  const positive = result.newBalance >= 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scissors className="size-5" />
          Plano de cortes
        </CardTitle>
        <CardDescription>Simule cortes por categoria. Comece pelo estilo de vida: é onde dói menos.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className={cn('flex flex-col gap-3 rounded-2xl p-4', positive ? 'bg-income-soft' : 'bg-expense-soft')}>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Plano libera por mês" value={formatMoney(result.freed)} tone="income" />
            <Stat
              label="Saldo mensal com o plano"
              value={`${result.newBalance < 0 ? '−' : ''}${formatMoney(Math.abs(result.newBalance))}`}
              tone={positive ? 'income' : 'expense'}
            />
          </div>
          <p className="text-sm">
            {positive
              ? result.freed > 0
                ? `Saiu do vermelho. Use a sobra para quitar dívidas e montar reserva.`
                : 'Você já fecha o mês no azul. Os cortes podem acelerar a quitação das dívidas.'
              : `Faltam ${formatMoney(-result.newBalance)} por mês para parar de gastar mais do que ganha.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setCuts(suggestCuts(d, plan, recurringCosts))}>
              <Sparkles />
              Sugerir plano
            </Button>
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcw />
              Limpar
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Cortar gastos</p>
          {cuttable.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem despesas cortáveis nos últimos meses.</p>
          ) : (
            <ul className="divide-y">
              {cuttable.map((c) => {
                const Icon = categoryIconMap[c.category.icon]
                const value = plan.cuts[c.category.id] ?? 0
                const base = bases.get(c.category.id)?.base ?? 0
                return (
                  <li key={c.category.id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: c.category.color }}>
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.category.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatMoney(c.cuttable)}/mês
                          {c.cuttable < c.average && <> · fora {formatMoney(c.average - c.cuttable)} em parcelas</>}
                        </p>
                      </div>
                      <Badge tone={groupTone[c.group]}>{GROUP_LABELS[c.group]}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={value}
                        onChange={(e) => setCut(c.category.id, Number(e.target.value))}
                        aria-label={`Corte em ${c.category.name}`}
                        className="h-2 flex-1 cursor-pointer accent-primary"
                      />
                      <span className="w-[5.5rem] shrink-0 text-right text-xs tabular-nums sm:w-28 sm:text-sm">
                        {value}% · <span className="text-income">{formatMoney(Math.round((base * value) / 100))}</span>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {cancellable.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Cancelar assinaturas e fixos</p>
            <ul className="divide-y">
              {cancellable.map((rc) => (
                <li key={rc.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{rc.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(monthlyAmount(rc))}/mês{rc.frequency === 'anual' && ' (anual ÷ 12)'}
                    </p>
                  </div>
                  <Switch
                    checked={plan.cancelled.includes(rc.id)}
                    onCheckedChange={() => toggleCancelled(rc.id)}
                    aria-label={`Cancelar ${rc.description}`}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="extra-income" className="text-sm font-medium">
            Renda extra por mês
          </label>
          <MoneyField id="extra-income" label="Renda extra por mês" value={plan.extraIncome} onChange={setExtraIncome} />
          <p className="text-xs text-muted-foreground">Bico, freela, hora extra, venda de coisas paradas.</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Dívidas
// ---------------------------------------------------------------------------

const strategies: Record<DebtStrategy, { label: string; icon: typeof Mountain; hint: string }> = {
  avalanche: { label: 'Avalanche', icon: Mountain, hint: 'Maior juro primeiro. Paga menos juros no total.' },
  bola_de_neve: { label: 'Bola de neve', icon: Snowflake, hint: 'Menor dívida primeiro. Vitórias rápidas mantêm a motivação.' },
}

function DebtsCard({ debts, available }: { debts: Debt[]; available: number }) {
  const { strategy, debtExtra, setStrategy, setDebtExtra } = useRecoveryStore(
    useShallow((s) => ({ strategy: s.strategy, debtExtra: s.debtExtra, setStrategy: s.setStrategy, setDebtExtra: s.setDebtExtra })),
  )
  const [dialog, setDialog] = useState<{ debt?: Debt } | null>(null)
  const start = currentYearMonth()

  const minimums = sumMinimums(debts)
  const extra = debtExtra ?? Math.max(0, available)
  const results = useMemo(
    () => ({
      avalanche: simulatePayoff(debts, minimums + extra, 'avalanche'),
      bola_de_neve: simulatePayoff(debts, minimums + extra, 'bola_de_neve'),
      onlyMinimum: simulatePayoff(debts, minimums, strategy),
    }),
    [debts, minimums, extra, strategy],
  )
  const chosen = results[strategy]
  const other = results[strategy === 'avalanche' ? 'bola_de_neve' : 'avalanche']
  const total = debts.reduce((a, x) => a + x.currentBalance, 0)
  const saved = results.onlyMinimum.months !== null && chosen.months !== null ? results.onlyMinimum.totalInterest - chosen.totalInterest : null

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <Landmark className="size-5" />
            Plano de quitação
          </CardTitle>
          <CardDescription>Cadastre o que cobra juros e veja quando fica livre.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setDialog({})}>
          <Plus />
          Dívida
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {debts.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="Nenhuma dívida cadastrada"
            description="Cartão no rotativo, cheque especial, empréstimo, acordo. Com saldo, juros e parcela, o app monta a ordem de pagamento."
            action={
              <Button size="sm" onClick={() => setDialog({})}>
                <Plus />
                Adicionar dívida
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total devido" value={formatMoney(total)} tone="expense" />
              <Stat label="Mínimos por mês" value={formatMoney(minimums)} />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="debt-extra" className="text-sm font-medium">
                Extra por mês para as dívidas
              </label>
              <MoneyField id="debt-extra" label="Extra por mês para as dívidas" value={extra} onChange={setDebtExtra} />
              <p className="text-xs text-muted-foreground">
                {debtExtra === null
                  ? available > 0
                    ? 'Preenchido com a sobra do seu plano de cortes.'
                    : 'Sem sobra no plano ainda. Monte o plano de cortes ou informe um valor.'
                  : (
                    <button type="button" className="underline" onClick={() => setDebtExtra(null)}>
                      Usar a sobra do plano ({formatMoney(Math.max(0, available))})
                    </button>
                  )}
              </p>
            </div>

            <div role="radiogroup" aria-label="Estratégia" className="grid grid-cols-2 gap-2">
              {(Object.keys(strategies) as DebtStrategy[]).map((key) => {
                const s = strategies[key]
                const r = results[key]
                const active = strategy === key
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStrategy(key)}
                    className={cn(
                      'flex flex-col gap-1 rounded-2xl border p-3 text-left transition-colors',
                      active ? 'border-primary bg-muted' : 'hover:bg-muted',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <s.icon className="size-4" />
                      {s.label}
                    </span>
                    <span className="text-lg font-semibold">{r.months === null ? 'Não quita' : durationLabel(r.months)}</span>
                    <span className="text-xs text-muted-foreground">Juros: {formatMoney(r.totalInterest)}</span>
                    <span className="text-xs text-muted-foreground">{s.hint}</span>
                  </button>
                )
              })}
            </div>

            {chosen.months === null ? (
              <p className="flex gap-2 rounded-2xl bg-expense-soft p-3 text-sm text-expense">
                <AlertTriangle className="size-4 shrink-0" />
                Com esse valor as dívidas não acabam nunca: os juros crescem mais rápido que os pagamentos. Aumente o extra ou
                renegocie as dívidas mais caras.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Livre das dívidas em <span className="font-medium text-foreground">{formatMonthLabel(monthAfter(start, chosen.months))}</span>.
                {saved !== null && saved > 0 && (
                  <> Pagando só o mínimo, você gastaria <span className="font-medium text-expense">{formatMoney(saved)}</span> a mais em juros.</>
                )}
                {results.onlyMinimum.months === null && <> Pagando só o mínimo, você nunca sairia delas.</>}
                {other.months !== null && other.totalInterest < chosen.totalInterest && (
                  <> {strategies[other.strategy].label} economizaria {formatMoney(chosen.totalInterest - other.totalInterest)} em juros.</>
                )}
              </p>
            )}

            <ol className="flex flex-col divide-y">
              {chosen.order.map((id, i) => {
                const debt = debts.find((x) => x.id === id)
                if (!debt) return null
                const month = chosen.payoffMonth[id]
                const growing = minimumBelowInterest(debt)
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setDialog({ debt })}
                      className="flex w-full items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        className={cn(
                          'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                          i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {debt.creditorName}
                          {debt.monthlyInterestRate >= HIGH_INTEREST && <Badge tone="expense">Juros alto</Badge>}
                          {growing && <Badge tone="warning">Só cresce</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatMoney(debt.currentBalance)} · {String(debt.monthlyInterestRate).replace('.', ',')}% a.m. · paga{' '}
                          {formatMoney(debt.minimumPayment)}/mês
                        </p>
                      </div>
                      <span className="shrink-0 text-right text-xs text-muted-foreground">
                        {month ? (
                          <>
                            Quita em
                            <br />
                            <span className="text-sm font-medium text-foreground">{monthShort(monthAfter(start, month))}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </CardContent>
      <DebtDialog open={!!dialog} debt={dialog?.debt} onClose={() => setDialog(null)} />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Parcelas acabando
// ---------------------------------------------------------------------------

function EndingInstallmentsCard({ items }: { items: ReturnType<typeof endingInstallments> }) {
  if (!items.length) return null
  // Acumulado liberado até cada parcela terminar.
  const freed = items.map((_, i) => items.slice(0, i + 1).reduce((a, x) => a + x.monthly, 0))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-5" />
          Quando sobra mais
        </CardTitle>
        <CardDescription>Parcelas que terminam e o dinheiro que fica livre a cada mês.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((it, i) => {
            return (
              <li key={it.installmentId} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Faltam {it.remaining} {it.remaining === 1 ? 'parcela' : 'parcelas'} ({formatMoney(it.remainingTotal)}) · última em{' '}
                    {monthShort(it.lastMonth)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-income">+{formatMoney(it.monthly)}/mês</p>
                  <p className="text-xs text-muted-foreground">livre: {formatMoney(freed[i]!)}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export function RecoveryPage() {
  const { transactions, categories, recurringCosts, debts } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, categories: s.categories, recurringCosts: s.recurringCosts, debts: s.debts })),
  )
  const plan = useRecoveryStore(useShallow((s) => ({ cuts: s.cuts, cancelled: s.cancelled, extraIncome: s.extraIncome })))
  const strategy = useRecoveryStore((s) => s.strategy)
  const debtExtra = useRecoveryStore((s) => s.debtExtra)
  const openForm = useUIStore((s) => s.setTransactionDialogOpen)
  const today = todayISO()

  const diagnosis = useMemo(() => computeDiagnosis(transactions, categories, currentYearMonth(), today), [transactions, categories, today])
  const health = healthOf(diagnosis)
  const cancellable = useMemo(() => cancellableCosts(recurringCosts), [recurringCosts])
  const result = useMemo(() => evaluatePlan(diagnosis, plan, recurringCosts), [diagnosis, plan, recurringCosts])
  const ending = useMemo(() => endingInstallments(transactions), [transactions])
  const payoff = useMemo(
    () => (debts.length ? simulatePayoff(debts, sumMinimums(debts) + (debtExtra ?? Math.max(0, result.newBalance)), strategy) : null),
    [debts, debtExtra, result.newBalance, strategy],
  )

  return (
    <>
      <PageHeader title="Sair do vermelho" />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        {health === 'sem_dados' ? (
          <Card>
            <EmptyState
              icon={Wallet}
              title="Lance sua renda e seus gastos"
              description="O diagnóstico usa a média dos últimos 3 meses. Cadastre salário, contas fixas e gastos do dia a dia para ver onde o dinheiro está indo."
              action={
                <Button onClick={() => openForm(true, 'receita')}>
                  <Plus />
                  Lançar renda
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <DiagnosisCard d={diagnosis} health={health} />
            <StepsCard steps={buildSteps(diagnosis, result, debts, payoff, health)} />
            <CutPlanCard d={diagnosis} result={result} cancellable={cancellable} />
          </>
        )}
        <DebtsCard debts={debts} available={result.newBalance} />
        <EndingInstallmentsCard items={ending} />
      </main>
    </>
  )
}
