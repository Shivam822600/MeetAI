import { randomUUID } from 'node:crypto'
import { AudioLifecycle } from '../audio/lifecycle'
import type { AppEvent, SessionState, Settings, Source, Transcript } from '../../shared/types'
import { DeepgramProvider } from '../transcription/deepgram'
import { MockTranscription } from '../transcription/mock'
import { TranscriptDeduplicator, type TranscriptionProvider } from '../transcription/provider'

export const emptyState = (): SessionState => ({
  meeting: null,
  status: 'idle',
  transcripts: [],
  answers: [],
  question: '',
  levels: { microphone: 0, system: 0 },
  metrics: {},
  muted: false
})
export class MeetingService {
  state = emptyState()
  lifecycle = new AudioLifecycle()
  protected lastEmit = 0
  private providers: Partial<Record<Source, TranscriptionProvider>> = {}
  private dedup = new TranscriptDeduplicator()
  private lastFrame: Record<Source, number> = { microphone: 0, system: 0 }
  private watchdog: ReturnType<typeof setInterval> | undefined
  private transition: Promise<void> | null = null
  private drainingGeneration: number | null = null
  onFinal?: (value: Transcript) => void
  onStarted?: () => void
  onStopped?: () => void
  constructor(
    public settings: Settings,
    protected emit: (event: AppEvent) => void,
    private key: (provider: 'openai' | 'deepgram') => string = () => ''
  ) {}
  start(input: { consent: true; topic: string; projectId: string | null }): void {
    if (this.transition || this.state.status !== 'idle')
      throw new Error('Wait for the current meeting to finish.')
    if (!this.settings.mockMode && !this.key('deepgram'))
      throw new Error('Add your Deepgram API key in Settings before starting.')
    this.lifecycle.start(input.consent)
    this.state = {
      ...emptyState(),
      status: 'starting',
      meeting: {
        id: randomUUID(),
        topic: input.topic,
        projectId: input.projectId,
        startedAt: Date.now(),
        endedAt: null,
        summary: '',
        mock: this.settings.mockMode
      }
    }
    this.onStarted?.()
    this.dedup.clear()
    this.connectProviders()
    this.publish()
    this.emit({ type: 'capture', action: 'start' })
  }
  ready(): void {
    if (this.lifecycle.status !== 'starting' || this.transition) return
    this.lifecycle.ready()
    this.state.status = this.lifecycle.status
    this.publish()
  }
  async stop(): Promise<void> {
    if (this.transition) await this.transition
    if (this.lifecycle.status === 'idle') return
    this.drainingGeneration = this.lifecycle.generation
    this.lifecycle.stop()
    this.state.status = 'stopping'
    this.state.levels = { microphone: 0, system: 0 }
    this.emit({ type: 'capture', action: 'stop' })
    this.publish()
    this.transition = this.finishProviders()
    try {
      await this.transition
      if (this.state.meeting) this.state.meeting.endedAt = Date.now()
      this.onStopped?.()
    } finally {
      this.drainingGeneration = null
      this.transition = null
      this.state.status = 'idle'
      this.publish()
    }
  }
  async pause(): Promise<void> {
    if (this.transition || this.lifecycle.status === 'idle') return
    const resume = this.lifecycle.status === 'paused'
    if (resume) {
      this.lifecycle.resume()
      this.connectProviders()
      this.state.status = this.lifecycle.status
      this.emit({ type: 'capture', action: 'resume' })
      this.publish()
    } else {
      this.drainingGeneration = this.lifecycle.generation
      this.lifecycle.pause()
      this.state.status = 'stopping'
      this.state.levels = { microphone: 0, system: 0 }
      this.emit({ type: 'capture', action: 'pause' })
      this.publish()
      this.transition = this.finishProviders()
      try {
        await this.transition
      } finally {
        this.drainingGeneration = null
        this.transition = null
        this.state.status = 'paused'
        this.publish()
      }
    }
  }
  captureError(message: string): void {
    if (this.state.status === 'idle') return
    if (this.state.status !== 'paused') void this.pause()
    this.emit({ type: 'error', message })
  }
  frame(input: { source: Source; pcm: Uint8Array; capturedAt: number; level: number }): void {
    if (!this.lifecycle.acceptsFrames()) return
    this.lastFrame[input.source] = Date.now()
    this.providers[input.source]?.send(input.pcm, input.capturedAt)
    this.state.levels[input.source] = input.level
    this.state.metrics.captureToMainMs = Math.max(0, Date.now() - input.capturedAt)
    if (Date.now() - this.lastEmit > 150) this.publish()
  }
  mute(value: boolean): void {
    this.state.muted = value
    this.publish()
  }
  private connectProviders(): void {
    const generation = this.lifecycle.generation
    this.lastFrame = { microphone: Date.now(), system: Date.now() }
    for (const source of ['microphone', 'system'] as const) {
      const options = {
        key: this.key('deepgram'),
        source,
        sampleRate: this.settings.sampleRate,
        language: this.settings.language,
        onTranscript: (value: Transcript): void => {
          if (
            (generation === this.lifecycle.generation && this.lifecycle.acceptsFrames()) ||
            generation === this.drainingGeneration
          )
            this.transcript(value)
        },
        onError: (message: string, fatal: boolean): void => {
          if (generation !== this.lifecycle.generation && generation !== this.drainingGeneration) return
          if (fatal) this.captureError(message)
          else this.emit({ type: 'error', message })
        }
      }
      const provider = this.settings.mockMode ? new MockTranscription(options) : new DeepgramProvider(options)
      this.providers[source] = provider
      provider.start()
    }
    this.watchdog = setInterval(() => {
      if (!this.settings.mockMode && Object.values(this.lastFrame).some((at) => Date.now() - at > 20000))
        this.captureError('An audio source stopped delivering data. Check your devices, then resume.')
    }, 2000)
  }
  private async finishProviders(): Promise<void> {
    clearInterval(this.watchdog)
    const providers = Object.values(this.providers)
    this.providers = {}
    await Promise.all(
      providers.map(async (provider) => {
        try {
          if (provider.finish) await provider.finish()
          else provider.stop()
        } catch {
          provider.stop()
          this.emit({
            type: 'error',
            message: 'Could not finalize a transcript stream. The last words may be missing.'
          })
        }
      })
    )
  }
  private transcript(value: Transcript): void {
    if (!this.dedup.accept(value)) return
    const index = this.state.transcripts.findIndex((t) => t.id === value.id)
    if (index >= 0) this.state.transcripts[index] = value
    else {
      this.state.transcripts = this.state.transcripts.filter((t) => t.final || t.source !== value.source)
      this.state.transcripts.push(value)
    }
    this.state.transcripts = this.state.transcripts.slice(-500)
    if (value.final) {
      this.state.metrics.lastFrameToTranscriptMs = Math.max(0, Date.now() - this.lastFrame[value.source])
      this.onFinal?.(value)
    }
    this.publish()
  }
  publish(): void {
    this.lastEmit = Date.now()
    this.emit({ type: 'state', state: this.state })
  }
}
