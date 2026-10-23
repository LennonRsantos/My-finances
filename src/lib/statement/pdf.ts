/**
 * PDF da fatura: extrai o texto no próprio aparelho (pdf.js) e remonta as
 * linhas pela posição na página. Biblioteca carregada só quando usada.
 */
import type { YearMonth } from '@/types/finance'
import { parseTextLines, type StatementLine } from './parse'

interface TextItem {
  str: string
  transform: number[]
}

export async function pdfText(file: File): Promise<string> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    // Agrupa os pedaços pela altura (y) e ordena da esquerda para a direita.
    const rows = new Map<number, { x: number; s: string }[]>()
    for (const item of content.items as TextItem[]) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5]! / 2) * 2
      const x = item.transform[4]!
      rows.set(y, [...(rows.get(y) ?? []), { x, s: item.str }])
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) =>
        parts
          .sort((a, b) => a.x - b.x)
          .map((q) => q.s)
          .join(' '),
      )
    pages.push(lines.join('\n'))
  }
  return pages.join('\n')
}

export async function parsePdf(file: File, invoice: YearMonth): Promise<StatementLine[]> {
  return parseTextLines(await pdfText(file), invoice)
}
