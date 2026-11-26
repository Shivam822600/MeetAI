export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}
export function fitBounds(saved: Bounds, displays: Bounds[]): Bounds {
  const display =
    displays.find(
      (d) => saved.x >= d.x && saved.x < d.x + d.width && saved.y >= d.y && saved.y < d.y + d.height
    ) || displays[0]
  const width = Math.min(Math.max(380, saved.width), display.width)
  const height = Math.min(Math.max(260, saved.height), display.height)
  return {
    x: Math.max(display.x, Math.min(saved.x, display.x + display.width - width)),
    y: Math.max(display.y, Math.min(saved.y, display.y + display.height - height)),
    width,
    height
  }
}
