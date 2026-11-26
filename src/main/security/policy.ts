export function isTrustedURL(candidate: string, expected: string): boolean {
  try {
    const actual = new URL(candidate)
    const trusted = new URL(expected)
    return (
      actual.origin === trusted.origin &&
      actual.protocol === trusted.protocol &&
      actual.pathname === trusted.pathname &&
      actual.search === trusted.search
    )
  } catch {
    return false
  }
}
export function redact(message: string): string {
  return message
    .replace(/(?:sk-|dg_)[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/(authorization|api[_-]?key|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
}
export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/401|unauthorized|invalid.*key/i.test(message))
    return 'Provider authentication failed. Check the API key in Settings.'
  if (/429|rate.limit/i.test(message)) return 'Provider rate limit reached. Wait briefly and try again.'
  if (/timeout|timed out/i.test(message)) return 'The provider timed out. Check your network and retry.'
  return redact(message).slice(0, 350)
}
