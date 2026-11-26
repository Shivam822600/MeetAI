import { useState, useEffect } from 'react'
import { KeyRound, AudioLines, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import type { Settings } from '../../../shared/types'
import { useApp } from '../stores/app'
import { CompanionSettings } from '../components/CompanionSettings'
import { Button } from '../components/ui/button'
export function SettingsPage() {
  const { data, setData, notify } = useApp()
  const [form, setForm] = useState<Settings>(data!.settings)
  const [keys, setKeys] = useState({ openai: '', deepgram: '' })
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const refresh = (): void => {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((d) => setDevices(d.filter((v) => v.kind === 'audioinput')))
        .catch(() => undefined)
    }
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh)
  }, [])
  const update = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    setForm((s) => ({ ...s, [key]: value }))
  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.meetpilot.saveSettings(form)
      for (const provider of ['openai', 'deepgram'] as const)
        if (keys[provider]) await window.meetpilot.saveKey(provider, keys[provider])
      setKeys({ openai: '', deepgram: '' })
      setData(await window.meetpilot.bootstrap())
      setMessage('Settings saved securely.')
    } catch (e) {
      notify(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="settings-stack">
      <section className="card">
        <h3>
          <KeyRound size={18} /> Provider connections
        </h3>
        <p>
          Keys stay in the main process and are encrypted for your Windows account. Configured does not mean
          the key has been verified by its provider.
        </p>
        <div className="form-grid">
          {(['openai', 'deepgram'] as const).map((provider) => (
            <div key={provider}>
              <label htmlFor={provider}>
                {provider === 'openai' ? 'OpenAI' : 'Deepgram'} API key ·{' '}
                {data!.credentials[provider] ? 'Configured' : 'Missing'}
              </label>
              <input
                id={provider}
                type="password"
                autoComplete="off"
                value={keys[provider]}
                placeholder="Enter a new key"
                onChange={(e) => setKeys((k) => ({ ...k, [provider]: e.target.value }))}
              />
              {data!.credentials[provider] && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void window.meetpilot
                      .saveKey(provider, '')
                      .then(() => window.meetpilot.bootstrap())
                      .then(setData)
                      .catch((e) => notify(String(e)))
                  }}
                >
                  Remove saved key
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="form-grid">
          <div>
            <label htmlFor="model">OpenAI model</label>
            <input id="model" value={form.model} onChange={(e) => update('model', e.target.value)} />
          </div>
          <div>
            <label htmlFor="speech-language">Speech language code</label>
            <input
              id="speech-language"
              value={form.language}
              onChange={(e) => update('language', e.target.value)}
            />
          </div>
        </div>
      </section>
      <section className="card">
        <h3>
          <AudioLines size={18} /> Audio & capture
        </h3>
        <div className="form-grid">
          <div>
            <label htmlFor="microphone">Microphone</label>
            <select
              id="microphone"
              value={form.microphoneId}
              onChange={(e) => update('microphoneId', e.target.value)}
            >
              <option value="default">Windows default microphone</option>
              {devices
                .filter((d) => d.deviceId && d.deviceId !== 'default')
                .map((d, i) => (
                  <option value={d.deviceId} key={d.deviceId}>
                    {d.label || `Microphone ${i + 1} (name available after consent)`}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="rate">PCM sample rate</label>
            <select
              id="rate"
              value={form.sampleRate}
              onChange={(e) => update('sampleRate', Number(e.target.value) as Settings['sampleRate'])}
            >
              {[16000, 24000, 48000].map((n) => (
                <option key={n} value={n}>
                  {n} Hz
                </option>
              ))}
            </select>
          </div>
        </div>
        <p>
          System audio uses the default Windows playback device. Change it in Windows Sound Settings. Pause
          and resume to apply microphone changes.
        </p>
      </section>
      <section className="card">
        <h3>
          <SlidersHorizontal size={18} /> Answer preferences
        </h3>
        <div className="form-grid">
          <div>
            <label htmlFor="answer-mode">Answer mode</label>
            <select
              id="answer-mode"
              value={form.mode}
              onChange={(e) => update('mode', e.target.value as Settings['mode'])}
            >
              {['quick', 'detailed', 'architecture', 'bullets', 'code', 'clarification', 'project'].map(
                (v) => (
                  <option key={v}>{v}</option>
                )
              )}
            </select>
          </div>
          <div>
            <label htmlFor="answer-language">Answer language</label>
            <input
              id="answer-language"
              value={form.answerLanguage}
              onChange={(e) => update('answerLanguage', e.target.value)}
            />
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={form.autoAnswer}
            onChange={(e) => update('autoAnswer', e.target.checked)}
          />
          Automatically answer relevant remote questions
        </label>
        <label htmlFor="confidence">Question confidence · {Math.round(form.confidence * 100)}%</label>
        <input
          id="confidence"
          type="range"
          min="0.3"
          max="1"
          step="0.05"
          value={form.confidence}
          onChange={(e) => update('confidence', Number(e.target.value))}
        />
      </section>
      <section className="card">
        <h3>Appearance & floating assistant</h3>
        <div className="form-grid">
          <div>
            <label htmlFor="theme">Theme</label>
            <select
              id="theme"
              value={form.theme}
              onChange={(e) => update('theme', e.target.value as Settings['theme'])}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div>
            <label htmlFor="opacity">Overlay opacity · {Math.round(form.opacity * 100)}%</label>
            <input
              id="opacity"
              type="range"
              min="0.4"
              max="1"
              step="0.05"
              value={form.opacity}
              onChange={(e) => update('opacity', Number(e.target.value))}
            />
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={form.compact}
            onChange={(e) => update('compact', e.target.checked)}
          />
          Compact overlay
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={form.contentProtection}
            onChange={(e) => update('contentProtection', e.target.checked)}
          />
          Request Windows content protection for both app windows
        </label>
        <p>
          Capture protection is not guaranteed across all capture methods or meeting apps. Use an unshared
          window, second monitor, or companion display for reliable separation.
        </p>
        <div className="actions">
          <Button
            variant="secondary"
            onClick={() => void window.meetpilot.overlay('toggle').catch((e) => notify(String(e)))}
          >
            Toggle floating assistant
          </Button>
          <Button
            variant="secondary"
            onClick={() => void window.meetpilot.overlay('recover').catch((e) => notify(String(e)))}
          >
            Recover overlay clicks
          </Button>
        </div>
      </section>
      <section className="card">
        <h3>Global keyboard shortcuts</h3>
        <p>
          Use Electron accelerator names, for example CommandOrControl+Shift+Space. Conflicts are reported
          when you save.
        </p>
        <div className="form-grid">
          {Object.entries(form.shortcuts).map(([action, key]) => (
            <div key={action}>
              <label htmlFor={'shortcut-' + action}>{action}</label>
              <input
                id={'shortcut-' + action}
                value={key}
                onChange={(e) => update('shortcuts', { ...form.shortcuts, [action]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h3>
          <ShieldCheck size={18} /> Privacy & development
        </h3>
        <label className="check">
          <input
            type="checkbox"
            checked={form.mockMode}
            disabled={data!.state.status !== 'idle'}
            onChange={(e) => update('mockMode', e.target.checked)}
          />
          Explicit mock mode (simulated transcripts and answers; no audio capture or provider requests)
        </label>
        <label htmlFor="retention">History retention in days (0 = keep until manually deleted)</label>
        <input
          id="retention"
          type="number"
          min="0"
          max="3650"
          value={form.retentionDays}
          onChange={(e) => update('retentionDays', Number(e.target.value))}
        />
        <p>
          Local meeting text is stored under your Windows profile. Raw audio is never persisted. Provider data
          handling policies apply to data you authorize sending.
        </p>
      </section>
      <CompanionSettings />
      <div className="actions">
        <Button disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save settings'}
        </Button>
        <span className="muted" role="status">
          {message}
        </span>
      </div>
    </div>
  )
}
