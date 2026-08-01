import { describe, expect, it } from 'vitest'
import {
  getCardTypeFeatures,
  controlsLandType,
  controlsBasicLandCount,
  evaluateConditionalEntryTap,
} from './cardFeatures'
import type { BoardCard } from '../types/card'

function land(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: 'land',
    scryfallId: 'sf-land',
    name: 'Forest',
    imageUri: '',
    typeLine: 'Basic Land — Forest',
    subtypes: ['Forest'],
    isBasicLand: true,
    zone: 'battlefield',
    tapped: false,
    counters: 0,
    type: 'land',
    revealed: false,
    ...overrides,
  }
}

describe('getCardTypeFeatures', () => {
  it('parses type and subtypes from a type line', () => {
    const features = getCardTypeFeatures('Legendary Creature — Dragon')
    expect(features).toEqual({
      typeLine: 'Legendary Creature — Dragon',
      subtypes: ['Dragon'],
      isBasicLand: false,
    })
  })

  it('handles multiple subtypes and no subtype', () => {
    expect(getCardTypeFeatures('Creature — Elf Druid').subtypes).toEqual(['Elf', 'Druid'])
    expect(getCardTypeFeatures('Instant').subtypes).toEqual([])
    expect(getCardTypeFeatures('Instant').isBasicLand).toBe(false)
  })

  it('recognizes basic lands', () => {
    const features = getCardTypeFeatures('Basic Land — Island')
    expect(features.isBasicLand).toBe(true)
    expect(features.subtypes).toEqual(['Island'])
  })

  it('infers a basic land type line from a bare name', () => {
    const features = getCardTypeFeatures('', 'Mountain')
    expect(features.typeLine).toBe('Basic Land — Mountain')
    expect(features.isBasicLand).toBe(true)
  })

  it('normalizes en-dashes and minus signs in type lines', () => {
    expect(getCardTypeFeatures('Creature – Dragon').subtypes).toEqual(['Dragon'])
  })
})

describe('controlsLandType / controlsBasicLandCount', () => {
  it('detects when a land type is controlled', () => {
    const battlefield = [land({ subtypes: ['Forest'] }), land({ name: 'Island', typeLine: 'Basic Land — Island', subtypes: ['Island'] })]
    expect(controlsLandType(battlefield, 'Forest')).toBe(true)
    expect(controlsLandType(battlefield, 'Island')).toBe(true)
    expect(controlsLandType(battlefield, 'Swamp')).toBe(false)
  })

  it('ignores non-battlefield and non-land cards', () => {
    const battlefield = [
      land({ zone: 'hand' }),
      land({ type: 'creature', isBasicLand: false, subtypes: [] }),
    ]
    expect(controlsLandType(battlefield, 'Forest')).toBe(false)
  })

  it('counts only basic lands on the battlefield', () => {
    const battlefield = [land(), land({ id: 'l2' }), land({ isBasicLand: false, typeLine: 'Land', subtypes: [] })]
    expect(controlsBasicLandCount(battlefield, 2)).toBe(true)
    expect(controlsBasicLandCount(battlefield, 3)).toBe(false)
  })
})

describe('evaluateConditionalEntryTap', () => {
  it('returns undefined for non-lands', () => {
    expect(evaluateConditionalEntryTap({ name: 'Bolt', type: 'instant', oracleText: 'Deal 3' }, [])).toBeUndefined()
  })

  it('returns undefined when the text has no unless-you-control clause', () => {
    expect(evaluateConditionalEntryTap({ name: 'Cave', type: 'land', oracleText: 'Enters tapped' }, [])).toBeUndefined()
  })

  it('flags entering tapped when two basic lands are not controlled', () => {
    const card = { name: 'X', type: 'land' as const, oracleText: 'Enters tapped unless you control two or more basic lands.' }
    expect(evaluateConditionalEntryTap(card, [land()])).toBe(true)
    expect(evaluateConditionalEntryTap(card, [land(), land({ id: 'l2' })])).toBe(false)
  })

  it('flags entering tapped when a required basic land type is missing', () => {
    const card = { name: 'Y', type: 'land' as const, oracleText: 'Enters tapped unless you control a Plains or an Island.' }
    expect(evaluateConditionalEntryTap(card, [land({ name: 'Forest', typeLine: 'Basic Land — Forest', subtypes: ['Forest'] })])).toBe(true)
    expect(evaluateConditionalEntryTap(card, [land({ name: 'Island', typeLine: 'Basic Land — Island', subtypes: ['Island'] })])).toBe(false)
  })

  it('falls back to the card database for oracle text', () => {
    const card = { name: 'Terramorphic Expanse', type: 'land' as const, oracleText: undefined }
    expect(evaluateConditionalEntryTap(card, [])).toBeUndefined()
  })
})
