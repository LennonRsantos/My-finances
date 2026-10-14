import type { ReactNode } from 'react'
import { MobileMenu } from './mobile-menu'

/**
 * Cabeçalho de cada tela. No celular o título é o único lugar onde o nome da
 * tela aparece (a barra inferior só tem ícones) e o menu fica no canto direito.
 */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/92 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6 lg:py-3">
        <h1 className="mr-auto min-w-0 truncate text-lg font-semibold tracking-[-0.015em] lg:text-xl">{title}</h1>
        <MobileMenu />
        {/* No celular, as ações (ex.: seletor de mês) ganham uma linha inteira. */}
        {actions && <div className="order-last flex w-full justify-center sm:order-none sm:w-auto">{actions}</div>}
      </div>
    </header>
  )
}
