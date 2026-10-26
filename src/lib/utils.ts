import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function createId(): string {
  return crypto.randomUUID()
}

/** Nome curto digitado pela pessoa (cômodo, loja, tipo): sem espaços sobrando, até 40 letras. */
export const cleanName = (v: string) => v.trim().replace(/\s+/g, ' ').slice(0, 40)
