import { loadLocalEnv } from './load-local-env'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

loadLocalEnv()

interface FaqSource {
  question: string
  answer: string
  category?: string
}

async function seedFaqs(): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set. Check your .env file.')
    process.exit(1)
  }

  const { sql } = await import('../client')
  const { embedText } = await import('@/lib/rag/embed')

  const sourcePath = process.env.FAQ_SOURCE_PATH ?? path.join(process.cwd(), 'data', 'faqs.json')

  if (!fs.existsSync(sourcePath)) {
    console.error(`FAQ source file not found: ${sourcePath}`)
    process.exit(1)
  }

  const faqs: FaqSource[] = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'))
  console.log(`Seeding ${faqs.length} FAQ entries...`)

  let inserted = 0
  let skipped = 0

  for (const faq of faqs) {
    const hash = createHash('sha256').update(faq.question).digest('hex')
    const embedding = await embedText(faq.question)
    const vectorStr = `[${embedding.join(',')}]`

    try {
      const rows = await sql`
        INSERT INTO faq_entries (question, answer, embedding, category, question_hash)
        VALUES (${faq.question}, ${faq.answer}, ${vectorStr}::vector, ${faq.category ?? null}, ${hash})
        ON CONFLICT (question_hash) DO NOTHING
        RETURNING id
      `
      if (rows.length > 0) inserted++
      else skipped++
    } catch {
      skipped++
    }
  }

  console.log(`Done: ${inserted} inserted, ${skipped} skipped`)
}

seedFaqs().catch(console.error)
