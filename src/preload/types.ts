import type {
  AppEvent,
  Bootstrap,
  Settings,
  Source,
  SessionState,
  Project,
  Meeting,
  Transcript,
  Answer,
  Preview,
  DocumentInfo
} from '../shared/types'
export interface MeetPilotAPI {
  bootstrap(): Promise<Bootstrap>
  saveSettings(settings: Settings): Promise<Settings>
  saveKey(provider: 'openai' | 'deepgram', value: string): Promise<void>
  start(input: { consent: true; topic: string; projectId: string | null }): Promise<void>
  stop(): Promise<void>
  pause(): Promise<void>
  ready(): Promise<void>
  audio(input: { source: Source; pcm: Uint8Array; capturedAt: number; level: number }): Promise<void>
  captureError(message: string): Promise<void>
  mute(muted: boolean): Promise<void>
  generate(question?: string): Promise<void>
  cancel(): Promise<void>
  overlay(action: 'toggle' | 'click-through' | 'recover'): Promise<void>
  projects(): Promise<Project[]>
  saveProject(input: Project): Promise<Project>
  documents(projectId: string): Promise<DocumentInfo[]>
  previewDocuments(): Promise<Preview[]>
  importDocument(projectId: string, previewId: string, text: string): Promise<void>
  document(id: string): Promise<{ id: string; name: string; text: string }>
  updateDocument(id: string, name: string, text: string): Promise<void>
  deleteProject(id: string): Promise<void>
  companionHosts(): Promise<string[]>
  companionStatus(): Promise<{ url: string; qr: string; expiresAt: number } | null>
  deleteDocument(id: string): Promise<void>
  searchKnowledge(
    projectId: string,
    query: string
  ): Promise<{ text: string; source: string; score: number }[]>
  history(): Promise<Meeting[]>
  meeting(id: string): Promise<{ meeting: Meeting; transcripts: Transcript[]; answers: Answer[] }>
  deleteMeeting(id: string): Promise<void>
  exportMeeting(id: string): Promise<boolean>
  summarize(id: string): Promise<string>
  companion(
    action: 'start' | 'stop',
    host?: string
  ): Promise<{ url: string; qr: string; expiresAt: number } | null>
  onEvent(callback: (event: AppEvent) => void): () => void
}
declare global {
  interface Window {
    meetpilot: MeetPilotAPI
  }
}
export type { SessionState }
