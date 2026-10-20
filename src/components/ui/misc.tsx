import type { ComponentProps, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-lg bg-muted', className)} {...props} />
}

export type Tone = 'neutral' | 'income' | 'expense' | 'warning' | 'info'

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  income: 'bg-income-soft text-income',
  expense: 'bg-expense-soft text-expense',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
}

export function Badge({ tone = 'neutral', className, ...props }: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', toneClasses[tone], className)}
      {...props}
    />
  )
}

export function Progress({
  value,
  color,
  className,
  label,
}: {
  /** 0–1; valores acima de 1 aparecem cheios */
  value: number
  color?: string
  className?: string
  label: string
}) {
  const pct = Math.min(Math.max(value, 0), 1) * 100
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-4 py-10 text-center', className)}>
      <Icon className="mb-1 size-6 text-muted-foreground" strokeWidth={1.5} />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Switch({
  checked,
  onCheckedChange,
  ...props
}: Omit<ComponentProps<'button'>, 'onChange'> & { checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        // after: área de toque maior que a chave (44px), sem mudar o visual.
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors after:absolute after:-inset-2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? 'bg-primary' : 'bg-input',
      )}
      {...props}
    >
      <span
        className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')}
      />
    </button>
  )
}
