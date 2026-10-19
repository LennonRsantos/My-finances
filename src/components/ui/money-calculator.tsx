import { Calculator, Delete, X } from 'lucide-react'
import { useState, type RefObject } from 'react'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Conta
// ---------------------------------------------------------------------------

const OPS = { '+': 1, '−': 1, '×': 2, '÷': 2 } as const
type Op = keyof typeof OPS

/** "1.234,56" ou "12,5" → número; ponto só como milhar quando há vírgula ou 3 dígitos depois. */
function parseNumber(raw: string): number | null {
  let t = raw.trim()
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Calcula "120 + 35,50 × 2" (× e ÷ antes de + e −). Aceita também * / -.
 * Expressão incompleta ou divisão por zero → `null`. Sem `eval`.
 */
function evaluate(expr: string): number | null {
  const src = expr.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/\s+/g, '')
  if (!src) return null
  const tokens: (number | Op)[] = []
  let num = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (c in OPS) {
      // Sinal negativo no começo ou logo depois de outro operador.
      if (c === '−' && num === '' && (tokens.length === 0 || typeof tokens[tokens.length - 1] !== 'number')) {
        num = '-'
        continue
      }
      const n = parseNumber(num)
      if (n === null) return null
      tokens.push(n, c as Op)
      num = ''
    } else if (/[\d.,]/.test(c)) num += c
    else return null
  }
  const lastNum = parseNumber(num)
  if (lastNum === null) return null
  tokens.push(lastNum)

  // Primeiro × e ÷, depois + e −.
  const stack: (number | Op)[] = [tokens[0]!]
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as Op
    const n = tokens[i + 1] as number
    if (OPS[op] === 2) {
      const a = stack.pop() as number
      if (op === '÷' && n === 0) return null
      stack.push(op === '×' ? a * n : a / n)
    } else stack.push(op, n)
  }
  let result = stack[0] as number
  for (let i = 1; i < stack.length; i += 2) {
    const n = stack[i + 1] as number
    result = stack[i] === '+' ? result + n : result - n
  }
  return Number.isFinite(result) ? Math.round(result * 100) / 100 : null
}

/** Grava no input como se a pessoa tivesse digitado (vale para react-hook-form e useState). */
function typeInto(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  // Campos que confirmam ao sair (onBlur) também recebem.
  input.focus()
  input.blur()
}

const toText = (n: number) => n.toFixed(2).replace('.', ',')

// ---------------------------------------------------------------------------
// Calculadora
// ---------------------------------------------------------------------------

const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', ',', '0', '⌫', '+'] as const

/** Botão dentro da caixa de valor (canto direito). */
export function CalculatorToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={open ? 'Fechar calculadora' : 'Abrir calculadora'}
      aria-expanded={open}
      title="Calculadora"
      onClick={onToggle}
      className={cn(
        'absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
        open && 'bg-muted text-foreground',
      )}
    >
      <Calculator className="size-4" />
    </button>
  )
}

/**
 * Teclado logo abaixo da caixa, no fluxo da página: não é cortado pela rolagem
 * dos diálogos. `fieldRef` é a caixa onde está o input que recebe o resultado.
 */
export function CalculatorPanel({ fieldRef, initial, onClose }: { fieldRef: RefObject<HTMLDivElement | null>; initial: string; onClose: () => void }) {
  const input = () => fieldRef.current?.querySelector('input') ?? null
  const [expr, setExpr] = useState(initial)
  const result = evaluate(expr)
  const incomplete = expr !== '' && result === null

  const press = (k: (typeof KEYS)[number]) => {
    if (k === '⌫') return setExpr((e) => e.slice(0, -1))
    setExpr((e) => {
      const last = e.slice(-1)
      // Dois operadores seguidos: troca pelo novo (menos o sinal negativo).
      if (k in OPS && last in OPS && !(k === '−' && last !== '−')) return e.slice(0, -1) + k
      return e + k
    })
  }

  const use = () => {
    const el = input()
    if (!el || result === null || result <= 0) return
    typeInto(el, toText(result))
    onClose()
  }

  return (
    <div
      role="group"
      aria-label="Calculadora"
      className="mt-1.5 flex flex-col gap-2 rounded-xl border bg-card p-2.5 shadow-sm"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="flex items-center gap-2">
        <input
          autoFocus
          aria-label="Conta"
          inputMode="decimal"
          placeholder="Ex.: 120 + 35,50 × 2"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Não envia o formulário do lançamento.
              e.preventDefault()
              use()
            }
          }}
          className="h-10 min-w-0 flex-1 rounded-lg bg-muted px-3 text-right text-base font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button type="button" aria-label="Fechar calculadora" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      <p className={cn('px-1 text-right text-xs tabular-nums', incomplete ? 'text-muted-foreground' : 'text-foreground')} aria-live="polite">
        {expr === '' ? 'Digite ou toque nos números' : result === null ? 'Conta incompleta' : `= ${formatMoney(Math.round(result * 100))}`}
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            aria-label={k === '⌫' ? 'Apagar' : k}
            className={cn(
              'grid h-10 place-items-center rounded-lg text-base font-medium tabular-nums transition-colors',
              k in OPS ? 'bg-muted text-foreground hover:bg-muted/70' : 'border hover:bg-muted',
            )}
          >
            {k === '⌫' ? <Delete className="size-4" /> : k}
          </button>
        ))}
        <button type="button" onClick={() => setExpr('')} className="grid h-10 place-items-center rounded-lg border text-sm font-medium hover:bg-muted">
          C
        </button>
        <button
          type="button"
          onClick={use}
          disabled={result === null || result <= 0}
          className="col-span-3 grid h-10 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
        >
          {result !== null && result > 0 ? `Usar ${formatMoney(Math.round(result * 100))}` : 'Usar valor'}
        </button>
      </div>
    </div>
  )
}
