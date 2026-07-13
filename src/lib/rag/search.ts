import { sql } from '@/lib/db/client'
import { embedText } from './embed'
import { logCall } from '@/lib/db/call-log'

const SIMILARITY_THRESHOLD = 0.75

export interface FAQEntry {
  id: string
  question: string
  answer: string
  category: string | null
}

export async function findFaq(
  query: string,
  opts?: { leadId?: string; correlationId?: string },
): Promise<FAQEntry | null> {
  const start = Date.now()
  const correlationId = opts?.correlationId ?? crypto.randomUUID()

  try {
    const embedding = await embedText(query)
    const vectorStr = `[${embedding.join(',')}]`

    const result = await sql`
      SELECT id, question, answer, category,
             1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM faq_entries
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT 1
    `

    const top = result[0] as (FAQEntry & { similarity: number }) | undefined
    if (!top || top.similarity < SIMILARITY_THRESHOLD) {
      return null
    }

    await logCall({
      leadId: opts?.leadId,
      callType: 'faq_search',
      latencyMs: Date.now() - start,
      correlationId,
    }).catch(() => {})

    return { id: top.id, question: top.question, answer: top.answer, category: top.category }
  } catch (err) {
    await logCall({
      leadId: opts?.leadId,
      callType: 'faq_search',
      latencyMs: Date.now() - start,
      correlationId,
      error: String(err),
    }).catch(() => {})
    return null
  }
}
