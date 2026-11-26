import { randomUUID } from 'node:crypto'
import type { Answer, Transcript } from '../../shared/types'
import type { MeetingService } from '../services/meeting'
import { safeError } from '../security/policy'
import { QuestionDetector } from './questions'
import { ConversationContext } from './context'
import { OpenAIProvider, MockAIProvider, parseAnswer, type AIProvider } from './provider'
export interface Retrieved {
  text: string
  source: string
  score?: number
}
export class Intelligence {
  readonly context = new ConversationContext()
  private detector = new QuestionDetector()
  private abort: AbortController | null = null
  private sequence = 0
  onAnswer?: (answer: Answer) => void
  retrieve: (projectId: string, query: string, signal: AbortSignal) => Promise<Retrieved[]> = async () => []
  projectName: (id: string) => string = () => ''
  constructor(
    private meeting: MeetingService,
    private key: () => string,
    private report: (message: string) => void,
    private injected?: AIProvider
  ) {}
  reset(): void {
    this.cancel()
    this.context.reset()
    this.detector.reset()
  }
  observe(value: Transcript): void {
    this.context.add(value.source === 'system' ? 'Remote Participant' : 'You', value.text)
    if (value.source !== 'system' || !this.meeting.lifecycle.acceptsFrames()) return
    const start = performance.now()
    const detected = this.detector.classify(value.text, this.meeting.settings.confidence)
    this.meeting.state.metrics.questionDetectionMs = performance.now() - start
    if (!detected) return
    this.meeting.state.question = detected.question
    this.meeting.state.metrics.questionConfidence = detected.confidence
    if (this.meeting.settings.autoAnswer)
      void this.generate(detected.question).catch((e) => this.report(safeError(e)))
  }
  cancel(): void {
    this.sequence++
    this.abort?.abort()
    this.abort = null
    let changed = false
    for (const answer of this.meeting.state.answers)
      if (answer.status === 'streaming') {
        answer.status = 'cancelled'
        changed = true
        this.onAnswer?.(answer)
      }
    if (changed) this.meeting.publish()
  }
  async generate(question?: string): Promise<void> {
    const service = this.meeting
    if (!service.state.meeting || service.state.status === 'idle' || service.state.status === 'stopping')
      throw new Error('Start a consented meeting before generating an answer.')
    const value = (
      question ||
      service.state.question ||
      [...service.state.transcripts].reverse().find((t) => t.final)?.text ||
      ''
    ).trim()
    if (!value) throw new Error('Type a question or wait for a transcript first.')
    if (!service.settings.mockMode && !this.key() && !this.injected)
      throw new Error('Add your OpenAI API key in Settings to generate answers.')
    this.cancel()
    const sequence = this.sequence
    const abort = new AbortController()
    this.abort = abort
    const answer: Answer = {
      id: randomUUID(),
      meetingId: service.state.meeting.id,
      question: value.slice(0, 4000),
      text: '',
      keywords: [],
      sources: [],
      status: 'streaming',
      at: Date.now()
    }
    service.state.answers = [...service.state.answers.slice(-99), answer]
    service.state.question = value
    service.publish()
    const started = performance.now()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      abort.abort()
    }, 35000)
    let raw = ''
    let lastPublished = 0
    try {
      const projectId = service.state.meeting.projectId
      const docs =
        projectId && !service.settings.mockMode ? await this.retrieve(projectId, value, abort.signal) : []
      if (abort.signal.aborted || sequence !== this.sequence) throw new Error('Cancelled')
      answer.sources = docs.map((d) => d.source)
      const context = this.context.build(
        service.state.meeting.topic,
        projectId ? this.projectName(projectId) : '',
        docs
      )
      const provider =
        this.injected || (service.settings.mockMode ? new MockAIProvider() : new OpenAIProvider(this.key))
      for await (const delta of provider.stream({
        question: answer.question,
        context,
        settings: service.settings,
        signal: abort.signal
      })) {
        if (abort.signal.aborted || sequence !== this.sequence) break
        if (answer.firstTokenMs === undefined) {
          answer.firstTokenMs = performance.now() - started
          service.state.metrics.firstTokenMs = answer.firstTokenMs
        }
        raw += delta
        if (raw.length > 30000) throw new Error('Answer exceeded the local output limit.')
        Object.assign(answer, parseAnswer(raw))
        if (performance.now() - lastPublished >= 50) {
          service.publish()
          lastPublished = performance.now()
        }
      }
      answer.status = abort.signal.aborted || sequence !== this.sequence ? 'cancelled' : 'complete'
      if (answer.status === 'complete') {
        if (!answer.text.trim()) throw new Error('The provider returned an empty answer.')
        this.context.add('Question', answer.question)
        this.context.add('Suggested answer (not verified fact)', answer.text)
      }
    } catch (error) {
      answer.status = abort.signal.aborted && !timedOut ? 'cancelled' : 'error'
      if (answer.status === 'error')
        this.report(
          timedOut ? 'Answer generation timed out. Check your connection and retry.' : safeError(error)
        )
    } finally {
      clearTimeout(timer)
      answer.totalMs = performance.now() - started
      if (sequence === this.sequence) {
        this.abort = null
        service.state.metrics.answerTotalMs = answer.totalMs
      }
      this.onAnswer?.(answer)
      service.publish()
    }
  }
}
