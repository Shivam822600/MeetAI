import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from '../src/main/database'
import { Knowledge, type Embedder } from '../src/main/knowledge'
import { chunkText, cosine, validateText } from '../src/main/knowledge/text'
const directories: string[] = []
const databases: Database[] = []
afterEach(async () => {
  for (const db of databases.splice(0)) await db.close()
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true })
})
const embed: Embedder = async (texts) => texts.map((t) => (t.includes('authentication') ? [1, 0] : [0, 1]))
async function setup() {
  const db = await Database.open()
  databases.push(db)
  const project = db.saveProject({ id: '', name: 'API', description: '' })
  const other = db.saveProject({ id: '', name: 'Other', description: '' })
  const dir = await mkdtemp(join(tmpdir(), 'meetpilot-knowledge-'))
  directories.push(dir)
  const file = join(dir, 'design.md')
  await writeFile(file, 'Our authentication uses short-lived sessions.')
  return { db, project, other, file, knowledge: new Knowledge(db, embed) }
}
describe('reviewed knowledge', () => {
  it('previews locally, imports only reviewed text, isolates projects and replaces edited indexes', async () => {
    const { db, project, other, file, knowledge } = await setup()
    const preview = await knowledge.preview(file)
    expect(db.documents(project.id)).toEqual([])
    await knowledge.import(project.id, preview.id, 'Reviewed authentication details.')
    const [document] = db.documents(project.id)
    expect((await knowledge.search(project.id, 'authentication'))[0].text).toBe(
      'Reviewed authentication details.'
    )
    expect(await knowledge.search(other.id, 'authentication')).toEqual([])
    await knowledge.update(document.id, 'Revised', 'deployment details')
    expect(await knowledge.search(project.id, 'authentication')).toEqual([])
    expect((await knowledge.search(project.id, 'deployment'))[0].source).toContain('Revised')
    db.run('DELETE FROM documents WHERE id=?', [document.id])
    expect(db.rows('SELECT * FROM chunks')).toEqual([])
    await expect(knowledge.import(project.id, preview.id, 'reuse')).rejects.toThrow('expired')
  })
  it('keeps the existing document if reindexing fails', async () => {
    const { db, project, file, knowledge } = await setup()
    const preview = await knowledge.preview(file)
    await knowledge.import(project.id, preview.id, preview.text)
    const [document] = db.documents(project.id)
    const failing = new Knowledge(db, async () => {
      throw new Error('offline')
    })
    await expect(failing.update(document.id, 'new', 'new text')).rejects.toThrow('offline')
    expect(db.documents(project.id)[0].name).toBe('design.md')
    expect((await knowledge.search(project.id, 'authentication'))[0].text).toContain('authentication')
  })
  it('screens secrets and binary content, and chunks multilingual text without broken characters', () => {
    expect(() => validateText('api_key=' + 'a'.repeat(40))).toThrow('credentials')
    expect(() => validateText('binary\0data')).toThrow('binary')
    const chunks = chunkText('🧠'.repeat(4000))
    expect(chunks.every((c) => !c.includes('\ufffd') && Buffer.byteLength(c) <= 4800)).toBe(true)
    expect(cosine([1, 0], [0, 1])).toBe(0)
  })
  it('rolls back partial database writes and persists reviewed documents across restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meetpilot-db-'))
    directories.push(dir)
    const path = join(dir, 'test.db')
    const db = await Database.open(path)
    const project = db.saveProject({ id: 'p', name: 'Persistence', description: '' })
    expect(() =>
      db.transaction(() => {
        db.saveProject({ id: 'bad', name: 'Rollback', description: '' })
        throw new Error('rollback')
      })
    ).toThrow()
    expect(db.projects()).toHaveLength(1)
    const file = join(dir, 'persist.md')
    await writeFile(file, 'authentication persists after restart')
    const knowledge = new Knowledge(db, embed)
    const preview = await knowledge.preview(file)
    await knowledge.import(project.id, preview.id, preview.text)
    await db.close()
    const reopened = await Database.open(path)
    databases.push(reopened)
    expect(reopened.projects()[0]).toEqual(project)
    expect((await new Knowledge(reopened, embed).search(project.id, 'authentication'))[0].text).toContain(
      'persists after restart'
    )
  })
})
it('extracts a text-based PDF locally without an embedding request', async () => {
  const { db, file } = await setup()
  const pdfFile = file.replace('.md', '.pdf')
  const content = 'BT /F1 12 Tf 50 750 Td (Architecture review) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => n.toString().padStart(10, '0') + ' 00000 n ')
    .join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  await writeFile(pdfFile, pdf)
  const knowledge = new Knowledge(db, async () => {
    throw new Error('Preview must not upload text')
  })
  expect((await knowledge.preview(pdfFile)).text).toContain('Architecture review')
})
