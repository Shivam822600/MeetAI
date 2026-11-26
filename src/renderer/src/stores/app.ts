import { create } from 'zustand'
import type { Bootstrap, SessionState } from '../../../shared/types'
interface Store {
  data: Bootstrap | null
  page: string
  error: string
  setData(data: Bootstrap): void
  setState(state: SessionState): void
  navigate(page: string): void
  notify(error: string): void
}
export const useApp = create<Store>((set) => ({
  data: null,
  page: 'Dashboard',
  error: '',
  setData: (data) => set({ data }),
  setState: (state) => set((s) => ({ data: s.data ? { ...s.data, state } : null })),
  navigate: (page) => set({ page }),
  notify: (error) => set({ error })
}))
