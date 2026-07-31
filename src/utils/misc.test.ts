import { afterEach, describe, expect, it, vi } from 'vitest'
import { canPayManaCost, classifyType, isLand, parseManaCost, rollDie, shuffle, spendManaForCost } from './misc'
import type { ManaPool } from '../types/card'

const pool = (overrides: Partial<ManaPool> = {}): ManaPool => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...overrides })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseManaCost', () => {
  it('parses a single colored symbol', () => {
    expect(parseManaCost('{W}')).toEqual({ colored: [{ color: 'W', count: 1 }], generic: 0 })
  })

  it('parses generic mana', () => {
    expect(parseManaCost('{2}')).toEqual({ colored: [], generic: 2 })
  })

  it('parses a mixed cost with multiple colors and generic', () => {
    expect(parseManaCost('{1}{U}{B}')).toEqual({
      colored: [
        { color: 'U', count: 1 },
        { color: 'B', count: 1 },
      ],
      generic: 1,
    })
  })

  it('counts repeated colored symbols', () => {
    expect(parseManaCost('{W}{W}{2}')).toEqual({ colored: [{ color: 'W', count: 2 }], generic: 2 })
  })

  it('returns an empty parse for an empty cost', () => {
    expect(parseManaCost('')).toEqual({ colored: [], generic: 0 })
  })

  it('ignores two-digit and hybrid symbol forms gracefully', () => {
    expect(parseManaCost('{2}{W}{B}')).toEqual({
      colored: [
        { color: 'W', count: 1 },
        { color: 'B', count: 1 },
      ],
      generic: 2,
    })
  })
})

describe('spendManaForCost', () => {
  it('deducts colored mana first', () => {
    const result = spendManaForCost(pool({ W: 2 }), '{W}{W}')
    expect(result).toEqual(pool())
  })

  it('uses the WUBRG order for generic mana', () => {
    const result = spendManaForCost(pool({ W: 1, U: 1, C: 1 }), '{2}')
    expect(result).toEqual({ ...pool(), C: 1 })
  })

  it('spends generic mana greedily across colors', () => {
    const result = spendManaForCost(pool({ U: 1, G: 1 }), '{2}')
    expect(result).toEqual(pool())
  })

  it('clamps at zero when the pool is insufficient', () => {
    const result = spendManaForCost(pool({ W: 1 }), '{2}{B}{B}')
    expect(result).toEqual(pool())
  })

  it('returns the pool unchanged for an empty cost', () => {
    const input = pool({ W: 1 })
    expect(spendManaForCost(input, '')).toEqual(input)
  })
})

describe('canPayManaCost', () => {
  it('returns true when the pool covers colored and generic mana', () => {
    expect(canPayManaCost(pool({ W: 2, U: 1 }), '{1}{W}{U}')).toBe(true)
  })

  it('returns false when a colored requirement is unmet', () => {
    expect(canPayManaCost(pool({ W: 2 }), '{W}{U}')).toBe(false)
  })

  it('returns false when generic mana is unmet', () => {
    expect(canPayManaCost(pool({ W: 1 }), '{3}{W}')).toBe(false)
  })

  it('treats an empty cost as free', () => {
    expect(canPayManaCost(pool(), '')).toBe(true)
  })

  it('does not spend from the pool', () => {
    const input = pool({ W: 2, C: 1 })
    canPayManaCost(input, '{1}{W}')
    expect(input).toEqual(pool({ W: 2, C: 1 }))
  })
})

describe('shuffle', () => {
  it('returns a permutation of the input elements', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const result = shuffle(input)

    expect([...result].sort((a, b) => a - b)).toEqual([...input].sort((a, b) => a - b))
    expect(result).toHaveLength(input.length)
  })

  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5]
    const before = [...input]

    shuffle(input)

    expect(input).toEqual(before)
  })

  it('can produce a different order', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const input = ['a', 'b', 'c', 'd']

    expect(shuffle(input)).not.toEqual(input)
  })

  it('produces a deterministic order when randomness is pinned', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    const input = [1, 2, 3]

    expect(shuffle(input)).toEqual([1, 2, 3])
  })
})

describe('classifyType', () => {
  it.each([
    ['Land', 'land'],
    ['Creature', 'creature'],
    ['Instant', 'instant'],
    ['Sorcery', 'sorcery'],
    ['Enchantment', 'enchantment'],
    ['Artifact', 'artifact'],
    ['Planeswalker', 'planeswalker'],
    ['Battle', 'battle'],
  ])('classifies "%s" as "%s"', (typeLine, expected) => {
    expect(classifyType(typeLine)).toBe(expected)
  })

  it('prioritizes creature over artifact for "Artifact Creature"', () => {
    expect(classifyType('Artifact Creature — Construct')).toBe('creature')
  })

  it('classifies subtype-heavy lines', () => {
    expect(classifyType('Legendary Creature — Human Wizard')).toBe('creature')
    expect(classifyType('Basic Land — Plains')).toBe('land')
  })

  it('falls back to other for unknown types', () => {
    expect(classifyType('Kindred')).toBe('other')
    expect(classifyType('')).toBe('other')
  })
})

describe('isLand', () => {
  it('recognizes land', () => {
    expect(isLand('land')).toBe(true)
  })

  it('rejects other types', () => {
    expect(isLand('creature')).toBe(false)
    expect(isLand('')).toBe(false)
  })
})

describe('rollDie', () => {
  it('rolls 1 when the random value is zero', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(rollDie(6)).toBe(1)
  })

  it('rolls the max face when the random value is just below 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    expect(rollDie(6)).toBe(6)
  })

  it('always stays within 1..sides for pinned values', () => {
    for (const fraction of [0, 0.17, 0.49, 0.5, 0.83, 0.999999]) {
      vi.spyOn(Math, 'random').mockReturnValue(fraction)
      const roll = rollDie(20)
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(20)
    }
  })
})
