import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchCards, getCardByName, getCardImageUri } from './scryfall'

const cardJson = {
  id: 'abc-123',
  name: 'Lightning Bolt',
  mana_cost: '{R}',
  cmc: 1,
  type_line: 'Instant',
  oracle_text: 'Deal 3 damage.',
  image_uris: { normal: 'https://cards.scryfall.io/normal/abc.jpg' },
}

function stubJsonResponse(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })))
}

afterEach(() => vi.unstubAllGlobals())

describe('searchCards', () => {
  it('queries the search endpoint with the encoded query', async () => {
    stubJsonResponse(200, { data: [cardJson] })
    const cards = await searchCards('Lightning Bolt')
    expect(cards).toHaveLength(1)
    expect(cards[0].name).toBe('Lightning Bolt')
    const fetchMock = vi.mocked(fetch)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cards/search?q=Lightning%20Bolt')
  })

  it('throws when the search fails', async () => {
    stubJsonResponse(404, {})
    await expect(searchCards('No Such Card')).rejects.toThrow('Card search failed')
  })
})

describe('getCardByName', () => {
  it('resolves an exact-name match', async () => {
    stubJsonResponse(200, cardJson)
    const card = await getCardByName('Lightning Bolt')
    expect(card.id).toBe('abc-123')
  })

  it('throws when the card is not found', async () => {
    stubJsonResponse(404, {})
    await expect(getCardByName('Missing')).rejects.toThrow('Card not found')
  })
})

describe('getCardImageUri', () => {
  it('returns the normal image uri for a single-faced card', async () => {
    stubJsonResponse(200, cardJson)
    await expect(getCardImageUri('abc-123')).resolves.toBe('https://cards.scryfall.io/normal/abc.jpg')
  })

  it('returns the front face image for double-faced cards', async () => {
    stubJsonResponse(200, {
      id: 'dfc-1',
      name: 'Grimoire of the Dead',
      card_faces: [
        { name: 'Grimoire of the Dead', image_uris: { normal: 'https://cards.scryfall.io/front.jpg' } },
        { name: 'Grimoire of the Dead Token', image_uris: { normal: 'https://cards.scryfall.io/back.jpg' } },
      ],
    })
    await expect(getCardImageUri('dfc-1')).resolves.toBe('https://cards.scryfall.io/front.jpg')
  })

  it('returns an empty string when no image is available', async () => {
    stubJsonResponse(200, { id: 'no-img', name: 'Puzzle Box' })
    await expect(getCardImageUri('no-img')).resolves.toBe('')
  })

  it('throws when the card cannot be fetched', async () => {
    stubJsonResponse(500, {})
    await expect(getCardImageUri('abc')).rejects.toThrow('Card not found')
  })
})
