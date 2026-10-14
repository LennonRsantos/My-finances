import { ArrowDownRight, ArrowUpRight, Check, Inbox, Layers, Pencil, Plus, Repeat, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MonthSelector } from '@/components/dashboard/month-selector'
import { RecurringList } from '@/components/transactions/recurring-list'
import {
  activeFilterCount,
  applyFilters,
  DEFAULT_FILTERS,
  TransactionFilters,
  type Filters,
} from '@/components/transactions/transaction-filters'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge, EmptyState, type Tone } from '@/components/ui/misc'
import { formatDateShort, todayISO } from '@/lib/dates'
import { resolveStatus, transactionsInMonth } from '@/lib/finance'
import { categoryIconMap } from '@/lib/icons'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useFinanceStore } from '@/store/finance-store'
import { useUIStore } from '@/store/ui-store'
import { PAYMENT_METHOD_LABELS, type TransactionStatus, type TransactionType } from '@/types/finance'
import { PageHeader } from '@/components/layout/page-header'

const statusTone: Record<TransactionStatus, Tone> = { pago: 'income', pendente: 'info', atrasado: 'expense' }

/** Rótulos de status mudam conforme o lado: pagar vs receber. */
const statusLabels: Record<TransactionType, Record<TransactionStatus, string>> = {
  despesa: { pago: 'Pago', pendente: 'A pagar', atrasado: 'Atrasado' },
  receita: { pago: 'Recebido', pendente: 'A receber', atrasado: 'Atrasado' },
}

const tabs = {
  despesa: { label: 'Despesas', icon: ArrowDownRight, active: 'text-expense', done: 'Pago', open: 'A pagar' },
  receita: { label: 'Receitas', icon: ArrowUpRight, active: 'text-income', done: 'Recebido', open: 'A receber' },
} as const

export function TransactionsPage() {
  const { transactions, categories, togglePaid, removeTransaction } = useFinanceStore(
    useShallow((s) => ({
      transactions: s.transactions,
      categories: s.categories,
      togglePaid: s.togglePaid,
      removeTransaction: s.removeTransaction,
    })),
  )
  const month = useUIStore((s) => s.selectedMonth)
  const tab = useUIStore((s) => s.transactionsTab)
  const setTab = useUIStore((s) => s.setTransactionsTab)
  const openForm = useUIStore((s) => s.setTransactionDialogOpen)
  const edit = useUIStore((s) => s.setEditingTransaction)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  // Exclusão em dois cliques: o primeiro arma, o segundo confirma.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  // Categorias são diferentes entre despesas e receitas.
  const [filtersTab, setFiltersTab] = useState(tab)
  if (filtersTab !== tab) {
    setFiltersTab(tab)
    setFilters((f) => ({ ...f, categoryId: 'all' }))
  }
  const today = todayISO()

  const monthRows = useMemo(() => transactionsInMonth(transactions, month), [transactions, month])

  const totals = useMemo(() => {
    const calc = (type: TransactionType) => {
      const list = monthRows.filter((t) => t.type === type)
      const done = list.filter((t) => t.status === 'pago').reduce((a, t) => a + t.amount, 0)
      const total = list.reduce((a, t) => a + t.amount, 0)
      return { count: list.length, total, done, open: total - done }
    }
    return { despesa: calc('despesa'), receita: calc('receita') }
  }, [monthRows])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = monthRows.filter((t) => t.type === tab && (!q || t.description.toLowerCase().includes(q)))
    return applyFilters(matches, filters, today)
  }, [monthRows, tab, query, filters, today])
  const filtered = query.trim() !== '' || activeFilterCount(filters) > 0
  const visibleTotal = rows.reduce((a, t) => a + t.amount, 0)

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const current = tabs[tab]
  const summary = totals[tab]

  return (
    <>
      <PageHeader title="Lançamentos" actions={<MonthSelector />} />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        {/* Abas: cada uma mostra o total do mês */}
        <div role="tablist" aria-label="Tipo de lançamento" className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
          {(Object.keys(tabs) as TransactionType[]).map((key) => {
            const { label, icon: Icon, active } = tabs[key]
            const selected = tab === key
            return (
              <button
                key={key}
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(key)}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors',
                  selected ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className={cn('flex items-center gap-1.5 text-sm font-medium', selected && active)}>
                  <Icon className="size-4" />
                  {label}
                  <span className="text-xs font-normal text-muted-foreground">({totals[key].count})</span>
                </span>
                <span className={cn('text-base font-semibold', selected ? 'text-foreground' : '')}>
                  {formatMoney(totals[key].total)}
                </span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="flex flex-col gap-1 p-3">
            <span className="text-xs text-muted-foreground">{current.done}</span>
            <span className="font-semibold">{formatMoney(summary.done)}</span>
          </Card>
          <Card className="flex flex-col gap-1 p-3">
            <span className="text-xs text-muted-foreground">{current.open}</span>
            <span className={cn('font-semibold', summary.open > 0 && (tab === 'despesa' ? 'text-expense' : 'text-info'))}>
              {formatMoney(summary.open)}
            </span>
          </Card>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Buscar em ${current.label.toLowerCase()}`}
              aria-label="Buscar lançamentos"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant={tab === 'receita' ? 'income' : 'default'} onClick={() => openForm(true, tab)}>
            <Plus />
            <span className="hidden sm:inline">{tab === 'receita' ? 'Nova receita' : 'Nova despesa'}</span>
          </Button>
        </div>

        <TransactionFilters value={filters} onChange={setFilters} categories={categories} type={tab} />

        <RecurringList type={tab} />

        {filtered && rows.length > 0 && (
          <p className="-mb-2 text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'resultado' : 'resultados'} · {formatMoney(visibleTotal)}
          </p>
        )}

        <Card>
          {rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={filtered ? 'Nada encontrado' : `Nenhuma ${tab === 'receita' ? 'receita' : 'despesa'} neste mês`}
              description={filtered ? 'Ajuste a busca, os filtros ou troque o mês.' : undefined}
            />
          ) : (
            <ul className="divide-y">
              {rows.map((t) => {
                const cat = categoryById.get(t.categoryId)
                const Icon = cat ? categoryIconMap[cat.icon] : Inbox
                const status = resolveStatus(t, today)
                const paid = status === 'pago'
                const confirming = confirmingId === t.id
                const amountAndStatus = (
                  <>
                    <span className={cn('text-sm font-semibold tabular-nums', t.type === 'receita' && 'text-income')}>
                      {t.type === 'receita' ? '+' : '−'} {formatMoney(t.amount)}
                    </span>
                    <Badge tone={statusTone[status]}>
                      {t.payTo && status !== 'atrasado' ? (status === 'pago' ? 'Enviado' : 'A enviar') : statusLabels[t.type][status]}
                    </Badge>
                  </>
                )
                return (
                  <li key={t.id} className="flex items-center gap-3 p-3 sm:p-4">
                    <button
                      type="button"
                      onClick={() => edit(t.id)}
                      aria-label={`Editar ${t.description}`}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        className="grid size-10 shrink-0 place-items-center rounded-xl text-white"
                        style={{ background: cat?.color ?? 'var(--muted-foreground)' }}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-start gap-1.5 text-sm font-medium">
                          {t.installment && <Layers className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Parcela" />}
                          {t.recurringCostId && <Repeat className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Fixo" />}
                          {/* Celular: até 2 linhas para "Celular (5/10)" não perder o número da parcela. */}
                          <span className="line-clamp-2 min-w-0 break-words sm:line-clamp-1">{t.description}</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDateShort(t.dueDate)} · {cat?.name ?? 'Sem categoria'}
                          {t.paymentMethod && <> · {PAYMENT_METHOD_LABELS[t.paymentMethod]}</>}
                          {t.payTo && <> · para {t.payTo}</>}
                        </p>
                        {/* Celular: valor e status descem para dar espaço à descrição. */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">{amountAndStatus}</div>
                      </div>
                    </button>
                    <div className="hidden flex-col items-end gap-1 sm:flex">{amountAndStatus}</div>
                    <div className="flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => togglePaid(t.id)}
                        aria-label={paid ? 'Desfazer' : t.type === 'receita' ? 'Marcar como recebido' : 'Marcar como pago'}
                        className={paid ? 'text-income' : 'text-muted-foreground'}
                      >
                        <Check />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => edit(t.id)}
                        aria-label={`Editar ${t.description}`}
                        className="hidden text-muted-foreground sm:inline-flex"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant={confirming ? 'expense' : 'ghost'}
                        size="icon"
                        onClick={() => {
                          if (!confirming) return setConfirmingId(t.id)
                          removeTransaction(t.id)
                          setConfirmingId(null)
                        }}
                        onBlur={() => setConfirmingId(null)}
                        aria-label={confirming ? `Confirmar exclusão de ${t.description}` : `Excluir ${t.description}`}
                        title={confirming ? 'Clique de novo para excluir' : 'Excluir'}
                        className={confirming ? undefined : 'text-muted-foreground'}
                      >
                        {confirming ? <Trash2 /> : <X />}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </main>
    </>
  )
}
