import { create } from 'zustand'
import type { BackgroundOption, BoardCard, Token, Zone, DeckCard } from '../types/card'
import { resolveCardRules } from '../data/cardRules'

interface OverlayState {
  type: 'dice' | 'coin' | 'zoom' | null
  cardId?: string
}

interface DrawNotice {
  id: number
  count: number
}

interface TurnAnnouncement {
  id: number
  text: string
}

type TurnAction = 'end' | 'advance'

interface TurnPrompt {
  id: number
  action: TurnAction
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

function resetAndDealCards(sourceCards: BoardCard[], openingHandSize = 0): BoardCard[] {
  const commanders = new Set(sourceCards.filter((card) => card.zone === 'command').map((card) => card.id))
  const resetCards = sourceCards.map((card) => {
    const isCommander = commanders.has(card.id)
    return {
      ...card,
      zone: isCommander ? 'command' as const : 'library' as const,
      tapped: false,
      counters: 0,
      revealed: isCommander,
    }
  })

  let remaining = Math.max(0, Math.floor(openingHandSize))
  return shuffle(resetCards).map((card) => {
    if (remaining > 0 && card.zone === 'library') {
      remaining--
      return { ...card, zone: 'hand' as const, revealed: false }
    }
    return card
  })
}

interface GameState {
  activeDeckId: string | null
  lifeTotal: number
  cards: BoardCard[]
  tokens: Token[]
  backgroundImage: string | null
  backgrounds: BackgroundOption[]
  rollHistory: string[]
  overlay: OverlayState
  showOpponent: boolean
  turn: number
  drawNotice: DrawNotice | null
  turnAnnouncement: TurnAnnouncement | null
  turnPrompt: TurnPrompt | null
  broadcasting: boolean

  setLife: (n: number) => void
  setBackground: (url: string | null) => void
  saveBackground: (name: string, dataUrl: string) => void
  removeBackground: (id: string) => void
  addRoll: (result: string) => void
  setOverlay: (overlay: OverlayState) => void
  setBroadcasting: (active: boolean) => void
  toggleOpponent: () => void
  advanceTurn: () => void
  announceEndTurn: () => void
  cancelTurnPrompt: () => void
  discardForTurn: (cardId: string) => void
  clearDrawNotice: (id?: number) => void
  clearTurnAnnouncement: (id?: number) => void

  loadDeck: (commanderNames: string[], deckCards: DeckCard[], deckId?: string) => void
  reshuffle: () => void
  redeal: (openingHandSize?: number) => void
  drawCards: (count?: number) => void
  addCard: (card: BoardCard) => void
  moveCard: (cardId: string, zone: Zone) => void
  reorderBattlefield: (cardId: string, direction: 'closer' | 'farther') => void
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
  'activeDeckId' | 'lifeTotal' | 'cards' | 'tokens' | 'backgroundImage' | 'backgrounds' | 'rollHistory' | 'overlay' | 'showOpponent' | 'turn' | 'turnAnnouncement'
>

const defaultGameState: PersistedGameState = {
  activeDeckId: null,
  lifeTotal: 40,
  cards: [],
  tokens: [],
  backgroundImage: null,
  backgrounds: [],
  rollHistory: [],
  overlay: { type: null },
  showOpponent: false,
  turn: 1,
  turnAnnouncement: null,
}

function advanceTurnState(state: GameState): Partial<GameState> {
  let drewCard = false
  const cards = state.cards.map((card) => {
    const untapped = card.zone === 'battlefield' ? { ...card, tapped: false } : card
    if (!drewCard && untapped.zone === 'library') {
      drewCard = true
      return { ...untapped, zone: 'hand' as const, revealed: false }
    }
    return untapped
  })
  return {
    turn: state.turn + 1,
    cards,
    drawNotice: drewCard ? { id: Date.now(), count: 1 } : null,
    turnAnnouncement: null,
    turnPrompt: null,
  }
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

function isBackgroundOption(value: unknown): value is BackgroundOption {
  if (!value || typeof value !== 'object') return false
  const background = value as Record<string, unknown>
  return typeof background.id === 'string' && typeof background.name === 'string' &&
    typeof background.dataUrl === 'string' && background.dataUrl.startsWith('data:image/')
}

function isOverlayState(value: unknown): value is OverlayState {
  if (!value || typeof value !== 'object') return false
  const overlay = value as Record<string, unknown>
  return overlay.type === null || overlay.type === 'dice' || overlay.type === 'coin' || overlay.type === 'zoom'
}

function isTurnAnnouncement(value: unknown): value is TurnAnnouncement | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const announcement = value as Record<string, unknown>
  return typeof announcement.id === 'number' && Number.isFinite(announcement.id) &&
    typeof announcement.text === 'string'
}

function loadPersistedGameState(): PersistedGameState {
  try {
    if (typeof localStorage === 'undefined') return defaultGameState
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultGameState
    const parsed = JSON.parse(raw) as Partial<PersistedGameState>
    if (!parsed || typeof parsed !== 'object') return defaultGameState
    const backgroundImage = typeof parsed.backgroundImage === 'string' ? parsed.backgroundImage : null
    const savedBackgrounds = Array.isArray(parsed.backgrounds) ? parsed.backgrounds.filter(isBackgroundOption) : []
    const backgrounds = backgroundImage && !savedBackgrounds.some((background) => background.dataUrl === backgroundImage)
      ? [{ id: 'current-background', name: 'Current background', dataUrl: backgroundImage }, ...savedBackgrounds]
      : savedBackgrounds
    return {
      activeDeckId: typeof parsed.activeDeckId === 'string' ? parsed.activeDeckId : null,
      lifeTotal: Number.isFinite(parsed.lifeTotal) ? parsed.lifeTotal! : defaultGameState.lifeTotal,
      cards: Array.isArray(parsed.cards) ? parsed.cards.filter(isBoardCard) : defaultGameState.cards,
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens.filter(isToken) : defaultGameState.tokens,
      backgroundImage,
      backgrounds,
      rollHistory: Array.isArray(parsed.rollHistory) ? parsed.rollHistory.filter((entry): entry is string => typeof entry === 'string') : defaultGameState.rollHistory,
      overlay: isOverlayState(parsed.overlay) ? parsed.overlay : defaultGameState.overlay,
      showOpponent: typeof parsed.showOpponent === 'boolean' ? parsed.showOpponent : defaultGameState.showOpponent,
      turn: Number.isFinite(parsed.turn) ? Math.max(1, parsed.turn!) : defaultGameState.turn,
      turnAnnouncement: isTurnAnnouncement(parsed.turnAnnouncement) ? parsed.turnAnnouncement : null,
    }
  } catch {
    return defaultGameState
  }
}

function persistGameState(state: GameState) {
  try {
    if (typeof localStorage === 'undefined') return
    const persisted: PersistedGameState = {
      activeDeckId: state.activeDeckId,
      lifeTotal: state.lifeTotal,
      cards: state.cards,
      tokens: state.tokens,
      backgroundImage: state.backgroundImage,
      backgrounds: state.backgrounds,
      rollHistory: state.rollHistory,
      overlay: state.overlay,
      showOpponent: state.showOpponent,
      turn: state.turn,
      turnAnnouncement: state.turnAnnouncement,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  } catch { /* ignore storage quota and privacy-mode failures */ }
}

const persistedGameState = loadPersistedGameState()

export const useGameStore = create<GameState>((set) => ({
  ...persistedGameState,
  drawNotice: null,
  turnPrompt: null,
  broadcasting: false,

  advanceTurn: () =>
    set((state) => state.cards.filter((card) => card.zone === 'hand').length > 7
      ? { turnPrompt: { id: Date.now(), action: 'advance' } }
      : advanceTurnState(state)),

  setLife: (n) => set({ lifeTotal: n }),
  setBackground: (url) => set({ backgroundImage: url }),
  saveBackground: (name, dataUrl) =>
    set((state) => {
      const existing = state.backgrounds.find((background) => background.dataUrl === dataUrl)
      const background = existing ?? {
        id: crypto.randomUUID(),
        name: name.trim() || 'Background',
        dataUrl,
      }
      return {
        backgroundImage: dataUrl,
        backgrounds: existing ? state.backgrounds : [...state.backgrounds, background],
      }
    }),
  removeBackground: (id) =>
    set((state) => {
      const removed = state.backgrounds.find((background) => background.id === id)
      return {
        backgrounds: state.backgrounds.filter((background) => background.id !== id),
        backgroundImage: removed?.dataUrl === state.backgroundImage ? null : state.backgroundImage,
      }
    }),
  addRoll: (result) =>
    set((state) => ({ rollHistory: [...state.rollHistory, result] })),
  setOverlay: (overlay) => set({ overlay }),
  setBroadcasting: (active) => set({ broadcasting: active }),
  toggleOpponent: () =>
    set((state) => ({ showOpponent: !state.showOpponent })),
  announceEndTurn: () =>
    set((state) => state.cards.filter((card) => card.zone === 'hand').length > 7
      ? { turnPrompt: { id: Date.now(), action: 'end' } }
      : { turnAnnouncement: { id: Date.now(), text: 'END TURN' }, turnPrompt: null }),
  cancelTurnPrompt: () => set({ turnPrompt: null }),
  discardForTurn: (cardId) =>
    set((state) => {
      if (!state.turnPrompt) return {}
      const card = state.cards.find((candidate) => candidate.id === cardId && candidate.zone === 'hand')
      if (!card) return {}
      const cards = state.cards.map((candidate) =>
        candidate.id === cardId
          ? { ...candidate, zone: 'graveyard' as const, tapped: false, revealed: true }
          : candidate,
      )
      const nextState = { ...state, cards }
      if (cards.filter((candidate) => candidate.zone === 'hand').length > 7) {
        return { cards, turnPrompt: { id: Date.now(), action: state.turnPrompt.action } }
      }
      return state.turnPrompt.action === 'advance'
        ? advanceTurnState(nextState)
        : { cards, turnPrompt: null, turnAnnouncement: { id: Date.now(), text: 'END TURN' } }
    }),
  clearDrawNotice: (id) =>
    set((state) => state.drawNotice && (id === undefined || state.drawNotice.id === id) ? { drawNotice: null } : {}),
  clearTurnAnnouncement: (id) =>
    set((state) => state.turnAnnouncement && (id === undefined || state.turnAnnouncement.id === id) ? { turnAnnouncement: null } : {}),

  loadDeck: (commanderNames, deckCards, deckId) => {
    const cards: BoardCard[] = []

    // Commanders in command zone
    for (const name of commanderNames) {
      const match = deckCards.find((c) => c.name === name)
      if (match) {
        const rules = resolveCardRules(match)
        cards.push({
          id: crypto.randomUUID(),
          scryfallId: match.scryfallId,
          name: match.name,
          imageUri: match.imageUri,
          manaCost: rules.manaCost,
          manaValue: rules.manaValue,
          oracleText: match.oracleText,
          entersTapped: rules.entersTapped,
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
      const rules = resolveCardRules(dc)
      for (let i = 0; i < dc.quantity; i++) {
        cards.push({
          id: crypto.randomUUID(),
          scryfallId: dc.scryfallId,
          name: dc.name,
          imageUri: dc.imageUri,
          manaCost: rules.manaCost,
          manaValue: rules.manaValue,
          oracleText: dc.oracleText,
          entersTapped: rules.entersTapped,
          zone: 'library',
          tapped: false,
          counters: 0,
          type: classifyType(dc.typeLine),
          revealed: false,
        })
      }
    }

    set({ activeDeckId: deckId ?? null, cards: shuffle(cards), lifeTotal: 40, tokens: [], rollHistory: [], overlay: { type: null }, turn: 1, drawNotice: null, turnAnnouncement: null, turnPrompt: null })
  },

  reshuffle: () =>
    set((state) => {
      return {
        cards: resetAndDealCards(state.cards),
        lifeTotal: 40,
        tokens: [],
        rollHistory: [],
        overlay: { type: null },
        turn: 1,
        drawNotice: null,
        turnAnnouncement: null,
        turnPrompt: null,
      }
    }),

  redeal: (openingHandSize = 7) =>
    set((state) => {
      const cards = resetAndDealCards(state.cards, openingHandSize)
      return {
        cards,
        lifeTotal: 40,
        tokens: [],
        rollHistory: [],
        overlay: { type: null },
        turn: 1,
        drawNotice: { id: Date.now(), count: cards.filter((card) => card.zone === 'hand').length },
        turnAnnouncement: null,
        turnPrompt: null,
      }
    }),

  drawCards: (count = 1) =>
    set((state) => {
      let remaining = Math.max(0, Math.floor(count))
      let drawnCount = 0
      const cards = state.cards.map((card) => {
        if (remaining > 0 && card.zone === 'library') {
          remaining--
          drawnCount++
          return { ...card, zone: 'hand' as const, revealed: false }
        }
        return card
      })
      return {
        cards,
        drawNotice: drawnCount > 0 ? { id: Date.now(), count: drawnCount } : state.drawNotice,
      }
    }),

  addCard: (card) =>
    set((state) => ({ cards: [...state.cards, card] })),
  moveCard: (cardId, zone) =>
    set((state) => {
      const current = state.cards.find((card) => card.id === cardId)
      if (!current) return {}
      const entersBattlefield = zone === 'battlefield' && current.zone !== 'battlefield'
      const updated = {
        ...current,
        zone,
        tapped: entersBattlefield ? Boolean(current.entersTapped) : false,
        revealed: zone === 'hand',
      }

      // New battlefield cards are appended after existing battlefield cards so the
      // Commander-facing layout reflects the order in which permanents were played.
      if (zone === 'battlefield' && current.zone !== 'battlefield') {
        return { cards: [...state.cards.filter((card) => card.id !== cardId), updated] }
      }

      return { cards: state.cards.map((card) => card.id === cardId ? updated : card) }
    }),
  reorderBattlefield: (cardId, direction) =>
    set((state) => {
      const target = state.cards.find((card) => card.id === cardId && card.zone === 'battlefield')
      if (!target) return {}

      const category = target.type === 'land' || target.type === 'creature' ? target.type : null
      if (!category) return {}
      const groupKey = (card: BoardCard) => card.type === 'land'
        ? `land:${card.name.toLowerCase()}`
        : `card:${card.id}`
      const groups = new Map<string, BoardCard[]>()
      state.cards
        .filter((card) => card.zone === 'battlefield' && card.type === category)
        .forEach((card) => {
          const key = groupKey(card)
          const group = groups.get(key)
          if (group) group.push(card)
          else groups.set(key, [card])
        })

      const orderedGroups = Array.from(groups.values())
      const targetGroupIndex = orderedGroups.findIndex((group) => group.some((card) => card.id === target.id))
      const nextGroupIndex = direction === 'closer' ? targetGroupIndex - 1 : targetGroupIndex + 1
      if (targetGroupIndex < 0 || nextGroupIndex < 0 || nextGroupIndex >= orderedGroups.length) return {}

      ;[orderedGroups[targetGroupIndex], orderedGroups[nextGroupIndex]] = [orderedGroups[nextGroupIndex], orderedGroups[targetGroupIndex]]
      const orderedCategory = orderedGroups.flat()
      let categoryIndex = 0
      return {
        cards: state.cards.map((card) => card.zone === 'battlefield' && card.type === category
          ? orderedCategory[categoryIndex++]
          : card),
      }
    }),
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
