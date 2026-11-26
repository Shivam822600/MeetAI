import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import { TranscriptDeduplicator, reconnectDelay } from '../src/main/transcription/provider'
import { DeepgramProvider } from '../src/main/transcription/deepgram'
class FakeSocket extends EventEmitter {
  readyState = 0
  bufferedAmount = 0
  sent: unknown[] = []
  send(data: unknown): void {
    this.sent.push(data)
  }
  close(): void {
    this.emit('close')
  }
  terminate(): void {
    this.readyState = 3
    this.emit('close')
  }
}
afterEach(() => vi.useRealTimers())
describe('transcription', () => {
  it('deduplicates finals but preserves partials and separate speakers', () => {
    const d = new TranscriptDeduplicator()
    const t = { id: '1', text: 'How does it scale?', source: 'system' as const, final: true, at: 0 }
    expect(d.accept(t)).toBe(true)
    expect(d.accept(t)).toBe(false)
    expect(d.accept({ ...t, source: 'microphone' })).toBe(true)
    expect(d.accept({ ...t, final: false })).toBe(true)
  })
  it('reconnects with bounded exponential delays and cancels scheduled reconnect on stop', () => {
    vi.useFakeTimers()
    const sockets: FakeSocket[] = []
    const onTranscript = vi.fn()
    const provider = new DeepgramProvider(
      { key: 'test', source: 'system', sampleRate: 16000, language: 'en', onTranscript, onError: vi.fn() },
      () => {
        const s = new FakeSocket()
        sockets.push(s)
        return s as unknown as WebSocket
      }
    )
    provider.start()
    sockets[0].emit('close')
    vi.advanceTimersByTime(499)
    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sockets).toHaveLength(2)
    sockets[1].readyState = 1
    sockets[1].emit('open')
    provider.send(new Uint8Array(3200), 1000)
    sockets[1].emit(
      'message',
      Buffer.from(
        JSON.stringify({
          type: 'Results',
          start: 0,
          is_final: true,
          channel: { alternatives: [{ transcript: 'Explain the API' }] }
        })
      )
    )
    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'system', at: 1000, final: true })
    )
    sockets[1].emit('close')
    provider.stop()
    vi.advanceTimersByTime(60000)
    expect(sockets).toHaveLength(2)
    expect(reconnectDelay(20)).toBe(15000)
  })
})
it('accepts final transcripts while draining, then closes without reconnecting', async () => {
  vi.useFakeTimers()
  const socket = new FakeSocket()
  const onTranscript = vi.fn()
  const onError = vi.fn()
  const provider = new DeepgramProvider(
    { key: 'test', source: 'system', sampleRate: 16000, language: 'en', onTranscript, onError },
    () => socket as unknown as WebSocket
  )
  provider.start()
  socket.readyState = 1
  socket.emit('open')
  const finished = provider.finish()
  expect(socket.readyState).toBe(1)
  expect(socket.sent).toContain(JSON.stringify({ type: 'CloseStream' }))
  socket.emit(
    'message',
    Buffer.from(
      JSON.stringify({
        type: 'Results',
        start: 0,
        is_final: true,
        channel: { alternatives: [{ transcript: 'The final words.' }] }
      })
    )
  )
  expect(onTranscript).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'The final words.', final: true })
  )
  socket.emit('close')
  await finished
  vi.advanceTimersByTime(60000)
  expect(onError).not.toHaveBeenCalled()
})
it('bounds finalization when a provider never closes', async () => {
  vi.useFakeTimers()
  const socket = new FakeSocket()
  const onError = vi.fn()
  const provider = new DeepgramProvider(
    { key: 'test', source: 'system', sampleRate: 16000, language: 'en', onTranscript: vi.fn(), onError },
    () => socket as unknown as WebSocket
  )
  provider.start()
  socket.readyState = 1
  socket.emit('open')
  const finished = provider.finish()
  vi.advanceTimersByTime(4000)
  await finished
  expect(socket.readyState).toBe(3)
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('timed out'), false)
})
