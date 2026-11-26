import { contextBridge, ipcRenderer } from 'electron'
import type { MeetPilotAPI } from './types'
import type { AppEvent } from '../shared/types'
const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args)
const api: MeetPilotAPI = {
  bootstrap: () => invoke('bootstrap'),
  saveSettings: (s) => invoke('settings:save', s),
  saveKey: (provider, value) => invoke('keys:save', { provider, value }),
  start: (input) => invoke('session:start', input),
  stop: () => invoke('session:stop'),
  pause: () => invoke('session:pause'),
  ready: () => invoke('audio:ready'),
  audio: (input) => invoke('audio:frame', input),
  captureError: (message) => invoke('audio:error', message),
  mute: (muted) => invoke('audio:mute', muted),
  generate: (question) => invoke('answer:generate', question),
  cancel: () => invoke('answer:cancel'),
  overlay: (action) => invoke('overlay', action),
  projects: () => invoke('projects:list'),
  saveProject: (input) => invoke('projects:save', input),
  documents: (id) => invoke('documents:list', id),
  previewDocuments: () => invoke('documents:preview'),
  importDocument: (projectId, previewId, text) => invoke('documents:import', { projectId, previewId, text }),
  document: (id) => invoke('documents:get', id),
  updateDocument: (id, name, text) => invoke('documents:update', { id, name, text }),
  deleteProject: (id) => invoke('projects:delete', id),
  companionHosts: () => invoke('companion:hosts'),
  companionStatus: () => invoke('companion:status'),
  deleteDocument: (id) => invoke('documents:delete', id),
  searchKnowledge: (projectId, query) => invoke('knowledge:search', { projectId, query }),
  history: () => invoke('history:list'),
  meeting: (id) => invoke('history:get', id),
  deleteMeeting: (id) => invoke('history:delete', id),
  exportMeeting: (id) => invoke('history:export', id),
  summarize: (id) => invoke('history:summarize', id),
  companion: (action, host) => invoke('companion', { action, host }),
  onEvent: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AppEvent): void => callback(payload)
    ipcRenderer.on('app:event', handler)
    return () => ipcRenderer.removeListener('app:event', handler)
  }
}
contextBridge.exposeInMainWorld('meetpilot', api)
