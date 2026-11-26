import type { z } from 'zod'
import type { settingsSchema, modeSchema } from '../schemas'
export type Settings = z.infer<typeof settingsSchema>
export type AnswerMode = z.infer<typeof modeSchema>
export type Source = 'microphone' | 'system'
export interface Transcript {
  id: string
  source: Source
  text: string
  final: boolean
  at: number
}
export interface Answer {
  id: string
  meetingId: string
  question: string
  text: string
  keywords: string[]
  sources: string[]
  at: number
  status: 'streaming' | 'complete' | 'cancelled' | 'error'
  firstTokenMs?: number
  totalMs?: number
}
export interface Project {
  id: string
  name: string
  description: string
}
export interface DocumentInfo {
  id: string
  projectId: string
  name: string
  chunks: number
  createdAt: number
}
export interface Preview {
  id: string
  name: string
  text: string
  warning?: string
}
export interface Meeting {
  id: string
  topic: string
  projectId: string | null
  startedAt: number
  endedAt: number | null
  summary: string
  mock: boolean
}
export interface SessionState {
  meeting: Meeting | null
  status: 'idle' | 'starting' | 'listening' | 'paused' | 'stopping'
  transcripts: Transcript[]
  answers: Answer[]
  question: string
  levels: Record<Source, number>
  metrics: Record<string, number>
  muted: boolean
}
export interface Bootstrap {
  settings: Settings
  credentials: { openai: boolean; deepgram: boolean }
  state: SessionState
  projects: Project[]
  meetings: Meeting[]
}
export type AppEvent =
  | { type: 'state'; state: SessionState }
  | { type: 'error'; message: string }
  | { type: 'settings'; settings: Settings }
  | { type: 'capture'; action: 'start' | 'stop' | 'pause' | 'resume' }
  | { type: 'history'; direction: number }
