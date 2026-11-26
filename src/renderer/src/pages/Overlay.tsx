import { AudioLines, MousePointer2, Minimize2, X, Maximize2 } from 'lucide-react'
import { AnswerPanel } from '../components/AnswerPanel'
import { MeetingControls } from '../components/MeetingControls'
import { Button } from '../components/ui/button'
import { useApp } from '../stores/app'
export function Overlay() {
  const { data, error, notify } = useApp()
  if (!data) return <div className="skeleton" />
  const run = (fn: () => Promise<unknown>): void => {
    void fn().catch((e) => notify(String(e)))
  }
  return (
    <div className="overlay-shell">
      <header className="overlay-title">
        <span>
          <AudioLines size={17} /> MeetPilot{' '}
          <small>{data.settings.mockMode ? 'MOCK' : data.state.status.toUpperCase()}</small>
        </span>
        <div className="actions">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle compact view"
            onClick={() =>
              run(() => window.meetpilot.saveSettings({ ...data.settings, compact: !data.settings.compact }))
            }
          >
            {data.settings.compact ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Enable click-through; recovery shortcut is shown below"
            onClick={() => run(() => window.meetpilot.overlay('click-through'))}
          >
            <MousePointer2 size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Hide assistant"
            onClick={() => run(() => window.meetpilot.overlay('toggle'))}
          >
            <X size={15} />
          </Button>
        </div>
      </header>
      {error && (
        <div role="alert" className="error" onClick={() => notify('')}>
          {error}
        </div>
      )}
      <AnswerPanel compact={data.settings.compact} />
      <footer>
        <MeetingControls />
        <p>Recover clicks: {data.settings.shortcuts.recover || 'not configured'}</p>
      </footer>
    </div>
  )
}
