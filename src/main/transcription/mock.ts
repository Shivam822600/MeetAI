import type { TranscriptionProvider, TranscriptionOptions } from './provider'
import { randomUUID } from 'node:crypto'
const script = [
  { source: 'system', text: 'How would you design an API that stays reliable when traffic increases?' },
  { source: 'microphone', text: 'I would begin with the traffic requirements and the failure modes.' },
  { source: 'system', text: 'What about database consistency across services?' },
  { source: 'microphone', text: 'We should clarify which operations require a single transaction.' },
  { source: 'system', text: 'How would you secure the deployment and protect customer data?' }
] as const
export class MockTranscription implements TranscriptionProvider {
  private timer: ReturnType<typeof setInterval> | undefined
  private index = 0
  private readonly connection = randomUUID()
  constructor(private options: TranscriptionOptions) {}
  start(): void {
    this.timer = setInterval(() => {
      const value = script[this.index++]
      if (!value) {
        this.stop()
        return
      }
      if (value.source === this.options.source)
        this.options.onTranscript({
          ...value,
          id: `mock-${this.connection}-${this.index}`,
          at: Date.now(),
          final: true
        })
    }, 5000)
  }
  send(): void {}
  stop(): void {
    clearInterval(this.timer)
  }
}
