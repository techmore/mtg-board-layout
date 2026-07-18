import { create } from 'zustand'
import type { BoardCard, Token, Zone, DeckCard } from '../types/card'

interface OverlayState {
  type: 'dice' | 'coin' | 'zoom' | null
  cardId?: string
}

function classifyType(typeLine: string): BoardCard['type'] {
  const tl = typeLine.toLowerCase()
  if (tl.includes('land')) return 'land'
  if (tl.includes('creature')) return 'creature'
  if (tl.includes('instant')) return 'instant'
  if (tl.includes('sorcery')) return 'sorcery'
  if (tl.includes('enchantment')) return 'enchantment'
  if (tl.includes('artifact')) return 'artifact'
  if (tl.includes('planeswalker')) return 'planeswalker'
  if (tl.includes('battle')) return 'battle'
  return 'other'
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface GameState {
  lifeTotal: number
  cards: BoardCard[]
  tokens: Token[]
  backgroundImage: string | null
  rollHistory: string[]
  overlay: OverlayState
  showOpponent: boolean
  turn: number
  broadcasting: boolean

  setLife: (n: number) => void
  setBackground: (url: string | null) => void
  addRoll: (result: string) => void
  setOverlay: (overlay: OverlayState) => void
  setBroadcasting: (active: boolean) => void
  toggleOpponent: () => void
  advanceTurn: () => void

  loadDeck: (commanderNames: string[], deckCards: DeckCard[]) => void
  reshuffle: () => void
  drawCards: (count?: number) => void
  addCard: (card: BoardCard) => void
  moveCard: (cardId: string, zone: Zone) => void
  toggleTap: (cardId: string) => void
  addCounter: (cardId: string) => void
  removeCounter: (cardId: string) => void
  removeCard: (cardId: string) => void
  revealCard: (cardId: string) => void

  addToken: (token: Token) => void
  toggleTokenTap: (tokenId: string) => void
  addTokenCounter: (tokenId: string) => void
  removeTokenCounter: (tokenId: string) => void
  removeToken: (tokenId: string) => void
}

const STORAGE_KEY = 'mtg-board-state'

type PersistedGameState = Pick<
  GameState,
  'lifeTotal' | 'cards' | 'tokens' | 'backgroundImage' | 'rollHistory' | 'overlay' | 'showOpponent' | 'turn'
>

const defaultGameState: PersistedGameState = {
  lifeTotal: 40,
  cards: [],
  tokens: [],
  backgroundImage: null,
  rollHistory: [],
  overlay: { type: null },
  showOpponent: false,
  turn: 0,
}

const validZones: Zone[] = ['hand', 'battlefield', 'graveyard', 'exile', 'library', 'command']
const validTypes: BoardCard['type'][] = ['land', 'creature', 'instant', 'sorcery', 'enchantment', 'artifact', 'planeswalker', 'battle', 'other']

function isBoardCard(value: unknown): value is BoardCard {
  if (!value || typeof value !== 'object') return false
  const card = value as Record<string, unknown>
  return typeof card.id === 'string' && typeof card.scryfallId === 'string' &&
    typeof card.name === 'string' && typeof card.imageUri === 'string' &&
    typeof card.zone === 'string' && validZones.includes(card.zone as Zone) &&
    typeof card.tapped === 'boolean' && typeof card.counters === 'number' &&
    Number.isFinite(card.counters) && typeof card.type === 'string' &&
    validTypes.includes(card.type as BoardCard['type']) && typeof card.revealed === 'boolean'
}

function isToken(value: unknown): value is Token {
  if (!value || typeof value !== 'object') return false
  const token = value as Record<string, unknown>
  return typeof token.id === 'string' && typeof token.name === 'string' &&
    typeof token.imageUri === 'string' && typeof token.counters === 'number' &&
    Number.isFinite(token.counters) && typeof token.tapped === 'boolean'
}

function isOverlayState(value: unknown): value is OverlayState {
  if (!value || typeof value !== 'object') return false
  const overlay = value as Record<string, unknown>
  return overlay.type === null || overlay.type === 'dice' || overlay.type === 'coin' || overlay.type === 'zoom'
}

function loadPersistedGameState(): PersistedGameState {
  try {
    if (typeof localStorage === 'undefined') return defaultGameState
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultGameState
    const parsed = JSON.parse(raw) as Partial<PersistedGameState>
    if (!parsed || typeof parsed !== 'object') return defaultGameState
    return {
      lifeTotal: Number.isFinite(parsed.lifeTotal) ? parsed.lifeTotal! : defaultGameState.lifeTotal,
      cards: Array.isArray(parsed.cards) ? parsed.cards.filter(isBoardCard) : defaultGameState.cards,
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens.filter(isToken) : defaultGameState.tokens,
      backgroundImage: typeof parsed.backgroundImage === 'string' ? parsed.backgroundImage : null,
      rollHistory: Array.isArray(parsed.rollHistory) ? parsed.rollHistory.filter((entry): entry is string => typeof entry === 'string') : defaultGameState.rollHistory,
      overlay: isOverlayState(parsed.overlay) ? parsed.overlay : defaultGameState.overlay,
      showOpponent: typeof parsed.showOpponent === 'boolean' ? parsed.showOpponent : defaultGameState.showOpponent,
      turn: Number.isFinite(parsed.turn) ? parsed.turn! : defaultGameState.turn,
    }
  } catch {
    return defaultGameState
  }
}

function persistGameState(state: GameState) {
  try {
    if (typeof localStorage === 'undefined') return
    const persisted: PersistedGameState = {
      lifeTotal: state.lifeTotal,
      cards: state.cards,
      tokens: state.tokens,
      backgroundImage: state.backgroundImage,
      rollHistory: state.rollHistory,
      overlay: state.overlay,
      showOpponent: state.showOpponent,
      turn: state.turn,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  } catch { /* ignore storage quota and privacy-mode failures */ }
}

const persistedGameState = loadPersistedGameState()

export const useGameStore = create<GameState>((set) => ({
  ...persistedGameState,
  broadcasting: false,

  advanceTurn: () =>
    set((s) => ({
      turn: s.turn + 1,
      cards: s.cards.map((c) =>
        c.zone === 'battlefield' ? { ...c, tapped: false } : c
      ),
    })),

  setLife: (n) => set({ lifeTotal: n }),
  setBackground: (url) => set({ backgroundImage: url }),
  addRoll: (result) =>
    set((state) => ({ rollHistory: [...state.rollHistory, result] })),
  setOverlay: (overlay) => set({ overlay }),
  setBroadcasting: (active) => set({ broadcasting: active }),
  toggleOpponent: () =>
    set((state) => ({ showOpponent: !state.showOpponent })),

  loadDeck: (commanderNames, deckCards) => {
    const cards: BoardCard[] = []

    // Commanders in command zone
    for (const name of commanderNames) {
      const match = deckCards.find((c) => c.name === name)
      if (match) {
        cards.push({
          id: crypto.randomUUID(),
          scryfallId: match.scryfallId,
          name: match.name,
          imageUri: match.imageUri,
          zone: 'command',
          tapped: false,
          counters: 0,
          type: classifyType(match.typeLine),
          revealed: true,
        })
      }
    }

    // Rest in library
    for (const dc of deckCards) {
      if (commanderNames.includes(dc.name)) continue
      for (let i = 0; i < dc.quantity; i++) {
        cards.push({
          id: crypto.randomUUID(),
          scryfallId: dc.scryfallId,
          name: dc.name,
          imageUri: dc.imageUri,
          zone: 'library',
          tapped: false,
          counters: 0,
          type: classifyType(dc.typeLine),
          revealed: false,
        })
      }
    }

    set({ cards: shuffle(cards), lifeTotal: 40, tokens: [], rollHistory: [], overlay: { type: null }, turn: 0 })
  },

  reshuffle: () =>
    set((state) => {
      const commanders = new Set(state.cards.filter((card) => card.zone === 'command').map((card) => card.id))
      const cards = state.cards.map((card) => {
        const isCommander = commanders.has(card.id)
        return {
          ...card,
          zone: isCommander ? 'command' as const : 'library' as const,
          tapped: false,
          counters: 0,
          revealed: isCommander,
        }
      })
      return {
        cards: shuffle(cards),
        lifeTotal: 40,
        tokens: [],
        rollHistory: [],
        overlay: { type: null },
        turn: 0,
      }
    }),

  drawCards: (count = 1) =>
    set((state) => {
      let remaining = Math.max(0, Math.floor(count))
      const cards = state.cards.map((card) => {
        if (remaining > 0 && card.zone === 'library') {
          remaining--
          return { ...card, zone: 'hand' as const, revealed: false }
        }
        return card
      })
      return { cards }
    }),

  addCard: (card) =>
    set((state) => ({ cards: [...state.cards, card] })),
  moveCard: (cardId, zone) =>
    set((state) => ({
      cards: state.cards.map((c) =>
        c.id === cardId ? { ...c, zone, tapped: false, revealed: zone === 'hand' } : c
      ),
    })),
  toggleTap: (cardId) =>
    set((state) => ({
      cards: state.cards.map((c) =>
        c.id === cardId ? { ...c, tapped: !c.tapped } : c
      ),
    })),
  addCounter: (cardId) =>
    set((state) => ({
      cards: state.cards.map((c) =>
        c.id === cardId ? { ...c, counters: c.counters + 1 } : c
      ),
    })),
  removeCounter: (cardId) =>
    set((state) => ({
      cards: state.cards.map((c) =>
        c.id === cardId ? { ...c, counters: Math.max(0, c.counters - 1) } : c
      ),
    })),
  removeCard: (cardId) =>
    set((state) => ({ cards: state.cards.filter((c) => c.id !== cardId) })),
  revealCard: (cardId) =>
    set((state) => ({
      cards: state.cards.map((c) =>
        c.id === cardId ? { ...c, revealed: !c.revealed } : c
      ),
    })),

  addToken: (token) =>
    set((state) => ({ tokens: [...state.tokens, token] })),
  toggleTokenTap: (tokenId) =>
    set((state) => ({
      tokens: state.tokens.map((t) =>
        t.id === tokenId ? { ...t, tapped: !t.tapped } : t
      ),
    })),
  addTokenCounter: (tokenId) =>
    set((state) => ({
      tokens: state.tokens.map((t) =>
        t.id === tokenId ? { ...t, counters: t.counters + 1 } : t
      ),
    })),
  removeTokenCounter: (tokenId) =>
    set((state) => ({
      tokens: state.tokens.map((t) =>
        t.id === tokenId ? { ...t, counters: Math.max(0, t.counters - 1) } : t
      ),
    })),
  removeToken: (tokenId) =>
    set((state) => ({ tokens: state.tokens.filter((t) => t.id !== tokenId) })),
}))

let applyingExternalState = false

useGameStore.subscribe((state) => {
  if (!applyingExternalState) persistGameState(state)
})

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    applyingExternalState = true
    useGameStore.setState(loadPersistedGameState())
    applyingExternalState = false
  })
}
