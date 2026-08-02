import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDeckCards } from './deckImport'

const stubFetch = () => {
  const searchCalls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = String(url)
    if (urlStr.includes('cards/collection')) {
      const body = JSON.parse(String(init?.body))
      const notFound = body.identifiers.filter(({ name }: { name: string }) => name.startsWith('Spiked'))
      const data = body.identifiers
        .filter(({ name }: { name: string }) => !notFound.some((n: { name: string }) => n.name === name))
        .map(({ name }: { name: string }) => ({
          id: `id-${name}`,
          name,
          mana_cost: '',
          cmc: 0,
          type_line: 'Artifact',
          oracle_text: '',
          image_uris: { normal: '' },
        }))
      return new Response(JSON.stringify({ data, not_found: notFound }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (urlStr.includes('cards/search')) {
      searchCalls.push(urlStr)
      const card = {
        id: 'dfc-id',
        name: 'Spiked Corridor // Torture Pit',
        mana_cost: '',
        cmc: 0,
        type_line: 'Land — Spiked Corridor // Torture Pit',
        oracle_text: '',
        image_uris: { normal: '' },
      }
      return new Response(JSON.stringify({ data: [card], total_cards: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({}), { status: 404 })
  }))
  return searchCalls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchDeckCards DFC fallback', () => {
  it('resolves collection-endpoint misses via the search endpoint', async () => {
    const searchCalls = stubFetch()

    const { cards, notFound } = await fetchDeckCards({
      id: 'test',
      name: 'Test',
      format: 'commander',
      commanderNames: [],
      cards: [
        { name: 'Spiked Corridor', quantity: 1 },
        { name: 'Sol Ring', quantity: 1 },
      ],
      complete: false,
      source: undefined,
    })

    expect(notFound).toEqual([])
    expect(searchCalls).toHaveLength(1)
    expect(searchCalls[0]).toContain(encodeURIComponent('name:"Spiked Corridor"'))
    const dfc = cards.find((c) => c.name.includes('//'))
    expect(dfc).toBeDefined()
    expect(dfc?.scryfallId).toBe('dfc-id')
    expect(cards).toHaveLength(2)
  })
})
