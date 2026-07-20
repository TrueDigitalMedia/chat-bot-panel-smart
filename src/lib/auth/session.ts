// Stateless, HMAC-signed admin session cookie — no session table (research.md R1).
// Uses Web Crypto (`crypto.subtle`) instead of `node:crypto` so the same code runs
// unmodified in both `middleware.ts` (Edge runtime) and Server Actions (Node runtime).

export const SESSION_COOKIE_NAME = 'admin_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 hours

const HMAC_ALGO = { name: 'HMAC', hash: 'SHA-256' } as const
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBuffer(b64url: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(b64url)) return null
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), '=')
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    return null
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), HMAC_ALGO, false, ['sign', 'verify'])
}

/** Creates a signed cookie value: `<expiresAtMs>.<base64url signature>`. */
export async function createSessionCookie(secret: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS
  const key = await importKey(secret)
  const signature = await crypto.subtle.sign(HMAC_ALGO, key, new TextEncoder().encode(String(expiresAt)))
  return `${expiresAt}.${bufferToBase64Url(signature)}`
}

/** Verifies a cookie value: well-formed, unexpired, and signed with `secret`. */
export async function verifySessionCookie(secret: string, cookieValue: string | undefined | null): Promise<boolean> {
  if (!cookieValue) return false
  const separatorIndex = cookieValue.indexOf('.')
  if (separatorIndex === -1) return false
  const expiresAtRaw = cookieValue.slice(0, separatorIndex)
  const signatureB64 = cookieValue.slice(separatorIndex + 1)
  if (!expiresAtRaw || !signatureB64) return false

  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false

  const signature = base64UrlToBuffer(signatureB64)
  if (!signature) return false

  const key = await importKey(secret)
  return crypto.subtle.verify(HMAC_ALGO, key, signature as BufferSource, new TextEncoder().encode(expiresAtRaw))
}
