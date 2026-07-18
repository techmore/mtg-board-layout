import { create } from 'zustand'
import type { Deck, DeckCard } from '../types/card'

interface DeckStore {
  decks: Deck[]
  importing: string | null
  importDeck: (name: string, cards: DeckCard[], format?: string, commanderNames?: string[], complete?: boolean, prebuiltId?: string) => void
  deleteDeck: (id: string) => void
  renameDeck: (id: string, name: string) => void
  setImporting: (id: string | null) => void
}

const STORAGE_KEY = 'mtg-decks'

function isDeck(value: unknown): value is Deck {
  if (!value || typeof value !== 'object') return false
  const deck = value as Record<string, unknown>
  return typeof deck.id === 'string' && typeof deck.name === 'string' &&
    typeof deck.format === 'string' && Array.isArray(deck.commanderNames) &&
    deck.commanderNames.every((name) => typeof name === 'string') &&
    Array.isArray(deck.cards) && typeof deck.complete === 'boolean' &&
    typeof deck.createdAt === 'number' && typeof deck.updatedAt === 'number'
}

function loadDecks(): Deck[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isDeck) : []
  } catch {
    return []
  }
}

function persistDecks(state: DeckStore) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.decks))
  } catch { /* ignore storage quota and privacy-mode failures */ }
}

export const useDeckStore = create<DeckStore>((set) => ({
  decks: loadDecks(),
  importing: null,
  importDeck: (name, cards, format = 'commander', commanderNames: string[] = [], complete = true, prebuiltId?: string) =>
    set((state) => {
      const id = prebuiltId ?? crypto.randomUUID()
      const existing = state.decks.find((deck) => deck.id === id)
      const nextDeck: Deck = {
        id,
        name,
        format,
        commanderNames,
        cards,
        complete,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      }
      return {
        decks: existing
          ? state.decks.map((deck) => (deck.id === id ? nextDeck : deck))
          : [...state.decks, nextDeck],
        importing: null,
      }
    }),
  deleteDeck: (id) =>
    set((state) => ({ decks: state.decks.filter((d) => d.id !== id) })),
  renameDeck: (id, name) =>
    set((state) => ({
      decks: state.decks.map((d) =>
        d.id === id ? { ...d, name, updatedAt: Date.now() } : d
      ),
    })),
  setImporting: (id) => set({ importing: id }),
}))

useDeckStore.subscribe((state) => persistDecks(state))
