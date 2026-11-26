import { safeStorage } from 'electron'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
export class Credentials {
  private values: Partial<Record<'openai' | 'deepgram', string>> = {}
  private encrypted: Record<string, string> = {}
  private writing: Promise<void> = Promise.resolve()
  constructor(private directory: string) {}
  async load(): Promise<void> {
    try {
      this.encrypted = JSON.parse(await readFile(join(this.directory, 'credentials.json'), 'utf8'))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Unable to read saved credentials. Check your Windows profile permissions.')
    }
    for (const provider of ['openai', 'deepgram'] as const) {
      if (!this.encrypted[provider]) continue
      if (!(await this.encryptionAvailable()))
        throw new Error('Windows credential encryption is unavailable.')
      const decrypted = await safeStorage.decryptStringAsync(Buffer.from(this.encrypted[provider], 'base64'))
      this.values[provider] = decrypted.result
    }
  }
  private async encryptionAvailable(): Promise<boolean> {
    const available = await safeStorage.isAsyncEncryptionAvailable()
    return (
      available && !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
    )
  }
  get(provider: 'openai' | 'deepgram'): string {
    return (
      this.values[provider] ||
      process.env[provider === 'openai' ? 'OPENAI_API_KEY' : 'DEEPGRAM_API_KEY'] ||
      ''
    )
  }
  status(): { openai: boolean; deepgram: boolean } {
    return { openai: !!this.get('openai'), deepgram: !!this.get('deepgram') }
  }
  async save(provider: 'openai' | 'deepgram', value: string): Promise<void> {
    const work = async (): Promise<void> => {
      if (value && !(await this.encryptionAvailable()))
        throw new Error('Secure credential storage is unavailable. No key was saved.')
      const next = { ...this.encrypted }
      if (value) next[provider] = (await safeStorage.encryptStringAsync(value)).toString('base64')
      else delete next[provider]
      await mkdir(this.directory, { recursive: true })
      const path = join(this.directory, 'credentials.json')
      await writeFile(path + '.tmp', JSON.stringify(next), { mode: 0o600 })
      await rename(path + '.tmp', path)
      this.encrypted = next
      this.values[provider] = value
    }
    this.writing = this.writing.catch(() => undefined).then(work)
    return this.writing
  }
}
