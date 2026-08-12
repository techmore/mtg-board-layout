import type { CardData } from 'mtg-protocol'
import type { Deck } from '../types/card'
import { classifyType } from '../utils/misc'
import { getCardTypeFeatures } from '../data/cardFeatures'

/** Converts the local deck model to the intentionally small multiplayer wire model. */
export function deckToRoomCards(deck: Deck): CardData[] {
  const commanderNames = new Set(deck.commanderNames.map((name) => name.toLowerCase()))
  const cards: CardData[] = []

  for (const [index, commanderName] of deck.commanderNames.entries()) {
    const source = deck.cards.find((card) => card.name.toLowerCase() === commanderName.toLowerCase())
    if (!source) continue
    cards.push({
      id: `commander-${source.scryfallId}-${index}`,
      scryfallId: source.scryfallId,
      name: source.name,
      imageUri: source.imageUri,
      oracleText: source.oracleText ?? '',
      zone: 'command',
      tapped: false,
      counters: 0,
      power: source.power,
      toughness: source.toughness,
      type: classifyType(source.typeLine),
      ...getCardTypeFeatures(source.typeLine, source.name),
      commanderTax: 0,
      revealed: true,
    })
  }

  for (const card of deck.cards) {
    if (commanderNames.has(card.name.toLowerCase())) continue
    for (let copy = 0; copy < card.quantity; copy++) {
      cards.push({
        id: `${card.scryfallId}-${cards.length}`,
        scryfallId: card.scryfallId,
        name: card.name,
        imageUri: card.imageUri,
        oracleText: card.oracleText ?? '',
        zone: 'library',
        tapped: false,
        counters: 0,
        power: card.power,
        toughness: card.toughness,
        type: classifyType(card.typeLine),
        ...getCardTypeFeatures(card.typeLine, card.name),
        commanderTax: 0,
        revealed: false,
      })
    }
  }

  return cards
}
