export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// Rough token estimate: ~4 chars per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// Bound conversation history to maxTokens, preserving system prompt and most recent turns.
export function boundContext(history: Message[], maxTokens = 2000): Message[] {
  const system = history.filter((m) => m.role === 'system')
  const conversation = history.filter((m) => m.role !== 'system')

  const systemTokens = system.reduce((sum, m) => sum + estimateTokens(m.content), 0)
  let budget = maxTokens - systemTokens
  if (budget <= 0) return system

  // Take most recent turns first until budget is exhausted
  const selected: Message[] = []
  for (let i = conversation.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(conversation[i].content)
    if (budget - tokens < 0) break
    selected.unshift(conversation[i])
    budget -= tokens
  }

  return [...system, ...selected]
}
