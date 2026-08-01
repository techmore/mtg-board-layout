import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import './gameStore'
import {
  STORAGE_KEY,
  defaultGameState,
  loadPersistedGameState,
  persistGameState,
  hydratePersistedBackgroundState,
} from './gamePersistence'
import type { GameState, Phase } from './gameStore'

function makeLocalStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size },
  } as unknown as Storage
}

let storage: Storage

beforeEach(() => {
  storage = makeLocalStorage()
  globalThis.localStorage = storage
})

afterEach(() => {
  vi.restoreAllMocks()
})

function baseState(): GameState {
  return {
    ...defaultGameState,
    activeDeckId: 'deck-1',
    lifeTotal: 25,
    turn: 3,
    currentPhase: 'combat' as Phase,
    opponentLifeTotal: 12,
    cards: [{
      id: 'card-1',
      scryfallId: 'sf-1',
      name: 'Forest',
      imageUri: '/cards/sf-1.jpg',
      typeLine: 'Basic Land — Forest',
      subtypes: ['Forest'],
      isBasicLand: true,
      zone: 'battlefield',
      tapped: true,
      counters: 0,
      type: 'land',
      revealed: false,
    }],
    manaPool: { W: 1, U: 0, B: 0, R: 0, G: 2, C: 0 },
    rollHistory: ['d20: 17'],
  } as unknown as GameState
}

describe('loadPersistedGameState', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadPersistedGameState()).toEqual(defaultGameState)
  })

  it('round-trips a persisted state', () => {
    const state = baseState()
    persistGameState(state)
    const loaded = loadPersistedGameState()

    expect(loaded.activeDeckId).toBe('deck-1')
    expect(loaded.lifeTotal).toBe(25)
    expect(loaded.turn).toBe(3)
    expect(loaded.currentPhase).toBe('combat')
    expect(loaded.cards).toHaveLength(1)
    expect(loaded.cards[0].name).toBe('Forest')
    expect(loaded.cards[0].isBasicLand).toBe(true)
    expect(loaded.manaPool).toEqual({ W: 1, U: 0, B: 0, R: 0, G: 2, C: 0 })
    expect(loaded.rollHistory).toEqual(['d20: 17'])
  })

  it('falls back to defaults for corrupt JSON', () => {
    storage.setItem(STORAGE_KEY, '{not valid json')
    expect(loadPersistedGameState()).toEqual(defaultGameState)
  })

  it('drops invalid cards and keeps valid ones', () => {
    const state = baseState()
    state.cards.push({
      id: 'bad',
      scryfallId: '',
      name: 'Broken',
      imageUri: '',
      typeLine: 'Not A Card',
      zone: 'battlefield',
      tapped: false,
      counters: 0,
      type: 'not-a-valid-type',
      revealed: false,
    } as unknown as GameState['cards'][number])
    persistGameState(state)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loaded = loadPersistedGameState()
    expect(loaded.cards).toHaveLength(1)
    expect(loaded.cards[0].id).toBe('card-1')
    warn.mockRestore()
  })

  it('sanitizes out-of-range numbers', () => {
    const state = baseState()
    state.turn = -5
    state.opponentLifeTotal = NaN
    persistGameState(state)
    const loaded = loadPersistedGameState()
    expect(loaded.turn).toBe(1)
    expect(loaded.opponentLifeTotal).toBe(40)
  })

  it('does not load indexeddb background references as renderable images', () => {
    const state = baseState()
    state.backgroundImage = 'data:image/png;base64,REAL'
    state.backgrounds = [{ id: 'bg-1', name: 'B', dataUrl: 'data:image/png;base64,REAL' }]
    persistGameState(state)
    storage.setItem(STORAGE_KEY, storage.getItem(STORAGE_KEY)!.replace('data:image/png;base64,REAL', 'indexeddb:bg-1'))
    const loaded = loadPersistedGameState()
    expect(loaded.backgroundImage).toBeNull()
  })
})

describe('persistGameState', () => {
  it('skips writing when localStorage is unavailable', () => {
    const original = globalThis.localStorage
    globalThis.localStorage = undefined as unknown as Storage
    try {
      persistGameState(baseState())
    } finally {
      globalThis.localStorage = original
    }
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('warns when the saved state approaches the quota', () => {
    const state = baseState()
    const bigText = 'x'.repeat(10 * 1024)
    state.cards = Array.from({ length: 600 }, (_, i) => ({
      id: `card-${i}`,
      scryfallId: `sf-${i}`,
      name: `Card ${i}`,
      imageUri: '/cards/x.jpg',
      typeLine: 'Creature',
      subtypes: [],
      isBasicLand: false,
      zone: 'library' as const,
      tapped: false,
      counters: 0,
      type: 'creature',
      revealed: false,
      oracleText: bigText,
    }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    persistGameState(state)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('approaching localStorage'))
    warn.mockRestore()
  })
})

describe('hydratePersistedBackgroundState', () => {
  it('returns null when nothing is stored', async () => {
    await expect(hydratePersistedBackgroundState()).resolves.toBeNull()
  })

  it('hydrates plain data-URL backgrounds without IndexedDB references', async () => {
    const state = baseState()
    state.backgroundImage = 'data:image/png;base64,REAL'
    state.backgrounds = [{ id: 'bg-1', name: 'B', dataUrl: 'data:image/png;base64,REAL' }]
    persistGameState(state)
    const hydrated = await hydratePersistedBackgroundState()
    expect(hydrated?.backgroundImage).toBe('data:image/png;base64,REAL')
  })
})
