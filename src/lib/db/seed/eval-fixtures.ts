import { loadLocalEnv } from './load-local-env'
import * as fs from 'fs'
import * as path from 'path'

loadLocalEnv()

interface FixtureSource {
  slug: string
  description: string
  scenarioType: string
  inputSnapshot: Record<string, unknown>
  expected: Record<string, unknown>
  tags?: string[]
}

async function seedEvalFixtures(): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL is not set. Check your .env file.')
    process.exit(1)
  }

  const { eq } = await import('drizzle-orm')
  const { db } = await import('../client')
  const { evalFixtures } = await import('../schema')

  const sourcePath =
    process.env.EVAL_FIXTURES_PATH ??
    path.join(process.cwd(), 'data', 'eval-fixtures.json')

  if (!fs.existsSync(sourcePath)) {
    console.error(`Eval fixtures file not found: ${sourcePath}`)
    process.exit(1)
  }

  const fixtures: FixtureSource[] = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'))
  console.log(`Seeding ${fixtures.length} eval fixtures...`)

  let upserted = 0
  for (const f of fixtures) {
    const [existing] = await db
      .select({ id: evalFixtures.id })
      .from(evalFixtures)
      .where(eq(evalFixtures.slug, f.slug))
      .limit(1)

    if (existing) {
      await db
        .update(evalFixtures)
        .set({
          description: f.description,
          scenarioType: f.scenarioType,
          inputSnapshot: f.inputSnapshot,
          expected: f.expected,
          tags: f.tags ?? null,
          active: true,
        })
        .where(eq(evalFixtures.id, existing.id))
    } else {
      await db.insert(evalFixtures).values({
        slug: f.slug,
        description: f.description,
        scenarioType: f.scenarioType,
        inputSnapshot: f.inputSnapshot,
        expected: f.expected,
        tags: f.tags ?? null,
        active: true,
      })
    }
    upserted++
    console.log(`  ✓ ${f.slug}`)
  }

  console.log(`Done: ${upserted} fixtures upserted`)
}

seedEvalFixtures().catch((err) => {
  console.error(err)
  process.exit(1)
})
