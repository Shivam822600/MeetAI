import { z } from 'zod'

export const modeSchema = z.enum([
  'quick',
  'detailed',
  'architecture',
  'bullets',
  'code',
  'clarification',
  'project'
])
export const settingsSchema = z.object({
  model: z.string().trim().min(1).max(100).default('gpt-4.1-mini'),
  language: z.string().min(2).max(20).default('en'),
  answerLanguage: z.string().min(2).max(60).default('English'),
  mode: modeSchema.default('quick'),
  autoAnswer: z.boolean().default(true),
  confidence: z.number().min(0.3).max(1).default(0.65),
  sampleRate: z.union([z.literal(16000), z.literal(24000), z.literal(48000)]).default(16000),
  microphoneId: z.string().max(500).default('default'),
  theme: z.enum(['dark', 'light']).default('dark'),
  opacity: z.number().min(0.4).max(1).default(0.96),
  contentProtection: z.boolean().default(false),
  compact: z.boolean().default(false),
  retentionDays: z.number().int().min(0).max(3650).default(30),
  mockMode: z.boolean().default(false),
  shortcuts: z.record(z.string(), z.string().max(80)).default({
    toggle: 'CommandOrControl+Shift+Space',
    generate: 'CommandOrControl+Shift+Enter',
    pause: 'CommandOrControl+Shift+P',
    previous: 'CommandOrControl+Shift+Up',
    next: 'CommandOrControl+Shift+Down',
    stop: 'CommandOrControl+Shift+X',
    recover: 'CommandOrControl+Shift+Escape'
  })
})
export const startSchema = z.object({
  consent: z.literal(true),
  topic: z.string().trim().min(1).max(200),
  projectId: z.string().max(100).nullable()
})
export const audioSchema = z.object({
  source: z.enum(['microphone', 'system']),
  pcm: z
    .instanceof(Uint8Array)
    .refine((v) => v.byteLength > 0 && v.byteLength <= 19200 && v.byteLength % 2 === 0),
  capturedAt: z.number().finite(),
  level: z.number().min(0).max(1)
})
export const idSchema = z.string().min(1).max(100)
