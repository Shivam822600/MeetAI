import { useEffect, useRef, type ReactNode } from 'react'
export function Dialog({
  title,
  onClose,
  children
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const element = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = element.current!
    const focusables = (): HTMLElement[] =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]'
        )
      )
    ;(focusables()[0] || root).focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close.current()
      if (event.key !== 'Tab') return
      const items = focusables()
      const first = items[0]
      const last = items.at(-1)
      if (!first) {
        event.preventDefault()
        root.focus()
        return
      }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    root.addEventListener('keydown', key)
    return () => {
      root.removeEventListener('keydown', key)
      previous?.focus()
    }
  }, [])
  return (
    <div className="modal-backdrop">
      <div className="modal" ref={element} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}
