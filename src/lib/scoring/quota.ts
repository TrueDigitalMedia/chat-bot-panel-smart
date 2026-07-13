import { createHash } from 'crypto'

/**
 * Mock quota check — no external API.
 *
 * Default: random but stable per conversation (`leadId`).
 * Override for tests:
 *   QUOTA_MOCK_AVAILABLE=true  → always available
 *   QUOTA_MOCK_AVAILABLE=false → always exhausted
 */
export async function checkQuotaAvailability(
  segment: string,
  leadId?: string,
): Promise<boolean> {
  const override = process.env.QUOTA_MOCK_AVAILABLE?.toLowerCase()
  if (override === 'true') {
    console.info(`[quota:mock] segment=${segment} available=true (override)`)
    return true
  }
  if (override === 'false') {
    console.info(`[quota:mock] segment=${segment} available=false (override)`)
    return false
  }

  const seed = leadId ?? `${segment}:${Date.now()}`
  const available = stableRandomBool(seed)
  console.info(`[quota:mock] segment=${segment} lead=${leadId ?? 'n/a'} available=${available} (per-session)`)
  return available
}

/** Deterministic 50/50 from a seed so the same conversation always gets the same result. */
function stableRandomBool(seed: string): boolean {
  const digest = createHash('sha256').update(seed).digest()
  return (digest[0]! & 1) === 1
}
