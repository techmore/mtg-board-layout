import { describe, expect, it } from 'vitest'
import { evaluateConditionalEntryTap, type EntryTapCard, type EntryTapBattlefieldCard } from './entryTap'

function land(name: string, overrides: Partial<EntryTapCard> = {}): EntryTapCard {
  return { type: 'land', oracleText: '', ...overrides, name }
}

function battlefieldCard(overrides: Partial<EntryTapBattlefieldCard> = {}): EntryTapBattlefieldCard {
  return { type: 'land', isBasicLand: true, subtypes: ['Forest'], ...overrides }
}

describe('evaluateConditionalEntryTap', () => {
  it('returns undefined for non-lands', () => {
    expect(evaluateConditionalEntryTap({ type: 'instant', oracleText: 'Deal 3' }, [])).toBeUndefined()
  })

  it('returns undefined for lands without a conditional clause', () => {
    expect(evaluateConditionalEntryTap(land('Forest', { oracleText: 'Enters tapped.' }), [])).toBeUndefined()
  })

  it('enters tapped when fewer than two basic lands are controlled', () => {
    const card = land('Cinder Glade', { oracleText: 'Cinder Glade enters tapped unless you control two or more basic lands.' })
    const one = [battlefieldCard({ isBasicLand: true })]
    const two = [battlefieldCard({ isBasicLand: true }), battlefieldCard({ isBasicLand: true })]
    expect(evaluateConditionalEntryTap(card, one)).toBe(true)
    expect(evaluateConditionalEntryTap(card, two)).toBe(false)
  })

  it('counts only basic lands on the battlefield', () => {
    const card = land('Smoldering Marsh', { oracleText: 'Enters tapped unless you control two or more basic lands.' })
    const battlefield = [
      battlefieldCard({ isBasicLand: true }),
      battlefieldCard({ isBasicLand: false, subtypes: ['Mountain', 'Swamp'] }),
    ]
    expect(evaluateConditionalEntryTap(card, battlefield)).toBe(true)
  })

  it('enters tapped unless a named basic land type is controlled', () => {
    const card = land('Dragonskull Summit', { oracleText: 'Dragonskull Summit enters tapped unless you control a Swamp or a Mountain.' })
    const withSwamp = [battlefieldCard({ subtypes: ['Swamp'] })]
    const without = [battlefieldCard({ subtypes: ['Forest'] })]
    expect(evaluateConditionalEntryTap(card, withSwamp)).toBe(false)
    expect(evaluateConditionalEntryTap(card, without)).toBe(true)
  })

  it('ignores non-land battlefield cards', () => {
    const card = land('Dragonskull Summit', { oracleText: 'Enters tapped unless you control a Swamp.' })
    const battlefield = [battlefieldCard({ type: 'creature', subtypes: [] })]
    expect(evaluateConditionalEntryTap(card, battlefield)).toBe(true)
  })
})
