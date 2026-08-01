import { describe, expect, it } from 'vitest'
import { getCardDatabaseEntry, databaseEntryToDeckCard, CARD_DATABASE } from './cardDatabase'

describe('cardDatabase', () => {
  it('resolves known entries case-insensitively with surrounding whitespace', () => {
    const entry = getCardDatabaseEntry('  terramorphic expanse ')
    expect(entry?.name).toBe('Terramorphic Expanse')
  })

  it('returns undefined for unknown cards', () => {
    expect(getCardDatabaseEntry('Lightning Bolt')).toBeUndefined()
  })

  it('has consistent entries', () => {
    for (const entry of Object.values(CARD_DATABASE)) {
      expect(entry.name).toBeTruthy()
      expect(entry.typeLine).toBeTruthy()
      expect(entry.imageUri).toBeTruthy()
    }
  })

  it('databaseEntryToDeckCard preserves rules and carries an empty scryfallId', () => {
    const entry = getCardDatabaseEntry('Terramorphic Expanse')
    if (!entry) throw new Error('fixture missing')
    const card = databaseEntryToDeckCard(entry, 3)
    expect(card).toMatchObject({
      scryfallId: '',
      name: 'Terramorphic Expanse',
      typeLine: entry.typeLine,
      oracleText: entry.oracleText,
      entryTapRule: entry.entryTapRule,
      entersTapped: entry.entersTapped,
      imageUri: entry.imageUri,
      quantity: 3,
    })
  })
})
