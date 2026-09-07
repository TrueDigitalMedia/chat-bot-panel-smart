import { z } from 'zod'

const emailSchema = z.string().email()

const PROVIDER_TYPOS: Record<string, string> = {
  gmial: 'gmail',
  gmai: 'gmail',
  gmal: 'gmail',
  gmil: 'gmail',
  gmall: 'gmail',
  gmaill: 'gmail',
  gamil: 'gmail',
  gaimail: 'gmail',
  gemail: 'gmail',
  gnail: 'gmail',
  gmail: 'gmail',
  hotmial: 'hotmail',
  hotmal: 'hotmail',
  hotmai: 'hotmail',
  hotmaill: 'hotmail',
  hotmail: 'hotmail',
  yaho: 'yahoo',
  yahho: 'yahoo',
  yahooo: 'yahoo',
  yahoo: 'yahoo',
  outlok: 'outlook',
  outlookk: 'outlook',
  outlook: 'outlook',
  icloud: 'icloud',
  live: 'live',
  aol: 'aol',
}
const KNOWN_PROVIDERS = new Set(Object.values(PROVIDER_TYPOS))

/**
 * Best-effort repair of a near-miss email address typed in a WhatsApp survey. Handles
 * the real failure shapes seen in production (~120/month): internal spaces
 * ("x@gmail. com", "Juan @gmail.com"), a comma for the dot ("x@gmail,com"), a label
 * prefix ("Correo: x@y.com"), a missing TLD after a known provider ("x@gmail"), a
 * missing "@" before a known provider ("xgmail.com"), and common provider misspellings
 * ("gmial", "hotmial", "gemail"). Returns the normalised address if it passes
 * z.string().email(), otherwise null (caller falls back to AI extraction / re-ask).
 */
export function salvageEmail(raw: string): string | null {
  if (!raw) return null
  const LABEL_WORDS = new Set(['correo', 'electronico', 'email', 'mail', 'e', 'es', 'mi', 'el', 'de', 'este'])
  let s = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s*@\s*/g, '@') // "juan perez @gmail" → "juan perez@gmail"

  // "&" / "arroba" where "@" belongs (phone keyboards, dictation) — only if no real "@"
  if (!s.includes('@')) s = s.replace(/\s*&\s*/, '@').replace(/\s+arroba\s+/, '@')

  const at = s.indexOf('@')
  if (at !== -1) {
    // Local part: everything before "@" back to the last non-label token boundary.
    // "correo electronico es : juanperez" → "juanperez"; "janny rojas" → "jannyrojas".
    const beforeTokens = s
      .slice(0, at)
      .split(/[\s:]+/)
      .filter((tok) => tok && !LABEL_WORDS.has(tok))
    const local = beforeTokens.join('').replace(/[^a-z0-9._%+\-]/g, '')
    const domainMatch = s.slice(at + 1).match(/^[a-z0-9.,\s\-]+/)
    s = `${local}@${(domainMatch ? domainMatch[0] : '').trim()}`
  }

  s = s
    .replace(/\s+/g, '') // "gmail. com" → "gmail.com"
    .replace(/,/g, '.') // "gmail,com" → "gmail.com"
    .replace(/\.+/g, '.') // "gmail..com" → "gmail.com"
    .replace(/^\.+|\.+$/g, '')

  // missing "@" but ends in a known provider domain: "xgmail.com" → "x@gmail.com"
  if (!s.includes('@')) {
    const m = s.match(/^(.+?)(gmail|hotmail|yahoo|outlook|icloud|live|aol)\.(com|net|es)$/)
    if (m) s = `${m[1]}@${m[2]}.${m[3]}`
  }
  if (!s.includes('@')) return null

  let [local, domain = ''] = s.split('@')
  if (!local || !domain) return null

  // fix the provider label + supply a missing TLD
  const domParts = domain.split('.')
  const label = domParts[0]
  if (PROVIDER_TYPOS[label]) domParts[0] = PROVIDER_TYPOS[label]
  if (domParts.length === 1 && KNOWN_PROVIDERS.has(domParts[0])) domParts.push('com')
  domain = domParts.join('.')

  const candidate = `${local}@${domain}`
  return emailSchema.safeParse(candidate).success ? candidate : null
}

/** Shown when a lead says they have no email — a real address is required to
 *  participate, so we explain how to get one instead of looping "no te entendí". */
export const NO_EMAIL_HELP =
  '📧 Necesitamos un correo electrónico para completar tu registro. Si no tienes uno, ' +
  'puedes crear uno gratis en unos minutos en gmail.com o outlook.com — cuando lo tengas, ' +
  'escríbelo aquí.'

/**
 * True when a reply to the email question means "I don't have one" rather than an
 * address. ~46/21d hit this and currently loop with "no te entendí". Deliberately
 * narrow — needs an explicit negation about a correo/email, so a stray "no" to
 * something else isn't swallowed.
 */
export function isNoEmailAnswer(raw: string): boolean {
  const t = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
  if (t.includes('@')) return false
  if (/\b(no|sin)\b.*\b(correo|email|e-?mail|gmail|hotmail)\b/.test(t)) return true
  if (/\bno\s+(tengo|poseo|cuento|dispongo|uso|manejo)\b/.test(t)) return true
  if (/^no\s*(tengo|hay|poseo)\.?$/.test(t)) return true
  return false
}
