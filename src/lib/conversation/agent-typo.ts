function isCloseToAgente(word: string): boolean {
  const target = 'agente'
  if (!word || Math.abs(word.length - target.length) > 2) return false
  const a = word
  const b = target
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length] <= 2
}

/**
 * Fast, non-AI check: does the message even plausibly attempt the word "agente"? Only
 * messages that pass this are worth spending an AI call on (detectAgentHandoffIntent in
 * ./detect-agent-handoff) — keeps the LLM off the hot path for the vast majority of
 * turns, which are ordinary survey/FAQ free text unrelated to a human-handoff request.
 * Kept dependency-free (no DB/AI imports) so flow-router.ts can import it statically
 * without pulling in database client code at module-load time.
 */
export function mightBeAgenteTypo(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t || t.length > 20) return false
  const firstWord = t.split(/\s+/)[0]
  return isCloseToAgente(firstWord)
}
