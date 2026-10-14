/**
 * Backup em JSON: gera o arquivo baixado em Configurações > Dados e lê de
 * volta para importar. Aceita também o formato salvo pelo app no navegador
 * (`localStorage['financas-data']`, com `{ state, version }`).
 */
import type { Category, Debt, Installment, RecurringCost, Subcategory, Transaction, UserSettings } from '@/types/finance'

export interface BackupData {
  categories: Category[]
  subcategories: Subcategory[]
  transactions: Transaction[]
  installments: Installment[]
  recurringCosts: RecurringCost[]
  debts: Debt[]
}

export interface ParsedBackup {
  data: BackupData
  settings: Partial<Omit<UserSettings, 'theme'>> | null
}

const KEYS = ['categories', 'subcategories', 'transactions', 'installments', 'recurringCosts', 'debts'] as const

/** Lista de objetos com `id` texto; o resto é ignorado. */
const items = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter((x) => x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string') as T[]) : []

export function parseBackup(text: string): ParsedBackup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Arquivo inválido: não é um JSON.')
  }
  const root = (raw && typeof raw === 'object' && 'state' in raw ? (raw as { state: unknown }).state : raw) as Record<string, unknown> | null
  if (!root || typeof root !== 'object' || !KEYS.some((k) => Array.isArray(root[k])))
    throw new Error('Arquivo não parece um backup do Finanças.')

  const data = Object.fromEntries(KEYS.map((k) => [k, items(root[k])])) as unknown as BackupData
  const settings = root.settings && typeof root.settings === 'object' ? (root.settings as ParsedBackup['settings']) : null
  if (settings && 'theme' in settings) delete (settings as Record<string, unknown>).theme
  return { data, settings }
}

export const backupCount = (d: BackupData) => KEYS.reduce((a, k) => a + d[k].length, 0)
