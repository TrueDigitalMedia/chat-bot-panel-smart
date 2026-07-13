import { eq } from 'drizzle-orm'
import { db, sql } from '@/lib/db/client'
import { treintaPanelistRecords } from '@/lib/db/schema'
import { embedText } from '@/lib/rag/embed'
import { EMBEDDING_MODEL_ID } from '@/lib/ai/models'
import type { SurveyProfile } from '@/types/lead'

export interface PersistTreintaPanelistInput {
  leadId: string
  profile: SurveyProfile | Record<string, unknown> | undefined
  summary: string | null
  score: number | null
  quotaSegment?: string | null
}

function buildSourceText(input: {
  summary: string | null
  fullName: string | null | undefined
  country: string | null | undefined
  municipality: string | null | undefined
  email: string | null | undefined
  score: number | null
}): string {
  return [
    input.summary ?? '',
    input.fullName ?? '',
    input.country ?? '',
    input.municipality ?? '',
    input.email ?? '',
    input.score != null ? String(input.score) : '',
  ].join(' | ')
}

function profileFields(profile: PersistTreintaPanelistInput['profile']) {
  if (!profile) {
    return {
      fullName: null as string | null,
      country: null as string | null,
      municipality: null as string | null,
      email: null as string | null,
    }
  }
  const p = profile as Record<string, unknown>
  return {
    fullName: (p.fullName ?? p.full_name ?? null) as string | null,
    country: (p.country ?? null) as string | null,
    municipality: (p.municipality ?? null) as string | null,
    email: (p.email ?? null) as string | null,
  }
}

/**
 * Persists a Treinta-owned panelist snapshot (JSONB) + embedding.
 * Idempotent per lead_id (upserts record and replaces embedding).
 */
export async function persistTreintaPanelist(input: PersistTreintaPanelistInput): Promise<boolean> {
  const { leadId, profile, summary, score, quotaSegment = null } = input
  const fields = profileFields(profile)

  const data: Record<string, unknown> = {
    ...(profile ?? {}),
    summary,
    score,
    quotaSegment,
  }

  const sourceText = buildSourceText({
    summary,
    fullName: fields.fullName,
    country: fields.country,
    municipality: fields.municipality,
    email: fields.email,
    score,
  })

  try {
    const [existing] = await db
      .select({ id: treintaPanelistRecords.id })
      .from(treintaPanelistRecords)
      .where(eq(treintaPanelistRecords.leadId, leadId))
      .limit(1)

    let recordId: string

    if (existing) {
      await db
        .update(treintaPanelistRecords)
        .set({ data, summary, updatedAt: new Date() })
        .where(eq(treintaPanelistRecords.id, existing.id))
      recordId = existing.id
    } else {
      const [inserted] = await db
        .insert(treintaPanelistRecords)
        .values({ leadId, data, summary })
        .returning({ id: treintaPanelistRecords.id })
      recordId = inserted.id
    }

    const embedding = await embedText(sourceText)
    const vectorStr = `[${embedding.join(',')}]`

    await sql`
      INSERT INTO treinta_panelist_embeddings (record_id, embedding, embedding_model, source_text)
      VALUES (${recordId}, ${vectorStr}::vector, ${EMBEDDING_MODEL_ID}, ${sourceText})
      ON CONFLICT (record_id) DO UPDATE SET
        embedding = EXCLUDED.embedding,
        embedding_model = EXCLUDED.embedding_model,
        source_text = EXCLUDED.source_text
    `

    return true
  } catch (err) {
    console.error('[treinta] Failed to persist panelist record:', err)
    return false
  }
}
