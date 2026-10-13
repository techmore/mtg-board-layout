import type { BoardCard, ManaColor, ManaLogEntry, ManaPool } from '../types/card'
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
  // Convention shared with castSpell: commanderTax stores 2× prior casts and
  // is incremented by 2 per cast — the tax charged is exactly `{tax}`.
  const commanderTax = castFromCommand ? previousTax + 2 : previousTax
  const taxExtra = castFromCommand && previousTax > 0 ? '{' + previousTax + '}' : ''
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
    minusCounters: 0,
    damage: 0,
    powerBoost: 0,
    toughnessBoost: 0,
    keywordBoosts: undefined,
    originalOwner: undefined,
    controlUntilTurnEnd: undefined,
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

export function isEquipment(card: Pick<BoardCard, 'type' | 'typeLine'>): boolean {
  return card.type === 'artifact' && /\bequipment\b/i.test(card.typeLine ?? '')
}

/** Aura or equipment: a permanent that attaches to a creature. */
export function isAttachable(card: Pick<BoardCard, 'type' | 'typeLine'>): boolean {
  return isAura(card) || isEquipment(card)
}

/**
 * Cards that moved into the graveyard between two board snapshots (deaths,
 * sacrifices, mills, discards). The per-side intake count feeds Fraying
 * Sanity's end-step mill ("X = cards put into their graveyard this turn").
 */
export function graveyardIntakeDelta(before: BoardCard[], after: BoardCard[]): { player: number; opponent: number } {
  const prevZone = new Map(before.map((card) => [card.id, card.zone]))
  const delta = { player: 0, opponent: 0 }
  for (const card of after) {
    if (card.zone !== 'graveyard') continue
    const was = prevZone.get(card.id)
    if (!was || was === 'graveyard') continue
    const owner = (card.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
    delta[owner]++
  }
  return delta
}

/**
 * Merge a board transition into the running intake counters. Spread the
 * result into the same set() that installs `after` — an empty delta returns {}
 * so untouched state keeps referential stability.
 */
export function withGraveyardIntake(
  state: Pick<GameState, 'cards' | 'graveyardIntake'>,
  after: BoardCard[],
): { graveyardIntake?: { player: number; opponent: number } } {
  const delta = graveyardIntakeDelta(state.cards, after)
  if (delta.player === 0 && delta.opponent === 0) return {}
  const current = state.graveyardIntake ?? { player: 0, opponent: 0 }
  return { graveyardIntake: { player: current.player + delta.player, opponent: current.opponent + delta.opponent } }
}

/**
 * Attach unattached battlefield auras to a friendly creature (the strongest
 * one by default, or a preferred target). Auras with no valid creature die.
 * With `deferUnattached`, unattached auras are left untouched for a caller
 * that wants to prompt the player first.
 */
export function updateCard(cards: BoardCard[], id: string, patch: Partial<BoardCard>): BoardCard[] {
  return cards.map((c) => (c.id === id ? { ...c, ...patch } : c))
}

export function attachAuras(
  cards: BoardCard[],
  options: { deferUnattached?: boolean; preferredTargetId?: string } = {},
): BoardCard[] {
  let changed = false
  const updated = cards.map((card) => {
    if (!isAttachable(card) || card.zone !== 'battlefield' || card.enchantsCardId) return card
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
    // Unattached auras die; equipment simply stays unattached on the board.
    if (isEquipment(card)) return card
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
    playerSpellsCastThisTurn: state.playerSpellsCastThisTurn ?? 0,
    opponentSpellsCastThisTurn: state.opponentSpellsCastThisTurn ?? 0,
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
    commanderDamage: { ...state.commanderDamage },
    energyCounters: state.energyCounters,
    opponentEnergyCounters: state.opponentEnergyCounters,
    radCounters: state.radCounters,
    opponentRadCounters: state.opponentRadCounters,
    experienceCounters: state.experienceCounters,
    opponentExperienceCounters: state.opponentExperienceCounters,
    triggerStack: state.triggerStack.map((trigger) => ({
      ...trigger,
      context: { ...trigger.context },
      selectedTargets: trigger.selectedTargets ? [...trigger.selectedTargets] : undefined,
    })),
    wardPrompt: state.wardPrompt ? { ...state.wardPrompt } : null,
    auraPrompt: state.auraPrompt ? { ...state.auraPrompt, candidates: state.auraPrompt.candidates.map((candidate) => ({ ...candidate })) } : null,
    gameOver: state.gameOver,
    monarch: state.monarch,
    aiResponsePending: state.aiResponsePending,
    graveyardIntake: state.graveyardIntake
      ? { player: state.graveyardIntake.player, opponent: state.graveyardIntake.opponent }
      : { player: 0, opponent: 0 },
    graveyardCast: state.graveyardCast ? { ...state.graveyardCast } : null,
  }
}

export function pushUndo(state: GameState) {
  // Legacy action-local call sites remain safe while an outer action transaction
  // owns the single snapshot for the whole user action.
  if (undoTransactionDepth > 0) {
    return { undoStack: state.undoStack, redoStack: state.redoStack }
  }
  // The AI turn is asynchronous and not undoable; capturing it would let undo
  // restore activePlayer to 'opponent' with no AI timers scheduled.
  if (state.activePlayer === 'opponent') {
    return { undoStack: state.undoStack, redoStack: state.redoStack }
  }
  return {
    undoStack: [...state.undoStack.slice(-(MAX_UNDO - 1)), takeSnapshot(state)],
    redoStack: [],
  }
}

let aiTurnActive = false
/** Marks whether the AI's asynchronous turn is currently running. The whole AI
 *  turn is not undoable — undoing it could restore an opponent-turn state with
 *  no AI timers scheduled (a soft-lock). */
export function setAITurnActive(active: boolean): void {
  aiTurnActive = active
}
export function isAITurnActive(): boolean {
  return aiTurnActive
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
