import type { Answer, Meeting, Transcript } from '../../shared/types'
export function localSummary(transcripts: Transcript[]): string {
  if (!transcripts.length) return 'No finalized transcript was captured.'
  const recent = transcripts
    .slice(-8)
    .map((t) => `- ${t.source === 'system' ? 'Remote Participant' : 'You'}: ${t.text}`)
    .join('\n')
  const actions = transcripts
    .filter((t) =>
      /\b(action item|follow up|follow-up|i will|we will|i'll|we'll|need to|assigned to)\b/i.test(t.text)
    )
    .slice(-15)
    .map((t) => `- ${t.text}`)
    .join('\n')
  return `LOCAL EXTRACTIVE RECAP (quotes, not inferred conclusions)\n\nRecent discussion\n${recent}\n\nPotential action items — verify owners and commitments\n${actions || 'No explicit action statements detected.'}`
}
export function exportMarkdown(value: {
  meeting: Meeting
  transcripts: Transcript[]
  answers: Answer[]
}): string {
  return `# ${value.meeting.topic}\n\n${new Date(value.meeting.startedAt).toISOString()}${value.meeting.mock ? ' · MOCK SESSION' : ''}\n\n## Recap\n${value.meeting.summary || 'No recap yet.'}\n\n## Transcript\n${value.transcripts.map((t) => `- ${new Date(t.at).toISOString()} | ${t.source === 'system' ? 'Remote Participant' : 'You'}: ${t.text}`).join('\n')}\n\n## Suggested answers (not verified facts)\n${value.answers.map((a) => `### ${a.question}\n${a.text}\n\nKeywords: ${a.keywords.join(', ')}\nSources: ${a.sources.join(', ')}\nStatus: ${a.status}`).join('\n\n')}`
}
