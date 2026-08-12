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
  let updated = 0

  for (const faq of faqs) {
    const hash = createHash('sha256').update(faq.question).digest('hex')
    const embedding = await embedText(faq.question)
    const vectorStr = `[${embedding.join(',')}]`

    try {
      // ON CONFLICT DO UPDATE (not DO NOTHING) — the question text (and therefore its
      // hash) rarely changes, but its answer does when we fix/update FAQ copy; without
      // this, re-running the seed after editing an existing entry's answer in
      // data/faqs.json would silently leave the stale answer in the DB.
      const rows = await sql`
        INSERT INTO faq_entries (question, answer, embedding, category, question_hash)
        VALUES (${faq.question}, ${faq.answer}, ${vectorStr}::vector, ${faq.category ?? null}, ${hash})
        ON CONFLICT (question_hash) DO UPDATE
          SET answer = excluded.answer, category = excluded.category, embedding = excluded.embedding
        RETURNING id, (xmax = 0) AS inserted
      `
      if (rows[0]?.inserted) inserted++
      else updated++
    } catch (err) {
      console.error(`Failed to seed "${faq.question}":`, err)
    }
  }

  console.log(`Done: ${inserted} inserted, ${updated} updated`)
}

seedFaqs().catch(console.error)
