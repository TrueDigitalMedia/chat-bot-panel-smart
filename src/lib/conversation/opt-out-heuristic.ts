// Word stems that only ever show up in Spanish when someone is talking about being
// contacted/messaged/stopped — none of these are risky substrings of unrelated common
// words (unlike e.g. "para" or "no"), so a plain includes() check is safe here.
const OPT_OUT_SIGNAL_STEMS = [
  'molest',
  'escrib',
  'contact',
  'mensaj',
  'llam',
  'cancel',
  'elimin',
  'denunci',
  'fastidi',
  'acos',
  'spam',
  'stop',
  'unsubscri',
  'detente',
  'detener',
]

// Whole-word-only signals — these ARE risky as substrings (e.g. "basta" inside
// "bastante"), so they're checked against tokenized words, not the raw string.
const OPT_OUT_SIGNAL_WORDS = new Set(['basta', 'baja'])

/**
 * Fast, non-AI check: does the message even plausibly relate to stopping contact? Only
 * messages that pass this are worth spending an AI call on (detectOptOutIntent in
 * ./detect-opt-out) — keeps the LLM off the hot path for the vast majority of turns,
 * which are ordinary survey/FAQ free text with nothing to do with opting out. This is
 * deliberately broader than flow-router.ts's isOptOutRequest (which only matches a
 * handful of exact phrasings for free, no AI needed) — it exists to catch the atypical
 * phrasing/typos that regex alone would miss, at the cost of some false-positive AI
 * calls (e.g. a message that happens to contain "contacto" as part of an email address),
 * which the AI step itself resolves correctly at negligible cost. Kept dependency-free
 * (no DB/AI imports) so flow-router.ts can import it statically without pulling in
 * database client code at module-load time.
 */
export function mightBeOptOutIntent(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t || t.length > 300) return false
  if (OPT_OUT_SIGNAL_STEMS.some((stem) => t.includes(stem))) return true
  return t.split(/\s+/).some((w) => OPT_OUT_SIGNAL_WORDS.has(w.replace(/[.,!?¡¿]/g, '')))
}
