/** Campos de formulário em texto (como o usuário digita) e conversões ao salvar. */
import { z } from 'zod'
import { toCents } from './money'
import { parseMoneyInput } from './schemas'

export const money = (msg: string) => z.string().trim().refine((v) => parseMoneyInput(v) > 0, msg)
export const optionalMoney = z.string().trim().refine((v) => v === '' || parseMoneyInput(v) >= 0, 'Valor inválido')
export const km = z.string().trim().refine((v) => v === '' || /^\d+$/.test(v.replace(/\./g, '')), 'Use só números')
export const requiredKm = km.refine((v) => v !== '', 'Informe o km')
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')

export const toKm = (v: string) => (v === '' ? null : Number(v.replace(/\./g, '')))
export const cents = (v: string) => toCents(parseMoneyInput(v))

/** Fora dos componentes: a data de criação só é lida ao salvar. */
export const nowISO = () => new Date().toISOString()
