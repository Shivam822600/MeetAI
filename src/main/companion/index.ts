import { createServer, type Server } from 'node:https'
import { randomBytes, timingSafeEqual, X509Certificate } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { WebSocketServer, WebSocket } from 'ws'
import QRCode from 'qrcode'
import type { SessionState } from '../../shared/types'
import { companionPage } from './page'
export function privateAddress(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  return (
    parts.length === 4 &&
    parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255) &&
    (parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31))
  )
}
export function companionHosts(): string[] {
  return [
    ...new Set(
      Object.values(networkInterfaces()).flatMap((list) =>
        (list || [])
          .filter((n) => !n.internal && n.family === 'IPv4' && privateAddress(n.address))
          .map((n) => n.address)
      )
    )
  ]
}
export function tokenMatches(actual: string | undefined, expected: string): boolean {
  if (!actual || !/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}
export function displayState(state: SessionState): object {
  const answer = state.answers.at(-1)
  return {
    status: state.status,
    topic: state.meeting?.topic || 'No active meeting',
    mock: state.meeting?.mock || false,
    question: answer?.question || state.question,
    answer: answer?.text || '',
    keywords: answer?.keywords || [],
    sources: answer?.sources || []
  }
}
export class Companion {
  private server: Server | null = null
  private sockets: WebSocketServer | null = null
  private expiry: ReturnType<typeof setTimeout> | undefined
  private pairingToken = ''
  private sessionToken = ''
  private info: { url: string; qr: string; expiresAt: number } | null = null
  private starting = false
  constructor(
    private state: () => SessionState,
    private hosts = companionHosts
  ) {}
  status(): { url: string; qr: string; expiresAt: number } | null {
    return this.info
  }
  async start(
    host: string,
    cert: Buffer,
    key: Buffer
  ): Promise<NonNullable<ReturnType<Companion['status']>>> {
    if (this.starting) throw new Error('Companion display is already starting.')
    if (!this.hosts().includes(host))
      throw new Error('Choose a private IPv4 address assigned to this computer.')
    const certificate = new X509Certificate(cert)
    if (
      !certificate.checkIP(host) ||
      Date.parse(certificate.validTo) <= Date.now() ||
      Date.parse(certificate.validFrom) > Date.now()
    )
      throw new Error('The TLS certificate must be valid and include the selected IP address.')
    this.starting = true
    try {
      await this.stop()
      this.pairingToken = randomBytes(32).toString('hex')
      this.sessionToken = randomBytes(32).toString('hex')
      const expiresAt = Date.now() + 15 * 60000
      const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false })
      this.sockets = sockets
      let origin = ''
      const authorized = (cookie?: string): boolean =>
        Date.now() < expiresAt &&
        tokenMatches(
          cookie
            ?.split(';')
            .map((p) => p.trim())
            .find((p) => p.startsWith('meetpilot='))
            ?.slice(10),
          this.sessionToken
        )
      const server = createServer({ cert, key, minVersion: 'TLSv1.2' }, (request, response) => {
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Referrer-Policy', 'no-referrer')
        response.setHeader('X-Content-Type-Options', 'nosniff')
        response.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        )
        if (request.headers.host !== new URL(origin).host) {
          response.writeHead(403).end()
          return
        }
        const path = request.url
        if (request.method === 'GET' && (path === '/' || path === '/app.js' || path === '/style.css')) {
          const asset =
            path === '/' ? companionPage.html : path === '/app.js' ? companionPage.js : companionPage.css
          response
            .writeHead(200, {
              'Content-Type':
                path === '/'
                  ? 'text/html; charset=utf-8'
                  : path === '/app.js'
                    ? 'text/javascript; charset=utf-8'
                    : 'text/css; charset=utf-8'
            })
            .end(asset)
          return
        }
        if (request.method === 'POST' && path === '/pair' && request.headers.origin === origin) {
          let body = ''
          let tooLarge = false
          request.on('data', (chunk: Buffer) => {
            body += chunk.toString()
            if (body.length > 256) {
              tooLarge = true
              request.destroy()
            }
          })
          request.on('end', () => {
            if (tooLarge || Date.now() >= expiresAt || !tokenMatches(body, this.pairingToken)) {
              response.writeHead(401).end()
              return
            }
            this.pairingToken = '' // Single use; the authenticated browser can reconnect until expiry.
            response.setHeader(
              'Set-Cookie',
              `meetpilot=${this.sessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))}`
            )
            response.writeHead(204).end()
          })
          return
        }
        if (request.method === 'GET' && path === '/status' && authorized(request.headers.cookie)) {
          response
            .writeHead(200, { 'Content-Type': 'application/json' })
            .end(JSON.stringify(displayState(this.state())))
          return
        }
        response.writeHead(401).end()
      })
      server.requestTimeout = 10000
      server.headersTimeout = 10000
      server.maxConnections = 20
      this.server = server
      server.on('upgrade', (request, socket, head) => {
        if (
          request.url !== '/live' ||
          request.headers.origin !== origin ||
          request.headers.host !== new URL(origin).host ||
          !authorized(request.headers.cookie) ||
          sockets.clients.size >= 3
        ) {
          socket.destroy()
          return
        }
        sockets.handleUpgrade(request, socket, head, (client) => {
          client.on('error', () => client.terminate())
          client.on('message', () => client.close(1008, 'Read-only display'))
          client.send(JSON.stringify(displayState(this.state())))
        })
      })
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, host, () => {
          server.removeListener('error', reject)
          resolve()
        })
      })
      server.on('error', () => {
        void this.stop()
      })
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Unable to start companion display.')
      origin = `https://${host}:${address.port}`
      const url = origin + '/#' + this.pairingToken
      this.info = { url, qr: await QRCode.toDataURL(url, { width: 240 }), expiresAt }
      this.expiry = setTimeout(() => {
        void this.stop()
      }, 15 * 60000)
      return this.info
    } catch (error) {
      await this.stop()
      throw error
    } finally {
      this.starting = false
    }
  }
  publish(): void {
    if (!this.sockets) return
    const data = JSON.stringify(displayState(this.state()))
    for (const socket of this.sockets.clients) {
      if (socket.bufferedAmount > 100000) socket.terminate()
      else if (socket.readyState === WebSocket.OPEN) socket.send(data)
    }
  }
  async stop(): Promise<void> {
    clearTimeout(this.expiry)
    this.info = null
    this.pairingToken = ''
    this.sessionToken = ''
    const sockets = this.sockets
    this.sockets = null
    for (const socket of sockets?.clients || []) socket.terminate()
    sockets?.close()
    const server = this.server
    this.server = null
    if (server)
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
  }
}
