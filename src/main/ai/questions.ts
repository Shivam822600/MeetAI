const domain =
  /\b(api|architect\w*|database|sql|schema|index(?:es|ing)?|query|queries|cache|caching|deploy\w*|security|secure|auth\w*|encrypt\w*|scale|scalability|performance|latency|service\w*|microservice\w*|code|function|react|node|typescript|java|python|cloud|aws|azure|kubernetes|docker|pipeline|test\w*|project|requirement\w*|client|customer|deadline|delivery|deliver|transaction\w*|consistency|concurrency|traffic|design|implementation|data|system|trade.?offs?|failure|reliab\w*|algorithm|complexity)\b/i
const cue =
  /(?:^|[.!?]\s*)(?:how|why|what|when|where|which|who|can (?:you|we)|could (?:you|we)|would (?:you|we)|should (?:we|i)|do (?:you|we)|does|is there|are there|tell me|explain|describe|walk (?:me|us) through)\b/i
const followup =
  /^(?:and |but |so )?(?:why|how so|what about|how about|can you elaborate|could you expand|what if|any trade.?offs)/i
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}
export class QuestionDetector {
  private recent = new Map<string, number>()
  private lastTechnicalAt = 0
  classify(
    text: string,
    threshold = 0.65,
    now = Date.now()
  ): { question: string; confidence: number } | null {
    const clean = text.trim()
    if (
      clean.length < 5 ||
      /^(hi|hello|good morning|good afternoon|thanks|thank you|how are you|can you hear me)\b/i.test(clean)
    )
      return null
    const technical = domain.test(clean)
    const question = cue.test(clean) || /\?\s*$/.test(clean)
    const contextual = followup.test(clean) && now - this.lastTechnicalAt < 120000 && this.lastTechnicalAt > 0
    if (!(question || contextual) || !(technical || contextual)) return null
    const confidence = Math.min(
      0.98,
      0.35 + (technical ? 0.35 : 0.2) + (cue.test(clean) ? 0.2 : 0.1) + (contextual ? 0.1 : 0)
    )
    if (confidence < threshold) return null
    const key = normalizeQuestion(clean)
    for (const [entry, at] of this.recent) if (now - at > 120000) this.recent.delete(entry)
    if (this.recent.has(key)) return null
    this.recent.set(key, now)
    this.lastTechnicalAt = now
    if (this.recent.size > 100) this.recent.delete(this.recent.keys().next().value!)
    return { question: clean, confidence }
  }
  reset(): void {
    this.recent.clear()
    this.lastTechnicalAt = 0
  }
}
