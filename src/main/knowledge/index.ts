import OpenAI from 'openai'
import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import type { Database } from '../database'
import type { Preview } from '../../shared/types'
import { chunkText, cosine, validateText, MAX_DOCUMENT_CHARS } from './text'
export type Embedder = (texts: string[], signal?: AbortSignal) => Promise<number[][]>
export class Knowledge {
  private previews = new Map<string, Preview & { expiresAt: number }>()
  private importing = false
  constructor(
    private db: Database,
    private embed: Embedder
  ) {}
  async preview(filename: string): Promise<Preview> {
    if (/^\.env|\.(?:key|pem|p12|pfx)$/i.test(basename(filename)))
      throw new Error('Credential files cannot be imported.')
    const extension = extname(filename).toLowerCase()
    if (!['.txt', '.md', '.pdf'].includes(extension)) throw new Error('Choose a .txt, .md, or .pdf file.')
    if ((await stat(filename)).size > 5 * 1024 * 1024) throw new Error('Documents must be smaller than 5 MB.')
    const bytes = await readFile(filename)
    let text = ''
    if (extension === '.pdf') {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false })
      try {
        const pdf = await task.promise
        if (pdf.numPages > 200) throw new Error('PDFs are limited to 200 pages.')
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          text +=
            content.items
              .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
              .join('') + '\n'
          page.cleanup()
          if (text.length > MAX_DOCUMENT_CHARS)
            throw new Error('Extracted document exceeds 120,000 characters.')
        }
      } finally {
        await task.destroy()
      }
    } else text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    text = text.trim()
    if (!text) throw new Error('No text was found. Scanned PDFs need OCR before import.')
    if (text.length > MAX_DOCUMENT_CHARS) throw new Error('Documents are limited to 120,000 characters.')
    let warning: string | undefined
    try {
      validateText(text)
    } catch (error) {
      warning = (error as Error).message
    }
    for (const [id, value] of this.previews) if (value.expiresAt < Date.now()) this.previews.delete(id)
    if (this.previews.size >= 10) this.previews.delete(this.previews.keys().next().value!)
    const preview = { id: randomUUID(), name: basename(filename), text, warning }
    this.previews.set(preview.id, { ...preview, expiresAt: Date.now() + 30 * 60000 })
    return preview
  }
  async import(projectId: string, previewId: string, reviewedText: string): Promise<void> {
    const preview = this.previews.get(previewId)
    if (!preview || preview.expiresAt < Date.now())
      throw new Error('This preview expired. Choose the document again.')
    await this.save(projectId, preview.name, reviewedText)
    this.previews.delete(previewId)
  }
  async update(id: string, name: string, text: string): Promise<void> {
    const row = this.db.rows('SELECT projectId FROM documents WHERE id=?', [id])[0]
    if (!row) throw new Error('Document not found.')
    await this.save(String(row.projectId), name, text, id)
  }
  private async save(projectId: string, name: string, value: string, existingId?: string): Promise<void> {
    if (this.importing) throw new Error('Wait for the current document to finish importing.')
    if (!this.db.projects().some((p) => p.id === projectId)) throw new Error('Project not found.')
    const text = validateText(value)
    const chunks = chunkText(text)
    if (
      Number(
        this.db.rows(
          'SELECT COUNT(*) AS n FROM chunks c JOIN documents d ON d.id=c.documentId WHERE d.projectId=? AND d.id!=?',
          [projectId, existingId || '']
        )[0].n
      ) +
        chunks.length >
      2000
    )
      throw new Error('This project has reached its 2,000-chunk limit. Remove documents first.')
    this.importing = true
    try {
      const embeddings: number[][] = []
      for (let i = 0; i < chunks.length; i += 16)
        embeddings.push(...(await this.embed(chunks.slice(i, i + 16))))
      if (
        embeddings.length !== chunks.length ||
        embeddings.some((v) => !v.length || v.some((n) => !Number.isFinite(n)))
      )
        throw new Error('The embedding provider returned invalid vectors.')
      if (existingId && !this.db.rows('SELECT id FROM documents WHERE id=?', [existingId]).length)
        throw new Error('The document was deleted during import.')
      const id = existingId || randomUUID()
      this.db.transaction(() => {
        if (existingId) this.db.run('DELETE FROM chunks WHERE documentId=?', [id])
        this.db.run(
          'INSERT INTO documents(id,projectId,name,createdAt,text) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,text=excluded.text',
          [id, projectId, name, Date.now(), text]
        )
        chunks.forEach((chunk, i) =>
          this.db.run('INSERT INTO chunks VALUES(?,?,?,?,?)', [
            randomUUID(),
            id,
            i,
            chunk,
            JSON.stringify(embeddings[i])
          ])
        )
      })
      await this.db.flush()
    } finally {
      this.importing = false
    }
  }
  async search(
    projectId: string,
    query: string,
    signal?: AbortSignal
  ): Promise<{ text: string; source: string; score: number }[]> {
    const rows = this.db.rows(
      'SELECT c.text,c.embedding,c.position,d.name FROM chunks c JOIN documents d ON d.id=c.documentId WHERE d.projectId=?',
      [projectId]
    )
    if (!rows.length) return []
    const [vector] = await this.embed([query], signal)
    return rows
      .map((row) => ({
        text: String(row.text),
        source: `${row.name} · excerpt ${Number(row.position) + 1}`,
        score: cosine(vector, JSON.parse(String(row.embedding)) as number[])
      }))
      .filter((r) => r.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
  }
}
export function openAIEmbedder(key: () => string, mock: () => boolean): Embedder {
  return async (texts, signal) => {
    if (mock()) throw new Error('Turn off mock mode to import or search documents with OpenAI.')
    if (!key()) throw new Error('Add your OpenAI key in Settings before importing or searching documents.')
    const client = new OpenAI({ apiKey: key(), timeout: 30000, maxRetries: 1 })
    const result = await client.embeddings.create(
      { model: 'text-embedding-3-small', dimensions: 512, encoding_format: 'float', input: texts },
      { signal }
    )
    return result.data.sort((a, b) => a.index - b.index).map((row) => row.embedding)
  }
}
