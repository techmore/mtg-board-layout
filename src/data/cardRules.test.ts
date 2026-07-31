import { describe, expect, it } from 'vitest'
import type { BoardCard } from '../types/card'
import { resolveCardRules } from './cardRules'
import { evaluateConditionalEntryTap, getCardTypeFeatures } from './cardFeatures'

type CardFixture = Partial<BoardCard> & { producedMana?: string[] }

function card(overrides: CardFixture = {}): BoardCard & { producedMana?: string[] } {
  return {
    id: 'card-1',
    scryfallId: 'scryfall-1',
    name: 'Test Card',
    imageUri: '',
    typeLine: 'Creature',
    subtypes: [],
    isBasicLand: false,
    zone: 'hand',
    tapped: false,
    counters: 0,
    type: 'creature',
    revealed: false,
    ...overrides,
  }
}

describe('resolveCardRules — entry tap rules', () => {
  it('flags "enters the battlefield tapped" as always-tapped', () => {
    const rules = resolveCardRules(card({ name: 'Test Land', oracleText: 'Test Land enters the battlefield tapped.' }))

    expect(rules.entryTapRule).toBe('always')
    expect(rules.entersTapped).toBe(true)
    expect(rules.entryTapMode).toBe('automatic')
  })

  it('flags an unconditional "enters tapped" clause without oracle text from the database', () => {
    const rules = resolveCardRules(card({ name: 'Savage Lands', typeLine: 'Land', type: 'land', oracleText: undefined }))

    expect(rules.entryTapRule).toBe('always')
    expect(rules.entersTapped).toBe(true)
  })

  it('marks a "unless you control a Plains" clause as conditional', () => {
    const rules = resolveCardRules(card({
      name: 'Test Land',
      typeLine: 'Land',
      type: 'land',
      oracleText: 'This land enters tapped unless you control a Plains.',
    }))

    expect(rules.entryTapRule).toBe('conditional')
    expect(rules.entersTapped).toBe(false)
  })

  it('treats a vanilla creature with no oracle text as never-tapped', () => {
    const rules = resolveCardRules(card({ name: 'Vanilla Golem', oracleText: undefined }))

    expect(rules.entryTapRule).toBe('never')
    expect(rules.entersTapped).toBe(false)
  })

  it('respects an explicit entryTapMode of never over oracle text', () => {
    const rules = resolveCardRules(card({
      name: 'Test Land',
      typeLine: 'Land',
      type: 'land',
      entryTapMode: 'never',
      oracleText: 'Test Land enters the battlefield tapped.',
    }))

    expect(rules.entryTapRule).toBe('never')
    expect(rules.entersTapped).toBe(false)
    expect(rules.entryTapMode).toBe('never')
  })
})

describe('resolveCardRules — mana production', () => {
  it('infers {T}: Add {W}', () => {
    const rules = resolveCardRules(card({ name: 'Plains Test', oracleText: '{T}: Add {W}.' }))

    expect(rules.manaProduction).toEqual({ colors: ['W'], amount: 1 })
  })

  it('infers one mana of any color', () => {
    const rules = resolveCardRules(card({ name: 'Rainbow Test', oracleText: '{T}: Add one mana of any color.' }))

    expect(rules.manaProduction).toEqual({ colors: ['W', 'U', 'B', 'R', 'G'], amount: 1 })
  })

  it('infers multi-color production without double counting', () => {
    const rules = resolveCardRules(card({ name: 'Dual Test', oracleText: '{T}: Add {W} or {U}.' }))

    expect(rules.manaProduction).toEqual({ colors: ['W', 'U'], amount: 1 })
  })

  it('prefers producedMana metadata when present', () => {
    const rules = resolveCardRules(card({
      name: 'Produced Test',
      oracleText: '{T}: Add {W} or {U}.',
      producedMana: ['B', 'G'],
    }))

    expect(rules.manaProduction).toEqual({ colors: ['B', 'G'], amount: 1 })
  })

  it('returns no mana production for a vanilla creature', () => {
    const rules = resolveCardRules(card({ name: 'Vanilla Golem', oracleText: undefined }))

    expect(rules.manaProduction).toBeUndefined()
  })
})

describe('resolveCardRules — cost passthrough', () => {
  it('passes through manaCost and manaValue', () => {
    const rules = resolveCardRules(card({ name: 'Grizzly Bears', manaCost: '{1}{G}', manaValue: 2 }))

    expect(rules.manaCost).toBe('{1}{G}')
    expect(rules.manaValue).toBe(2)
  })

  it('defaults an absent mana cost to an empty string', () => {
    const rules = resolveCardRules(card({ name: 'Vanilla Golem', manaCost: undefined, manaValue: undefined }))

    expect(rules.manaCost).toBe('')
    expect(rules.manaValue).toBeUndefined()
  })
})

describe('getCardTypeFeatures', () => {
  it('splits subtypes from the type line', () => {
    const features = getCardTypeFeatures('Land — Mountain Forest')

    expect(features.typeLine).toBe('Land — Mountain Forest')
    expect(features.subtypes).toEqual(['Mountain', 'Forest'])
    expect(features.isBasicLand).toBe(false)
  })

  it('recognizes basic lands', () => {
    const features = getCardTypeFeatures('Basic Land — Plains')

    expect(features.isBasicLand).toBe(true)
    expect(features.subtypes).toEqual(['Plains'])
  })

  it('falls back to the name for a known basic land', () => {
    const features = getCardTypeFeatures('', 'Island')

    expect(features.typeLine).toBe('Basic Land — Island')
    expect(features.isBasicLand).toBe(true)
    expect(features.subtypes).toEqual(['Island'])
  })

  it('normalizes en-dashes in the type line', () => {
    const features = getCardTypeFeatures('Creature – Human Wizard')

    expect(features.typeLine).toBe('Creature – Human Wizard')
    expect(features.subtypes).toEqual(['Human', 'Wizard'])
  })

  it('returns empty features for unknown cards', () => {
    const features = getCardTypeFeatures('', 'Not a Card')

    expect(features.typeLine).toBe('')
    expect(features.subtypes).toEqual([])
    expect(features.isBasicLand).toBe(false)
  })
})

describe('evaluateConditionalEntryTap', () => {
  const landOnBattlefield = (overrides: Partial<BoardCard> = {}): BoardCard => card({
    id: `land-${Math.random()}`,
    type: 'land',
    typeLine: 'Land',
    zone: 'battlefield',
    ...overrides,
  })

  it('enters tapped when fewer than two basic lands are controlled', () => {
    const source = landOnBattlefield({
      id: 'source',
      name: 'Cinder Glade',
      oracleText: 'This land enters tapped unless you control two or more basic lands.',
    })
    const oneBasic = [landOnBattlefield({ id: 'basic-1', isBasicLand: true, typeLine: 'Basic Land — Plains', subtypes: ['Plains'] })]

    expect(evaluateConditionalEntryTap(source, oneBasic)).toBe(true)
  })

  it('enters untapped when two or more basic lands are controlled', () => {
    const source = landOnBattlefield({
      id: 'source',
      name: 'Cinder Glade',
      oracleText: 'This land enters tapped unless you control two or more basic lands.',
    })
    const twoBasics = [
      landOnBattlefield({ id: 'basic-1', isBasicLand: true, typeLine: 'Basic Land — Plains', subtypes: ['Plains'] }),
      landOnBattlefield({ id: 'basic-2', isBasicLand: true, typeLine: 'Basic Land — Island', subtypes: ['Island'] }),
    ]

    expect(evaluateConditionalEntryTap(source, twoBasics)).toBe(false)
  })

  it('enters untapped when a required land type is controlled', () => {
    const source = landOnBattlefield({
      id: 'source',
      name: 'Woodland Cemetery',
      oracleText: 'This land enters tapped unless you control a Swamp or a Forest.',
    })
    const battlefield = [landOnBattlefield({ id: 'swamp', subtypes: ['Swamp'], typeLine: 'Land — Swamp' })]

    expect(evaluateConditionalEntryTap(source, battlefield)).toBe(false)
  })

  it('enters tapped when no required land type is controlled', () => {
    const source = landOnBattlefield({
      id: 'source',
      name: 'Woodland Cemetery',
      oracleText: 'This land enters tapped unless you control a Swamp or a Forest.',
    })
    const battlefield = [landOnBattlefield({ id: 'plains', subtypes: ['Plains'], typeLine: 'Land — Plains' })]

    expect(evaluateConditionalEntryTap(source, battlefield)).toBe(true)
  })

  it('returns undefined for non-lands', () => {
    const creature = card({
      id: 'source',
      type: 'creature',
      typeLine: 'Creature',
      oracleText: 'This creature enters the battlefield tapped unless you control a Plains.',
    })

    expect(evaluateConditionalEntryTap(creature, [])).toBeUndefined()
  })

  it('returns undefined for unsupported conditional text', () => {
    const source = landOnBattlefield({
      id: 'source',
      name: 'Exotic Land',
      oracleText: 'This land enters tapped unless you control a Gorgon.',
    })

    expect(evaluateConditionalEntryTap(source, [])).toBeUndefined()
  })
})
