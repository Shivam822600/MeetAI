export type CaptureStatus = 'idle' | 'starting' | 'listening' | 'paused'
export class AudioLifecycle {
  status: CaptureStatus = 'idle'
  generation = 0
  start(consent: boolean): number {
    if (!consent) throw new Error('Participant consent is required.')
    if (this.status !== 'idle') throw new Error('A meeting is already active.')
    this.status = 'starting'
    return ++this.generation
  }
  ready(): void {
    if (this.status === 'starting') this.status = 'listening'
  }
  pause(): void {
    if (this.status !== 'idle') {
      this.status = 'paused'
      this.generation++
    }
  }
  resume(): void {
    if (this.status === 'paused') {
      this.status = 'starting'
      this.generation++
    }
  }
  stop(): void {
    this.status = 'idle'
    this.generation++
  }
  acceptsFrames(): boolean {
    return this.status === 'starting' || this.status === 'listening'
  }
}
