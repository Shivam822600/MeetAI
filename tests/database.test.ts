import { afterEach, describe, expect, it } from 'vitest'
import { Database } from '../src/main/database'
import { settingsSchema, audioSchema } from '../src/shared/schemas'
import { localSummary } from '../src/main/services/history'
const opened: Database[] = []
afterEach(async () => {
  for (const db of opened.splice(0)) await db.close()
})
describe('SQLite storage', () => {
  it('persists settings, projects and meetings, enforces foreign keys and cascades deletion', async () => {
    const db = await Database.open()
    opened.push(db)
    db.saveSettings(settingsSchema.parse({ retentionDays: 7 }))
    expect(db.getSettings().retentionDays).toBe(7)
    const p = db.saveProject({ id: '', name: 'Demo', description: 'API' })
    db.saveMeeting({
      id: 'm',
      topic: 'Design',
      projectId: p.id,
      startedAt: 1,
      endedAt: 2,
      summary: '',
      mock: false
    })
    db.saveTranscript('m', { id: 't', source: 'system', text: 'How would you scale?', at: 1, final: true })
    expect(db.meeting('m').transcripts).toHaveLength(1)
    expect(() =>
      db.saveTranscript('missing', { id: 'bad', source: 'system', text: 'x', at: 1, final: true })
    ).toThrow()
    db.deleteMeeting('m')
    expect(db.rows('SELECT * FROM transcripts')).toHaveLength(0)
    expect(db.projects()).toHaveLength(1)
  })
  it('purges expired sessions but keeps active sessions', async () => {
    const db = await Database.open()
    opened.push(db)
    db.saveMeeting({
      id: 'old',
      topic: 'Old',
      projectId: null,
      startedAt: 1,
      endedAt: 2,
      summary: '',
      mock: false
    })
    db.saveMeeting({
      id: 'active',
      topic: 'Active',
      projectId: null,
      startedAt: 1,
      endedAt: null,
      summary: '',
      mock: false
    })
    db.retain(7)
    expect(db.meetings().map((m) => m.id)).toEqual(['active'])
  })
  it('validates audio IPC payload size and labels', () => {
    expect(
      audioSchema.safeParse({ source: 'system', pcm: new Uint8Array(100000), capturedAt: 1, level: 0 })
        .success
    ).toBe(false)
    expect(
      audioSchema.safeParse({ source: 'microphone', pcm: new Uint8Array(3200), capturedAt: 1, level: 0.1 })
        .success
    ).toBe(true)
  })
  it('extracts action statements without inventing owners', () => {
    const summary = localSummary([
      { id: 't', source: 'microphone', text: 'I will check the database index.', at: 1, final: true }
    ])
    expect(summary).toContain('Potential action items')
    expect(summary).toContain('I will check the database index.')
  })
})
