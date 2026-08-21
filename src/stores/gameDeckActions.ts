import type { BoardCard } from '../types/card'
import type { GameState } from './gameStore'
import { shuffle, classifyType, canPayManaCost, getCardPower } from '../utils/misc'
import { emptyManaPool, isAura, moveCastSpellsToGraveyard, pushUndo, resetAndDealCards, setAITurnActive } from './gameRules'
import { resolveCardRules } from '../data/cardRules'
import { getCardTypeFeatures } from '../data/cardFeatures'
import { localCardImage } from '../data/localCardImages'
import { cacheDeckImages } from '../services/cardImageCache'
import { enqueueSpellAbilities } from './spellResolution'
import { useToastStore } from './toastStore'
import { aiCastInstant } from './gameOpponentAI'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

let aiCastResponseScheduled = false

/**
 * Give the AI a short instant-speed window after the player casts a spell so
 * it can respond (combat tricks, removal, protection).
 */
function scheduleAICastResponse(set: SetFn, get: () => GameState) {
  if (aiCastResponseScheduled) return
  aiCastResponseScheduled = true
  setTimeout(() => {
    aiCastResponseScheduled = false
    const current = get()
    if (current.gameOver || current.activePlayer !== 'player') return
    aiCastInstant(set, get)
  }, 2000)
}

export function createDeckActions(set: SetFn, get: () => GameState): Pick<GameState, 'loadDeck' | 'reshuffle' | 'redeal' | 'drawCards' | 'castSpell'> {
  return {
    loadDeck: (commanderNames, deckCards, deckId) => {
      const preState = get()
      // A new game always resets the undo suppression from any AI turn.
      setAITurnActive(false)
      const cards: BoardCard[] = []

      for (const name of commanderNames) {
        const match = deckCards.find((c) => c.name === name)
        if (match) {
          const rules = resolveCardRules(match)
          const features = getCardTypeFeatures(match.typeLine, match.name)
          cards.push({
            id: crypto.randomUUID(),
            scryfallId: match.scryfallId,
            name: match.name,
            imageUri: localCardImage(match.scryfallId) ?? match.imageUri,
            manaCost: rules.manaCost,
            manaValue: rules.manaValue,
            oracleText: match.oracleText,
            ...features,
            manaProduction: rules.manaProduction,
            entryTapMode: rules.entryTapMode,
            entersTapped: rules.entersTapped,
            entryTapRule: rules.entryTapRule,
            zone: 'command',
            tapped: false,
            counters: 0,
            minusCounters: 0,
            keywordBoosts: undefined,
            type: classifyType(match.typeLine),
            revealed: true,
            commanderTax: 0,
            isCommander: true,
          })
        }
      }

      for (const dc of deckCards) {
        if (commanderNames.includes(dc.name)) continue
        const rules = resolveCardRules(dc)
        const features = getCardTypeFeatures(dc.typeLine, dc.name)
        for (let i = 0; i < dc.quantity; i++) {
          cards.push({
            id: crypto.randomUUID(),
            scryfallId: dc.scryfallId,
            name: dc.name,
            imageUri: localCardImage(dc.scryfallId) ?? dc.imageUri,
            manaCost: rules.manaCost,
            manaValue: rules.manaValue,
            oracleText: dc.oracleText,
            ...features,
            manaProduction: rules.manaProduction,
            entryTapMode: rules.entryTapMode,
            entersTapped: rules.entersTapped,
            entryTapRule: rules.entryTapRule,
            zone: 'library',
            tapped: false,
            counters: 0,
            minusCounters: 0,
            keywordBoosts: undefined,
            type: classifyType(dc.typeLine),
            revealed: false,
          })
        }
      }

      cacheDeckImages(deckCards)
      set({ ...pushUndo(preState), activeDeckId: deckId ?? null, cards: shuffle(cards), manaPool: emptyManaPool(), potentialMana: [], manaLog: [], effectHistory: [], lifeTotal: 40, tokens: [], rollHistory: [], overlay: { type: null }, turn: 1, turnPlayerMs: 0, turnOpponentMs: 0, landPlaysThisTurn: 0, playerSpellsCastThisTurn: 0, opponentSpellsCastThisTurn: 0, drawNotice: null, turnAnnouncement: null, turnPrompt: null, commanderDamage: {}, gameOver: null, monarch: null, aiResponsePending: null, activePlayer: 'player', currentPhase: 'beginning', opponentLifeTotal: 40, energyCounters: 0, opponentEnergyCounters: 0, radCounters: 0, opponentRadCounters: 0, experienceCounters: 0, opponentExperienceCounters: 0, opponentManaPool: emptyManaPool(), opponentPotentialMana: [], opponentLandPlaysThisTurn: 0, showOpponent: false, opponentName: null, triggerStack: [], auraPrompt: null, wardPrompt: null, graveyardIntake: { player: 0, opponent: 0 }, lastResolvedAbility: null, combatState: { active: false, attackers: [], blockers: {} } })
    },

    reshuffle: () =>
      set((state) => {
        const undo = pushUndo(state)
        setAITurnActive(false)
        return {
          ...undo,
          cards: resetAndDealCards(state.cards),
          manaPool: emptyManaPool(),
          potentialMana: [],
          manaLog: [],
          effectHistory: [],
          lifeTotal: 40,
          turnPlayerMs: 0,
          turnOpponentMs: 0,
          tokens: [],
          rollHistory: [],
          overlay: { type: null },
          turn: 1,
          landPlaysThisTurn: 0,
          playerSpellsCastThisTurn: 0,
          opponentSpellsCastThisTurn: 0,
          drawNotice: null,
          turnAnnouncement: null,
          turnPrompt: null,
          gameOver: null,
          monarch: null,
          aiResponsePending: null,
          commanderDamage: {},
          activePlayer: 'player' as const,
          currentPhase: 'beginning' as const,
          opponentLifeTotal: 40,
          energyCounters: 0,
          opponentEnergyCounters: 0,
          radCounters: 0,
          opponentRadCounters: 0,

          experienceCounters: 0,

          opponentExperienceCounters: 0,
          opponentManaPool: emptyManaPool(),
          opponentPotentialMana: [],
          opponentLandPlaysThisTurn: 0,
        }
      }),

    redeal: (openingHandSize = 7) =>
      set((state) => {
        const cards = resetAndDealCards(state.cards, openingHandSize)
        const undo = pushUndo(state)
        setAITurnActive(false)
        return {
          ...undo,
          cards,
          manaPool: emptyManaPool(),
          potentialMana: [],
          manaLog: [],
          effectHistory: [],
          lifeTotal: 40,
          turnPlayerMs: 0,
          turnOpponentMs: 0,
          tokens: [],
          rollHistory: [],
          overlay: { type: null },
          turn: 1,
          landPlaysThisTurn: 0,
          playerSpellsCastThisTurn: 0,
          opponentSpellsCastThisTurn: 0,
          drawNotice: { id: Date.now(), count: cards.filter((card) => card.zone === 'hand').length, cardNames: cards.filter((card) => card.zone === 'hand').map((c) => c.name) },
          turnAnnouncement: null,
          turnPrompt: null,
          gameOver: null,
          monarch: null,
          aiResponsePending: null,
          commanderDamage: {},
          activePlayer: 'player' as const,
          currentPhase: 'beginning' as const,
          opponentLifeTotal: 40,
          energyCounters: 0,
          opponentEnergyCounters: 0,
          radCounters: 0,
          opponentRadCounters: 0,

          experienceCounters: 0,

          opponentExperienceCounters: 0,
          opponentManaPool: emptyManaPool(),
          opponentPotentialMana: [],
          opponentLandPlaysThisTurn: 0,
        }
      }),

    drawCards: (count = 1) => {
      const libraryCount = get().cards.filter((c) => c.zone === 'library').length
      set((state) => {
        let remaining = Math.max(0, Math.floor(count))
        let drawnCount = 0
        const cardNames: string[] = []
        const cards = state.cards.map((card) => {
          if (remaining > 0 && card.zone === 'library') {
            remaining--
            drawnCount++
            cardNames.push(card.name)
            return { ...card, zone: 'hand' as const, revealed: false }
          }
          return card
        })
        const undo = pushUndo(state)
        const deckedOut = count > 0 && drawnCount === 0 && libraryCount === 0
        return {
          ...undo,
          cards,
          drawNotice: drawnCount > 0 ? { id: Date.now(), count: drawnCount, cardNames } : state.drawNotice,
          ...(deckedOut
            ? {
                gameOver: { winner: 'opponent' },
                turnPrompt: null,
                turnAnnouncement: { id: Date.now(), text: 'DEFEATED — library empty' },
              }
            : {}),
        }
      })
      get().emitGameEvent({ type: 'card_drawn', count: Math.min(count, libraryCount) })
    },

    castSpell: (cardId) => {
      const state = get()
      const card = state.cards.find((c) => c.id === cardId)
      if (!card || (card.zone !== 'hand' && card.zone !== 'command')) return false
      const isLand = card.type === 'land'
      if (isLand && card.zone === 'hand') {
        if (state.landPlaysThisTurn >= 1) {
          useToastStore.getState().push('Already played a land this turn', 'error')
          return false
        }
        // Conditional enters-tapped lands ("enters tapped unless ...") need a
        // player choice before entering — same prompt as the drag-drop path.
        if (card.entryTapRule === 'conditional') {
          set((prev) => ({
            ...pushUndo(prev),
            turnPrompt: { id: Date.now(), action: 'end', reason: 'etb', cardId },
          }))
          return true
        }
        // Play through the same rules pipeline as drag-drop: enters-tapped
        // rules apply and landfall triggers fire.
        set((prev) => ({
          ...pushUndo(prev),
          cards: moveCastSpellsToGraveyard(prev.cards.map((c) =>
            c.id === cardId
              ? { ...c, zone: 'battlefield' as const, tapped: c.entersTapped === true, revealed: false, enteredAtTurn: get().turn }
              : c
          )),
          landPlaysThisTurn: prev.landPlaysThisTurn + 1,
        }))
        get().emitGameEvent({ type: 'etb', cardId, cardName: card.name })
        get().emitGameEvent({ type: 'landfall', cardId, cardName: card.name })
        return true
      }
      const fromCommand = card.zone === 'command'
      const tax = fromCommand ? (card.commanderTax ?? 0) : 0
      const baseCost = card.manaCost ?? ''
      const fullCost = tax > 0 ? `${baseCost}{${tax}}` : baseCost
      if (fullCost && !canPayManaCost(state.manaPool, fullCost)) {
        useToastStore.getState().push(`Not enough mana for ${card.name} (${fullCost})`, 'error')
        return false
      }
      if (fullCost) get().spendManaCost(fullCost, `${fromCommand ? 'Commander: ' : ''}${card.name} (${fullCost})`)
      const updated = moveCastSpellsToGraveyard([
        ...state.cards.filter((c) => c.id !== cardId),
        { ...card, zone: 'battlefield' as const, tapped: false, revealed: false, enteredAtTurn: state.turn, commanderTax: fromCommand ? (card.commanderTax ?? 0) + 2 : card.commanderTax },
      ])
      const nextCastCount = (state.playerSpellsCastThisTurn ?? 0) + 1
      set((prev) => ({
        ...pushUndo(prev),
        cards: updated,
        playerSpellsCastThisTurn: nextCastCount,
      }))
      get().emitGameEvent({ type: 'cast', cardId: card.id, cardName: card.name, count: nextCastCount })
      if (card.type !== 'instant' && card.type !== 'sorcery') {
        get().emitGameEvent({ type: 'etb', cardId: card.id, cardName: card.name })
      }

      // Aura cast: let the player choose which creature to enchant instead of
      // auto-attaching to the strongest one.
      if (isAura(card)) {
        const onBoard = get().cards.filter((c) => c.zone === 'battlefield' && (c.owner ?? 'player') === 'player' && c.type === 'creature' && c.id !== card.id)
        if (onBoard.length > 0) {
          set({
            auraPrompt: {
              kind: 'aura' as const,
              auraCardId: card.id,
              auraName: card.name,
              candidates: onBoard
                .sort((a, b) => getCardPower(b) - getCardPower(a))
                .map((c) => ({ id: c.id, name: c.name, power: getCardPower(c) })),
            },
          })
          return true
        }
        // No creature to enchant: the aura falls off immediately.
        set({ cards: get().cards.map((c) => c.id === card.id ? { ...c, zone: 'graveyard' as const, revealed: true } : c) })
        return true
      }

      // Enqueue the spell's own abilities on the stack so they can be resolved.
      enqueueSpellAbilities(set, get, card)
      scheduleAICastResponse(set, get)
      return true
    },
  }
}
