import { FileUp, Link2, Loader2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Affix, bodyClass } from '@/components/ui/form-kit'
import { Input, Label } from '@/components/ui/input'
import { findMatches, isPaymentLike, suggestCategory } from '@/lib/cards'
import { formatDateShort, formatMonthLabel, shiftMonth } from '@/lib/dates'
import { generateInstallments } from '@/lib/finance'
import { nowISO } from '@/lib/form-fields'
import { formatMoney, fromCents, toCents } from '@/lib/money'
import { parseMoneyInput } from '@/lib/schemas'
import { kindOf, readStatement, type StatementLine } from '@/lib/statement'
import { cn, createId } from '@/lib/utils'
import { useFinanceStore, type StatementImport } from '@/store/finance-store'
import type { CreditCard, ISODate, Transaction, YearMonth } from '@/types/finance'

interface Row {
  key: string
  include: boolean
  date: string
  description: string
  amount: string
  categoryId: string
  subcategoryId: string | null
  number: string
  total: string
  /** Lançamento existente ligado; `null` = criar novo */
  match: string | null
  candidates: Transaction[]
  /** Já importada antes: mesma linha, ou a mesma compra vinda de outro arquivo */
  already: boolean
  payment: boolean
}

const moneyText = (c: number) => fromCents(Math.abs(c)).toFixed(2).replace('.', ',')
const selectClass = 'h-10 w-full rounded-xl border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Prepara as linhas lidas: categoria sugerida, compra já lançada para ligar e o que vem desmarcado. */
function toRows(lines: StatementLine[], transactions: Transaction[], fallbackCategory: string): Row[] {
  const keys = new Set(transactions.map((t) => t.importKey).filter(Boolean))
  const taken = new Set<string>()
  return lines.map((l) => {
    const already = keys.has(l.key)
    const payment = isPaymentLike(l.description, l.amount)
    const candidates = payment || already ? [] : findMatches(l, transactions, taken).slice(0, 4)
    const best = candidates[0] && candidates[0].score >= 1 ? candidates[0].transaction : null
    if (best) taken.add(best.id)
    // A compra provável já veio de outra importação: não importa de novo.
    const sameImported = !!best?.importKey && best.cardId != null
    const cat = suggestCategory(l.description, transactions, fallbackCategory)
    return {
      key: l.key,
      include: !already && !payment && !sameImported,
      date: l.date,
      description: l.description,
      amount: moneyText(l.amount),
      categoryId: best?.categoryId ?? cat.categoryId,
      subcategoryId: best?.subcategoryId ?? cat.subcategoryId,
      number: l.installment ? String(l.installment.number) : '',
      total: l.installment ? String(l.installment.total) : '',
      match: best?.id ?? null,
      candidates: candidates.map((c) => c.transaction),
      already: already || sameImported,
      payment,
    }
  })
}

/**
 * Importar a fatura: lê o arquivo no aparelho, mostra cada compra para revisar
 * (tudo editável) e liga a lançamentos que já existem para não duplicar.
 */
export function ImportStatementDialog({ card, open, onClose, invoiceMonth }: { card: CreditCard; open: boolean; onClose: () => void; invoiceMonth: YearMonth }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar fatura · {card.name}</DialogTitle>
          <DialogDescription>PDF, CSV, OFX ou print da fatura. Tudo é lido no seu aparelho.</DialogDescription>
        </DialogHeader>
        {open && <ImportFlow key={card.id} card={card} invoiceMonth={invoiceMonth} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function ImportFlow({ card, invoiceMonth, onDone }: { card: CreditCard; invoiceMonth: YearMonth; onDone: () => void }) {
  const { transactions, categories, importStatement } = useFinanceStore(
    useShallow((s) => ({ transactions: s.transactions, categories: s.categories, importStatement: s.importStatement })),
  )
  const expenseCats = useMemo(() => categories.filter((c) => c.type === 'despesa').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [categories])
  const fallback = expenseCats.find((c) => c.id === 'cat-compras')?.id ?? expenseCats[0]?.id ?? ''
  const [month, setMonth] = useState<YearMonth>(invoiceMonth)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...p } : r)) ?? null)

  const read = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      const lines = await readStatement(file, month, (p) => setProgress(p))
      if (!lines.length) throw new Error('Não encontrei compras neste arquivo. Confira se é a fatura do cartão ou tente o CSV/OFX do banco.')
      setRows(toRows(lines, transactions, fallback))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.')
    } finally {
      setBusy(false)
    }
  }

  // ------------------------------------------------------------------ arquivo
  if (!rows) {
    const kind = file ? kindOf(file) : null
    return (
      <>
        <div className={bodyClass}>
          <div className="flex flex-col gap-2">
            <Label>Fatura de</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
                ‹
              </Button>
              <span className="flex-1 text-center text-sm font-medium capitalize">{formatMonthLabel(month)}</span>
              <Button type="button" variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
                ›
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Serve para completar o ano das datas que vêm só com dia e mês.</p>
          </div>
          <label
            htmlFor="statement-file"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm transition-colors hover:bg-muted"
          >
            <FileUp className="size-6 text-muted-foreground" />
            <span className="font-medium">{file ? file.name : 'Escolher arquivo'}</span>
            <span className="text-xs text-muted-foreground">PDF, CSV, OFX, PNG ou JPG</span>
            <input
              id="statement-file"
              type="file"
              accept=".pdf,.csv,.txt,.ofx,.qfx,image/*"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setError(null)
              }}
            />
          </label>
          {(kind === 'pdf' || kind === 'image') && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {kind === 'image'
                ? 'Leitura de foto pode errar letras e valores; confira na revisão. Na primeira vez baixa o leitor (alguns MB).'
                : 'PDF de cada banco é diferente: confira as compras na revisão. CSV ou OFX costumam vir mais certos.'}
            </p>
          )}
          {file && !kind && <p className="text-sm text-expense">Formato não reconhecido. Use PDF, CSV, OFX ou imagem.</p>}
          {error && (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="outline" className="flex-1" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="button" className="flex-1" disabled={!file || !kind || busy} onClick={read}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? (progress !== null ? `Lendo ${Math.round(progress * 100)}%` : 'Lendo…') : 'Ler fatura'}
          </Button>
        </div>
      </>
    )
  }

  // ------------------------------------------------------------------ revisão
  const included = rows.filter((r) => r.include)
  const linked = included.filter((r) => r.match).length
  const total = included.reduce((a, r) => a + toCents(parseMoneyInput(r.amount) || 0), 0)

  const save = () => {
    const ops: StatementImport[] = []
    const now = nowISO()
    for (const r of included) {
      const amount = toCents(parseMoneyInput(r.amount) || 0)
      if (!amount || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue
      if (r.match) {
        ops.push({ kind: 'link', transactionId: r.match, cardId: card.id, importKey: r.key })
        continue
      }
      const n = Number(r.number)
      const N = Number(r.total)
      if (N >= 2 && n >= 1 && n <= N) {
        // Parcelada: lança da parcela n em diante, para as próximas faturas já acharem as parcelas.
        const purchase = generateInstallments({
          description: r.description,
          totalAmount: amount * N,
          totalInstallments: N,
          startAt: n,
          firstDueDate: r.date as ISODate,
          categoryId: r.categoryId,
          subcategoryId: r.subcategoryId,
          paymentMethod: 'cartao_credito',
          accountName: card.name,
          cardId: card.id,
          importKey: r.key,
        })
        ops.push({ kind: 'installments', purchase })
      } else {
        ops.push({
          kind: 'new',
          transaction: {
            id: createId(),
            description: r.description,
            amount,
            type: 'despesa',
            categoryId: r.categoryId,
            subcategoryId: r.subcategoryId,
            dueDate: r.date as ISODate,
            paymentDate: null,
            status: 'pendente',
            paymentMethod: 'cartao_credito',
            installment: null,
            recurringCostId: null,
            payTo: null,
            cardId: card.id,
            importKey: r.key,
            createdAt: now,
          },
        })
      }
    }
    importStatement(ops)
    onDone()
  }

  return (
    <>
      <div className={bodyClass}>
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'linha lida' : 'linhas lidas'}. Confira e ajuste antes de importar; desmarque o que não for compra.
        </p>
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.key} className={cn('flex flex-col gap-2 rounded-xl border p-3', !r.include && 'opacity-60')}>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Importar ${r.description}`}
                  checked={r.include}
                  onChange={(e) => patch(r.key, { include: e.target.checked })}
                  className="size-5 shrink-0 accent-foreground"
                />
                <Input
                  aria-label="Descrição"
                  value={r.description}
                  onChange={(e) => patch(r.key, { description: e.target.value })}
                  className="h-10 min-w-0 flex-1"
                />
              </div>
              {(r.already || r.payment) && (
                <p className="text-xs text-muted-foreground">{r.already ? 'Já importada antes.' : 'Parece pagamento ou estorno, não compra.'}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="Data" type="date" value={r.date} onChange={(e) => patch(r.key, { date: e.target.value })} className="h-10" />
                <Affix before="R$">
                  <Input aria-label="Valor" inputMode="decimal" className="h-10 pl-10" value={r.amount} onChange={(e) => patch(r.key, { amount: e.target.value })} />
                </Affix>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <select
                  aria-label="Categoria"
                  className={selectClass}
                  value={r.categoryId}
                  disabled={!!r.match}
                  onChange={(e) => patch(r.key, { categoryId: e.target.value, subcategoryId: null })}
                >
                  {expenseCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  Parc.
                  <Input
                    aria-label="Número da parcela"
                    inputMode="numeric"
                    className="h-10 w-11 px-1 text-center"
                    value={r.number}
                    disabled={!!r.match}
                    onChange={(e) => patch(r.key, { number: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                  />
                  /
                  <Input
                    aria-label="Total de parcelas"
                    inputMode="numeric"
                    className="h-10 w-11 px-1 text-center"
                    value={r.total}
                    disabled={!!r.match}
                    onChange={(e) => patch(r.key, { total: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                  />
                </span>
              </div>
              {r.candidates.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <Link2 className="size-3.5" />
                    Já lançado?
                  </span>
                  <select aria-label="Ligar a lançamento existente" className={selectClass} value={r.match ?? ''} onChange={(e) => patch(r.key, { match: e.target.value || null })}>
                    <option value="">Não, criar novo</option>
                    {r.candidates.map((t) => (
                      <option key={t.id} value={t.id}>
                        Ligar a: {t.description} · {formatDateShort(t.dueDate)} · {formatMoney(t.amount)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2 border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="text-xs text-muted-foreground">
          {included.length} para importar · {linked} {linked === 1 ? 'ligada' : 'ligadas'} a lançamentos existentes · {formatMoney(total)}
        </p>
        <FormActionsRow onBack={() => setRows(null)} onSave={save} disabled={included.length === 0} />
      </div>
    </>
  )
}

function FormActionsRow({ onBack, onSave, disabled }: { onBack: () => void; onSave: () => void; disabled: boolean }) {
  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
        Outro arquivo
      </Button>
      <Button type="button" className="flex-1" disabled={disabled} onClick={onSave}>
        Importar
      </Button>
    </div>
  )
}

