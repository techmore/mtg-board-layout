import { describe, expect, it, vi } from 'vitest'
import { parseDeckList, prebuiltToDeckDefinition, fetchDeckList } from './deckList'
import type { PrebuiltDeck } from '../data/prebuiltDecks'

describe('parseDeckList — plain text formats', () => {
  it('parses `4 Lightning Bolt` quantities', () => {
    const deck = parseDeckList('4 Lightning Bolt\n1 Sol Ring\n60 Island')
    expect(deck.cards).toEqual([
      { name: 'Lightning Bolt', quantity: 4 },
      { name: 'Sol Ring', quantity: 1 },
      { name: 'Island', quantity: 60 },
    ])
    expect(deck.complete).toBe(false)
    expect(deck.format).toBe('commander')
  })

  it('parses `4x` notation and merges duplicate names', () => {
    const deck = parseDeckList('4x Mountain\n2 Mountain\n3x Goblin Piker')
    expect(deck.cards).toEqual([
      { name: 'Mountain', quantity: 6 },
      { name: 'Goblin Piker', quantity: 3 },
    ])
  })

  it('parses bracket quantities and merges case-insensitively', () => {
    const deck = parseDeckList('Lightning Bolt [4]\n4 lightning bolt')
    expect(deck.cards).toEqual([{ name: 'Lightning Bolt', quantity: 8 }])
  })

  it('parses commander entries with the *CMDR* marker', () => {
    const deck = parseDeckList('Atarka, World Render *CMDR*\n1 Dragon Fodder')
    expect(deck.commanderNames).toEqual(['Atarka, World Render'])
    expect(deck.complete).toBe(true)
    expect(deck.cards).toEqual([{ name: 'Dragon Fodder', quantity: 1 }])
  })

  it('handles a Commander: section header with a following Deck section', () => {
    const deck = parseDeckList('Commander\nSamut, Voice of Dissent\n\nDeck\n99 Plains')
    expect(deck.commanderNames).toEqual(['Samut, Voice of Dissent'])
    expect(deck.cards).toEqual([{ name: 'Plains', quantity: 99 }])
  })

  it('returns to the main section after a blank line following commander entries', () => {
    const deck = parseDeckList('Commander\nAtarka, World Render\n\n4 Lightning Bolt\n20 Mountain')
    expect(deck.commanderNames).toEqual(['Atarka, World Render'])
    expect(deck.cards).toEqual([
      { name: 'Lightning Bolt', quantity: 4 },
      { name: 'Mountain', quantity: 20 },
    ])
  })

  it('returns to the main section after a blank line following sideboard entries', () => {
    const deck = parseDeckList('Sideboard\n3 Stifle\n\n1 Forest')
    expect(deck.cards).toEqual([{ name: 'Forest', quantity: 1 }])
  })

  it('keeps consecutive partners as commanders without blank lines between them', () => {
    const deck = parseDeckList('Commander\nHaldan, Avid Arcanist\nPako, Arcane Retriever\n\n40 Island')
    expect(deck.commanderNames).toEqual(['Haldan, Avid Arcanist', 'Pako, Arcane Retriever'])
    expect(deck.cards).toEqual([{ name: 'Island', quantity: 40 }])
  })

  it('drops sideboard cards and keeps duplicates of partners', () => {
    const deck = parseDeckList('Sideboard\n15 Stifle\n\nCommander\nHaldan, Avid Arcanist\nPako, Arcane Retriever\n\nDeck\n40 Island')
    expect(deck.commanderNames).toEqual(['Haldan, Avid Arcanist', 'Pako, Arcane Retriever'])
    expect(deck.cards).toEqual([{ name: 'Island', quantity: 40 }])
  })

  it('skips comments, decoration headers, and metadata lines', () => {
    const deck = parseDeckList('# My Deck\n// comment\n-- Main --\n1 Forest\nname: Test\n— something')
    expect(deck.cards).toEqual([{ name: 'Forest', quantity: 1 }])
  })

  it('strips set-code suffixes like [BLB] 4R from card names', () => {
    const deck = parseDeckList('4 Lightning Bolt [BLB] 4R\n1 Sol Ring (MUL) 8U')
    expect(deck.cards).toEqual([
      { name: 'Lightning Bolt', quantity: 4 },
      { name: 'Sol Ring', quantity: 1 },
    ])
  })

  it('throws when the list contains no cards', () => {
    expect(() => parseDeckList('Sideboard\n3 Forest')).toThrow('No cards were found')
    expect(() => parseDeckList('')).toThrow('No cards were found')
  })

  it('uses the provided deck name and format', () => {
    const deck = parseDeckList('1 Island', { name: 'My Deck', format: 'standard' })
    expect(deck.name).toBe('My Deck')
    expect(deck.format).toBe('standard')
  })
})

describe('prebuiltToDeckDefinition', () => {
  const prebuilt: PrebuiltDeck = {
    id: 'test-deck',
    name: 'Test Deck',
    format: 'commander',
    commander: 'Cairo, the Eternal',
    partners: ['Mass of Mysteries'],
    complete: true,
    cards: ['Plains', 'Plains', 'Island'],
    officialRelease: { publisher: 'WotC', product: 'Test Product', releaseDate: '2025-01-01', url: 'https://example.com' },
  }

  it('aggregates duplicate card names and lists commanders', () => {
    const def = prebuiltToDeckDefinition(prebuilt)
    expect(def.cards).toEqual([{ name: 'Plains', quantity: 2 }, { name: 'Island', quantity: 1 }])
    expect(def.commanderNames).toEqual(['Cairo, the Eternal', 'Mass of Mysteries'])
    expect(def.complete).toBe(true)
  })

  it('carries the official release metadata as a builtin source', () => {
    const def = prebuiltToDeckDefinition(prebuilt)
    expect(def.source).toEqual({ type: 'builtin', url: 'https://example.com', publisher: 'WotC', product: 'Test Product', releaseDate: '2025-01-01' })
  })

  it('marks decks without an official release as plain builtin', () => {
    const def = prebuiltToDeckDefinition({ ...prebuilt, officialRelease: undefined })
    expect(def.source).toEqual({ type: 'builtin' })
  })
})

describe('fetchDeckList', () => {
  it('rejects malformed URLs', async () => {
    await expect(fetchDeckList('not a url')).rejects.toThrow('valid deck-list URL')
  })

  it('rejects non-http protocols', async () => {
    await expect(fetchDeckList('file:///etc/passwd')).rejects.toThrow('must use http or https')
  })

  it('fetches and returns the list body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('4 Lightning Bolt\n1 Mountain', { status: 200 })))
    try {
      await expect(fetchDeckList('https://example.com/list.txt')).resolves.toBe('4 Lightning Bolt\n1 Mountain')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('surfaces non-200 responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    try {
      await expect(fetchDeckList('https://example.com/missing')).rejects.toThrow('returned 404')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('maps CORS network failures to a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    try {
      await expect(fetchDeckList('https://example.com/list.txt')).rejects.toThrow('CORS')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejects oversized lists', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(1_000_001), { status: 200 })))
    try {
      await expect(fetchDeckList('https://example.com/huge.txt')).rejects.toThrow('too large')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
