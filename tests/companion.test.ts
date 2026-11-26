import { afterEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { request } from 'node:https'
import { WebSocket } from 'ws'
import { Companion, displayState, privateAddress, tokenMatches } from '../src/main/companion'
import { emptyState } from '../src/main/services/meeting'
const instances: Companion[] = []
afterEach(async () => {
  for (const instance of instances.splice(0)) await instance.stop()
})
function fetchLocal(
  url: string,
  options: { method?: string; origin?: string; cookie?: string; body?: string } = {}
): Promise<{ status: number; body: string; cookie: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        rejectUnauthorized: false,
        method: options.method || 'GET',
        headers: {
          ...(options.origin ? { Origin: options.origin } : {}),
          ...(options.cookie ? { Cookie: options.cookie } : {})
        }
      },
      (response) => {
        let body = ''
        response.on('data', (chunk) => {
          body += String(chunk)
        })
        response.on('end', () =>
          resolve({
            status: response.statusCode!,
            body,
            cookie: response.headers['set-cookie']?.[0].split(';')[0]
          })
        )
      }
    )
    req.on('error', reject)
    req.end(options.body)
  })
}
describe('private companion display', () => {
  it('rejects public/wildcard hosts and malformed tokens', () => {
    for (const ip of ['0.0.0.0', '8.8.8.8', '127.0.0.1', '192.168.1.999', '172.32.0.1'])
      expect(privateAddress(ip)).toBe(false)
    for (const ip of ['10.1.2.3', '172.16.0.1', '192.168.1.2']) expect(privateAddress(ip)).toBe(true)
    expect(tokenMatches('a'.repeat(64), 'a'.repeat(64))).toBe(true)
    expect(tokenMatches('é'.repeat(64), 'a'.repeat(64))).toBe(false)
    expect(tokenMatches('', '')).toBe(false)
  })
  it('only exposes the latest display content', () => {
    const state = emptyState()
    state.transcripts = [{ id: 't', text: 'private transcript', at: 0, source: 'system', final: true }]
    expect(JSON.stringify(displayState(state))).not.toContain('private transcript')
  })
  it('requires one-time pairing, rejects cross-origin access, streams and disconnects on stop', async () => {
    const state = emptyState()
    const instance = new Companion(
      () => state,
      () => ['127.0.0.1']
    )
    instances.push(instance)
    const [cert, key] = await Promise.all([
      readFile('tests/fixtures/localhost-test.crt'),
      readFile('tests/fixtures/localhost-test.key')
    ])
    const info = await instance.start('127.0.0.1', cert, key)
    const origin = new URL(info.url).origin
    const token = new URL(info.url).hash.slice(1)
    expect((await fetchLocal(origin + '/status')).status).toBe(401)
    expect(
      (await fetchLocal(origin + '/pair', { method: 'POST', origin: 'https://evil.invalid', body: token }))
        .status
    ).toBe(401)
    const paired = await fetchLocal(origin + '/pair', { method: 'POST', origin, body: token })
    expect(paired.status).toBe(204)
    expect(paired.cookie).toBeTruthy()
    expect((await fetchLocal(origin + '/pair', { method: 'POST', origin, body: token })).status).toBe(401)
    expect((await fetchLocal(origin + '/status', { cookie: paired.cookie })).status).toBe(200)
    const socket = new WebSocket(origin.replace('https:', 'wss:') + '/live', {
      rejectUnauthorized: false,
      origin,
      headers: { Cookie: paired.cookie! }
    })
    const first = await new Promise<string>((resolve, reject) => {
      socket.once('message', (value) => resolve(value.toString()))
      socket.once('error', reject)
    })
    expect(JSON.parse(first).status).toBe('idle')
    const update = new Promise<string>((resolve) =>
      socket.once('message', (value) => resolve(value.toString()))
    )
    state.question = 'New question'
    instance.publish()
    expect(JSON.parse(await update).question).toBe('New question')
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()))
    await instance.stop()
    await closed
    expect(instance.status()).toBeNull()
  })
})
