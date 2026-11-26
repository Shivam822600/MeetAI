import { describe, expect, it } from 'vitest'
import { QuestionDetector } from '../src/main/ai/questions'
import { ConversationContext, tokenUpperBound } from '../src/main/ai/context'
import { parseAnswer, type AIProvider } from '../src/main/ai/provider'
import { Intelligence } from '../src/main/ai/intelligence'
import { MeetingService } from '../src/main/services/meeting'
import { settingsSchema } from '../src/shared/schemas'
describe('question detection', () => {
  it('detects technical questions without punctuation, follow-ups, and duplicates', () => {
    const d = new QuestionDetector()
    expect(d.classify('How would you design a reliable API', 0.65, 1000)).not.toBeNull()
    expect(d.classify('What about that', 0.65, 2000)).not.toBeNull()
    expect(d.classify('How would you design a reliable API?', 0.65, 3000)).toBeNull()
  })
  it('ignores greetings, irrelevant questions and statements', () => {
    const d = new QuestionDetector()
    for (const s of [
      'How are you?',
      'Can you hear me?',
      'What is your favorite food?',
      'We deployed the database yesterday.',
      'What about that'
    ])
      expect(d.classify(s)).toBeNull()
  })
})
describe('context and output', () => {
  it('bounds multilingual context and keeps recent turns', () => {
    const c = new ConversationContext()
    for (let i = 0; i < 100; i++) c.add('Remote', `${i}: ${'æž¶æ§‹'.repeat(300)}`)
    c.add('You', 'LATEST_IMPORTANT_FACT')
    const value = c.build('Design', 'Project', [], 5000)
    expect(tokenUpperBound(value)).toBeLessThanOrEqual(5000)
    expect(value).toContain('LATEST_IMPORTANT_FACT')
    expect(value).not.toContain('Remote: 0:')
  })
  it('separates answer from supporting keywords', () => {
    expect(parseAnswer('Use an index.\nKeywords: SQL, indexing')).toEqual({
      text: 'Use an index.',
      keywords: ['SQL', 'indexing']
    })
    expect(parseAnswer('Part')).toEqual({ text: 'Part', keywords: [] })
  })
  it('cancels an older answer when a new request supersedes it', async () => {
    const service = new MeetingService(settingsSchema.parse({ mockMode: true }), () => undefined)
    service.state.status = 'listening'
    service.state.meeting = {
      id: 'm',
      topic: 'API',
      projectId: null,
      startedAt: 1,
      endedAt: null,
      summary: '',
      mock: true
    }
    const provider: AIProvider = {
      async *stream(request) {
        if (request.question === 'first') {
          await new Promise<void>((resolve) =>
            request.signal.addEventListener('abort', () => resolve(), { once: true })
          )
          yield 'stale'
        } else yield 'new answer\nKeywords: API'
      }
    }
    const ai = new Intelligence(
      service,
      () => '',
      () => undefined,
      provider
    )
    const old = ai.generate('first')
    await Promise.resolve()
    await ai.generate('second')
    await old
    expect(service.state.answers[0].status).toBe('cancelled')
    expect(service.state.answers[0].text).not.toContain('stale')
    expect(service.state.answers[1].text).toBe('new answer')
  })
})
