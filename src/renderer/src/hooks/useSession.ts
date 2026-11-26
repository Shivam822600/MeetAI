import { useEffect } from 'react'
import { useApp } from '../stores/app'
import { AudioCapture } from '../services/capture'
const capture = new AudioCapture()
export function useSession(): void {
  const { setData, setState, notify } = useApp()
  const theme = useApp((s) => s.data?.settings.theme)
  useEffect(() => {
    document.body.dataset.theme = theme || 'dark'
  }, [theme])
  useEffect(() => {
    const overlay = window.location.hash === '#overlay'
    const off = window.meetpilot.onEvent((event) => {
      if (event.type === 'state') {
        const wasActive = useApp.getState().data?.state.status !== 'idle'
        setState(event.state)
        capture.mute(event.state.muted)
        if (!overlay && wasActive && event.state.status === 'idle')
          void window.meetpilot
            .history()
            .then((meetings) => {
              const data = useApp.getState().data
              if (data) setData({ ...data, meetings })
            })
            .catch(() => undefined)
      }
      if (event.type === 'error') notify(event.message)
      if (event.type === 'settings') {
        const data = useApp.getState().data
        if (data) setData({ ...data, settings: event.settings })
      }
      if (event.type === 'capture' && !overlay) {
        if (event.action === 'stop' || event.action === 'pause') capture.stop()
        else {
          const settings = useApp.getState().data?.settings
          if (settings) void capture.start(settings)
        }
      }
    })
    window.meetpilot
      .bootstrap()
      .then(setData)
      .catch((e) => notify(String(e)))
    const cleanup = (): void => capture.stop()
    window.addEventListener('beforeunload', cleanup)
    return () => {
      off()
      capture.stop()
      window.removeEventListener('beforeunload', cleanup)
    }
  }, [setData, setState, notify])
}
