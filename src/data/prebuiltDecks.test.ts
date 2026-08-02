import { describe, expect, it } from 'vitest'
import { prebuiltDecks, DRACONIC_DESTRUCTION_DECK } from './prebuiltDecks'

describe('prebuilt decks catalog', () => {
  it('has 16 complete decks with unique ids', () => {
    expect(prebuiltDecks).toHaveLength(16)
    const ids = prebuiltDecks.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(prebuiltDecks.every((d) => d.complete)).toBe(true)
  })

  it('gives every deck a commander and consistent metadata', () => {
    for (const deck of prebuiltDecks) {
      expect(deck.commander, deck.name).toBeTruthy()
      expect(deck.name).toBeTruthy()
      expect(deck.format).toBe('commander')
      expect(deck.cards.length).toBeGreaterThan(0)
      expect(deck.partners ?? []).toBeInstanceOf(Array)
    }
  })

  it('keeps deck names distinct per id', () => {
    const names = prebuiltDecks.map((d) => d.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('Draconic Destruction deck (fixed AI deck)', () => {
  it('has a valid commander and a 100-card list', () => {
    expect(DRACONIC_DESTRUCTION_DECK.commanderNames).toEqual(['Atarka, World Render'])
    const total = DRACONIC_DESTRUCTION_DECK.cards.reduce((sum, card) => sum + card.quantity, 0)
    expect(total).toBe(100)
  })

  it('has well-formed cards with scryfall ids and mana info', () => {
    for (const card of DRACONIC_DESTRUCTION_DECK.cards) {
      expect(card.name).toBeTruthy()
      expect(card.scryfallId).toBeTruthy()
      expect(card.imageUri).toBeTruthy()
      expect(card.quantity).toBeGreaterThan(0)
      expect(card.typeLine).toBeTruthy()
      expect(typeof card.manaCost).toBe('string')
      expect(typeof card.manaValue).toBe('number')
    }
  })

  it('is a distinct fixed AI deck, not part of the user-selectable catalog', () => {
    expect(prebuiltDecks.some((d) => d.name === DRACONIC_DESTRUCTION_DECK.name)).toBe(false)
  })
})
