import { BrowserWindow, screen } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { Settings } from '../../shared/types'
import { fitBounds } from './bounds'
export class OverlayWindow {
  window: BrowserWindow | null = null
  recoveryAvailable = false
  private clickThrough = false
  private lastCompact = false
  constructor(
    private directory: string,
    private settings: () => Settings,
    private load: (window: BrowserWindow, hash: string) => void
  ) {}
  private create(): BrowserWindow {
    const area = screen.getPrimaryDisplay().workArea
    let saved = { x: area.x + area.width - 490, y: area.y + 80, width: 450, height: 640 }
    try {
      saved = z
        .object({
          x: z.number().int(),
          y: z.number().int(),
          width: z.number().int(),
          height: z.number().int()
        })
        .parse(JSON.parse(readFileSync(join(this.directory, 'overlay.json'), 'utf8')))
    } catch {
      /* First run or invalid bounds: use safe defaults. */
    }
    const window = new BrowserWindow({
      ...fitBounds(
        saved,
        screen.getAllDisplays().map((d) => d.workArea)
      ),
      minWidth: 380,
      minHeight: 260,
      frame: false,
      show: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      title: 'MeetPilot Assistant',
      backgroundColor: '#11141e',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    this.window = window
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.on('close', (event) => {
      event.preventDefault()
      this.save()
      window.hide()
    })
    window.on('moved', () => this.save())
    window.on('resized', () => this.save())
    this.load(window, 'overlay')
    this.apply()
    return window
  }
  apply(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    const settings = this.settings()
    window.setOpacity(settings.opacity)
    window.setContentProtection(settings.contentProtection)
    if (settings.compact !== this.lastCompact) {
      window.setSize(window.getSize()[0], settings.compact ? 390 : 640)
      this.lastCompact = settings.compact
    }
  }
  toggle(): void {
    const window = this.window || this.create()
    if (window.isVisible()) window.hide()
    else window.showInactive()
  }
  recover(show = true): void {
    this.clickThrough = false
    this.window?.setIgnoreMouseEvents(false)
    if (show) this.window?.showInactive()
  }
  toggleClickThrough(): void {
    if (!this.recoveryAvailable)
      throw new Error(
        'Click-through needs an available recovery shortcut. Resolve the shortcut conflict in Settings first.'
      )
    this.clickThrough = !this.clickThrough
    this.window?.setIgnoreMouseEvents(this.clickThrough, { forward: true })
  }
  private save(): void {
    if (this.window && !this.window.isDestroyed()) {
      try {
        writeFileSync(join(this.directory, 'overlay.json'), JSON.stringify(this.window.getBounds()), {
          mode: 0o600
        })
      } catch {
        /* Non-critical geometry write. */
      }
    }
  }
  destroy(): void {
    this.save()
    this.window?.destroy()
    this.window = null
  }
  restoreOnDisplays(): void {
    if (this.window && !this.window.isDestroyed())
      this.window.setBounds(
        fitBounds(
          this.window.getBounds(),
          screen.getAllDisplays().map((d) => d.workArea)
        )
      )
  }
}
