import { useState } from 'react'
import { Mic, MicOff, Pause, Play, Square, ArrowUpRight } from 'lucide-react'
import { useApp } from '../stores/app'
import { Dialog } from './Dialog'
import { Button } from './ui/button'
export function MeetingControls() {
  const { data, navigate, notify } = useApp()
  const [show, setShow] = useState(false)
  const [consent, setConsent] = useState(false)
  const [topic, setTopic] = useState('Technical discussion')
  const [projectId, setProject] = useState('')
  const [busy, setBusy] = useState(false)
  if (!data) return null
  const run = (fn: () => Promise<unknown>): void => {
    void fn().catch((e) => notify(String(e)))
  }
  if (data.state.status === 'stopping')
    return (
      <span role="status" className="muted">
        Saving final transcript…
      </span>
    )
  if (data.state.status === 'idle' && window.location.hash === '#overlay')
    return <p className="muted">Start a meeting from the main MeetPilot window.</p>
  if (data.state.status !== 'idle')
    return (
      <div className="actions">
        <Button variant="secondary" onClick={() => run(() => window.meetpilot.pause())}>
          {data.state.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}
          {data.state.status === 'paused' ? 'Resume' : 'Pause'}
        </Button>
        <Button variant="secondary" onClick={() => run(() => window.meetpilot.mute(!data.state.muted))}>
          {data.state.muted ? <MicOff size={15} /> : <Mic size={15} />}
          {data.state.muted ? 'Unmute' : 'Mute'}
        </Button>
        <Button variant="destructive" onClick={() => run(() => window.meetpilot.stop())}>
          <Square size={14} />
          Stop meeting
        </Button>
      </div>
    )
  return (
    <>
      <Button onClick={() => setShow(true)}>
        Start a meeting <ArrowUpRight size={16} />
      </Button>
      {show && (
        <Dialog
          title="Start meeting"
          onClose={() => {
            if (!busy) setShow(false)
          }}
        >
          <p>Make room for a good conversation.</p>
          <p>
            MeetPilot sends microphone and default Windows system audio to Deepgram for transcription.
            Questions, bounded conversation context, and selected project excerpts go to OpenAI. Raw audio is
            not saved locally.
          </p>
          <label htmlFor="meeting-topic">Meeting topic</label>
          <input
            id="meeting-topic"
            value={topic}
            maxLength={200}
            onChange={(e) => setTopic(e.target.value)}
          />
          <label htmlFor="meeting-project">Project context</label>
          <select id="meeting-project" value={projectId} onChange={(e) => setProject(e.target.value)}>
            <option value="">No project</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I have
            informed the participants and obtained appropriate consent to process this meeting audio and
            context with these providers.
          </label>
          {data.settings.mockMode && (
            <div className="notice">
              MOCK MODE — simulated transcripts and answers; no audio or provider requests.
            </div>
          )}
          <p className="muted">
            Use headphones to reduce acoustic echo. System capture includes other applications playing on the
            default output device.
          </p>
          <div className="actions">
            <Button variant="secondary" onClick={() => setShow(false)}>
              Cancel
            </Button>
            <Button
              disabled={!consent || !topic.trim() || busy}
              onClick={() => {
                setBusy(true)
                window.meetpilot
                  .start({ consent: true, topic, projectId: projectId || null })
                  .then(() => {
                    setShow(false)
                    setConsent(false)
                    navigate('Live meeting')
                  })
                  .catch((e) => notify(String(e)))
                  .finally(() => setBusy(false))
              }}
            >
              {busy ? 'Starting…' : 'Consent & start'}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  )
}
