import { useState, useEffect } from 'react'
import { Sparkles, ChevronLeft, ChevronRight, Square, PanelTop } from 'lucide-react'
import { useApp } from '../stores/app'
import { Button } from './ui/button'
export function AnswerPanel({ compact = false }: { compact?: boolean }) {
  const { data, notify } = useApp()
  const [question, setQuestion] = useState('')
  const [back, setBack] = useState(0)
  const count = data?.state.answers.length || 0
  useEffect(
    () =>
      window.meetpilot.onEvent((event) => {
        if (event.type === 'history') setBack((n) => Math.max(0, Math.min(count - 1, n + event.direction)))
      }),
    [count]
  )
  if (!data) return null
  const answers = data.state.answers
  const answer = answers[Math.max(0, answers.length - 1 - back)]
  const run = (fn: () => Promise<unknown>): void => {
    void fn().catch((e) => notify(String(e)))
  }
  return (
    <section className={'card answer-panel ' + (compact ? 'compact' : '')}>
      <div className="section-heading">
        <h3>
          <Sparkles size={17} /> Your thinking partner
        </h3>
        <span className="tag">{data.settings.mockMode ? 'MOCK' : 'AI SUGGESTION'}</span>
      </div>
      <div className="question-label">LATEST QUESTION</div>
      <p className="detected-question">
        {answer?.question || data.state.question || 'A useful answer starts with a good question.'}
      </p>
      <div className="answer-text" aria-live="polite">
        {answer?.text ||
          (answer?.status === 'streaming'
            ? 'Thinking through the context…'
            : 'Ask a question, or let MeetPilot pick up a technical question from the conversation.')}{' '}
        {answer?.status === 'streaming' && <span className="stream-cursor" />}
      </div>
      <div className="keywords">
        {answer?.keywords.map((k) => (
          <span key={k}>{k}</span>
        ))}
      </div>
      {answer?.sources.length ? <p className="sources">Context: {answer.sources.join(' · ')}</p> : null}
      {answer && (
        <div className="answer-meta">
          <span>
            {answer.status}
            {answer.firstTokenMs !== undefined
              ? ` · first text ${(answer.firstTokenMs / 1000).toFixed(2)}s`
              : ''}
          </span>
          <div className="actions">
            <button
              aria-label="Previous answer"
              disabled={back >= answers.length - 1}
              onClick={() => setBack((n) => n + 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {answers.length - back}/{answers.length}
            </span>
            <button aria-label="Next answer" disabled={back === 0} onClick={() => setBack((n) => n - 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
      {!compact && (
        <>
          <label htmlFor="manual-question" className="sr-only">
            Manual question
          </label>
          <textarea
            id="manual-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Ask a question or add a follow-up…"
          />
        </>
      )}
      <div className="actions answer-actions">
        <Button
          disabled={data.state.status === 'idle' || data.state.status === 'stopping'}
          onClick={() => {
            setBack(0)
            run(() => window.meetpilot.generate(question || undefined))
          }}
        >
          <Sparkles size={14} />
          Generate answer
        </Button>
        {answer?.status === 'streaming' && (
          <Button variant="ghost" size="sm" onClick={() => run(() => window.meetpilot.cancel())}>
            <Square size={13} />
            Cancel
          </Button>
        )}
        {!compact && (
          <Button variant="ghost" size="sm" onClick={() => run(() => window.meetpilot.overlay('toggle'))}>
            <PanelTop size={15} />
            Float
          </Button>
        )}
      </div>
    </section>
  )
}
