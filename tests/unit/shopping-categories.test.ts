import { describe, it, expect } from 'vitest'
import { SHOPPING_CATEGORIES } from '@/lib/conversation/survey-questions'
import { resolveSurveyQuestions } from '@/lib/conversation/survey-plan'

// env.ts validates required vars eagerly at import time, and db/client.ts calls
// neon(process.env.POSTGRES_URL!) at module load — extract-survey-fields.ts pulls in
// both transitively (via logCall). Mock so this pure content test doesn't need real
// credentials, same pattern as tests/unit/ficha-hogar-validation.test.ts.
import { vi } from 'vitest'
vi.mock('@/lib/env', () => ({
  env: { FORCE_EXTRACTION_ERROR: undefined },
}))
vi.mock('@/lib/db/client', () => ({ db: {} }))

import { FIELD_HINTS } from '@/lib/ai/extract-survey-fields'

describe('SHOPPING_CATEGORIES — canonical Q14 category list', () => {
  it('has exactly 8 entries, ids 1-8 in order, with the expected labels', () => {
    expect(SHOPPING_CATEGORIES).toEqual([
      { id: 1, label: 'Canasta básica' },
      { id: 2, label: 'Lácteos' },
      { id: 3, label: 'Bebidas' },
      { id: 4, label: 'Snacks/Botanas' },
      { id: 5, label: 'Cuidado personal' },
      { id: 6, label: 'Prod. de limpieza' },
      { id: 7, label: 'Cuidado del bebé' },
      { id: 8, label: 'Mascotas' },
    ])
  })
})

describe('Q14 question text — derived from SHOPPING_CATEGORIES', () => {
  it('still contains the full numbered list shown to the user', () => {
    const q14 = resolveSurveyQuestions('Guatemala').find((q) => q.fieldName === 'shoppingCategories')
    expect(q14).toBeDefined()
    for (const { id, label } of SHOPPING_CATEGORIES) {
      expect(q14!.text).toContain(`${id}. ${label}`)
    }
  })
})

describe('FIELD_HINTS.shoppingCategories — regression guard for the extraction bug', () => {
  it('is defined', () => {
    expect(FIELD_HINTS.shoppingCategories).toBeDefined()
  })

  it('mentions every category label and its id from the canonical list', () => {
    const hint = FIELD_HINTS.shoppingCategories!
    for (const { id, label } of SHOPPING_CATEGORIES) {
      expect(hint).toContain(label)
      expect(hint).toContain(`${id}=${label}`)
    }
  })
})
