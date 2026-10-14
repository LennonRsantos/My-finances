import { z } from 'zod'
import { PAYMENT_METHODS, RECURRENCE_FREQUENCIES, TRANSACTION_TYPES } from '@/types/finance'

export const MAX_INSTALLMENTS = 120

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida')

export const transactionFormSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    description: z.string().trim().min(2, 'Descreva o lançamento').max(80, 'Máximo de 80 caracteres'),
    /** Em reais na UI; convertido para centavos ao salvar */
    amount: z
      .number({ error: 'Informe um valor válido' })
      .refine((v) => !Number.isNaN(v), 'Informe um valor válido')
      .positive('O valor deve ser maior que zero')
      .max(10_000_000, 'Valor muito alto'),
    categoryId: z.string().min(1, 'Escolha uma categoria'),
    subcategoryId: z.string().nullable(),
    dueDate: isoDate,
    paymentMethod: z.enum(PAYMENT_METHODS),
    paid: z.boolean(),
    isInstallment: z.boolean(),
    /** Gasto/receita fixo: repete todo mês ou todo ano */
    isRecurring: z.boolean(),
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    /** `nova`: valor = total da compra. `andamento`: valor = parcela, começa em `currentInstallment` */
    installmentMode: z.enum(['nova', 'andamento']),
    currentInstallment: z
      .number({ error: 'Informe a parcela atual' })
      .int('Use um número inteiro')
      .min(1, 'Mínimo 1'),
    installments: z
      .number({ error: 'Informe o número de parcelas' })
      .int('Use um número inteiro')
      .min(2, 'Mínimo de 2 parcelas')
      .max(MAX_INSTALLMENTS, `Máximo de ${MAX_INSTALLMENTS} parcelas`),
    accountName: z.string().trim().max(40, 'Máximo de 40 caracteres'),
    notes: z.string().trim().max(200, 'Máximo de 200 caracteres'),
    /** Para quem enviar o valor (opcional, só despesa) */
    payTo: z.string().trim().max(40, 'Máximo de 40 caracteres'),
  })
  .superRefine((data, ctx) => {
    if (data.isRecurring && data.isInstallment) {
      ctx.addIssue({ code: 'custom', path: ['isRecurring'], message: 'Escolha fixo ou parcelado, não os dois' })
    }
    if (data.isInstallment && data.installmentMode === 'andamento' && data.currentInstallment > data.installments) {
      ctx.addIssue({ code: 'custom', path: ['currentInstallment'], message: `Máximo ${data.installments}` })
    }
    if (data.isInstallment && data.type === 'receita') {
      ctx.addIssue({ code: 'custom', path: ['isInstallment'], message: 'Parcelamento só vale para despesas' })
    }
    if (data.isInstallment && data.paymentMethod === 'cartao_credito' && !data.accountName) {
      ctx.addIssue({ code: 'custom', path: ['accountName'], message: 'Informe o cartão do parcelamento' })
    }
  })

export type TransactionFormValues = z.infer<typeof transactionFormSchema>

/** Converte "1.234,56" / "1234.56" / "12" em número. Retorna NaN se inválido. */
export function parseMoneyInput(raw: unknown): number {
  if (typeof raw === 'number') return raw
  if (typeof raw !== 'string') return Number.NaN
  const cleaned = raw.replace(/[^\d.,]/g, '')
  if (!cleaned) return Number.NaN
  if (cleaned.includes(',')) return Number(cleaned.replace(/\./g, '').replace(',', '.'))
  // Sem vírgula, ponto seguido de grupos de 3 dígitos é milhar: "1.500" = 1500, "1.250.000" = 1250000.
  // Senão é decimal: "6.29" = 6,29.
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/\./g, ''))
  return Number(cleaned)
}
