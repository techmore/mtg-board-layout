import type { DeckCard } from '../types/card'
import type { PrebuiltDeck } from '../data/prebuiltDecks'

interface ScryfallIdentifier {
  name: string
}

interface ScryfallCollectionResponse {
  data: {
    id: string
    name: string
    mana_cost: string
    type_line: string
    image_uris?: {
      normal: string
    }
    card_faces?: {
      name: string
      mana_cost: string
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
  deck: PrebuiltDeck
): Promise<{ cards: DeckCard[]; notFound: string[] }> {
  const allNames = [...deck.cards, deck.commander, ...(deck.partners ?? [])]

  // Count quantities per card name
  const nameCounts = new Map<string, number>()
  for (const name of allNames) {
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
  }

  // Collect unique names to query (send each name only once)
  const uniqueNames = [...new Set(allNames)]
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
      const imageUri = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? ''
      results.push({
        scryfallId: card.id,
        name: card.name,
        manaCost: card.mana_cost,
        typeLine: card.type_line,
        imageUri,
        quantity: nameCounts.get(card.name) ?? 1,
      })
    }

    for (const card of data.not_found ?? []) notFound.add(card.name)
  }

  return { cards: results, notFound: [...notFound] }
}
