import { create } from 'zustand'
import type { BackgroundOption, BoardCard, CardScale, EffectHistoryEntry, ManaColor, ManaLogEntry, ManaPool, ManaUsageKind, PotentialManaSource, Token, Zone, DeckCard, TriggerInstance } from '../types/card'
import { hydratePersistedBackgroundState, loadPersistedGameState, persistGameState, STORAGE_KEY } from './gamePersistence'
import { reindexTriggers, buildTriggerInstances } from './triggerEngine'
import { getCachedCardRules } from './cardRulesLoader'
import { resolveTrigger as resolveTriggerImpl, selectTarget as selectTargetImpl } from './triggerActions'
import { createUndoContext, createUndoActions, runUndoableAction } from './gameHistory'
import { createTurnPhases } from './gameTurnPhases'
import { createOpponentAI } from './gameOpponentAI'
import { createDeckActions } from './gameDeckActions'
import { createCardMovement } from './gameCardMovement'
import { createTokenActions } from './gameTokenActions'
import { createManaActions } from './gameManaActions'
import { createCombatActions } from './gameCombatActions'

export interface OverlayState {
  type: 'dice' | 'coin' | 'zoom' | 'graveyard' | null
  cardId?: string
}

export interface DrawNotice {
  id: number
  count: number
  cardNames?: string[]
}

export interface TurnAnnouncement {
  id: number
  text: string
}

type TurnAction = 'end' | 'advance'
type TurnPromptReason = 'discard' | 'land' | 'etb'

export const PHASES = ['beginning', 'precombat_main', 'combat', 'postcombat_main', 'ending'] as const
export type Phase = typeof PHASES[number]

export interface TurnPrompt {
  action: TurnAction
  reason: TurnPromptReason
  cardId?: string
}

export interface CombatState {
  active: boolean
  attackers: string[]
  blockers: Record<string, string[]>
}

export type ActivePlayer = 'player' | 'opponent'

export type GameSnapshot = Pick<
  GameState,
  'cards' | 'manaPool' | 'potentialMana' | 'manaLog' | 'effectHistory' | 'tokens' | 'lifeTotal' | 'opponentLifeTotal' | 'turn' | 'landPlaysThisTurn' | 'drawNotice' | 'turnAnnouncement' | 'turnPrompt' | 'combatState' | 'currentPhase' | 'activePlayer' | 'opponentManaPool' | 'opponentPotentialMana' | 'opponentLandPlaysThisTurn'
>

export interface GameState {
  activeDeckId: string | null
  lifeTotal: number
  cards: BoardCard[]
  cardScale: CardScale
  manaPool: ManaPool
  potentialMana: PotentialManaSource[]
  manaLog: ManaLogEntry[]
  effectHistory: EffectHistoryEntry[]
  tokens: Token[]
  backgroundImage: string | null
  backgrounds: BackgroundOption[]
  rollHistory: string[]
  overlay: OverlayState
  showOpponent: boolean
  opponentLifeTotal: number
  activePlayer: ActivePlayer
  opponentManaPool: ManaPool
  opponentPotentialMana: PotentialManaSource[]
  opponentLandPlaysThisTurn: number
  turn: number
  landPlaysThisTurn: number
  drawNotice: DrawNotice | null
  turnAnnouncement: TurnAnnouncement | null
  turnPrompt: TurnPrompt | null
  broadcasting: boolean
  undoStack: GameSnapshot[]
  redoStack: GameSnapshot[]
  triggerStack: TriggerInstance[]
  combatState: CombatState
  currentPhase: Phase

  setLife: (n: number) => void
  setBackground: (url: string | null) => void
  setCardScale: (scale: CardScale) => void
  saveBackground: (name: string, dataUrl: string) => void
  removeBackground: (id: string) => void
  addRoll: (result: string) => void
  setOverlay: (overlay: OverlayState) => void
  setBroadcasting: (active: boolean) => void
  toggleOpponent: () => void
  setOpponentLife: (n: number) => void
  loadOpponentDeck: (commanderNames: string[], deckCards: DeckCard[]) => void
  runOpponentTurn: () => void
  advanceTurn: () => void
  advancePhase: () => void
  castSpell: (cardId: string) => boolean
  announceEndTurn: () => void
  cancelTurnPrompt: () => void
  overrideLandPlay: (cardId: string) => void
  resolveConditionalEntry: (cardId: string, tapped: boolean) => void
  discardForTurn: (cardId: string) => void
  clearDrawNotice: (id?: number) => void
  clearTurnAnnouncement: (id?: number) => void
  addMana: (color: ManaColor, source?: { cardId: string; cardName: string }) => void
  spendMana: (color: ManaColor, usage?: ManaUsageKind, label?: string) => void
  spendManaCost: (costSymbols: string, label?: string) => boolean
  clearManaPool: () => void

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
  addTokenToCard: (cardId: string) => void
  toggleTokenTap: (tokenId: string) => void
  addTokenCounter: (tokenId: string) => void
  removeTokenCounter: (tokenId: string) => void
  removeToken: (tokenId: string) => void

  undo: () => void
  redo: () => void

  emitGameEvent: (event: import('../types/card').GameEvent) => void
  resolveTrigger: (triggerId: string) => void
  selectTarget: (triggerId: string, cardId: string) => void
  toggleProliferateTarget: (triggerId: string, cardId: string) => void
  confirmProliferate: (triggerId: string) => void
  toggleScryTarget: (triggerId: string, cardId: string) => void
  confirmScry: (triggerId: string) => void
  confirmSearchLibrary: (triggerId: string) => void
  selectSearchLibraryTarget: (triggerId: string, cardId: string) => void
  clearTriggerStack: () => void
  toggleCombat: () => void
  toggleAttacker: (cardId: string) => void
  assignBlocker: (attackerId: string, blockerId: string) => void
  resolveCombat: () => void
}

const persistedGameState = loadPersistedGameState()

export const useGameStore = create<GameState>((set, get) => {
  const undoContext = createUndoContext()

  const store: GameState = {
    ...persistedGameState,
    drawNotice: null,
    turnPrompt: null,
    broadcasting: false,
    undoStack: [],
    redoStack: [],
    triggerStack: [],
    combatState: { active: false, attackers: [], blockers: {} },
    currentPhase: 'beginning' as Phase,
    opponentLifeTotal: 40,
    activePlayer: 'player' as ActivePlayer,
    opponentManaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } as ManaPool,
    opponentPotentialMana: [] as PotentialManaSource[],
    opponentLandPlaysThisTurn: 0,

    ...createTurnPhases(set, get),
    ...createOpponentAI(set, get),
    ...createDeckActions(set, get),
    ...createCardMovement(set, get),
    ...createTokenActions(set, get),
    ...createManaActions(set, get),
    ...createCombatActions(set, get),
    ...createUndoActions(set),

    // Simple setters kept inline
    setBackground: (url) => set({ backgroundImage: url }),
    setCardScale: (scale) => set({ cardScale: scale }),
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
    setOpponentLife: (n) => set({ opponentLifeTotal: n }),

    // Trigger stack actions
    emitGameEvent: (event) =>
      set((state) => {
        const rules = getCachedCardRules()
        if (rules) reindexTriggers(state.cards, rules)
        const { stack, newTriggers } = buildTriggerInstances(event, state.triggerStack)
        if (newTriggers === 0) return {}
        return { triggerStack: stack }
      }),

    resolveTrigger: (triggerId) => resolveTriggerImpl(get, set, triggerId),

    selectTarget: (triggerId, cardId) => selectTargetImpl(get, set, triggerId, cardId),

    toggleProliferateTarget: (triggerId, cardId) => {
      const state = get()
      const trigger = state.triggerStack.find((t) => t.id === triggerId)
      if (!trigger) return
      const selected = trigger.selectedTargets ?? []
      const next = selected.includes(cardId)
        ? selected.filter((id) => id !== cardId)
        : [...selected, cardId]
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: next } : t,
        ),
      })
    },

    confirmProliferate: (triggerId) => {
      const state = get()
      const trigger = state.triggerStack.find((t) => t.id === triggerId)
      if (!trigger) return
      const targets = trigger.selectedTargets ?? []
      for (const cardId of targets) {
        const card = state.cards.find((c) => c.id === cardId)
        if (card) state.addCounter(cardId)
      }
      set({
        triggerStack: state.triggerStack.filter((t) => t.id !== triggerId),
      })
    },

    toggleScryTarget: (triggerId, cardId) => {
      const state = get()
      const trigger = state.triggerStack.find((t) => t.id === triggerId)
      if (!trigger) return
      const selected = trigger.selectedTargets ?? []
      const next = selected.includes(cardId)
        ? selected.filter((id) => id !== cardId)
        : [...selected, cardId]
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: next } : t,
        ),
      })
    },

    confirmScry: (triggerId) => {
      const state = get()
      const trigger = state.triggerStack.find((t) => t.id === triggerId)
      if (!trigger) return
      const params = trigger.ability.effect.params as Record<string, unknown>
      const scryAmount = (params.amount as number) ?? 1
      const bottomIds = trigger.selectedTargets ?? []

      const libraryCards = state.cards.filter((c) => c.zone === 'library')
      const topIds = libraryCards.slice(0, scryAmount).map((c) => c.id)
      const keepIds = topIds.filter((id) => !bottomIds.includes(id))

      const bottomCards = bottomIds.length > 0
        ? state.cards.filter((c) => bottomIds.includes(c.id))
        : []

      const bottomIdsSet = new Set(bottomIds)
      const keepIdsSet = new Set(keepIds)
      const skipIds = new Set([...topIds])

      const reordered = state.cards.flatMap((card) => {
        if (card.zone !== 'library') return [card]
        if (bottomIdsSet.has(card.id)) return []
        if (skipIds.has(card.id) && keepIdsSet.has(card.id)) return [card]
        if (skipIds.has(card.id)) return []
        return [card]
      })

      const result = [...reordered, ...bottomCards]

      set({
        cards: result,
        triggerStack: state.triggerStack.filter((t) => t.id !== triggerId),
      })
    },

    confirmSearchLibrary: (triggerId) => {
      const state = get()
      const trigger = state.triggerStack.find((t) => t.id === triggerId)
      if (!trigger) return
      const targets = trigger.selectedTargets ?? []
      if (targets.length === 0) {
        set({ triggerStack: state.triggerStack.filter((t) => t.id !== triggerId) })
        return
      }
      const cardId = targets[0]
      const card = state.cards.find((c) => c.id === cardId)
      if (card) {
        state.moveCard(cardId, 'battlefield')
        state.emitGameEvent({ type: 'etb', cardId, cardName: card.name })
      }
      set({
        triggerStack: state.triggerStack.filter((t) => t.id !== triggerId),
      })
    },

    selectSearchLibraryTarget: (triggerId, cardId) => {
      const state = get()
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: [cardId] } : t,
        ),
      })
    },

    clearTriggerStack: () => set({ triggerStack: [] }),
  }

  // Wrap undoable actions with undo history tracking
  const undoableActions = [
    'advanceTurn', 'setLife', 'setOpponentLife', 'loadOpponentDeck', 'advancePhase', 'castSpell',
    'announceEndTurn', 'overrideLandPlay', 'resolveConditionalEntry', 'discardForTurn',
    'addMana', 'spendMana', 'spendManaCost', 'clearManaPool', 'loadDeck', 'reshuffle', 'redeal',
    'drawCards', 'addCard', 'moveCard', 'reorderBattlefield', 'toggleTap', 'addCounter',
    'removeCounter', 'removeCard', 'revealCard', 'addToken', 'addTokenToCard', 'toggleTokenTap',
    'addTokenCounter', 'removeTokenCounter', 'removeToken', 'confirmProliferate', 'confirmScry',
    'confirmSearchLibrary', 'toggleCombat', 'toggleAttacker', 'assignBlocker', 'resolveCombat',
  ] as const

  for (const actionName of undoableActions) {
    const action = store[actionName] as unknown as (...args: unknown[]) => unknown
    ;(store as unknown as Record<string, unknown>)[actionName] = (...args: unknown[]) =>
      runUndoableAction(undoContext, set, get, () => action(...args))
  }

  return store
})

let applyingExternalState = false

useGameStore.subscribe((state) => {
  if (!applyingExternalState) persistGameState(state)
})

void hydratePersistedBackgroundState().then((hydrated) => {
  if (!hydrated) return
  const current = useGameStore.getState()
  const hasIndexedDbReferences = current.backgrounds.some((background) => isIndexedDbReference(background.dataUrl))
  const hasInlineBackgrounds = current.backgrounds.some((background) => !isIndexedDbReference(background.dataUrl))
  if (hasIndexedDbReferences && !hasInlineBackgrounds) {
    useGameStore.setState(hydrated)
  }
  persistGameState(useGameStore.getState())
})

function isIndexedDbReference(value: string): boolean {
  return value.startsWith('indexeddb:')
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    applyingExternalState = true
    useGameStore.setState(loadPersistedGameState())
    applyingExternalState = false
  })
}
