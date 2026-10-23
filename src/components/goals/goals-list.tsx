import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { PiggyBank, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, EmptyState, Progress, type Tone } from '@/components/ui/misc'
import { parseDate } from '@/lib/dates'
import { goalProgress, type GoalProgress, type GoalStatus } from '@/lib/goals'
import { formatMoney } from '@/lib/money'
import { KIND_LABELS, kindOf } from '@/lib/plan'
import type { Goal, ISODate } from '@/types/finance'
import type { GoalDialogState } from './goal-dialogs'

const STATUS: Record<GoalStatus, { label: string; tone: Tone } | null> = {
  concluida: { label: 'Concluída', tone: 'income' },
  no_ritmo: { label: 'No ritmo', tone: 'income' },
  abaixo: { label: 'Falta guardar no mês', tone: 'warning' },
  vencida: { label: 'Prazo passou', tone: 'expense' },
  sem_prazo: null,
}

const deadlineLabel = (g: Goal) => (g.deadline ? format(parseDate(g.deadline), 'MMM/yy', { locale: ptBR }) : null)

function hint(g: Goal, p: GoalProgress) {
  if (p.status === 'concluida') return 'Valor juntado. Pode retirar quando for usar.'
  if (p.status === 'vencida') return `Faltaram ${formatMoney(p.remaining)}. Ajuste o prazo para recalcular.`
  if (p.perMonth !== null) {
    const left = p.perMonth - Math.max(0, p.savedThisMonth)
    return left > 0
      ? `Guarde ${formatMoney(p.perMonth)}/mês até ${deadlineLabel(g)} · faltam ${formatMoney(left)} neste mês`
      : `Guarde ${formatMoney(p.perMonth)}/mês até ${deadlineLabel(g)} · mês em dia`
  }
  return `Faltam ${formatMoney(p.remaining)}`
}

/** Caixinhas: progresso e quanto guardar por mês para chegar no prazo. */
export function GoalsList({ goals, today, onOpen }: { goals: Goal[]; today: ISODate; onOpen: (s: GoalDialogState) => void }) {
  const rows = goals
    .map((g) => ({ g, p: goalProgress(g, today) }))
    // Concluídas por último; depois, quem vence antes.
    .sort((a, b) => Number(a.p.status === 'concluida') - Number(b.p.status === 'concluida') || (a.g.deadline ?? '9999').localeCompare(b.g.deadline ?? '9999'))
  const monthly = rows.reduce((a, r) => a + (r.p.status !== 'concluida' && r.p.perMonth ? r.p.perMonth : 0), 0)

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <PiggyBank className="size-4" />
            Caixinhas
          </CardTitle>
          <CardDescription>{monthly > 0 ? `Para todas no prazo: ${formatMoney(monthly)} por mês.` : 'Dinheiro separado para seus objetivos.'}</CardDescription>
        </div>
        {rows.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => onOpen({ kind: 'goal' })}>
            <Plus />
            Meta
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={PiggyBank}
            title="Nenhuma caixinha ainda"
            description="Viagem, reserva de emergência, troca do carro: diga quanto e até quando, e o app mostra quanto guardar por mês."
            className="py-6"
            action={
              <Button size="sm" onClick={() => onOpen({ kind: 'goal' })}>
                <Plus />
                Criar meta
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col divide-y">
            {rows.map(({ g, p }) => {
              const status = STATUS[p.status]
              const kind = kindOf(g)
              return (
                <li key={g.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onOpen({ kind: 'goal', goal: g })}
                      aria-label={`Editar meta ${g.name}`}
                      className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{g.name}</span>
                        {kind !== 'livre' && g.name !== KIND_LABELS[kind] && <Badge tone="info">{KIND_LABELS[kind]}</Badge>}
                        {status && <Badge tone={status.tone}>{status.label}</Badge>}
                      </span>
                      <span className="block text-sm tabular-nums">
                        <span className="font-semibold">{formatMoney(p.saved)}</span>
                        <span className="text-muted-foreground"> de {formatMoney(g.target)}</span>
                      </span>
                    </button>
                    {p.status !== 'concluida' && (
                      <Button size="sm" variant="outline" onClick={() => onOpen({ kind: 'deposit', goal: g })}>
                        Guardar
                      </Button>
                    )}
                  </div>
                  <Progress value={p.ratio} color="var(--income)" label={`${g.name}: ${Math.round(p.ratio * 100)}% juntado`} />
                  <span className="text-xs text-muted-foreground">{hint(g, p)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
