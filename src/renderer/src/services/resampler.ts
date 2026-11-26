/** Streaming weighted box-filter resampler. Maintains fractional phase across render quanta. */
export class PCMResampler {
  private remaining: number
  private sum = 0
  private count = 0
  private output: Int16Array
  private squared = 0
  private readonly ratio: number
  constructor(
    inputRate: number,
    outputRate: number,
    private emit: (pcm: Int16Array, rms: number) => void
  ) {
    if (outputRate > inputRate || outputRate < 8000) throw new Error('Unsupported sample rate')
    this.ratio = inputRate / outputRate
    this.remaining = this.ratio
    this.output = new Int16Array(outputRate / 10)
  }
  push(samples: Float32Array): void {
    for (const raw of samples) {
      const sample = Math.max(-1, Math.min(1, raw))
      let available = 1
      while (available > 1e-8) {
        const weight = Math.min(available, this.remaining)
        this.sum += sample * weight
        this.remaining -= weight
        available -= weight
        if (this.remaining < 1e-8) {
          const value = this.sum / this.ratio
          this.output[this.count++] = Math.round(value * (value < 0 ? 32768 : 32767))
          this.squared += value * value
          this.sum = 0
          this.remaining = this.ratio
          if (this.count === this.output.length) {
            this.emit(this.output, Math.sqrt(this.squared / this.count))
            this.output = new Int16Array(this.output.length)
            this.count = 0
            this.squared = 0
          }
        }
      }
    }
  }
}
