import type { DeckCard } from '../types/card'
import type { Deck, DeckImportDefinition } from '../types/card'
import { resolveCardRules } from '../data/cardRules'
import { databaseEntryToDeckCard, getCardDatabaseEntry } from '../data/cardDatabase'

interface ScryfallIdentifier {
  name: string
}

interface ScryfallCollectionResponse {
  data: {
    id: string
    name: string
    mana_cost: string
    cmc: number
    type_line: string
    oracle_text?: string
    produced_mana?: string[]
    image_uris?: {
      normal: string
    }
    card_faces?: {
      name: string
      mana_cost: string
      oracle_text: string
      produced_mana?: string[]
      type_line: string
      image_uris: {
        normal: string
      }
    }[]
  }[]
  not_found: { name: string }[]
}

const REQUEST_TIMEOUT_MS = 15_000

export async function fetchDeckCards(
  deck: DeckImportDefinition
): Promise<{ cards: DeckCard[]; notFound: string[] }> {
  const allEntries = [
    ...deck.cards,
    ...deck.commanderNames.map((name) => ({ name, quantity: 1 })),
  ]

  const nameCounts = new Map<string, number>()
  for (const entry of allEntries) {
    nameCounts.set(entry.name, (nameCounts.get(entry.name) ?? 0) + entry.quantity)
  }

  // Collect unique names to query (send each name only once).
  const uniqueNames = [...new Set(allEntries.map((entry) => entry.name))]
  const identifiers: ScryfallIdentifier[] = uniqueNames.map((name) => ({ name }))

  const results: DeckCard[] = []
  const notFound = new Set<string>()

  // Scryfall collection endpoint handles up to 75 at a time
  for (let i = 0; i < identifiers.length; i += 75) {
    const batch = identifiers.slice(i, i + 75)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) {
      throw new Error(`Scryfall batch failed at offset ${i}`)
    }

    const data: ScryfallCollectionResponse = await res.json()

    for (const card of data.data) {
      const databaseEntry = getCardDatabaseEntry(card.name)
      const imageUri = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? databaseEntry?.imageUri ?? ''
      const oracleText = card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? databaseEntry?.oracleText ?? ''
      const rules = resolveCardRules({
        scryfallId: card.id,
        name: card.name,
        manaCost: card.mana_cost,
        manaValue: card.cmc,
        oracleText,
        producedMana: card.produced_mana ?? card.card_faces?.[0]?.produced_mana,
      })
      results.push({
        scryfallId: card.id,
        name: card.name,
        manaCost: rules.manaCost,
        manaValue: rules.manaValue,
        typeLine: card.type_line || databaseEntry?.typeLine || 'Unknown',
        oracleText,
        manaProduction: rules.manaProduction,
        entryTapMode: rules.entryTapMode,
        entersTapped: rules.entersTapped,
        entryTapRule: rules.entryTapRule,
        imageUri,
        quantity: nameCounts.get(card.name) ?? 1,
      })
    }

    for (const card of data.not_found ?? []) {
      const databaseEntry = getCardDatabaseEntry(card.name)
      if (databaseEntry) {
        results.push(databaseEntryToDeckCard(databaseEntry, nameCounts.get(card.name) ?? 1))
      } else {
        notFound.add(card.name)
      }
    }
  }

  return { cards: results, notFound: [...notFound] }
}

export function deckNeedsRuleHydration(deck: Pick<Deck, 'cards'>) {
  return deck.cards.some((card) => card.oracleText === undefined || card.entryTapRule === undefined)
}

export async function hydrateDeckRules(deck: Deck) {
  const definition: DeckImportDefinition = {
    id: deck.id,
    name: deck.name,
    format: deck.format,
    commanderNames: deck.commanderNames,
    cards: deck.cards
      .filter((card) => !deck.commanderNames.includes(card.name))
      .map((card) => ({ name: card.name, quantity: card.quantity })),
    complete: deck.complete,
    source: deck.source,
  }
  const refreshed = await fetchDeckCards(definition)
  const refreshedByName = new Map(refreshed.cards.map((card) => [card.name.toLowerCase(), card]))
  const cards = deck.cards.map((card) => {
    const fresh = refreshedByName.get(card.name.toLowerCase())
    return fresh ? { ...fresh, quantity: card.quantity } : card
  })
  return { cards, notFound: refreshed.notFound }
}
