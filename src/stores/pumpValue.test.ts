import { describe, expect, it } from 'vitest'
import { pumpValue } from './triggerActions'

describe('pumpValue', () => {
  it('passes finite numbers through', () => {
    expect(pumpValue(3)).toBe(3)
    expect(pumpValue(-2)).toBe(-2)
  })

  it('resolves symbolic X with the given value', () => {
    expect(pumpValue('X', 4)).toBe(4)
    expect(pumpValue('x', 4)).toBe(4)
    expect(pumpValue('-X', 4)).toBe(-4)
    expect(pumpValue('+X', 4)).toBe(4)
  })

  it('treats an unresolved X as 0, never a string that concatenates', () => {
    expect(pumpValue('X')).toBe(0)
    expect(Object.is(pumpValue('-X'), -0) || pumpValue('-X') === 0).toBe(true)
    expect(0 + pumpValue('-X')).toBe(0)
  })

  it('parses numeric strings and rejects junk', () => {
    expect(pumpValue('+2')).toBe(2)
    expect(pumpValue('-3')).toBe(-3)
    expect(pumpValue(undefined)).toBe(0)
    expect(pumpValue(NaN)).toBe(0)
    expect(pumpValue('banana')).toBe(0)
  })
})
