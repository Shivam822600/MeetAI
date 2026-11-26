import { useState, useEffect, useCallback } from 'react'
import { History, Download, Trash2, Search, FileText } from 'lucide-react'
import type { Meeting, Transcript, Answer } from '../../../shared/types'
import { useApp } from '../stores/app'
import { Button } from '../components/ui/button'
import { TranscriptList } from '../components/TranscriptList'
export function HistoryPage() {
  const notify = useApp((s) => s.notify)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [detail, setDetail] = useState<{
    meeting: Meeting
    transcripts: Transcript[]
    answers: Answer[]
  } | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<string | null>(null)
  const refresh = useCallback(() => {
    setLoading(true)
    void window.meetpilot
      .history()
      .then(setMeetings)
      .catch((e) => notify(String(e)))
      .finally(() => setLoading(false))
  }, [notify])
  useEffect(refresh, [refresh])
  const open = (id: string): void => {
    void window.meetpilot
      .meeting(id)
      .then(setDetail)
      .catch((e) => notify(String(e)))
  }
  const visible = meetings.filter(
    (m) =>
      (filter === 'all' || (filter === 'mock' ? m.mock : !m.mock)) &&
      (m.topic + ' ' + m.summary).toLowerCase().includes(query.toLowerCase())
  )
  return (
    <>
      <div className="history-search">
        <Search size={17} />
        <input
          aria-label="Search meetings"
          placeholder="Search meeting topics and recaps…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select aria-label="Session filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All sessions</option>
          <option value="real">Real sessions</option>
          <option value="mock">Mock sessions</option>
        </select>
      </div>
      {loading ? (
        <div className="skeleton" />
      ) : !visible.length ? (
        <section className="card empty">
          <History size={30} />
          <h3>No meetings here yet</h3>
          <p>Completed sessions and their local recaps will appear here.</p>
        </section>
      ) : (
        <div className="history-layout">
          <section className="card meeting-list">
            {visible.map((m) => (
              <button
                key={m.id}
                className={detail?.meeting.id === m.id ? 'selected' : ''}
                onClick={() => open(m.id)}
              >
                <strong>{m.topic}</strong>
                <span>
                  {new Date(m.startedAt).toLocaleString()} {m.mock ? '· MOCK' : ''}
                </span>
                <small>
                  {m.endedAt === null
                    ? 'In progress'
                    : `${Math.max(0, Math.round((m.endedAt - m.startedAt) / 60000))} min`}
                </small>
              </button>
            ))}
          </section>
          <section className="card">
            {!detail ? (
              <div className="empty">
                <FileText size={28} />
                <h3>Select a conversation</h3>
              </div>
            ) : (
              <>
                <div className="section-heading">
                  <h3>{detail.meeting.topic}</h3>
                  <div className="actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void window.meetpilot.exportMeeting(detail.meeting.id).catch((e) => notify(String(e)))
                      }
                    >
                      <Download size={14} />
                      Export
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setConfirm(detail.meeting.id)}>
                      <Trash2 size={14} />
                      Delete
                    </Button>
                  </div>
                </div>
                {confirm === detail.meeting.id && (
                  <div className="notice">
                    Delete this meeting, transcript, and answers from local history?
                    <div className="actions">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          void window.meetpilot
                            .deleteMeeting(confirm)
                            .then(() => {
                              setConfirm(null)
                              setDetail(null)
                              refresh()
                            })
                            .catch((e) => notify(String(e)))
                        }
                      >
                        Delete permanently
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                        Keep meeting
                      </Button>
                    </div>
                  </div>
                )}
                <pre className="recap">{detail.meeting.summary || 'No recap generated yet.'}</pre>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void window.meetpilot
                      .summarize(detail.meeting.id)
                      .then(() => open(detail.meeting.id))
                      .catch((e) => notify(String(e)))
                  }
                >
                  Refresh local recap & action items
                </Button>
                <h3 className="spaced">Questions & suggested answers</h3>
                {detail.answers.length ? (
                  detail.answers.map((a) => (
                    <article className="history-answer" key={a.id}>
                      <strong>{a.question}</strong>
                      <p>{a.text}</p>
                      <span className="muted">
                        {a.status} · {a.keywords.join(', ')}
                      </span>
                    </article>
                  ))
                ) : (
                  <p>No answers were generated.</p>
                )}
                <h3 className="spaced">Transcript</h3>
                <TranscriptList transcripts={detail.transcripts} />
              </>
            )}
          </section>
        </div>
      )}
    </>
  )
}
