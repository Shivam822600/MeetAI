import type { Source, Transcript } from '../../shared/types'
export interface TranscriptionProvider {
  start(): void
  send(pcm: Uint8Array, capturedAt: number): void
  stop(): void
  finish?(): Promise<void>
}
export interface TranscriptionOptions {
  key: string
  source: Source
  sampleRate: number
  language: string
  onTranscript(value: Transcript): void
  onError(message: string, fatal: boolean): void
}
export class TranscriptDeduplicator {
  private seen = new Map<string, number>()
  accept(value: Transcript): boolean {
    if (!value.final) return true
    const key = value.source + ':' + value.id + ':' + value.text.trim().toLowerCase()
    if (this.seen.has(key)) return false
    this.seen.set(key, Date.now())
    if (this.seen.size > 1000) this.seen.delete(this.seen.keys().next().value!)
    return true
  }
  clear(): void {
    this.seen.clear()
  }
}
export function reconnectDelay(attempt: number): number {
  return Math.min(15000, 500 * 2 ** attempt)
}
