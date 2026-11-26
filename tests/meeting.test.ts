import { afterEach, expect, it, vi } from 'vitest'
import { MeetingService } from '../src/main/services/meeting'
import { settingsSchema } from '../src/shared/schemas'
import { DeepgramProvider } from '../src/main/transcription/deepgram'
import type { TranscriptionOptions } from '../src/main/transcription/provider'
afterEach(() => vi.restoreAllMocks())
it('saves late final results before marking a meeting ended and prevents a new start while draining', async () => {
  let finish!: () => void
  const drained = new Promise<void>((resolve) => {
    finish = resolve
  })
  vi.spyOn(DeepgramProvider.prototype, 'start').mockImplementation(() => undefined)
  vi.spyOn(DeepgramProvider.prototype, 'finish').mockImplementation(async function (this: DeepgramProvider) {
    await drained
    const options = (this as unknown as { options: TranscriptionOptions }).options
    options.onTranscript({
      id: options.source,
      source: options.source,
      text: 'Last words',
      final: true,
      at: Date.now()
    })
  })
  const service = new MeetingService(
    settingsSchema.parse({}),
    () => undefined,
    () => 'test'
  )
  const saved = vi.fn()
  service.onFinal = saved
  const stopped = vi.fn()
  service.onStopped = stopped
  service.start({ consent: true, topic: 'Test', projectId: null })
  service.ready()
  const closing = service.stop()
  service.ready() // A delayed renderer acknowledgment must not end the draining state.
  expect(service.state.status).toBe('stopping')
  expect(() => service.start({ consent: true, topic: 'Next', projectId: null })).toThrow()
  finish()
  await closing
  expect(saved).toHaveBeenCalledTimes(2)
  expect(stopped).toHaveBeenCalledTimes(1)
  expect(service.state.status).toBe('idle')
  expect(service.state.meeting?.endedAt).not.toBeNull()
})
