import { resolveCardRules } from '../data/cardRules'
import { getCardTypeFeatures } from '../data/cardFeatures'
import type { BackgroundOption } from '../types/card'
import { emptyManaPool, resolveEntryRules } from './gameRules'
import { hydrateBackgrounds, indexedDbReference, isIndexedDbBackground, saveBackgroundsToStorage } from '../services/backgroundStorage'
import type { GameSnapshot, GameState, Phase } from './gameStore'
import { PHASES } from './gameStore'
import {
  isBoardCard, isToken, isManaPool, isPotentialManaSource, isCardScale,
  isManaLogEntry, isEffectHistoryEntry, isBackgroundOption, isOverlayState,
  isTriggerInstance, isTurnAnnouncement,
} from './gameStateValidation'

export const STORAGE_KEY = 'mtg-board-state'

/**
 * Persistence schema version. The saved payload is `{ schemaVersion, state }`;
 * loading an older/unknown version resets to defaults instead of silently
 * misreading the shape (legacy saves without a wrapper load as-is — this
 * baseline predates versioning).
 */
export const SCHEMA_VERSION = 1

interface VersionedPayload {
  schemaVersion?: number
  state?: unknown
}

export type PersistedGameState = Pick<
  GameState,
  'activeDeckId' | 'lifeTotal' | 'cards' | 'cardScale' | 'manaPool' | 'potentialMana' | 'manaLog' | 'effectHistory' | 'tokens' | 'backgroundImage' | 'backgrounds' | 'rollHistory' | 'overlay' | 'showOpponent' | 'opponentName' | 'aiFixedDeck' | 'opponentLifeTotal' | 'energyCounters' | 'opponentEnergyCounters' | 'radCounters' | 'opponentRadCounters' | 'experienceCounters' | 'opponentExperienceCounters' | 'turnPlayerMs' | 'turnOpponentMs' | 'turn' | 'currentPhase' | 'landPlaysThisTurn' | 'playerSpellsCastThisTurn' | 'opponentSpellsCastThisTurn' | 'turnAnnouncement' | 'triggerStack' | 'commanderDamage'
>

export const defaultGameState: PersistedGameState & { undoStack: GameSnapshot[]; redoStack: GameSnapshot[] } = {
  activeDeckId: null,
  lifeTotal: 40,
  cards: [],
  cardScale: 1,
  manaPool: emptyManaPool(),
  potentialMana: [],
  manaLog: [],
  effectHistory: [],
  tokens: [],
  backgroundImage: null,
  backgrounds: [],
  rollHistory: [],
  overlay: { type: null },
  showOpponent: false,
  opponentName: null,
  aiFixedDeck: true,
  commanderDamage: {},
  energyCounters: 0,
  opponentEnergyCounters: 0,
  radCounters: 0,
  opponentRadCounters: 0,
  experienceCounters: 0,
  opponentExperienceCounters: 0,
  turnPlayerMs: 0,
  turnOpponentMs: 0,
  opponentLifeTotal: 40,
  turn: 1,
  currentPhase: 'beginning' as Phase,
  landPlaysThisTurn: 0,
  playerSpellsCastThisTurn: 0,
  opponentSpellsCastThisTurn: 0,
  turnAnnouncement: null,
  triggerStack: [],
  undoStack: [],
  redoStack: [],
}

export function loadPersistedGameState(): PersistedGameState {
  try {
    if (typeof localStorage === 'undefined') return defaultGameState
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultGameState
    const parsed = JSON.parse(raw) as Partial<PersistedGameState> & VersionedPayload
    if (!parsed || typeof parsed !== 'object') return defaultGameState
    // Versioned payload: only the current version loads. Anything else (older
    // or newer shape) resets rather than guessing at a half-compatible read.
    if (parsed.schemaVersion !== undefined && parsed.state && typeof parsed.state === 'object') {
      if (parsed.schemaVersion !== SCHEMA_VERSION) {
        console.warn(`[gameStore] Saved state schema v${parsed.schemaVersion} != v${SCHEMA_VERSION} — starting fresh.`)
        return defaultGameState
      }
      return loadStatePayload(parsed.state as Partial<PersistedGameState>)
    }
    // Legacy (unversioned) save: the state object was stored directly.
    return loadStatePayload(parsed)
  } catch {
    return defaultGameState
  }
}

function loadStatePayload(parsed: Partial<PersistedGameState>): PersistedGameState {
    // IndexedDB references are storage keys, not browser-loadable image URLs.
    // Keep the initial state renderable; the async hydration below replaces this
    // with the stored data URL once IndexedDB has been read.
    const backgroundImage = typeof parsed.backgroundImage === 'string' && !isIndexedDbBackground(parsed.backgroundImage)
      ? parsed.backgroundImage
      : null
    const savedBackgrounds = Array.isArray(parsed.backgrounds) ? parsed.backgrounds.filter(isBackgroundOption) : []
    const backgrounds = backgroundImage && !savedBackgrounds.some((background) => background.dataUrl === backgroundImage)
      ? [{ id: 'current-background', name: 'Current background', dataUrl: backgroundImage }, ...savedBackgrounds]
      : savedBackgrounds
    const rawCards: unknown[] = Array.isArray(parsed.cards) ? parsed.cards : []
    const validCards = rawCards.filter(isBoardCard)
    if (validCards.length < rawCards.length) {
      console.warn(
        `[gameStore] Dropped ${rawCards.length - validCards.length} invalid card(s) from saved state.`,
        rawCards.filter((c) => !isBoardCard(c)),
      )
    }
    const savedCards = validCards.length > 0 ? validCards : defaultGameState.cards
    const cards = savedCards.map((card) => {
      const rules = resolveCardRules(card)
      const entryRules = resolveEntryRules(card)
      const features = getCardTypeFeatures(typeof card.typeLine === 'string' ? card.typeLine : '', card.name)
      return {
        ...card,
        ...features,
        subtypes: Array.isArray(card.subtypes) && card.subtypes.length > 0 ? card.subtypes : features.subtypes,
        isBasicLand: typeof card.isBasicLand === 'boolean' ? card.isBasicLand || features.isBasicLand : features.isBasicLand,
        manaProduction: card.manaProduction ?? rules.manaProduction,
        entryTapMode: rules.entryTapMode,
        entryTapRule: entryRules.entryTapRule,
        entersTapped: entryRules.entersTapped,
      }
    })
    return {
      activeDeckId: typeof parsed.activeDeckId === 'string' ? parsed.activeDeckId : null,
      lifeTotal: Number.isFinite(parsed.lifeTotal) ? parsed.lifeTotal! : defaultGameState.lifeTotal,
      cards,
      cardScale: isCardScale(parsed.cardScale) ? parsed.cardScale : defaultGameState.cardScale,
      manaPool: isManaPool(parsed.manaPool) ? parsed.manaPool : defaultGameState.manaPool,
      potentialMana: Array.isArray(parsed.potentialMana) ? parsed.potentialMana.filter(isPotentialManaSource) : defaultGameState.potentialMana,
      manaLog: Array.isArray(parsed.manaLog) ? parsed.manaLog.filter(isManaLogEntry).slice(-250) : defaultGameState.manaLog,
      effectHistory: Array.isArray(parsed.effectHistory) ? parsed.effectHistory.filter(isEffectHistoryEntry).slice(-250) : defaultGameState.effectHistory,
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens.filter(isToken) : defaultGameState.tokens,
      backgroundImage,
      backgrounds,
      rollHistory: Array.isArray(parsed.rollHistory) ? parsed.rollHistory.filter((entry): entry is string => typeof entry === 'string') : defaultGameState.rollHistory,
      overlay: isOverlayState(parsed.overlay) ? parsed.overlay : defaultGameState.overlay,
      showOpponent: typeof parsed.showOpponent === 'boolean' ? parsed.showOpponent : defaultGameState.showOpponent,
      opponentName: typeof parsed.opponentName === 'string' ? parsed.opponentName : defaultGameState.opponentName,
      aiFixedDeck: typeof parsed.aiFixedDeck === 'boolean' ? parsed.aiFixedDeck : defaultGameState.aiFixedDeck,
      turnPlayerMs: Number.isFinite(parsed.turnPlayerMs) ? Math.max(0, parsed.turnPlayerMs!) : defaultGameState.turnPlayerMs,
      turnOpponentMs: Number.isFinite(parsed.turnOpponentMs) ? Math.max(0, parsed.turnOpponentMs!) : defaultGameState.turnOpponentMs,
      opponentLifeTotal: Number.isFinite(parsed.opponentLifeTotal) ? parsed.opponentLifeTotal! : defaultGameState.opponentLifeTotal,
      energyCounters: Number.isFinite(parsed.energyCounters) ? Math.max(0, parsed.energyCounters!) : defaultGameState.energyCounters,
      opponentEnergyCounters: Number.isFinite(parsed.opponentEnergyCounters) ? Math.max(0, parsed.opponentEnergyCounters!) : defaultGameState.opponentEnergyCounters,
      radCounters: Number.isFinite(parsed.radCounters) ? Math.max(0, parsed.radCounters!) : defaultGameState.radCounters,
      opponentRadCounters: Number.isFinite(parsed.opponentRadCounters) ? Math.max(0, parsed.opponentRadCounters!) : defaultGameState.opponentRadCounters,
      experienceCounters: Number.isFinite(parsed.experienceCounters) ? Math.max(0, parsed.experienceCounters!) : defaultGameState.experienceCounters,
      opponentExperienceCounters: Number.isFinite(parsed.opponentExperienceCounters) ? Math.max(0, parsed.opponentExperienceCounters!) : defaultGameState.opponentExperienceCounters,
      turn: Number.isFinite(parsed.turn) ? Math.max(1, parsed.turn!) : defaultGameState.turn,
      currentPhase: PHASES.includes(parsed.currentPhase as any) ? parsed.currentPhase as Phase : defaultGameState.currentPhase,
      landPlaysThisTurn: Number.isFinite(parsed.landPlaysThisTurn) ? Math.max(0, Math.floor(parsed.landPlaysThisTurn!)) : defaultGameState.landPlaysThisTurn,
      playerSpellsCastThisTurn: Number.isFinite(parsed.playerSpellsCastThisTurn) ? Math.max(0, Math.floor(parsed.playerSpellsCastThisTurn!)) : defaultGameState.playerSpellsCastThisTurn,
      opponentSpellsCastThisTurn: Number.isFinite(parsed.opponentSpellsCastThisTurn) ? Math.max(0, Math.floor(parsed.opponentSpellsCastThisTurn!)) : defaultGameState.opponentSpellsCastThisTurn,
      turnAnnouncement: isTurnAnnouncement(parsed.turnAnnouncement) ? parsed.turnAnnouncement : null,
      triggerStack: Array.isArray(parsed.triggerStack) ? parsed.triggerStack.filter(isTriggerInstance) : defaultGameState.triggerStack,
      commanderDamage: parsed.commanderDamage && typeof parsed.commanderDamage === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.commanderDamage as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0),
          ) as Record<string, number>
        : defaultGameState.commanderDamage,
    }
}

let lastSavedBackgrounds: BackgroundOption[] | null = null

export function persistGameState(state: GameState) {
  try {
    if (typeof localStorage === 'undefined') return
    const useIndexedDb = typeof indexedDB !== 'undefined'
    if (useIndexedDb) {
      // Backgrounds only change identity when set() touches them; skip the
      // (potentially multi-MB) IndexedDB write on unrelated state changes.
      if (state.backgrounds !== lastSavedBackgrounds) {
        lastSavedBackgrounds = state.backgrounds
        void saveBackgroundsToStorage(state.backgrounds)
      }
    }
    const storedBackgrounds = useIndexedDb
      ? state.backgrounds.map((background) => ({ ...background, dataUrl: indexedDbReference(background.id) }))
      : state.backgrounds
    const activeBackground = state.backgrounds.find((background) => background.dataUrl === state.backgroundImage)
    const persisted: PersistedGameState = {
      activeDeckId: state.activeDeckId,
      lifeTotal: state.lifeTotal,
      cards: state.cards,
      cardScale: state.cardScale,
      manaPool: state.manaPool,
      potentialMana: state.potentialMana,
      manaLog: state.manaLog,
      effectHistory: state.effectHistory,
      tokens: state.tokens,
      backgroundImage: useIndexedDb && activeBackground ? indexedDbReference(activeBackground.id) : state.backgroundImage,
      backgrounds: storedBackgrounds,
      rollHistory: state.rollHistory,
      overlay: state.overlay,
      showOpponent: state.showOpponent,
      opponentName: state.opponentName,
      aiFixedDeck: state.aiFixedDeck,
      turnPlayerMs: state.turnPlayerMs,
      turnOpponentMs: state.turnOpponentMs,
      opponentLifeTotal: state.opponentLifeTotal,
      energyCounters: state.energyCounters,
      opponentEnergyCounters: state.opponentEnergyCounters,
      radCounters: state.radCounters,
      opponentRadCounters: state.opponentRadCounters,
      experienceCounters: state.experienceCounters,
      opponentExperienceCounters: state.opponentExperienceCounters,
      turn: state.turn,
      currentPhase: state.currentPhase,
      landPlaysThisTurn: state.landPlaysThisTurn,
      playerSpellsCastThisTurn: state.playerSpellsCastThisTurn ?? 0,
      opponentSpellsCastThisTurn: state.opponentSpellsCastThisTurn ?? 0,
      turnAnnouncement: state.turnAnnouncement,
      triggerStack: state.triggerStack,
      commanderDamage: state.commanderDamage,
    }
    const serialized = JSON.stringify({ schemaVersion: SCHEMA_VERSION, state: persisted })
    const sizeMB = new Blob([serialized]).size / (1024 * 1024)
    if (sizeMB > 4) {
      console.warn(`[gameStore] Saved state is ${sizeMB.toFixed(1)} MB — approaching localStorage ~5 MB limit.`)
    }
    localStorage.setItem(STORAGE_KEY, serialized)
  } catch (err) {
    console.error('[gameStore] Failed to save game state. localStorage may be full.', err)
  }
}

export async function hydratePersistedBackgroundState(): Promise<{ backgrounds: BackgroundOption[]; backgroundImage: string | null } | null> {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const wrapper = JSON.parse(raw) as Partial<PersistedGameState> & { state?: Partial<PersistedGameState>; schemaVersion?: number }
    const parsed = (wrapper.schemaVersion !== undefined && wrapper.state && typeof wrapper.state === 'object' ? wrapper.state : wrapper) as Partial<PersistedGameState>
    const backgrounds = Array.isArray(parsed.backgrounds) ? parsed.backgrounds.filter(isBackgroundOption) : []
    return hydrateBackgrounds(backgrounds, typeof parsed.backgroundImage === 'string' ? parsed.backgroundImage : null)
  } catch {
    return null
  }
}
