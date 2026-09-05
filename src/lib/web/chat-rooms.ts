/**
 * Chat-room registry (spec 016). A "room" is a `/chat/<slug>` URL that pre-scopes a fresh
 * web conversation to one country, so the visitor is never asked their country.
 *
 * The room set is FIXED to Ecuador + México (contract §Rules.3) — adding a CAM country
 * here is a spec change. `resolveRoom` is the only slug→country switch; the bootstrap
 * handler additionally verifies `getCountryConfig(country)` and degrades if absent.
 */
import { env } from '@/lib/env'
import { normalizeGeoKey } from '@/lib/geo/cam-nse-catalog'

export const CHAT_ROOMS = { ecuador: 'Ecuador', mexico: 'México' } as const

export type ChatRoomSlug = keyof typeof CHAT_ROOMS

/** slug (path segment) for a room country — the inverse of CHAT_ROOMS. */
const SLUG_BY_COUNTRY: Record<string, ChatRoomSlug> = { Ecuador: 'ecuador', México: 'mexico' }

/**
 * Resolve a URL path segment (or a loosely-typed input) to a canonical room country
 * name, or null. Case-insensitive and accent-tolerant on the *input* ("méxico" → México)
 * but the canonical slug is always ASCII ("mexico"). Never throws; a path-traversal
 * string, empty string, or non-room country → null.
 */
export function resolveRoom(slug: string): string | null {
  if (typeof slug !== 'string') return null
  // Defense-in-depth: a real room slug is one clean path segment. Reject anything with a
  // separator or dot before normalizing, so "ecuador/..", "ecuador.", "../ecuador" etc.
  // can never collapse onto a valid room.
  if (/[/\\.]/.test(slug)) return null
  const key = normalizeGeoKey(slug) // NFD-strip accents, lowercase, non-alnum → space, collapse
  if (key === 'ecuador') return CHAT_ROOMS.ecuador
  if (key === 'mexico') return CHAT_ROOMS.mexico
  return null
}

/**
 * Canonical URL for a room country. Absolute when APP_BASE_URL is set, relative
 * ("/chat/ecuador") otherwise — the admin page shows a note in the relative case.
 * Only room countries are valid input (callers pass CHAT_ROOMS values / listRooms()).
 */
export function roomUrl(country: string): string {
  const slug = SLUG_BY_COUNTRY[country]
  if (!slug) return '' // not a room country — callers never hit this
  const path = `/chat/${slug}`
  const base = env.APP_BASE_URL?.replace(/\/$/, '')
  return base ? `${base}${path}` : path
}

/** The 2 rooms, with their slug + URL — for the admin room-links page. */
export function listRooms(): { country: string; slug: ChatRoomSlug; url: string }[] {
  return (Object.entries(CHAT_ROOMS) as [ChatRoomSlug, string][]).map(([slug, country]) => ({
    country,
    slug,
    url: roomUrl(country),
  }))
}
