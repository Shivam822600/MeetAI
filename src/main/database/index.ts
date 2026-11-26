import initSqlJs, { type Database as SQLDatabase, type BindParams, type SqlValue } from 'sql.js'
import { dirname, join } from 'node:path'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { Answer, Meeting, Project, Settings, Transcript, DocumentInfo } from '../../shared/types'
import { settingsSchema } from '../../shared/schemas'
export class Database {
  private queue: Promise<void> = Promise.resolve()
  private timer: ReturnType<typeof setTimeout> | undefined
  private dirty = false
  private closed = false
  private constructor(
    private db: SQLDatabase,
    private filename?: string,
    private onError: (error: unknown) => void = () => undefined
  ) {
    db.run(`PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meetings(id TEXT PRIMARY KEY,topic TEXT NOT NULL,projectId TEXT REFERENCES projects(id) ON DELETE SET NULL,startedAt INTEGER NOT NULL,endedAt INTEGER,summary TEXT NOT NULL,mock INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS transcripts(id TEXT PRIMARY KEY,meetingId TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,source TEXT NOT NULL,text TEXT NOT NULL,at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS answers(id TEXT PRIMARY KEY,meetingId TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,name TEXT NOT NULL,createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chunks(id TEXT PRIMARY KEY,documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,position INTEGER NOT NULL,text TEXT NOT NULL,embedding BLOB NOT NULL);
      CREATE INDEX IF NOT EXISTS transcript_meeting ON transcripts(meetingId,at);
      CREATE INDEX IF NOT EXISTS answer_meeting ON answers(meetingId);
      CREATE INDEX IF NOT EXISTS chunks_document ON chunks(documentId);`)
    if (!this.rows('PRAGMA table_info(documents)').some((row) => row.name === 'text'))
      db.run("ALTER TABLE documents ADD COLUMN text TEXT NOT NULL DEFAULT ''")
    db.run(
      'UPDATE meetings SET endedAt=COALESCE((SELECT MAX(at) FROM transcripts WHERE meetingId=meetings.id),startedAt) WHERE endedAt IS NULL'
    )
  }
  static async open(filename?: string, onError?: (error: unknown) => void): Promise<Database> {
    const SQL = await initSqlJs({ locateFile: (file) => join(dirname(require.resolve('sql.js')), file) })
    let data: Buffer | undefined
    if (filename)
      try {
        data = await readFile(filename)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    return new Database(new SQL.Database(data), filename, onError)
  }
  rows(sql: string, values: BindParams = []): Record<string, SqlValue>[] {
    const statement = this.db.prepare(sql)
    try {
      statement.bind(values)
      const rows: Record<string, SqlValue>[] = []
      while (statement.step()) rows.push(statement.getAsObject())
      return rows
    } finally {
      statement.free()
    }
  }
  transaction(work: () => void): void {
    this.db.run('BEGIN')
    try {
      work()
      this.db.run('COMMIT')
      this.changed()
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
  }
  run(sql: string, values: BindParams = []): void {
    this.db.run(sql, values)
    this.changed()
  }
  private changed(): void {
    this.dirty = true
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined
        void this.flush().catch(this.onError)
      }, 500)
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer)
    this.timer = undefined
    if (!this.dirty || !this.filename || this.closed) return this.queue
    const data = this.db.export()
    const filename = this.filename
    this.dirty = false
    this.queue = this.queue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(filename), { recursive: true })
        await writeFile(filename + '.tmp', data, { mode: 0o600 })
        await rename(filename + '.tmp', filename)
      })
      .catch((error) => {
        this.dirty = true
        throw error
      })
    return this.queue
  }
  async close(): Promise<void> {
    clearTimeout(this.timer)
    await this.flush()
    this.closed = true
    this.db.close()
  }
  getSettings(): Settings {
    const row = this.rows('SELECT value FROM settings WHERE key=?', ['preferences'])[0]
    return settingsSchema.parse(row ? JSON.parse(String(row.value)) : {})
  }
  saveSettings(settings: Settings): Settings {
    const parsed = settingsSchema.parse(settings)
    this.run('INSERT OR REPLACE INTO settings VALUES(?,?)', ['preferences', JSON.stringify(parsed)])
    return parsed
  }
  projects(): Project[] {
    return this.rows('SELECT * FROM projects ORDER BY name COLLATE NOCASE').map((r) => ({
      id: String(r.id),
      name: String(r.name),
      description: String(r.description)
    }))
  }
  saveProject(project: Project): Project {
    const result = { ...project, id: project.id || randomUUID() }
    this.run(
      'INSERT INTO projects VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description',
      [result.id, result.name, result.description]
    )
    return result
  }
  saveMeeting(value: Meeting): void {
    this.run(
      'INSERT INTO meetings VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET endedAt=excluded.endedAt,summary=excluded.summary',
      [
        value.id,
        value.topic,
        value.projectId,
        value.startedAt,
        value.endedAt,
        value.summary,
        Number(value.mock)
      ]
    )
  }
  meetings(): Meeting[] {
    return this.rows('SELECT * FROM meetings ORDER BY startedAt DESC LIMIT 1000').map((r) => ({
      id: String(r.id),
      topic: String(r.topic),
      projectId: r.projectId ? String(r.projectId) : null,
      startedAt: Number(r.startedAt),
      endedAt: r.endedAt === null ? null : Number(r.endedAt),
      summary: String(r.summary),
      mock: !!r.mock
    }))
  }
  saveTranscript(meetingId: string, value: Transcript): void {
    this.run('INSERT OR REPLACE INTO transcripts VALUES(?,?,?,?,?)', [
      value.id,
      meetingId,
      value.source,
      value.text,
      value.at
    ])
  }
  saveAnswer(meetingId: string, value: Answer): void {
    if (!this.closed && this.rows('SELECT id FROM meetings WHERE id=?', [meetingId]).length)
      this.run('INSERT OR REPLACE INTO answers VALUES(?,?,?)', [value.id, meetingId, JSON.stringify(value)])
  }
  meeting(id: string): { meeting: Meeting; transcripts: Transcript[]; answers: Answer[] } {
    const row = this.rows('SELECT * FROM meetings WHERE id=?', [id])[0]
    if (!row) throw new Error('Meeting not found.')
    const meeting: Meeting = {
      id: String(row.id),
      topic: String(row.topic),
      projectId: row.projectId ? String(row.projectId) : null,
      startedAt: Number(row.startedAt),
      endedAt: row.endedAt === null ? null : Number(row.endedAt),
      summary: String(row.summary),
      mock: !!row.mock
    }
    return {
      meeting,
      transcripts: this.rows('SELECT * FROM transcripts WHERE meetingId=? ORDER BY at', [id]).map((r) => ({
        id: String(r.id),
        source: r.source as Transcript['source'],
        text: String(r.text),
        at: Number(r.at),
        final: true
      })),
      answers: this.rows('SELECT json FROM answers WHERE meetingId=? ORDER BY rowid', [id]).map(
        (r) => JSON.parse(String(r.json)) as Answer
      )
    }
  }
  deleteMeeting(id: string): void {
    this.run('DELETE FROM meetings WHERE id=?', [id])
    this.run('VACUUM')
  }
  retain(days: number): void {
    if (days > 0)
      this.run('DELETE FROM meetings WHERE endedAt IS NOT NULL AND endedAt<?', [Date.now() - days * 86400000])
  }
  documents(projectId: string): DocumentInfo[] {
    return this.rows(
      'SELECT d.*,COUNT(c.id) chunks FROM documents d LEFT JOIN chunks c ON c.documentId=d.id WHERE d.projectId=? GROUP BY d.id ORDER BY d.createdAt DESC',
      [projectId]
    ).map((r) => ({
      id: String(r.id),
      projectId: String(r.projectId),
      name: String(r.name),
      chunks: Number(r.chunks),
      createdAt: Number(r.createdAt)
    }))
  }
}
