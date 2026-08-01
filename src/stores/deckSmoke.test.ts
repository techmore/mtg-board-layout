import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from './gameStore'
import { useDeckStore } from './deckStore'
import { fetchDeckCards } from '../services/deckImport'
import { prebuiltDecks, type PrebuiltDeck } from '../data/prebuiltDecks'
import { primeCardRules } from './cardRulesLoader'
import type { DeckCard, ManaPool } from '../types/card'

const emptyManaPool = (): ManaPool => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 })

function resetStore() {
  useGameStore.setState({
    cards: [],
    manaPool: emptyManaPool(),
    potentialMana: [],
    manaLog: [],
    effectHistory: [],
    tokens: [],
    lifeTotal: 40,
    opponentLifeTotal: 40,
    turn: 1,
    landPlaysThisTurn: 0,
    drawNotice: null,
    turnAnnouncement: null,
    turnPrompt: null,
    currentPhase: 'beginning',
    activePlayer: 'player',
    opponentManaPool: emptyManaPool(),
    opponentPotentialMana: [],
    opponentLandPlaysThisTurn: 0,
    combatState: { active: false, attackers: [], blockers: {} },
    triggerStack: [],
    undoStack: [],
    redoStack: [],
    gameOver: null,
    showOpponent: false,
  })
  useDeckStore.setState({ decks: [], importing: null })
}

const BASIC_LAND_NAMES = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'])
const BASIC_LAND_RE = /plains|island|swamp|mountain|forest/i

/** Stub the Scryfall collection endpoint so fetchDeckCards resolves offline. */
function stubScryfall() {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = String(url)
    if (!urlStr.includes('cards/collection')) {
      return new Response(JSON.stringify({ data: [], not_found: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    const body = JSON.parse(String(init?.body))
    const data = body.identifiers.map(({ name }: { name: string }) => {
      const isLand = BASIC_LAND_NAMES.has(name) || BASIC_LAND_RE.test(name)
      return {
        id: `mock-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        mana_cost: '',
        cmc: 0,
        type_line: isLand ? 'Basic Land' : 'Creature',
        oracle_text: '',
        image_uris: { normal: '' },
      }
    })
    return new Response(JSON.stringify({ data, not_found: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
}

function deckDefinition(deck: PrebuiltDeck) {
  return {
    id: deck.id,
    name: deck.name,
    format: deck.format,
    commanderNames: [deck.commander, ...(deck.partners ?? [])],
    cards: deck.cards.map((name) => ({ name, quantity: 1 })),
    complete: deck.complete,
    source: undefined,
  }
}

beforeEach(() => {
  primeCardRules({})
  stubScryfall()
})

afterEach(() => {
  resetStore()
  vi.unstubAllGlobals()
})

describe('E1: per-deck playability smoke test', () => {
  it.each(prebuiltDecks.map((d) => [d.name, d] as const))('%s imports and is playable', async (_, deck) => {
    const { cards, notFound } = await fetchDeckCards(deckDefinition(deck))

    expect(notFound).toEqual([])
    expect(cards.length).toBeGreaterThan(0)

    const totalQuantity = cards.reduce((sum, c) => sum + c.quantity, 0)
    expect(totalQuantity).toBe(100)

    for (const c of cards) {
      expect(c.scryfallId).not.toBe('')
      expect(c.name).toBeTruthy()
      expect(c.typeLine).toBeTruthy()
      expect(typeof c.imageUri).toBe('string')
    }

    useGameStore.getState().loadDeck([deck.commander, ...(deck.partners ?? [])], cards, deck.id)
    let state = useGameStore.getState()

    const total = state.cards.length
    expect(total).toBe(100)
    expect(state.cards.filter((c) => c.zone === 'command')).toHaveLength(1 + (deck.partners?.length ?? 0))
    expect(state.cards.filter((c) => c.zone === 'library')).toHaveLength(99 - (deck.partners?.length ?? 0))
    expect(state.cards.every((c) => c.name && c.imageUri !== undefined)).toBe(true)

    useGameStore.getState().drawCards(7)
    state = useGameStore.getState()
    expect(state.cards.filter((c) => c.zone === 'hand')).toHaveLength(7)

    for (let i = 0; i < 5; i++) {
      useGameStore.getState().advancePhase()
    }
    state = useGameStore.getState()
    expect(state.currentPhase).toBe('beginning')
  })
})

describe('E2: deck-vs-AI smoke test', () => {
  it('a resolved deck loads against the AI and survives a full AI turn', async () => {
    const deck = prebuiltDecks.find((d) => d.id === 'blight-curse') ?? prebuiltDecks[0]
    const { cards } = await fetchDeckCards(deckDefinition(deck))

    useGameStore.getState().loadDeck([deck.commander, ...(deck.partners ?? [])], cards, deck.id)

    vi.useFakeTimers()
    try {
      const { cards: aiCards } = await fetchDeckCards(deckDefinition(deck))
      useGameStore.getState().loadOpponentDeck([deck.commander, ...(deck.partners ?? [])], aiCards, deck.name)

      // Guarantee the AI has a land to play — random draws can otherwise produce
      // landless hands (the mock only classifies basic lands as lands).
      const preState = useGameStore.getState()
      const oppLand = preState.cards.find(
        (c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'library' && c.type === 'land',
      )
      if (oppLand) {
        useGameStore.setState({
          cards: preState.cards.map((c) => c.id === oppLand.id ? { ...c, zone: 'hand' as const } : c),
        })
      }

      vi.advanceTimersByTime(3200)

      const state = useGameStore.getState()
      expect(state.activePlayer).toBe('player')
      expect(state.turn).toBe(2)
      expect(state.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield').length).toBeGreaterThan(0)
      expect(state.gameOver).toBeNull()
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('still loads a deck whose name is not in the prebuilt catalog', () => {
    const deckCards: DeckCard[] = [
      { scryfallId: 'sf-1', name: 'Test Commander', manaCost: '{3}', manaValue: 4, typeLine: 'Legendary Creature — Wizard', imageUri: '', quantity: 1 },
      { scryfallId: 'sf-2', name: 'Plains', manaCost: '', manaValue: 0, typeLine: 'Basic Land', imageUri: '', quantity: 40 },
      { scryfallId: 'sf-3', name: 'Test Creature', manaCost: '{2}', manaValue: 3, typeLine: 'Creature', imageUri: '', quantity: 59 },
    ]
    useGameStore.getState().loadDeck(['Test Commander'], deckCards, 'custom')

    const state = useGameStore.getState()
    expect(state.cards).toHaveLength(100)
    expect(state.cards.filter((c) => c.zone === 'command')).toHaveLength(1)
    expect(state.activeDeckId).toBe('custom')
  })
})
