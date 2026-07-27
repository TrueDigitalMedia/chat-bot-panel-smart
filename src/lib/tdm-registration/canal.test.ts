import { describe, it, expect } from 'vitest'
import { canalFor } from './canal'

describe('canalFor', () => {
  it('maps whatsapp to the exact casing confirmed by TDM\'s example payload', () => {
    expect(canalFor('whatsapp')).toBe('WhatsApp')
  })

  it('maps telegram and web to Title Case, consistent with the whatsapp convention', () => {
    expect(canalFor('telegram')).toBe('Telegram')
    expect(canalFor('web')).toBe('Web')
  })
})
