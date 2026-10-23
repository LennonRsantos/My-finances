/**
 * Print ou foto da fatura: reconhecimento de texto (OCR) no próprio aparelho
 * com tesseract.js em português. Carregado só quando usado; na primeira vez
 * baixa o modelo de leitura (alguns MB).
 */
import type { YearMonth } from '@/types/finance'
import { parseTextLines, type StatementLine } from './parse'

export async function parseImage(file: File, invoice: YearMonth, onProgress?: (p: number) => void): Promise<StatementLine[]> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('por', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress)
    },
  })
  try {
    const { data } = await worker.recognize(file)
    return parseTextLines(data.text, invoice)
  } finally {
    await worker.terminate()
  }
}
