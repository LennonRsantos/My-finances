import { ChevronLeft, ChevronRight, CreditCard as CardIcon, FileUp, Layers, Pencil, Plus, Repeat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CardForm } from '@/components/cards/card-form'
import { ImportStatementDialog } from '@/components/cards/import-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge, EmptyState, Progress, type Tone } from '@/components/ui/misc'
import { currentInvoice, INVOICE_LABEL, invoiceSummary, unassignedCardPurchases, usedLimit, type InvoiceStatus } from '@/lib/cards'
import { formatDateShort, formatMonthLabel, shiftMonth, todayISO } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { baseDescription, useFinanceStore } from '@/store/finance-store'
import { useUIStore } from '@/store/ui-store'
import type { CreditCard, Transaction, YearMonth } from '@/types/finance'

const statusTone: Record<InvoiceStatus, Tone> = { aberta: 'info', fechada: 'warning', paga: 'income', atrasada: 'expense', vazia: 'neutral' }

/** Faturas do cartão: mês a mês, com as compras lançadas e o botão de pagar. */
function InvoiceCard({ card, month, setMonth, onImport }: { card: CreditCard; month: YearMonth; setMonth: (m: YearMonth) => void; onImport: () => void }) {
  const { transactions, categories, cards, payInvoice } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, categories: s.categories, cards: s.cards, payInvoice: s.payInvoice })),
  )
  const edit = useUIStore((s) => s.setEditingTransaction)
  const today = todayISO()
  const inv = invoiceSummary(transactions, card, month, today, cards)
  const [confirmPay, setConfirmPay] = useState(false)
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Outros'

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Fatura anterior" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <CardTitle className="text-base">Fatura de {formatMonthLabel(month).toLowerCase()}</CardTitle>
            <CardDescription>
              Fecha {formatDateShort(inv.closing)} · vence {formatDateShort(inv.due)}
            </CardDescription>
          </div>
          <Button variant="outline" size="icon" aria-label="Próxima fatura" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight />
          </Button>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatMoney(inv.total)}</span>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge tone={statusTone[inv.status]}>{INVOICE_LABEL[inv.status]}</Badge>
              {inv.paid > 0 && inv.open > 0 && <span>falta {formatMoney(inv.open)}</span>}
            </span>
          </div>
          {inv.open > 0 && !confirmPay && (
            <Button onClick={() => setConfirmPay(true)}>Pagar fatura</Button>
          )}
        </div>
        {confirmPay && (
          <div className="flex flex-col gap-2 rounded-xl border p-3">
            <p className="text-sm">
              Marcar as {inv.items.filter((t) => t.status !== 'pago').length} compras em aberto como pagas em {formatDateShort(today)}? Não cria outra despesa.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmPay(false)}>
                Voltar
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  payInvoice(
                    card.id,
                    inv.items.map((t) => t.id),
                    today,
                  )
                  setConfirmPay(false)
                }}
              >
                Pagar {formatMoney(inv.open)}
              </Button>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {inv.items.length === 0 ? (
          <EmptyState
            icon={CardIcon}
            title="Nenhuma compra nesta fatura"
            description="Lance compras com este cartão em Lançamentos ou importe a fatura do banco."
            className="py-6"
            action={
              <Button size="sm" variant="outline" onClick={onImport}>
                <FileUp />
                Importar fatura
              </Button>
            }
          />
        ) : (
          <ul className="divide-y">
            {inv.items.map((t) => {
              const paid = t.status === 'pago'
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => edit(t.id)}
                    aria-label={`Editar ${t.description}`}
                    className="flex w-full items-center gap-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {t.installment && <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-label="Parcela" />}
                        {t.recurringCostId && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Fixo" />}
                        <span className={cn('truncate', paid && 'text-muted-foreground')}>{t.description}</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatDateShort(t.dueDate)} · {catName(t.categoryId)}
                        {paid && ' · paga'}
                      </span>
                    </span>
                    <span className={cn('shrink-0 text-sm font-semibold tabular-nums', paid && 'text-muted-foreground')}>{formatMoney(t.amount)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Com vários cartões: compras no cartão que ainda não dizem qual. Atribuir uma a uma ou todas de uma vez. */
function UnassignedCard({ cards }: { cards: CreditCard[] }) {
  const { transactions, assignCard } = useFinanceStore(useShallow((s) => ({ transactions: s.transactions, assignCard: s.assignCard })))
  const [open, setOpen] = useState(false)
  const items = unassignedCardPurchases(transactions, cards)
  if (!items.length) return null
  // Uma linha por compra: parcelas e meses do mesmo fixo andam juntos (atribuir vale para a série).
  const today = todayISO()
  const groups = new Map<string, Transaction[]>()
  for (const t of items) {
    const key = t.installment?.installmentId ?? t.recurringCostId ?? t.id
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  const rows = [...groups.values()]
    .map((list) => {
      // Representante: a mais recente até hoje; se todas forem futuras, a próxima.
      const past = list.filter((t) => t.dueDate <= today).sort((a, b) => b.dueDate.localeCompare(a.dueDate))
      const rep = past[0] ?? [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]!
      return { rep, ids: list.map((t) => t.id), count: list.length }
    })
    // Já feitas primeiro (mais recentes no topo); depois as futuras, da mais próxima.
    .sort((a, b) => {
      const pa = a.rep.dueDate <= today
      const pb = b.rep.dueDate <= today
      if (pa !== pb) return pa ? -1 : 1
      return pa ? b.rep.dueDate.localeCompare(a.rep.dueDate) : a.rep.dueDate.localeCompare(b.rep.dueDate)
    })
  const list = open ? rows : rows.slice(0, 3)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Compras no cartão sem cartão definido ({rows.length})</CardTitle>
        <CardDescription>Escolha em qual cartão cada uma foi feita para entrar na fatura certa.</CardDescription>
        <div className="flex flex-wrap gap-2 pt-1">
          {cards.map((c) => (
            <Button key={c.id} size="sm" variant="outline" onClick={() => assignCard(items.map((t) => t.id), c.id)}>
              <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
              Todas para {c.name}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {list.map(({ rep: t, ids, count }) => (
            <li key={t.id} className="flex flex-col gap-2 py-2.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{count > 1 ? baseDescription(t) : t.description}</span>
                <span className="shrink-0 font-semibold tabular-nums">{formatMoney(t.amount)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-muted-foreground">
                  {formatDateShort(t.dueDate)}
                  {count > 1 && ` · ${count} ${t.installment ? 'parcelas' : 'meses'}`} ·
                </span>
                {cards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => assignCard(ids, c.id)}
                    className="flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
                    {c.name}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {rows.length > 3 && (
          <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => setOpen((v) => !v)}>
            {open ? 'Mostrar menos' : `Ver todas (${rows.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function CardsPage() {
  const { cards, transactions } = useFinanceStore(useShallow((s) => ({ cards: s.cards, transactions: s.transactions })))
  const active = useMemo(() => cards.filter((c) => c.active).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [cards])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<CreditCard | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const card = active.find((c) => c.id === selectedId) ?? active[0]
  const today = todayISO()
  const [months, setMonths] = useState<Record<string, YearMonth>>({})
  const month: YearMonth | null = card ? (months[card.id] ?? currentInvoice(card, today)) : null
  const used = card ? usedLimit(transactions, card.id, cards) : 0

  return (
    <>
      <PageHeader title="Cartões" />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        {!card ? (
          <Card>
            <EmptyState
              icon={CardIcon}
              title="Cadastre seu cartão"
              description="Veja as compras de cada cartão por fatura, quanto do limite está usado e importe a fatura do banco para lançar tudo de uma vez."
              action={
                <Button onClick={() => setEditing('new')}>
                  <Plus />
                  Adicionar cartão
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {active.map((c) => {
                const selected = c.id === card.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    aria-pressed={selected}
                    className={cn(
                      'flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
                    {c.name}
                  </button>
                )
              })}
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Adicionar cartão" onClick={() => setEditing('new')}>
                <Plus />
              </Button>
            </div>

            <Card className="flex flex-col gap-4 p-4">
              <div className="flex items-center gap-4">
                <span className="grid h-12 w-16 shrink-0 place-items-center rounded-lg text-white" style={{ background: card.color }}>
                  <CardIcon className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold">{card.name}</p>
                  {(card.bank || card.last4) && (
                    <p className="truncate text-sm text-muted-foreground">{[card.bank, card.last4 ? `•••• ${card.last4}` : null].filter(Boolean).join(' · ')}</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    Fecha dia {card.closingDay} · vence dia {card.dueDay}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Editar ${card.name}`} onClick={() => setEditing(card)}>
                  <Pencil />
                </Button>
              </div>
              {card.limit ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">Limite usado</span>
                    <span className="tabular-nums">
                      <span className="font-semibold">{formatMoney(used)}</span>
                      <span className="text-muted-foreground"> de {formatMoney(card.limit)}</span>
                    </span>
                  </div>
                  <Progress value={Math.min(1, used / card.limit)} color={used / card.limit > 0.9 ? 'var(--expense)' : card.color} label={`Limite usado: ${formatMoney(used)}`} />
                  <span className="text-xs text-muted-foreground">Disponível: {formatMoney(Math.max(0, card.limit - used))}. Conta as parcelas futuras ainda não pagas.</span>
                </div>
              ) : null}
              <Button variant="outline" onClick={() => setImporting(true)}>
                <FileUp />
                Importar fatura do banco
              </Button>
            </Card>

            <UnassignedCard cards={active} />

            <InvoiceCard card={card} month={month!} setMonth={(m) => setMonths((s) => ({ ...s, [card.id]: m }))} onImport={() => setImporting(true)} />
          </>
        )}
      </main>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Novo cartão' : 'Editar cartão'}</DialogTitle>
            <DialogDescription>Fechamento e vencimento definem em que fatura cai cada compra.</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <CardForm
              key={editing === 'new' ? 'new' : editing.id}
              card={editing === 'new' ? undefined : editing}
              onDone={(saved) => {
                if (saved) setSelectedId(saved.id)
                setEditing(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {card && month && <ImportStatementDialog card={card} open={importing} onClose={() => setImporting(false)} invoiceMonth={month} />}
    </>
  )
}
