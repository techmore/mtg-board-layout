import { describe, expect, it } from 'vitest'
import { canPayManaCost, emptyManaPool, parseManaCost, spendManaForCost } from './mana'

describe('parseManaCost', () => {
  it('parses colored and generic symbols', () => {
    const cost = parseManaCost('{1}{R}{G}')
    expect(cost.generic).toBe(1)
    expect(cost.colored).toEqual([
      { color: 'R', count: 1 },
      { color: 'G', count: 1 },
    ])
  })

  it('treats {X} as at least one generic mana', () => {
    expect(parseManaCost('{X}{B}').generic).toBe(1)
    expect(parseManaCost('{X}{B}').colored).toEqual([{ color: 'B', count: 1 }])
  })

  it('counts hybrid symbols as generic', () => {
    expect(parseManaCost('{2/B}').generic).toBe(2)
    expect(parseManaCost('{W/U}').colored).toEqual([{ color: 'W', count: 1 }])
  })
})

describe('canPayManaCost / spendManaForCost', () => {
  it('pays colored requirements from the matching color', () => {
    const pool = { ...emptyManaPool(), W: 1, R: 2 }
    expect(canPayManaCost(pool, '{W}{1}')).toBe(true)
    expect(canPayManaCost(pool, '{W}{U}')).toBe(false)
    expect(spendManaForCost(pool, '{W}{1}')).toEqual({ ...emptyManaPool(), R: 1 })
  })

  it('spends generic mana across all colors', () => {
    const pool = { ...emptyManaPool(), R: 1, G: 1 }
    expect(canPayManaCost(pool, '{2}')).toBe(true)
    expect(spendManaForCost(pool, '{2}')).toEqual({ ...emptyManaPool() })
  })

  it('is free when there is no cost', () => {
    expect(canPayManaCost(emptyManaPool(), '')).toBe(true)
    expect(spendManaForCost(emptyManaPool(), '')).toEqual(emptyManaPool())
  })
})
