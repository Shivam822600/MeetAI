import { app, BrowserWindow, desktopCapturer, ipcMain, session, powerMonitor, screen, dialog } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { readFile, writeFile } from 'node:fs/promises'
import { isTrustedURL, safeError } from './security/policy'
import { settingsSchema, startSchema, audioSchema, idSchema } from '../shared/schemas'
import { MeetingService } from './services/meeting'
import { Credentials } from './security/credentials'
import { Intelligence } from './ai/intelligence'
import { OverlayWindow } from './windows/overlay'
import { Shortcuts } from './shortcuts'
import { Database } from './database'
import { Knowledge, openAIEmbedder } from './knowledge'
import { Companion, companionHosts } from './companion'
import { localSummary, exportMarkdown } from './services/history'
import type { AppEvent } from '../shared/types'
if (!app.isPackaged && process.env.MEETPILOT_TEST_DATA)
  app.setPath('userData', process.env.MEETPILOT_TEST_DATA)
let main: BrowserWindow | null = null
let meeting: MeetingService | null = null
let overlay: OverlayWindow | null = null
let shortcuts: Shortcuts | null = null
let database: Database | null = null
let companion: Companion | null = null
let quitting = false
let flushed = false
if (!app.requestSingleInstanceLock()) app.quit()
else
  void app
    .whenReady()
    .then(async () => {
      const emit = (event: AppEvent): void => {
        if (event.type === 'state') companion?.publish()
        for (const window of BrowserWindow.getAllWindows())
          if (!window.isDestroyed()) window.webContents.send('app:event', event)
      }
      const credentials = new Credentials(app.getPath('userData'))
      await credentials.load()
      database = await Database.open(join(app.getPath('userData'), 'meetpilot.db'), (error) =>
        emit({ type: 'error', message: 'Local database write failed: ' + safeError(error) })
      )
      const db = database
      const savedSettings = db.getSettings()
      db.retain(savedSettings.retentionDays)
      meeting = new MeetingService(savedSettings, emit, (provider) => credentials.get(provider))
      const service = meeting
      const knowledge = new Knowledge(
        db,
        openAIEmbedder(
          () => credentials.get('openai'),
          () => service.settings.mockMode
        )
      )
      companion = new Companion(() => service.state)
      const display = companion
      const intelligence = new Intelligence(
        service,
        () => credentials.get('openai'),
        (message) => emit({ type: 'error', message })
      )
      service.onStarted = () => {
        intelligence.reset()
        if (service.state.meeting) db.saveMeeting(service.state.meeting)
      }
      service.onStopped = () => {
        intelligence.cancel()
        if (service.state.meeting) {
          const recorded = db.meeting(service.state.meeting.id)
          service.state.meeting.summary = localSummary(recorded.transcripts)
          db.saveMeeting(service.state.meeting)
        }
      }
      service.onFinal = (value) => {
        if (service.state.meeting) db.saveTranscript(service.state.meeting.id, value)
        intelligence.observe(value)
      }
      intelligence.onAnswer = (answer) => db.saveAnswer(answer.meetingId, answer)
      intelligence.retrieve = (projectId, query, signal) => knowledge.search(projectId, query, signal)
      intelligence.projectName = (id) => db.projects().find((p) => p.id === id)?.name || ''
      main = new BrowserWindow({
        width: 1380,
        height: 900,
        minWidth: 960,
        minHeight: 680,
        backgroundColor: '#0b0d14',
        title: 'MeetPilot AI',
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          backgroundThrottling: false
        }
      })
      main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      main.webContents.on('will-navigate', (event) => event.preventDefault())
      main.webContents.on('render-process-gone', () => service.stop())
      main.on('close', () => service.stop())
      main.on('closed', () => {
        main = null
        app.quit()
      })
      main.setContentProtection(savedSettings.contentProtection)
      const expected =
        process.env.ELECTRON_RENDERER_URL || pathToFileURL(join(__dirname, '../renderer/index.html')).href
      const load = (window: BrowserWindow, hash = ''): void => {
        if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(expected + (hash ? '#' + hash : ''))
        else void window.loadFile(join(__dirname, '../renderer/index.html'), { hash })
      }
      overlay = new OverlayWindow(app.getPath('userData'), () => service.settings, load)
      const floating = overlay
      shortcuts = new Shortcuts((message) => emit({ type: 'error', message }))
      const keys = shortcuts
      const register = (): void => {
        floating.recover(false)
        floating.recoveryAvailable = keys.register(service.settings.shortcuts, {
          toggle: () => floating.toggle(),
          generate: () => {
            void intelligence.generate().catch((e) => emit({ type: 'error', message: safeError(e) }))
          },
          pause: () => service.pause(),
          stop: () => service.stop(),
          recover: () => floating.recover(),
          previous: () => emit({ type: 'history', direction: 1 }),
          next: () => emit({ type: 'history', direction: -1 })
        })
      }
      main.webContents.once('did-finish-load', register)
      screen.on('display-removed', () => floating.restoreOnDisplays())
      screen.on('display-metrics-changed', () => floating.restoreOnDisplays())
      const overlayChannels = new Set([
        'bootstrap',
        'settings:save',
        'session:stop',
        'session:pause',
        'audio:mute',
        'answer:generate',
        'answer:cancel',
        'overlay'
      ])
      const handle = (channel: string, fn: (input: unknown) => unknown): void => {
        ipcMain.handle(channel, async (event, input: unknown) => {
          const allowed =
            event.sender === main?.webContents ||
            (event.sender === floating.window?.webContents && overlayChannels.has(channel))
          if (
            !allowed ||
            event.senderFrame !== event.sender.mainFrame ||
            !isTrustedURL(event.senderFrame.url, expected)
          )
            throw new Error('Untrusted IPC sender')
          try {
            return await fn(input)
          } catch (error) {
            throw new Error(safeError(error))
          }
        })
      }
      session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
        callback(
          contents === main?.webContents &&
            service.lifecycle.acceptsFrames() &&
            (permission === 'display-capture' ||
              (permission === 'media' &&
                'mediaTypes' in details &&
                !!details.mediaTypes?.every((t) => t === 'audio')))
        )
      })
      session.defaultSession.setPermissionCheckHandler(
        (contents, permission) =>
          contents === main?.webContents &&
          service.lifecycle.acceptsFrames() &&
          (permission === 'media' || permission === 'display-capture')
      )
      session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        if (
          process.platform !== 'win32' ||
          request.frame !== main?.webContents.mainFrame ||
          !service.lifecycle.acceptsFrames()
        ) {
          callback({})
          return
        }
        void desktopCapturer
          .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
          .then((sources) => {
            if (!service.lifecycle.acceptsFrames() || !sources[0]) {
              callback({})
              return
            }
            callback({ video: sources[0], audio: 'loopback' })
          })
          .catch(() => callback({}))
      })
      handle('bootstrap', () => ({
        settings: service.settings,
        credentials: credentials.status(),
        state: service.state,
        projects: db.projects(),
        meetings: db.meetings()
      }))
      handle('keys:save', async (input) => {
        const { provider, value } = z
          .object({
            provider: z.enum(['openai', 'deepgram']),
            value: z
              .string()
              .trim()
              .max(512)
              .regex(/^[A-Za-z0-9_-]*$/)
          })
          .parse(input)
        await credentials.save(provider, value)
      })
      handle('settings:save', (input) => {
        const next = settingsSchema.parse(input)
        if (service.state.status !== 'idle' && next.mockMode !== service.settings.mockMode)
          throw new Error('Stop the meeting before changing mock mode.')
        if (
          service.lifecycle.acceptsFrames() &&
          (next.microphoneId !== service.settings.microphoneId ||
            next.sampleRate !== service.settings.sampleRate ||
            next.language !== service.settings.language)
        )
          throw new Error('Pause the meeting before changing audio settings.')
        service.settings = db.saveSettings(next)
        db.retain(next.retentionDays)
        floating.apply()
        main?.setContentProtection(next.contentProtection)
        register()
        emit({ type: 'settings', settings: service.settings })
        return service.settings
      })
      handle('session:start', (input) => {
        if (process.platform !== 'win32' && !service.settings.mockMode)
          throw new Error(
            'Live system capture requires Windows. Enable mock mode to explore the app on this platform.'
          )
        const parsed = startSchema.parse(input)
        if (parsed.projectId && !db.projects().some((p) => p.id === parsed.projectId))
          throw new Error('Select an existing project.')
        service.start(parsed)
      })
      handle('session:stop', () => service.stop())
      handle('session:pause', () => service.pause())
      handle('audio:ready', () => service.ready())
      handle('audio:frame', (input) => service.frame(audioSchema.parse(input)))
      handle('audio:error', (input) => service.captureError(z.string().max(1000).parse(input)))
      handle('audio:mute', (input) => service.mute(z.boolean().parse(input)))
      handle('answer:generate', (input) =>
        intelligence.generate(z.string().max(4000).optional().parse(input))
      )
      handle('answer:cancel', () => intelligence.cancel())
      handle('overlay', (input) => {
        const action = z.enum(['toggle', 'click-through', 'recover']).parse(input)
        if (action === 'toggle') floating.toggle()
        else if (action === 'recover') floating.recover()
        else floating.toggleClickThrough()
      })
      handle('companion:hosts', () => companionHosts())
      handle('companion:status', () => display.status())
      handle('companion', async (input) => {
        const parsed = z
          .object({ action: z.enum(['start', 'stop']), host: z.string().max(50).optional() })
          .parse(input)
        if (parsed.action === 'stop') {
          await display.stop()
          return null
        }
        if (!parsed.host || !companionHosts().includes(parsed.host))
          throw new Error('Select a private network address.')
        const certificate = await dialog.showOpenDialog(main!, {
          title: 'Select a trusted TLS certificate for this IP',
          properties: ['openFile'],
          filters: [{ name: 'TLS certificate', extensions: ['pem', 'crt'] }]
        })
        if (certificate.canceled) return null
        const privateKey = await dialog.showOpenDialog(main!, {
          title: 'Select the matching TLS private key',
          properties: ['openFile'],
          filters: [{ name: 'TLS private key', extensions: ['pem', 'key'] }]
        })
        if (privateKey.canceled) return null
        return display.start(
          parsed.host,
          await readFile(certificate.filePaths[0]),
          await readFile(privateKey.filePaths[0])
        )
      })
      handle('documents:list', (input) => db.documents(idSchema.parse(input)))
      handle('documents:get', (input) => {
        const row = db.rows('SELECT id,name,text FROM documents WHERE id=?', [idSchema.parse(input)])[0]
        if (!row) throw new Error('Document not found.')
        return { id: String(row.id), name: String(row.name), text: String(row.text) }
      })
      handle('documents:preview', async () => {
        const result = await dialog.showOpenDialog(main!, {
          title: 'Choose a document to review locally',
          properties: ['openFile'],
          filters: [{ name: 'Project documents', extensions: ['txt', 'md', 'pdf'] }]
        })
        return result.canceled ? [] : [await knowledge.preview(result.filePaths[0])]
      })
      handle('documents:import', async (input) => {
        const value = z
          .object({ projectId: idSchema, previewId: idSchema, text: z.string().min(1).max(120000) })
          .parse(input)
        await knowledge.import(value.projectId, value.previewId, value.text)
      })
      handle('documents:update', async (input) => {
        const value = z
          .object({
            id: idSchema,
            name: z.string().trim().min(1).max(200),
            text: z.string().min(1).max(120000)
          })
          .parse(input)
        await knowledge.update(value.id, value.name, value.text)
      })
      handle('documents:delete', (input) => {
        db.run('DELETE FROM documents WHERE id=?', [idSchema.parse(input)])
        db.run('VACUUM')
      })
      handle('knowledge:search', (input) => {
        const value = z
          .object({ projectId: idSchema, query: z.string().trim().min(1).max(4000) })
          .parse(input)
        return knowledge.search(value.projectId, value.query)
      })
      handle('projects:delete', (input) => {
        const id = idSchema.parse(input)
        if (service.state.status !== 'idle' && service.state.meeting?.projectId === id)
          throw new Error('Stop the meeting before deleting its project.')
        db.run('DELETE FROM projects WHERE id=?', [id])
        db.run('VACUUM')
      })
      handle('projects:list', () => db.projects())
      handle('projects:save', (input) =>
        db.saveProject(
          z
            .object({
              id: z.string().max(100),
              name: z.string().trim().min(1).max(100),
              description: z.string().max(2000)
            })
            .parse(input)
        )
      )
      handle('history:list', () => db.meetings())
      handle('history:get', (input) => db.meeting(idSchema.parse(input)))
      handle('history:delete', (input) => {
        const id = idSchema.parse(input)
        if (service.state.status !== 'idle' && service.state.meeting?.id === id)
          throw new Error('Stop this meeting before deleting it.')
        db.deleteMeeting(id)
      })
      handle('history:summarize', (input) => {
        const record = db.meeting(idSchema.parse(input))
        record.meeting.summary = localSummary(record.transcripts)
        db.saveMeeting(record.meeting)
        return record.meeting.summary
      })
      handle('history:export', async (input) => {
        const record = db.meeting(idSchema.parse(input))
        const result = await dialog.showSaveDialog(main!, {
          title: 'Export meeting',
          defaultPath: 'meeting-' + record.meeting.id + '.md',
          filters: [
            { name: 'Markdown', extensions: ['md'] },
            { name: 'JSON', extensions: ['json'] }
          ]
        })
        if (result.canceled || !result.filePath) return false
        await writeFile(
          result.filePath,
          result.filePath.endsWith('.json') ? JSON.stringify(record, null, 2) : exportMarkdown(record),
          'utf8'
        )
        return true
      })
      powerMonitor.on('suspend', () => {
        if (service.lifecycle.acceptsFrames()) service.pause()
      })
      load(main)
    })
    .catch((error) => {
      console.error(safeError(error))
      app.quit()
    })
app.on('second-instance', () => {
  main?.show()
  main?.focus()
})
app.on('before-quit', (event) => {
  if (flushed) return
  event.preventDefault()
  if (quitting) return
  quitting = true
  shortcuts?.dispose()
  overlay?.destroy()
  void (async () => {
    await companion?.stop()
    await meeting?.stop()
    await database?.close()
  })()
    .catch((error) => dialog.showErrorBox('Local storage error', safeError(error)))
    .finally(() => {
      flushed = true
      app.quit()
    })
})
app.on('window-all-closed', () => app.quit())
