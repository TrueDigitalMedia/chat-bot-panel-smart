// Allowlist of domains that bot responses may link to
const ALLOWED_DOMAINS = [
  'facebook.com/PanelSmartLatino',
  'instagram.com/panelsmart_latino',
  'kantar.com',
  'apps.apple.com',
  'play.google.com',
]

const URL_PATTERN = /https?:\/\/[^\s]+/gi

export function validateBotResponse(text: string): boolean {
  if (!text || text.trim().length === 0) return false

  // Find any URLs in the response
  const urls = text.match(URL_PATTERN) ?? []
  for (const url of urls) {
    const isAllowed = ALLOWED_DOMAINS.some((domain) => url.includes(domain))
    if (!isAllowed) {
      console.warn(`[validate-output] Blocked response containing disallowed URL: ${url}`)
      return false
    }
  }

  return true
}

export const SAFE_FALLBACK = 'Tuve un problema al procesar tu respuesta. ¿Puedes repetirlo?'
