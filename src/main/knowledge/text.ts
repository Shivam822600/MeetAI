export const MAX_DOCUMENT_CHARS = 120000
export function validateText(value: string): string {
  const text = value.replace(/\r\n/g, '\n').trim()
  if (!text || text.length > MAX_DOCUMENT_CHARS || text.includes('\0'))
    throw new Error('Use a text document between 1 and 120,000 characters without binary content.')
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}\b|(?:api[_-]?key|password|secret|access[_-]?token)\s*[:=]\s*["']?[^\s"']{12,}/i.test(
      text
    )
  )
    throw new Error('Possible credentials found. Remove secrets from the text before importing.')
  return text
}
export function chunkText(text: string): string[] {
  const chunks: string[] = []
  // Unicode code points avoid splitting surrogate pairs. At most 4,800 UTF-8 bytes per chunk.
  const chars = Array.from(text)
  for (let start = 0; start < chars.length; start += 1050) {
    chunks.push(chars.slice(start, start + 1200).join(''))
    if (start + 1200 >= chars.length) break
  }
  return chunks
}
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0
  let dot = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    aa += a[i] ** 2
    bb += b[i] ** 2
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0
}
