import { PCMResampler } from './resampler'
declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void
class PCMProcessor extends AudioWorkletProcessor {
  private resampler: PCMResampler
  constructor(options: { processorOptions: { targetRate: number } }) {
    super()
    this.resampler = new PCMResampler(sampleRate, options.processorOptions.targetRate, (pcm, level) => {
      // Never drop time during silence; silent frames keep provider timestamps coherent.
      this.port.postMessage({ pcm: pcm.buffer, level, capturedAt: Date.now() - 100, speech: level > 0.008 }, [
        pcm.buffer
      ])
    })
  }
  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0]
    if (channels?.[0]) {
      const mono = new Float32Array(channels[0].length)
      for (const channel of channels)
        for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length
      this.resampler.push(mono)
    }
    // Output remains all zeroes: captured audio is never played back.
    return true
  }
}
registerProcessor('meetpilot-pcm', PCMProcessor as unknown as typeof AudioWorkletProcessor)
