import type { BoardCard, ManaColor, ManaLogEntry, ManaPool, PotentialManaSource } from '../types/card'
import { resolveCardRules } from '../data/cardRules'
import { evaluateConditionalEntryTap } from '../data/cardFeatures'
import { canPayManaCost, shuffle, spendManaForCost, getCardPower } from '../utils/misc'
import type { GameState, GameSnapshot } from './gameStore'

export function resolveEntryRules(card: Pick<BoardCard, 'scryfallId' | 'name' | 'oracleText' | 'entryTapMode' | 'entersTapped' | 'entryTapRule'>) {
  const rules = resolveCardRules(card)
  return { entryTapRule: rules.entryTapRule, entersTapped: rules.entersTapped }
}

export interface CardPlayContext {
  landPlaysThisTurn: number
  manaPool: ManaPool
  cards: BoardCard[]
}

export interface CardPlayPreparation {
  entersBattlefield: boolean
  isLandPlay: boolean
  entryTapRule: 'never' | 'always' | 'conditional'
  entersTapped: boolean
  castFromCommand: boolean
  effectiveCost: string
  commanderTax: number
  canPayMana: boolean
  manaPoolAfterPlay: ManaPool
  blockReason: 'land' | 'etb' | null
}

export function prepareCardPlay(
  card: BoardCard,
  context: CardPlayContext,
  options: { ignoreLandLimit?: boolean; resolveConditionalEntry?: boolean } = {},
): CardPlayPreparation {
  const entersBattlefield = card.zone !== 'battlefield'
  const entryRules = entersBattlefield ? resolveEntryRules(card) : { entryTapRule: 'never' as const, entersTapped: false }
  const evaluatedConditionalTap = entersBattlefield && entryRules.entryTapRule === 'conditional'
    ? evaluateConditionalEntryTap(card, context.cards)
    : undefined
  const isLandPlay = entersBattlefield && card.type === 'land'
  const castFromCommand = entersBattlefield && card.zone === 'command'
  const previousTax = card.commanderTax ?? 0
  const commanderTax = castFromCommand ? previousTax + 1 : previousTax
  const taxExtra = castFromCommand && previousTax > 0 ? '{' + previousTax * 2 + '}' : ''
  const effectiveCost = castFromCommand ? (card.manaCost ?? '') + taxExtra : card.manaCost ?? ''
  const paysMana = entersBattlefield && card.type !== 'land' && Boolean(effectiveCost)
  const canPayMana = !paysMana || canPayManaCost(context.manaPool, effectiveCost)
  const manaPoolAfterPlay = paysMana ? spendManaForCost(context.manaPool, effectiveCost) : context.manaPool
  const landLimitReached = isLandPlay && card.zone === 'hand' && context.landPlaysThisTurn >= 1 && !options.ignoreLandLimit
  const entersTapped = options.resolveConditionalEntry
    ? entryRules.entersTapped
    : evaluatedConditionalTap ?? entryRules.entersTapped
  const conditionalEntry = entersBattlefield && entryRules.entryTapRule === 'conditional' &&
    evaluatedConditionalTap === undefined && !options.resolveConditionalEntry

  return {
    entersBattlefield,
    isLandPlay,
    entryTapRule: entryRules.entryTapRule,
    entersTapped,
    castFromCommand,
    effectiveCost,
    commanderTax,
    canPayMana,
    manaPoolAfterPlay,
    blockReason: landLimitReached ? 'land' : conditionalEntry ? 'etb' : null,
  }
}

export function resetAndDealCards(sourceCards: BoardCard[], openingHandSize = 0): BoardCard[] {
  const commanders = new Set(sourceCards.filter((card) => card.zone === 'command').map((card) => card.id))
  const resetCards = sourceCards.map((card) => ({
    ...card,
    zone: commanders.has(card.id) ? 'command' as const : 'library' as const,
    tapped: false,
    counters: 0,
    damage: 0,
    powerBoost: 0,
    toughnessBoost: 0,
    revealed: commanders.has(card.id),
    commanderTax: card.commanderTax ?? 0,
  }))

  let remaining = Math.max(0, Math.floor(openingHandSize))
  return shuffle(resetCards).map((card) => {
    if (remaining > 0 && card.zone === 'library') {
      remaining--
      return { ...card, zone: 'hand' as const, revealed: false }
    }
    return card
  })
}

export function moveCastSpellsToGraveyard(cards: BoardCard[]): BoardCard[] {
  return cards.map((card) => card.zone === 'battlefield' && (card.type === 'instant' || card.type === 'sorcery')
    ? { ...card, zone: 'graveyard' as const, tapped: false, revealed: true }
    : card)
}

export function emptyManaPool(): ManaPool {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
}

export function isAura(card: Pick<BoardCard, 'type' | 'typeLine'>): boolean {
  return card.type === 'enchantment' && /\baura\b/i.test(card.typeLine ?? '')
}

/**
 * Attach unattached battlefield auras to a friendly creature (the strongest
 * one by default, or a preferred target). Auras with no valid creature die.
 * With `deferUnattached`, unattached auras are left untouched for a caller
 * that wants to prompt the player first.
 */
export function attachAuras(
  cards: BoardCard[],
  options: { deferUnattached?: boolean; preferredTargetId?: string } = {},
): BoardCard[] {
  let changed = false
  const updated = cards.map((card) => {
    if (!isAura(card) || card.zone !== 'battlefield' || card.enchantsCardId) return card
    if (options.deferUnattached) return card
    const owner = card.owner ?? 'player'
    const candidates = cards.filter(
      (c) => c.zone === 'battlefield' && (c.owner ?? 'player') === owner && c.type === 'creature' && c.id !== card.id,
    )
    const preferred = options.preferredTargetId
      ? candidates.find((c) => c.id === options.preferredTargetId)
      : undefined
    const target = preferred ?? candidates.sort((a, b) => getCardPower(b) - getCardPower(a))[0]
    if (target) {
      changed = true
      return { ...card, enchantsCardId: target.id, enchantsCardName: target.name }
    }
    changed = true
    return { ...card, zone: 'graveyard' as const, revealed: true }
  })
  return changed ? updated : cards
}

const MAX_UNDO = 50

let undoTransactionDepth = 0

export function beginUndoTransaction() {
  undoTransactionDepth++
}

export function endUndoTransaction() {
  undoTransactionDepth = Math.max(0, undoTransactionDepth - 1)
}

export function takeSnapshot(state: GameState): GameSnapshot {
  return {
    cards: state.cards.map((card) => ({ ...card })),
    manaPool: { ...state.manaPool },
    potentialMana: state.potentialMana.map((source) => ({ ...source })),
    manaLog: [...state.manaLog],
    effectHistory: [...state.effectHistory],
    tokens: state.tokens.map((token) => ({ ...token })),
    lifeTotal: state.lifeTotal,
    opponentLifeTotal: state.opponentLifeTotal,
    turn: state.turn,
    landPlaysThisTurn: state.landPlaysThisTurn,
    drawNotice: state.drawNotice,
    turnAnnouncement: state.turnAnnouncement,
    turnPrompt: state.turnPrompt,
    currentPhase: state.currentPhase,
    combatState: {
      active: state.combatState.active,
      attackers: [...state.combatState.attackers],
      blockers: Object.fromEntries(
        Object.entries(state.combatState.blockers).map(([attackerId, blockerIds]) => [attackerId, [...blockerIds]]),
      ),
    },
    activePlayer: state.activePlayer,
    opponentManaPool: { ...state.opponentManaPool },
    opponentPotentialMana: state.opponentPotentialMana.map((source) => ({ ...source })),
    opponentLandPlaysThisTurn: state.opponentLandPlaysThisTurn,
  }
}

export function pushUndo(state: GameState) {
  // Legacy action-local call sites remain safe while an outer action transaction
  // owns the single snapshot for the whole user action.
  if (undoTransactionDepth > 0) {
    return { undoStack: state.undoStack, redoStack: state.redoStack }
  }
  return {
    undoStack: [...state.undoStack.slice(-(MAX_UNDO - 1)), takeSnapshot(state)],
    redoStack: [],
  }
}

export function pushUndoSnapshot(state: GameState, snapshot: GameSnapshot) {
  return {
    undoStack: [...state.undoStack.slice(-(MAX_UNDO - 1)), snapshot],
    redoStack: [],
  }
}

export function generatedManaState(
  state: Pick<GameState, 'manaPool' | 'manaLog' | 'turn'>,
  color: ManaColor,
  amount: number,
  source?: { cardId: string; cardName: string },
) {
  const entry: ManaLogEntry = {
    id: crypto.randomUUID(),
    turn: state.turn,
    direction: 'generated',
    color,
    amount,
    sourceCardId: source?.cardId,
    sourceCardName: source?.cardName,
  }
  return {
    manaPool: { ...state.manaPool, [color]: state.manaPool[color] + amount },
    manaLog: [...state.manaLog, entry].slice(-250),
  }
}

export function advanceTurnState(state: GameState): Partial<GameState> {
  const cards = moveCastSpellsToGraveyard(state.cards).map((card) => {
    if (card.zone === 'battlefield') return { ...card, tapped: false, damage: 0, powerBoost: 0, toughnessBoost: 0 }
    return card
  })
  return {
    turn: state.turn + 1,
    landPlaysThisTurn: 0,
    manaPool: emptyManaPool(),
    potentialMana: [] as PotentialManaSource[],
    cards,
    drawNotice: null,
    turnAnnouncement: null,
    turnPrompt: null,
  }
}
