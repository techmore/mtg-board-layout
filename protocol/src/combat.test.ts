import { describe, expect, it } from 'vitest'
import { COMBAT_KEYWORDS, computeStaticPump, parseKeywords, parsePower, parseToughness } from './combat'

describe('parseKeywords', () => {
  it('finds keywords on the first line', () => {
    expect(parseKeywords('Flying, trample\nOther text')).toEqual(new Set(['flying', 'trample']))
    expect(parseKeywords('Lifelink, first strike')).toEqual(new Set(['lifelink', 'first strike']))
  })

  it('finds keywords anywhere in the Oracle text, not just the first line', () => {
    // This is the solo-vs-MP drift: the old server parser only read line one.
    expect(parseKeywords('When ~ enters the battlefield, draw a card.\nFlying')).toEqual(new Set(['flying']))
    expect(parseKeywords('Whenever ~ attacks, ...\nMenace')).toEqual(new Set(['menace']))
  })

  it('distinguishes hexproof from hexproof-from', () => {
    expect(parseKeywords('Hexproof')).toEqual(new Set(['hexproof']))
    expect(parseKeywords('Hexproof from red')).toEqual(new Set(['hexproof from']))
  })

  it('covers the full keyword set the client parser knows', () => {
    // If the shared list is trimmed, the server silently misses keywords the
    // client's rules cache resolves.
    expect(COMBAT_KEYWORDS).toContain('ward')
    expect(COMBAT_KEYWORDS).toContain('persist')
    expect(COMBAT_KEYWORDS).toContain('undying')
    expect(COMBAT_KEYWORDS).toContain('infect')
    expect(COMBAT_KEYWORDS).toContain('wither')
  })

  it('returns an empty set for text without keywords', () => {
    expect(parseKeywords('No keywords here')).toEqual(new Set())
  })
})

describe('parsePower / parseToughness', () => {
  it('parses P/T from type lines', () => {
    expect(parsePower('2/2')).toBe(2)
    expect(parseToughness('2/3')).toBe(3)
    expect(parsePower('Creature — Wolf')).toBe(0)
    expect(parseToughness('Creature — Wolf')).toBe(0)
  })

  it('prefers explicit P/T fields over the type line', () => {
    expect(parsePower({ typeLine: 'Creature 1/1', power: '7' })).toBe(7)
    expect(parseToughness({ typeLine: 'Creature 1/1', toughness: '6' })).toBe(6)
  })
})

describe('computeStaticPump', () => {
  const creature = (id: string, ownerId: string) => ({ id, name: id, typeLine: 'Creature', oracleText: '', ownerId, type: 'creature' })

  it('applies a "creatures you control" anthem only to the owner\'s creatures', () => {
    const anthem = { id: 'glorious', name: 'Glorious Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.', ownerId: 'a', type: 'enchantment' }
    const mine = creature('bear', 'a')
    const theirs = creature('wolf', 'b')
    const battlefield = [anthem, mine, theirs]
    expect(computeStaticPump(battlefield, mine)).toEqual({ power: 1, toughness: 1 })
    expect(computeStaticPump(battlefield, theirs)).toEqual({ power: 0, toughness: 0 })
  })

  it('applies an opponents-control anthem only to the other side', () => {
    const anthem = { id: 'gloom', name: 'Gloom', typeLine: 'Enchantment', oracleText: 'Creatures your opponents control get -1/-1.', ownerId: 'a', type: 'enchantment' }
    const mine = creature('bear', 'a')
    const theirs = creature('wolf', 'b')
    const battlefield = [anthem, mine, theirs]
    expect(computeStaticPump(battlefield, theirs)).toEqual({ power: -1, toughness: -1 })
    expect(computeStaticPump(battlefield, mine)).toEqual({ power: 0, toughness: 0 })
  })

  it('excludes "until end of turn" pumps (not static) and the source card itself', () => {
    const temporary = { id: 'trick', name: 'Trick', typeLine: 'Instant', oracleText: 'Creatures you control get +2/+2 until end of turn.', ownerId: 'a', type: 'instant' }
    const bear = creature('bear', 'a')
    expect(computeStaticPump([temporary, bear], bear)).toEqual({ power: 0, toughness: 0 })
  })

  it('applies attached aura/equipment pumps only to their creature', () => {
    const sword = { id: 'sword', name: 'Sword', typeLine: 'Artifact — Equipment', oracleText: 'Equipped creature gets +2/+2.', ownerId: 'a', type: 'artifact', enchantsCardId: 'bear' }
    const bear = creature('bear', 'a')
    const wolf = creature('wolf', 'b')
    const battlefield = [sword, bear, wolf]
    expect(computeStaticPump(battlefield, bear)).toEqual({ power: 2, toughness: 2 })
    expect(computeStaticPump(battlefield, wolf)).toEqual({ power: 0, toughness: 0 })
  })
})
