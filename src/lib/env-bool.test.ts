import { describe, it, expect } from 'vitest'
import { boolEnv } from './env-bool'

describe('boolEnv', () => {
  const schema = boolEnv(false)

  it('parses the literal string "false" as false — the exact z.coerce.boolean() footgun this replaces', () => {
    expect(schema.parse('false')).toBe(false)
  })

  it('parses "true" as true', () => {
    expect(schema.parse('true')).toBe(true)
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(schema.parse('FALSE')).toBe(false)
    expect(schema.parse(' False ')).toBe(false)
    expect(schema.parse('TRUE')).toBe(true)
  })

  it('treats "0" and empty string as false', () => {
    expect(schema.parse('0')).toBe(false)
    expect(schema.parse('')).toBe(false)
  })

  it('falls back to the default when undefined (var not set)', () => {
    expect(boolEnv(false).parse(undefined)).toBe(false)
    expect(boolEnv(true).parse(undefined)).toBe(true)
  })

  it('treats any other non-empty string as true', () => {
    expect(schema.parse('1')).toBe(true)
    expect(schema.parse('yes')).toBe(true)
  })
})
