import { useState, useRef, useEffect } from 'react'
import type { Transcript } from '../../../shared/types'
export function TranscriptList({ transcripts }: { transcripts: Transcript[] }) {
  const [offset, setOffset] = useState(0)
  const parent = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  useEffect(() => {
    if (follow.current && parent.current) parent.current.scrollTop = parent.current.scrollHeight
  }, [transcripts])
  const rowHeight = 100
  const first = Math.max(0, Math.floor(offset / rowHeight) - 3)
  const visible = transcripts.slice(first, first + 13)
  return (
    <div
      ref={parent}
      className="transcript-scroll"
      onScroll={(e) => {
        const el = e.currentTarget
        setOffset(el.scrollTop)
        follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
      }}
    >
      <div style={{ height: transcripts.length * rowHeight, position: 'relative' }}>
        {visible.map((t, i) => (
          <article
            className={'transcript-row ' + (t.final ? '' : 'partial')}
            style={{ position: 'absolute', top: (first + i) * rowHeight, height: rowHeight }}
            key={t.id}
          >
            <div>
              <span className={t.source === 'system' ? 'speaker remote' : 'speaker'}>
                {t.source === 'system' ? 'Remote Participant' : 'You'}
              </span>
              <time>
                {new Date(t.at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })}
              </time>
              {!t.final && <span className="muted"> · transcribing</span>}
            </div>
            <p title={t.text}>{t.text}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
