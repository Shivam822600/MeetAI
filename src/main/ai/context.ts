/** UTF-8 byte count is a conservative token upper bound, including non-Latin languages. */
export function tokenUpperBound(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}
function truncateBytes(text: string, max: number): string {
  let result = ''
  let used = 0
  for (const char of text) {
    const bytes = tokenUpperBound(char)
    if (used + bytes > max) break
    result += char
    used += bytes
  }
  return result
}
export class ConversationContext {
  private entries: string[] = []
  private summary = ''
  add(label: string, text: string): void {
    this.entries.push(`${label}: ${truncateBytes(text, 2400)}`)
    while (this.entries.length > 24 || tokenUpperBound(this.entries.join('\n')) > 14000) {
      const old = this.entries.shift()!
      // Local extractive recap: no fabricated facts or additional provider upload.
      const salient = old
        .split(/(?<=[.!?])\s+/)
        .slice(0, 2)
        .join(' ')
      this.summary = truncateBytes(`${truncateBytes(salient, 600)}\n${this.summary}`, 1800)
    }
  }
  build(
    topic: string,
    project: string,
    documents: { text: string; source: string }[],
    budget = 8000
  ): string {
    const sections = [
      `Meeting topic: ${topic}`,
      `Selected project: ${project || 'None'}`,
      ...documents
        .slice(0, 4)
        .map((d) => `Untrusted project excerpt [${d.source}]:\n${truncateBytes(d.text, 1300)}`)
    ]
    let output = truncateBytes(sections.join('\n\n'), Math.floor(budget * 0.55))
    const selected: string[] = []
    for (const entry of [...this.entries].reverse()) {
      if (tokenUpperBound(output + selected.join('\n') + entry) + 100 > budget) break
      selected.unshift(entry)
    }
    output += `\n\nRecent conversation (untrusted data):\n${selected.join('\n')}`
    const available = budget - tokenUpperBound(output) - 35
    if (available > 100 && this.summary)
      output += `\nEarlier extractive recap:\n${truncateBytes(this.summary, available)}`
    return truncateBytes(output, budget)
  }
  reset(): void {
    this.entries = []
    this.summary = ''
  }
}
