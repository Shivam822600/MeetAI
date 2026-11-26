import workletURL from './pcm-worklet?worker&url'
import type { Settings, Source } from '../../../shared/types'
export class AudioCapture {
  private generation = 0
  private streams: MediaStream[] = []
  private contexts: AudioContext[] = []
  private nodes: AudioWorkletNode[] = []
  private muted = false
  private recovering = false
  private attempts = 0
  private settings: Settings | null = null
  async start(settings: Settings, recovery = false): Promise<void> {
    this.stop()
    if (!recovery) this.attempts = 0
    this.settings = settings
    const generation = this.generation
    try {
      if (settings.mockMode) {
        await window.meetpilot.ready()
        return
      }
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: settings.microphoneId === 'default' ? undefined : { exact: settings.microphoneId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      })
      if (generation !== this.generation) {
        mic.getTracks().forEach((t) => t.stop())
        return
      }
      this.streams.push(mic)
      const system = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { width: 1, height: 1, frameRate: 1 }
      })
      if (generation !== this.generation) {
        system.getTracks().forEach((t) => t.stop())
        return
      }
      this.streams.push(system)
      // Chromium requires a video selection to establish loopback. Discard video immediately.
      system.getVideoTracks().forEach((t) => t.stop())
      if (!system.getAudioTracks().length)
        throw new Error(
          'Windows system audio is unavailable. Check the default playback device, then resume.'
        )
      await this.connect(mic, 'microphone', settings.sampleRate, generation)
      await this.connect(system, 'system', settings.sampleRate, generation)
      if (generation !== this.generation) return
      for (const stream of this.streams)
        for (const track of stream.getAudioTracks()) {
          track.onended = () => {
            if (generation === this.generation) void this.recover()
          }
        }
      await window.meetpilot.ready()
    } catch (error) {
      if (generation !== this.generation) return
      this.stop()
      await window.meetpilot.captureError(
        error instanceof Error
          ? error.message
          : 'Audio capture failed. Check permissions and devices, then resume.'
      )
    }
  }
  private async connect(
    stream: MediaStream,
    source: Source,
    rate: number,
    generation: number
  ): Promise<void> {
    const context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
    this.contexts.push(context)
    await context.audioWorklet.addModule(workletURL)
    if (generation !== this.generation) return
    const node = new AudioWorkletNode(context, 'meetpilot-pcm', { processorOptions: { targetRate: rate } })
    this.nodes.push(node)
    let pending = 0
    node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; level: number; capturedAt: number }>) => {
      if (generation !== this.generation || pending >= 4) return
      const pcm = new Uint8Array(event.data.pcm)
      const muted = source === 'microphone' && this.muted
      if (muted) pcm.fill(0)
      pending++
      void window.meetpilot
        .audio({ source, pcm, capturedAt: event.data.capturedAt, level: muted ? 0 : event.data.level })
        .catch(() => {
          if (generation === this.generation) {
            this.stop()
            void window.meetpilot.captureError('Audio transport failed. Resume to reconnect.')
          }
        })
        .finally(() => {
          pending--
        })
    }
    context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(node)
    const silence = context.createGain()
    silence.gain.value = 0
    node.connect(silence).connect(context.destination)
    await context.resume()
  }
  private async recover(): Promise<void> {
    if (this.recovering || !this.settings) return
    if (this.attempts++ >= 2) {
      this.stop()
      await window.meetpilot.captureError(
        'Audio device disconnected. Choose an available microphone in Settings, then resume.'
      )
      return
    }
    this.recovering = true
    try {
      await this.start(this.settings, true)
    } finally {
      this.recovering = false
    }
  }
  mute(value: boolean): void {
    this.muted = value
  }
  stop(): void {
    this.generation++
    for (const node of this.nodes) {
      node.port.onmessage = null
      node.disconnect()
      node.port.close()
    }
    for (const stream of this.streams)
      for (const track of stream.getTracks()) {
        track.onended = null
        track.stop()
      }
    for (const context of this.contexts) void context.close().catch(() => undefined)
    this.streams = []
    this.contexts = []
    this.nodes = []
  }
}
