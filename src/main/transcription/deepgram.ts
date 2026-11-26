import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import type { TranscriptionOptions, TranscriptionProvider } from './provider'
import { reconnectDelay } from './provider'
export class DeepgramProvider implements TranscriptionProvider {
  private socket: WebSocket | null = null
  private active = false
  private retry = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private keepalive: ReturnType<typeof setInterval> | undefined
  private queue: { pcm: Uint8Array; at: number }[] = []
  private origin = 0
  private finishing = false
  private finished: Promise<void> | null = null
  constructor(
    private options: TranscriptionOptions,
    private createSocket: (url: string, key: string) => WebSocket = (url, key) =>
      new WebSocket(url, {
        headers: { Authorization: `Token ${key}` },
        handshakeTimeout: 12000,
        maxPayload: 1024 * 1024
      })
  ) {}
  start(): void {
    if (this.active) return
    this.active = true
    this.connect()
  }
  private connect(): void {
    if (!this.active) return
    const connection = randomUUID()
    const query = new URLSearchParams({
      model: 'nova-3',
      language: this.options.language,
      encoding: 'linear16',
      sample_rate: String(this.options.sampleRate),
      channels: '1',
      interim_results: 'true',
      punctuate: 'true',
      smart_format: 'true',
      endpointing: '300',
      vad_events: 'true'
    })
    const socket = this.createSocket(`wss://api.deepgram.com/v1/listen?${query}`, this.options.key)
    this.socket = socket
    this.origin = 0
    socket.on('open', () => {
      if (!this.active || socket !== this.socket) {
        socket.close()
        return
      }
      for (const frame of this.queue.splice(0)) this.transmit(frame.pcm, frame.at)
      this.keepalive = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'KeepAlive' }))
      }, 4000)
    })
    socket.on('message', (raw) => {
      if (!this.active || socket !== this.socket) return
      try {
        const data = JSON.parse(raw.toString())
        if (data.type === 'Error') {
          this.options.onError(
            'Deepgram rejected the audio stream. Check audio format and language settings.',
            true
          )
          this.stop()
          return
        }
        if (data.type !== 'Results') return
        const text = data.channel?.alternatives?.[0]?.transcript
        if (typeof text !== 'string' || !text.trim()) return
        this.retry = 0
        const start = typeof data.start === 'number' ? data.start : 0
        this.options.onTranscript({
          id: `${this.options.source}:${connection}:${start}`,
          source: this.options.source,
          text: text.slice(0, 10000),
          final: data.is_final === true,
          at: (this.origin || Date.now()) + start * 1000
        })
      } catch {
        this.options.onError('Ignored an invalid transcription message.', false)
      }
    })
    socket.on('unexpected-response', (_request, response) => {
      response.resume()
      const fatal = [400, 401, 403].includes(response.statusCode || 0)
      this.options.onError(
        fatal
          ? 'Deepgram authentication or configuration failed. Check your key and language.'
          : 'Deepgram is unavailable. Reconnecting…',
        fatal
      )
      if (fatal) this.stop()
      else socket.terminate()
    })
    socket.on('error', () => {
      /* Close performs the bounded retry; never log request headers. */
    })
    socket.on('close', () => {
      if (socket !== this.socket) return
      clearInterval(this.keepalive)
      if (!this.active || this.finishing) return
      if (this.retry >= 6) {
        this.options.onError(
          'Transcription disconnected repeatedly. Check your connection, then resume.',
          true
        )
        this.stop()
        return
      }
      this.options.onError(
        'Transcription connection interrupted. Reconnecting; a short audio gap may occur.',
        false
      )
      this.timer = setTimeout(() => this.connect(), reconnectDelay(this.retry++))
    })
  }
  private transmit(pcm: Uint8Array, at: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    if (this.socket.bufferedAmount > this.options.sampleRate * 4) {
      this.socket.terminate()
      return
    }
    if (!this.origin) this.origin = at
    this.socket.send(pcm)
  }
  send(pcm: Uint8Array, capturedAt: number): void {
    if (!this.active || this.finishing) return
    if (this.socket?.readyState === WebSocket.OPEN) this.transmit(pcm, capturedAt)
    else {
      this.queue.push({ pcm: Uint8Array.from(pcm), at: capturedAt })
      if (this.queue.length > 20) this.queue.shift()
    }
  }
  finish(): Promise<void> {
    if (this.finished) return this.finished
    this.finishing = true
    clearTimeout(this.timer)
    clearInterval(this.keepalive)
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      this.stop()
      return Promise.resolve()
    }
    this.finished = new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timeout)
        socket.removeListener('close', done)
        this.stop()
        resolve()
      }
      const timeout = setTimeout(() => {
        this.options.onError('Transcription finalization timed out; the last words may be missing.', false)
        done()
      }, 4000)
      socket.once('close', done)
      try {
        socket.send(JSON.stringify({ type: 'CloseStream' }))
      } catch {
        done()
      }
    })
    return this.finished
  }
  stop(): void {
    this.active = false
    clearTimeout(this.timer)
    clearInterval(this.keepalive)
    this.queue = []
    const socket = this.socket
    this.socket = null
    socket?.terminate()
  }
}
