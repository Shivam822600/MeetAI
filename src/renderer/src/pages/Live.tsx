import { useEffect, useState } from 'react'
import { AudioLines, MessageSquare } from 'lucide-react'
import { useApp } from '../stores/app'
import { MeetingControls } from '../components/MeetingControls'
import { TranscriptList } from '../components/TranscriptList'
import { AnswerPanel } from '../components/AnswerPanel'
export function Live() {
  const data = useApp((s) => s.data)!
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const state = data.state
  const elapsed = state.meeting
    ? Math.floor(((state.meeting.endedAt || now) - state.meeting.startedAt) / 1000)
    : 0
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="tag">{state.status.toUpperCase()}</span>
          <h2 className="meeting-title">{state.meeting?.topic || 'Your next conversation'}</h2>
          <span className="muted">
            {Math.floor(elapsed / 60)
              .toString()
              .padStart(2, '0')}
            :{(elapsed % 60).toString().padStart(2, '0')}
          </span>
        </div>
        <MeetingControls />
      </div>
      <div className="two-column">
        {(['system', 'microphone'] as const).map((source) => (
          <section className="card" key={source}>
            <div className="section-heading">
              <h3>
                <AudioLines size={16} /> {source === 'system' ? 'System audio' : 'Your microphone'}
              </h3>
              <span className="muted">{state.levels[source] > 0.008 ? 'Speech detected' : 'Quiet'}</span>
            </div>
            <div className="meter">
              <div style={{ width: `${Math.min(100, state.levels[source] * 300)}%` }} />
            </div>
            <p>
              {source === 'system'
                ? 'Windows default playback · Remote Participant'
                : `${state.muted ? 'Muted' : 'Independent input'} · You`}
            </p>
          </section>
        ))}
      </div>
      <div className="live-columns">
        <section className="card">
          <div className="section-heading">
            <h3>Live transcript</h3>
            <span className="muted">Separate sources. Shared context.</span>
          </div>
          {state.transcripts.length ? (
            <TranscriptList transcripts={state.transcripts} />
          ) : (
            <div className="empty">
              <MessageSquare size={28} />
              <h3>Listening starts with your permission</h3>
              <p>Your live conversation will appear here.</p>
            </div>
          )}
        </section>
        <AnswerPanel />
      </div>
    </>
  )
}
