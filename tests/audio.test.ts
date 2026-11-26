import { describe, expect, it } from 'vitest'
import { AudioLifecycle } from '../src/main/audio/lifecycle'
import { PCMResampler } from '../src/renderer/src/services/resampler'
describe('audio lifecycle', () => {
  it('prevents duplicate starts and rejects frames after stop', () => {
    const life = new AudioLifecycle()
    expect(() => life.start(false)).toThrow()
    life.start(true)
    expect(() => life.start(true)).toThrow()
    life.ready()
    expect(life.acceptsFrames()).toBe(true)
    life.pause()
    expect(life.acceptsFrames()).toBe(false)
    life.resume()
    life.stop()
    life.ready()
    expect(life.status).toBe('idle')
  })
  it('resamples across quantum boundaries without losing samples', () => {
    let count = 0
    let level = 0
    const r = new PCMResampler(48000, 16000, (pcm, rms) => {
      count += pcm.length
      level = rms
      expect(pcm[0]).toBe(16384)
    })
    for (let i = 0; i < 375; i++) r.push(new Float32Array(128).fill(0.5))
    expect(count).toBe(16000)
    expect(level).toBeCloseTo(0.5)
  })
  it('preserves silence and fractional sample rates', () => {
    let count = 0
    const r = new PCMResampler(44100, 16000, (pcm) => {
      count += pcm.length
      expect(pcm.every((n) => n === 0)).toBe(true)
    })
    r.push(new Float32Array(44100))
    expect(count).toBe(16000)
  })
})
