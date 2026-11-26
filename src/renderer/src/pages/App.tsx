import {
  AudioLines,
  LayoutDashboard,
  Radio,
  FolderOpen,
  History,
  Settings,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react'
import { useApp } from '../stores/app'
import { Button } from '../components/ui/button'
import { useSession } from '../hooks/useSession'
import { MeetingControls } from '../components/MeetingControls'
import { Live } from './Live'
import { SettingsPage } from './SettingsPage'
import { Overlay } from './Overlay'
import { KnowledgePage } from './KnowledgePage'
import { HistoryPage } from './HistoryPage'
const nav = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Live meeting', icon: Radio },
  { name: 'Project knowledge', icon: FolderOpen },
  { name: 'Meeting history', icon: History },
  { name: 'Settings', icon: Settings }
]
export function App() {
  const { data, page, navigate, error, notify } = useApp()
  useSession()
  if (window.location.hash === '#overlay') return <Overlay />
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <AudioLines size={24} />
          </span>
          <span>
            MeetPilot<span className="brand-ai">AI</span>
          </span>
        </div>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              onClick={() => navigate(name)}
              className={page === name ? 'nav-item active' : 'nav-item'}
            >
              <Icon size={19} />
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={20} />
          <strong>Private by design</strong>
          <p>
            Local history. Explicit consent.
            <br />
            You control what AI sees.
          </p>
          <span className="version">MEETPILOT / v1.0</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <span className="muted">/</span> {page}
          </span>
          <span className="status-pill">
            <i />
            {data?.settings.mockMode
              ? 'MOCK MODE · No real audio'
              : data?.state.status === 'listening'
                ? 'Audio capture active'
                : data?.state.status === 'starting'
                  ? 'Connecting audio…'
                  : data?.state.status === 'stopping'
                    ? 'Saving final transcript…'
                    : data?.state.status === 'paused'
                      ? 'Audio paused'
                      : 'Ready when you are'}
          </span>
        </header>
        <div className="page">
          <div className="eyebrow">YOUR MEETING, WITH CLARITY</div>
          <h1>{page === 'Dashboard' ? 'A little clarity. A lot of confidence.' : page}</h1>
          <p className="subtitle">Stay present in the conversation. Let MeetPilot handle the details.</p>
          {error && (
            <div role="alert" className="error">
              {error}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Dismiss notification"
                onClick={() => notify('')}
              >
                <X size={14} />
              </Button>
            </div>
          )}
          {!data ? (
            <div className="skeleton" />
          ) : page === 'Live meeting' ? (
            <Live />
          ) : page === 'Settings' ? (
            <SettingsPage />
          ) : page === 'Meeting history' ? (
            <HistoryPage />
          ) : page === 'Project knowledge' ? (
            <KnowledgePage />
          ) : (
            <>
              <section className="hero">
                <div>
                  <span className="tag">
                    <Sparkles size={14} /> YOUR TECHNICAL THINKING PARTNER
                  </span>
                  <h2>
                    Great conversations.
                    <br />
                    <span>Thoughtful answers.</span>
                  </h2>
                  <p>
                    Live transcripts, relevant project knowledge, and a second
                    <br />
                    perspective — right when you need it.
                  </p>
                  <MeetingControls />
                </div>
                <div className="hero-art">
                  <AudioLines size={92} strokeWidth={1} />
                  <div className="orbit one" />
                  <div className="orbit two" />
                  <span className="art-label">LISTEN · UNDERSTAND · RESPOND</span>
                </div>
              </section>
              <div className="stats-grid">
                {['Audio sources', 'AI connections', 'Project knowledge'].map((title, i) => (
                  <section className="card" key={title}>
                    <span className="card-caption">
                      0{i + 1} / {title.toUpperCase()}
                    </span>
                    <h3>
                      {
                        [
                          'System + microphone',
                          data.credentials.openai && data.credentials.deepgram
                            ? 'Providers configured'
                            : 'Connect your providers',
                          data.projects.length + ' projects in your workspace'
                        ][i]
                      }
                    </h3>
                    <p>
                      {
                        [
                          'Capture begins only after your consent.',
                          'OpenAI answers · Deepgram transcription',
                          'Add a project and review documents before upload.'
                        ][i]
                      }
                    </p>
                  </section>
                ))}
              </div>
              <section className="card">
                <div className="section-heading">
                  <h3>Recent meetings</h3>
                  <span className="muted">Your conversation library</span>
                </div>
                {data.meetings.length ? (
                  data.meetings.slice(0, 4).map((m) => (
                    <div
                      className="recent-row"
                      key={m.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate('Meeting history')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navigate('Meeting history')
                      }}
                    >
                      <strong>
                        {m.topic}
                        {m.mock ? ' · MOCK' : ''}
                      </strong>
                      <span>{new Date(m.startedAt).toLocaleString()}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty">
                    <History size={28} />
                    <h3>A fresh start</h3>
                    <p>Your completed meetings will appear here.</p>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
