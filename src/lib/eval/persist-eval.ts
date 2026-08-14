import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { conversationEvals, evalFixtures, leads, surveyProfiles } from '@/lib/db/schema'
import {
  EVAL_VERSION,
  PHASE1_EVAL_REASONS,
  inferPhase1EvalReason,
  reasonToScenarioType,
  runQualificationEval,
  type QualificationActual,
  type QualificationExpected,
  type QualificationEvalResult,
} from './qualification-eval'

export type EvaluatePhase1Result = {
  leadId: string
  reason: string
  result: QualificationEvalResult
  skipped?: false
}

export type EvaluatePhase1Skipped = {
  leadId: string
  skipped: true
  skipReason: string
}

async function loadQualificationActual(leadId: string): Promise<QualificationActual | null> {
  const [row] = await db
    .select({
      leadStatus: leads.leadStatus,
      d1Accepted: leads.d1Accepted,
      d3IsShopper: leads.d3IsShopper,
      score: leads.score,
      quotaSegment: leads.quotaSegment,
      country: surveyProfiles.country,
      stateProvince: surveyProfiles.stateProvince,
      municipality: surveyProfiles.municipality,
      nseRegion: surveyProfiles.nseRegion,
      inQuotaGeo: surveyProfiles.inQuotaGeo,
      educationPsh: surveyProfiles.educationPsh,
      cars: surveyProfiles.cars,
      domesticHelp: surveyProfiles.domesticHelp,
      householdSize: surveyProfiles.householdSize,
      bedrooms: surveyProfiles.bedrooms,
    })
    .from(leads)
    .leftJoin(surveyProfiles, eq(surveyProfiles.leadId, leads.id))
    .where(eq(leads.id, leadId))
    .limit(1)

  if (!row) return null

  return {
    leadStatus: row.leadStatus,
    d1Accepted: row.d1Accepted,
    d3IsShopper: row.d3IsShopper,
    score: row.score,
    quotaSegment: row.quotaSegment,
    country: row.country ?? null,
    stateProvince: row.stateProvince ?? null,
    municipality: row.municipality ?? null,
    nseRegion: row.nseRegion ?? null,
    inQuotaGeo: row.inQuotaGeo ?? null,
    educationPsh: row.educationPsh ?? null,
    cars: row.cars ?? null,
    domesticHelp: row.domesticHelp ?? null,
    householdSize: row.householdSize ?? null,
    bedrooms: row.bedrooms ?? null,
  }
}

export async function evaluatePhase1Outcome(opts: {
  leadId: string
  correlationId: string
  reason: string
}): Promise<EvaluatePhase1Result | EvaluatePhase1Skipped | void> {
  if (!PHASE1_EVAL_REASONS.has(opts.reason)) return

  const actual = await loadQualificationActual(opts.leadId)
  if (!actual) {
    console.warn('[eval] lead not found', { leadId: opts.leadId })
    return { leadId: opts.leadId, skipped: true, skipReason: 'lead_not_found' }
  }

  return persistEval({
    leadId: opts.leadId,
    correlationId: opts.correlationId,
    reason: opts.reason,
    actual,
  })
}

/**
 * Run (or re-run) Phase-1 eval for a lead, inferring reason from current state.
 * Use for manual backfill of existing conversations.
 */
export async function evaluateLeadManually(
  leadId: string,
  opts?: { correlationId?: string; reason?: string },
): Promise<EvaluatePhase1Result | EvaluatePhase1Skipped> {
  const actual = await loadQualificationActual(leadId)
  if (!actual) {
    return { leadId, skipped: true, skipReason: 'lead_not_found' }
  }

  const reason = opts?.reason ?? inferPhase1EvalReason(actual)
  if (!reason) {
    return {
      leadId,
      skipped: true,
      skipReason: `not_evaluable_status:${actual.leadStatus}`,
    }
  }

  return persistEval({
    leadId,
    correlationId: opts?.correlationId ?? crypto.randomUUID(),
    reason,
    actual,
  })
}

async function persistEval(opts: {
  leadId: string
  correlationId: string
  reason: string
  actual: QualificationActual
}): Promise<EvaluatePhase1Result> {
  const scenarioType = reasonToScenarioType(opts.reason)
  let fixtureId: string | null = null
  let fixtureExpected: Partial<QualificationExpected> | null = null

  try {
    const [match] = await db
      .select()
      .from(evalFixtures)
      .where(and(eq(evalFixtures.scenarioType, scenarioType), eq(evalFixtures.active, true)))
      .limit(1)
    if (match) {
      fixtureId = match.id
      fixtureExpected = match.expected as Partial<QualificationExpected>
    }
  } catch (err) {
    console.warn('[eval] fixture lookup skipped', String(err))
  }

  const result = runQualificationEval(opts.reason, opts.actual, fixtureExpected)

  const correlationId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      opts.correlationId,
    )
      ? opts.correlationId
      : null

  await db.insert(conversationEvals).values({
    leadId: opts.leadId,
    fixtureId,
    correlationId,
    reason: opts.reason,
    overallScore: result.overallScore,
    passed: result.passed,
    checks: result.checks as unknown as Record<string, boolean>,
    actual: opts.actual as unknown as Record<string, unknown>,
    expected: result.expected as unknown as Record<string, unknown>,
    mismatches: result.mismatches,
    evalVersion: EVAL_VERSION,
  })

  console.log(
    JSON.stringify({
      event: 'conversation_eval',
      lead_id: opts.leadId,
      correlation_id: opts.correlationId,
      reason: opts.reason,
      overall_score: result.overallScore,
      passed: result.passed,
      checks: result.checks,
      mismatches: result.mismatches,
      fixture_id: fixtureId,
      timestamp: new Date().toISOString(),
    }),
  )

  return { leadId: opts.leadId, reason: opts.reason, result }
}

/** Backfill evals for all evaluable leads (or a subset). */
export async function backfillPhase1Evals(opts?: {
  leadIds?: string[]
  onlyMissing?: boolean
}): Promise<{
  evaluated: number
  skipped: number
  passed: number
  failed: number
  results: Array<EvaluatePhase1Result | EvaluatePhase1Skipped>
}> {
  let leadIds = opts?.leadIds

  if (!leadIds) {
    const rows = await db.select({ id: leads.id }).from(leads)
    leadIds = rows.map((r) => r.id)
  }

  if (opts?.onlyMissing && leadIds.length > 0) {
    const existing = await db
      .selectDistinct({ leadId: conversationEvals.leadId })
      .from(conversationEvals)
      .where(inArray(conversationEvals.leadId, leadIds))
    const hasEval = new Set(existing.map((e) => e.leadId))
    leadIds = leadIds.filter((id) => !hasEval.has(id))
  }

  const results: Array<EvaluatePhase1Result | EvaluatePhase1Skipped> = []
  let evaluated = 0
  let skipped = 0
  let passed = 0
  let failed = 0

  for (const leadId of leadIds) {
    const out = await evaluateLeadManually(leadId)
    results.push(out)
    if ('skipped' in out && out.skipped) {
      skipped++
    } else if ('result' in out) {
      evaluated++
      if (out.result.passed) passed++
      else failed++
    }
  }

  return { evaluated, skipped, passed, failed, results }
}

/** Latest eval for a lead (monitor / list). */
export async function getLatestEvalForLead(leadId: string) {
  const [row] = await db
    .select({
      id: conversationEvals.id,
      overallScore: conversationEvals.overallScore,
      passed: conversationEvals.passed,
      checks: conversationEvals.checks,
      mismatches: conversationEvals.mismatches,
      reason: conversationEvals.reason,
      expected: conversationEvals.expected,
      actual: conversationEvals.actual,
      ranAt: conversationEvals.ranAt,
      evalVersion: conversationEvals.evalVersion,
      fixtureId: conversationEvals.fixtureId,
    })
    .from(conversationEvals)
    .where(eq(conversationEvals.leadId, leadId))
    .orderBy(desc(conversationEvals.ranAt))
    .limit(1)

  return row ?? null
}

export async function getLatestEvalsForLeads(leadIds: string[]) {
  type EvalRow = {
    id: string
    leadId: string
    overallScore: number
    passed: boolean
    checks: Record<string, boolean>
    mismatches: Array<{ field: string; expected: unknown; actual: unknown }>
    reason: string
    ranAt: Date
    evalVersion: string
  }

  const map = new Map<string, EvalRow>()
  if (leadIds.length === 0) return map

  const all = await db
    .select({
      id: conversationEvals.id,
      leadId: conversationEvals.leadId,
      overallScore: conversationEvals.overallScore,
      passed: conversationEvals.passed,
      checks: conversationEvals.checks,
      mismatches: conversationEvals.mismatches,
      reason: conversationEvals.reason,
      ranAt: conversationEvals.ranAt,
      evalVersion: conversationEvals.evalVersion,
    })
    .from(conversationEvals)
    .where(inArray(conversationEvals.leadId, leadIds))
    .orderBy(desc(conversationEvals.ranAt))

  for (const r of all) {
    if (!map.has(r.leadId)) {
      map.set(r.leadId, r as EvalRow)
    }
  }
  return map
}
