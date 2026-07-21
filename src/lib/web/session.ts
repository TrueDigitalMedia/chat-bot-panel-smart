import { cookies } from 'next/headers'
import { randomUUID } from 'crypto'

/**
 * Anonymous per-browser identity for the web chat channel (spec 012 research.md R1).
 * Not a credential — unlike admin_session (src/lib/auth/session.ts) it grants no
 * privileged access, only continuity of one visitor's own conversation, so a plain
 * random UUID is enough (no HMAC signing needed).
 */
export const WEB_SESSION_COOKIE_NAME = 'web_session_id'

/** ~2 years — persists indefinitely per spec 012 clarification, same as Telegram/WhatsApp never expiring on their own. */
export const WEB_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 730

export interface WebSessionResult {
  sessionId: string
  /** True if this call just created a brand-new cookie (no prior session for this browser). */
  isNew: boolean
}

/**
 * Reads the web_session_id cookie, or creates one and sets it on the response.
 * Must be called from a Route Handler or Server Action (mutates the response's cookies).
 */
export async function getOrCreateWebSessionId(): Promise<WebSessionResult> {
  const cookieStore = await cookies()
  const existing = cookieStore.get(WEB_SESSION_COOKIE_NAME)?.value
  if (existing) {
    return { sessionId: existing, isNew: false }
  }

  const sessionId = randomUUID()
  cookieStore.set(WEB_SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: WEB_SESSION_MAX_AGE_SECONDS,
  })
  return { sessionId, isNew: true }
}
