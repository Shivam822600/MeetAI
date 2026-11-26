import { globalShortcut } from 'electron'
export class Shortcuts {
  constructor(private report: (message: string) => void) {}
  register(config: Record<string, string>, actions: Record<string, () => void>): boolean {
    globalShortcut.unregisterAll()
    let recovery = false
    for (const [name, callback] of Object.entries(actions)) {
      const accelerator = config[name]
      if (!accelerator) continue
      try {
        const success = globalShortcut.register(accelerator, callback)
        if (!success)
          this.report(
            `Shortcut unavailable: ${accelerator} (${name}). Choose another combination in Settings.`
          )
        if (name === 'recover') recovery = success
      } catch {
        this.report(`Invalid shortcut for ${name}. Check its accelerator in Settings.`)
      }
    }
    return recovery
  }
  dispose(): void {
    globalShortcut.unregisterAll()
  }
}
