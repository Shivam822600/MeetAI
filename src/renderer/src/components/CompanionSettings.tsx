import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { useApp } from '../stores/app'
export function CompanionSettings() {
  const notify = useApp((s) => s.notify)
  const [hosts, setHosts] = useState<string[]>([])
  const [host, setHost] = useState('')
  const [info, setInfo] = useState<{ url: string; qr: string; expiresAt: number } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void window.meetpilot
      .companionHosts()
      .then((values) => {
        setHosts(values)
        setHost(values[0] || '')
      })
      .catch((e) => notify(String(e)))
    const refresh = (): void => {
      void window.meetpilot
        .companionStatus()
        .then(setInfo)
        .catch((e) => notify(String(e)))
    }
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => clearInterval(timer)
  }, [notify])
  const change = (action: 'start' | 'stop'): void => {
    setBusy(true)
    void window.meetpilot
      .companion(action, host)
      .then(setInfo)
      .catch((e) => notify(String(e)))
      .finally(() => setBusy(false))
  }
  return (
    <section className="card">
      <h3>Companion display</h3>
      <p>
        Show the latest question and suggested answer on a trusted device on your private network. The display
        is read-only and automatically disconnects after 15 minutes.
      </p>
      <p>
        You need a TLS certificate trusted by the other device, with this computer's selected IP address in
        its certificate, plus the matching private key. Both are selected locally when you start.
      </p>
      <label htmlFor="companion-host" className="spaced">
        Private network address
      </label>
      <select
        id="companion-host"
        value={host}
        disabled={busy || !!info}
        onChange={(e) => setHost(e.target.value)}
      >
        {!hosts.length && <option value="">No private network found</option>}
        {hosts.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <div className="actions spaced">
        <Button
          disabled={busy || (!info && !host)}
          variant={info ? 'destructive' : 'secondary'}
          onClick={() => change(info ? 'stop' : 'start')}
        >
          {busy ? 'Please wait…' : info ? 'Stop companion display' : 'Choose TLS files & start'}
        </Button>
      </div>
      {info && (
        <div className="companion-pairing">
          <img src={info.qr} alt="Single-use pairing QR code" width={240} height={240} />
          <div>
            <p>Scan once on your trusted device. Anyone with this unused link can pair.</p>
            <label htmlFor="pairing-url">Pairing link</label>
            <input id="pairing-url" readOnly value={info.url} onFocus={(e) => e.target.select()} />
            <p>
              Expires at {new Date(info.expiresAt).toLocaleTimeString()}. Stop and start again for a new
              pairing link.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
