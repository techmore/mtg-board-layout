import { describe, expect, it } from 'vitest'
import {
  MAX_DECK_SIZE,
  OPENING_HAND_SIZE,
  sanitizeText,
  stringField,
  numberField,
  booleanField,
  validMode,
  validZone,
  isCardData,
  normalizeCards,
  isLandCard,
  entersTappedOnBattlefield,
  generateRoomIdSingle,
  shuffleArray,
} from './roomUtils'
import type { CardData } from 'mtg-protocol'

function cardData(overrides: Partial<CardData> = {}): CardData {
  return {
    id: 'c1',
    scryfallId: 'sf-1',
    name: 'Forest',
    imageUri: '/cards/x.jpg',
    oracleText: '',
    zone: 'hand',
    tapped: false,
    counters: 0,
    type: 'land',
    typeLine: 'Basic Land — Forest',
    subtypes: ['Forest'],
    isBasicLand: true,
    commanderTax: 0,
    revealed: false,
    ...overrides,
  }
}

describe('message field guards', () => {
  it('stringField only accepts strings', () => {
    expect(stringField({ name: 'x' }, 'name')).toBe('x')
    expect(stringField({ name: 5 }, 'name')).toBeUndefined()
    expect(stringField(null, 'name')).toBeUndefined()
    expect(stringField({}, 'missing')).toBeUndefined()
  })

  it('numberField rejects non-finite numbers', () => {
    expect(numberField({ n: 3 }, 'n')).toBe(3)
    expect(numberField({ n: Infinity }, 'n')).toBeUndefined()
    expect(numberField({ n: '3' }, 'n')).toBeUndefined()
  })

  it('booleanField only accepts booleans', () => {
    expect(booleanField({ b: true }, 'b')).toBe(true)
    expect(booleanField({ b: 1 }, 'b')).toBeUndefined()
  })
})

describe('validMode / validZone', () => {
  it('accepts the known game modes only', () => {
    expect(validMode('1v1')).toBe(true)
    expect(validMode('2v2')).toBe(true)
    expect(validMode('4ffa')).toBe(true)
    expect(validMode('solo')).toBe(false)
  })

  it('accepts the known zones only', () => {
    expect(validZone('hand')).toBe(true)
    expect(validZone('command')).toBe(true)
    expect(validZone('sideboard')).toBe(false)
  })
})

describe('sanitizeText', () => {
  it('trims, clamps, and falls back', () => {
    expect(sanitizeText('  hello  ', 'fb', 10)).toBe('hello')
    expect(sanitizeText('x'.repeat(30), 'fb', 10)).toBe('x'.repeat(10))
    expect(sanitizeText('', 'fb', 10)).toBe('fb')
    expect(sanitizeText(5, 'fb', 10)).toBe('fb')
  })
})

describe('isCardData / normalizeCards', () => {
  it('accepts valid cards', () => {
    expect(isCardData(cardData())).toBe(true)
  })

  it('rejects malformed cards', () => {
    expect(isCardData({ ...cardData(), zone: 'sideboard' })).toBe(false)
    expect(isCardData({ ...cardData(), counters: -1 })).toBe(false)
    expect(isCardData({ ...cardData(), counters: 1.5 })).toBe(false)
    expect(isCardData({ ...cardData(), name: 'x'.repeat(300) })).toBe(false)
    expect(isCardData(null)).toBe(false)
  })

  it('normalizeCards filters invalid entries and caps at MAX_DECK_SIZE', () => {
    const valid = cardData()
    const invalid = { ...cardData(), id: 5 }
    const result = normalizeCards([valid, invalid, valid])
    expect(result).toHaveLength(2)
    const many = normalizeCards(Array.from({ length: MAX_DECK_SIZE + 10 }, () => cardData({ id: `c${Math.random()}` })))
    expect(many.length).toBeLessThanOrEqual(MAX_DECK_SIZE)
  })
})

describe('isLandCard', () => {
  it('detects lands by type or type line', () => {
    expect(isLandCard({ type: 'land', typeLine: '' })).toBe(true)
    expect(isLandCard({ type: 'creature', typeLine: 'Land — Forest' })).toBe(true)
    expect(isLandCard({ type: 'creature', typeLine: 'Creature' })).toBe(false)
  })
})

describe('entersTappedOnBattlefield (server parity with client evaluator)', () => {
  const land = (overrides: Record<string, unknown> = {}) => ({
    zone: 'battlefield', type: 'land', subtypes: ['Forest'], isBasicLand: true, ...overrides,
  })

  it('returns false for non-lands', () => {
    expect(entersTappedOnBattlefield({ type: 'instant', oracleText: 'Enters tapped' } as never, [])).toBe(false)
  })

  it('flags entering tapped when two basic lands are not controlled', () => {
    const card = { zone: 'battlefield', type: 'land', subtypes: [], isBasicLand: false, oracleText: 'Enters tapped unless you control two or more basic lands.' }
    expect(entersTappedOnBattlefield(card, [land()])).toBe(true)
    expect(entersTappedOnBattlefield(card, [land(), land({ id: 'l2' })])).toBe(false)
  })

  it('flags entering tapped when a required basic land type is missing', () => {
    const card = { zone: 'battlefield', type: 'land', subtypes: [], isBasicLand: false, oracleText: 'Enters tapped unless you control a Plains or an Island.' }
    expect(entersTappedOnBattlefield(card, [land({ subtypes: ['Forest'] })])).toBe(true)
    expect(entersTappedOnBattlefield(card, [land({ subtypes: ['Island'] })])).toBe(false)
  })

  it('falls back to plain enters-tapped text', () => {
    const card = { zone: 'battlefield', type: 'land', subtypes: [], isBasicLand: false, oracleText: 'This land enters the battlefield tapped.' }
    expect(entersTappedOnBattlefield(card, [])).toBe(true)
    expect(entersTappedOnBattlefield({ ...card, oracleText: 'Add {G}.' }, [])).toBe(false)
  })
})

describe('generateRoomIdSingle / shuffleArray', () => {
  it('generates a 5-letter room id (entropy against code guessing)', () => {
    for (let i = 0; i < 20; i++) {
      const id = generateRoomIdSingle()
      expect(id).toMatch(/^[A-Z]{5}$/)
    }
  })

  it('shuffles without mutating the input and preserves elements', () => {
    const input = [1, 2, 3, 4, 5]
    const result = shuffleArray(input)
    expect(result).toHaveLength(input.length)
    expect([...result].sort()).toEqual([...input].sort())
    expect(input).toEqual([1, 2, 3, 4, 5])
  })
})

describe('constants', () => {
  it('exports the documented limits', () => {
    expect(OPENING_HAND_SIZE).toBe(7)
    expect(MAX_DECK_SIZE).toBe(250)
  })
})
