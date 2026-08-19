import { describe, expect, it } from 'vitest'
import type { Deck } from '../types/card'
import { deckToRoomCards } from './roomCards'

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1',
    name: 'Test Deck',
    format: 'commander',
    commanderNames: ['Atarka, World Render'],
    complete: true,
    createdAt: 0,
    updatedAt: 0,
    cards: [
      { scryfallId: 'atarka-id', name: 'Atarka, World Render', manaCost: '{5}{R}{G}', typeLine: 'Legendary Creature — Dragon', power: '6', toughness: '4', oracleText: 'Flying', imageUri: 'https://x/atarka.jpg', quantity: 1 },
      { scryfallId: 'mount-id', name: 'Mountain', manaCost: '', typeLine: 'Basic Land — Mountain', oracleText: '', imageUri: 'https://x/mountain.jpg', quantity: 2 },
    ],
    ...overrides,
  }
}

describe('deckToRoomCards', () => {
  it('places the commander in the command zone with isCommander true', () => {
    const cards = deckToRoomCards(makeDeck())
    const commander = cards.find((card) => card.zone === 'command')
    expect(commander).toBeDefined()
    expect(commander?.name).toBe('Atarka, World Render')
    expect(commander?.isCommander).toBe(true)
    expect(commander?.revealed).toBe(true)
    expect(commander?.commanderTax).toBe(0)
  })

  it('copies non-commanders per quantity into the library', () => {
    const cards = deckToRoomCards(makeDeck())
    const mountains = cards.filter((card) => card.name === 'Mountain')
    expect(mountains).toHaveLength(2)
    expect(mountains.every((card) => card.zone === 'library')).toBe(true)
    expect(mountains.every((card) => card.revealed === false)).toBe(true)
  })

  it('re-keys every card id uniquely and deterministically', () => {
    const cards = deckToRoomCards(makeDeck())
    const ids = cards.map((card) => card.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Commander id carries its scryfall id and a per-commander index.
    expect(cards.find((card) => card.isCommander)?.id).toBe('commander-atarka-id-0')
  })

  it('carries power/toughness onto the wire model', () => {
    const cards = deckToRoomCards(makeDeck())
    const commander = cards.find((card) => card.zone === 'command')!
    expect(commander.power).toBe('6')
    expect(commander.toughness).toBe('4')
  })
})
