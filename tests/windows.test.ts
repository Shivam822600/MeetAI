import { expect, it } from 'vitest'
import { fitBounds } from '../src/main/windows/bounds'
it('recovers an overlay from a disconnected monitor without losing its title bar', () => {
  const result = fitBounds({ x: 2500, y: 100, width: 450, height: 640 }, [
    { x: 0, y: 0, width: 1920, height: 1080 }
  ])
  expect(result.x).toBe(1470)
  expect(result.y).toBe(100)
})
it('keeps a window within a negative-coordinate secondary display', () => {
  const result = fitBounds({ x: -1800, y: 800, width: 900, height: 900 }, [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: -1920, y: 0, width: 1920, height: 1080 }
  ])
  expect(result.x).toBe(-1800)
  expect(result.y).toBe(180)
})
