import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

const placement = {
  /** Bottom sheet no mobile, modal centralizado a partir de `sm`. */
  sheet: cn(
    'dialog-sheet inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl',
    'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl',
  ),
  /** Painel que nasce do canto superior direito (menu do cabeçalho). */
  corner: cn(
    'dialog-corner right-2 top-[calc(env(safe-area-inset-top)+0.5rem)] w-[calc(100vw-1rem)] max-w-md origin-top-right rounded-xl',
    'max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)]',
  ),
}

export function DialogContent({
  className,
  children,
  side = 'sheet',
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { side?: keyof typeof placement }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/40" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col border bg-card shadow-[0_24px_48px_-24px_rgb(0_0_0/0.35)] focus:outline-none',
          placement[side],
          className,
        )}
        {...props}
      >
        {side === 'sheet' && <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-border sm:hidden" aria-hidden />}
        {children}
        <DialogPrimitive.Close className="absolute right-2.5 top-2.5 grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-4.5" />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 px-5 pb-2 pr-14 pt-4', className)} {...props} />
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-[17px] font-semibold tracking-[-0.01em]', className)} {...props} />
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
}
