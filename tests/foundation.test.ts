import { describe, expect, it } from 'vitest'
import { settingsSchema, startSchema } from '../src/shared/schemas'
import { isTrustedURL, redact } from '../src/main/security/policy'
describe('foundation boundaries', () => {
  it('requires explicit participant consent', () => {
    expect(startSchema.safeParse({ consent: false, topic: 'Design', projectId: null }).success).toBe(false)
  })
  it('defaults to real mode and bounded settings', () => {
    expect(settingsSchema.parse({}).mockMode).toBe(false)
    expect(settingsSchema.safeParse({ opacity: 0 }).success).toBe(false)
  })
  it('rejects unrelated IPC frames and redacts credentials', () => {
    expect(isTrustedURL('file:///app/index.html#overlay', 'file:///app/index.html')).toBe(true)
    expect(isTrustedURL('file:///other/index.html', 'file:///app/index.html')).toBe(false)
    expect(isTrustedURL('http://localhost:5173/evil', 'http://localhost:5173/')).toBe(false)
    expect(redact('api_key=secret sk-abcdefghijk')).not.toContain('secret')
  })
})
