import type { GameState } from './gameStore'
import { emptyManaPool, moveCastSpellsToGraveyard, prepareCardPlay, pushUndo } from './gameRules'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

export function createTurnPhases(set: SetFn, get: () => GameState): Pick<GameState, 'advanceTurn' | 'advancePhase' | 'announceEndTurn' | 'cancelTurnPrompt' | 'overrideLandPlay' | 'resolveConditionalEntry' | 'discardForTurn' | 'clearDrawNotice' | 'clearTurnAnnouncement'> {
  return {
    advanceTurn: () => {
      const state = get()
      const isPlayer = state.activePlayer === 'player'

      if (isPlayer) {
        const handSize = state.cards.filter((c) => c.zone === 'hand').length
        const undo = pushUndo(state)
        // Hand-size rule applies regardless of how the turn ends (button or
        // phase advance): discard to 7 before handing off.
        if (handSize > 7) {
          set({
            ...undo,
            turnPrompt: { action: 'advance', reason: 'discard' },
          })
          return
        }
        set((prev) => ({
          ...pushUndo(prev),
          manaPool: emptyManaPool(),
          potentialMana: [],
          landPlaysThisTurn: 0,
          activePlayer: 'opponent',
          currentPhase: 'beginning',
          turnAnnouncement: { id: Date.now(), text: "OPPONENT'S TURN" },
        }))
        get().emitGameEvent({ type: 'end_of_turn' })
        get().runOpponentTurn()
      } else {
        set((prev) => ({
          ...pushUndo(prev),
          opponentManaPool: emptyManaPool(),
          opponentPotentialMana: [],
          opponentLandPlaysThisTurn: 0,
          activePlayer: 'player',
          currentPhase: 'beginning',
          turn: prev.turn + 1,
          turnAnnouncement: { id: Date.now(), text: `YOUR TURN ${prev.turn + 1}` },
        }))
        get().emitGameEvent({ type: 'end_of_turn' })
      }
    },

    advancePhase: () => {
      const state = get()
      if (state.activePlayer === 'opponent') return

      set((prev) => ({
        ...pushUndo(prev),
        manaPool: emptyManaPool(),
        potentialMana: [],
      }))
      switch (state.currentPhase) {
        case 'beginning': {
          get().emitGameEvent({ type: 'upkeep' })
          set((prev) => ({
            cards: prev.cards.map((c) =>
              (c.owner ?? 'player') === 'player' && c.zone === 'battlefield'
                ? { ...c, tapped: false, damage: 0, powerBoost: 0, toughnessBoost: 0 }
                : c,
            ),
          }))
          if (state.turn > 1) {
            get().drawCards(1)
          }
          set({ currentPhase: 'precombat_main', landPlaysThisTurn: 0 })
          break
        }
        case 'precombat_main':
          set({ currentPhase: 'combat', combatState: { active: true, attackers: [], blockers: {} } })
          break
        case 'combat':
          get().resolveCombat()
          set({ currentPhase: 'postcombat_main' })
          break
        case 'postcombat_main':
          set({ currentPhase: 'ending' })
          break
        case 'ending':
          get().advanceTurn()
          break
      }
    },

    announceEndTurn: () => {
      const hadExtra = get().cards.filter((c) => c.zone === 'hand').length > 7
      set((state) => {
        const undo = pushUndo(state)
        const cards = moveCastSpellsToGraveyard(state.cards)
        return hadExtra
          ? { ...undo, cards, turnPrompt: { id: Date.now(), action: 'end', reason: 'discard' } }
          : { ...undo, cards, turnAnnouncement: { id: Date.now(), text: 'END TURN' }, turnPrompt: null }
      })
      if (!hadExtra) get().emitGameEvent({ type: 'end_of_turn' })
    },

    cancelTurnPrompt: () => set({ turnPrompt: null }),

    overrideLandPlay: (cardId) => {
      set((state) => {
        const prompt = state.turnPrompt
        const card = state.cards.find((candidate) => candidate.id === cardId && candidate.zone === 'hand' && candidate.type === 'land')
        if (!prompt || prompt.reason !== 'land' || prompt.cardId !== cardId || !card) return { turnPrompt: null }
        const preparation = prepareCardPlay(card, state, { ignoreLandLimit: true })
        const undo = pushUndo(state)
        if (preparation.blockReason === 'etb') {
          return {
            ...undo,
            turnPrompt: { id: Date.now(), action: 'end', reason: 'etb', cardId },
          }
        }
        const updated = {
          ...card,
          zone: 'battlefield' as const,
          tapped: preparation.entersTapped,
          revealed: false,
          enteredAtTurn: state.turn,
        }
        const updatedCards = moveCastSpellsToGraveyard([
          ...state.cards.filter((candidate) => candidate.id !== cardId),
          updated,
        ])
        return {
          ...undo,
          cards: updatedCards,
          landPlaysThisTurn: state.landPlaysThisTurn + 1,
          turnPrompt: null,
          turnAnnouncement: { id: Date.now(), text: 'LAND OVERRIDE · END TURN' },
        }
      })
      const card = get().cards.find((c) => c.id === cardId)
      if (card?.zone === 'battlefield') get().emitGameEvent({ type: 'etb', cardId, cardName: card.name })
    },

    resolveConditionalEntry: (cardId, tapped) => {
      set((state) => {
        const prompt = state.turnPrompt
        const card = state.cards.find((candidate) => candidate.id === cardId && (candidate.zone === 'hand' || candidate.zone === 'command'))
        if (!prompt || prompt.reason !== 'etb' || prompt.cardId !== cardId || !card) return { turnPrompt: null }
        const preparation = prepareCardPlay(card, state, { ignoreLandLimit: true, resolveConditionalEntry: true })
        const updated = {
          ...card,
          zone: 'battlefield' as const,
          tapped,
          revealed: false,
          enteredAtTurn: state.turn,
          commanderTax: preparation.commanderTax,
        }
        const undo = pushUndo(state)
        return {
          ...undo,
          cards: [...state.cards.filter((candidate) => candidate.id !== cardId), updated],
          manaPool: preparation.manaPoolAfterPlay,
          landPlaysThisTurn: state.landPlaysThisTurn + (preparation.isLandPlay ? 1 : 0),
          turnPrompt: null,
        }
      })
      const card = get().cards.find((c) => c.id === cardId)
      if (card?.zone === 'battlefield') get().emitGameEvent({ type: 'etb', cardId, cardName: card.name })
    },

    discardForTurn: (cardId) => {
      const action = get().turnPrompt?.action
      const discarded = get().cards.find((c) => c.id === cardId && c.zone === 'hand')
      set((state) => {
        if (!state.turnPrompt) return {}
        const card = state.cards.find((candidate) => candidate.id === cardId && candidate.zone === 'hand')
        if (!card) return {}
        const cards = state.cards.map((candidate) =>
          candidate.id === cardId
            ? { ...candidate, zone: 'graveyard' as const, tapped: false, revealed: true }
            : candidate,
        )
        const resolvedCards = moveCastSpellsToGraveyard(cards)
        const undo = pushUndo(state)
        if (resolvedCards.filter((candidate) => candidate.zone === 'hand').length > 7) {
          return { ...undo, cards: resolvedCards, turnPrompt: { id: Date.now(), action: state.turnPrompt.action, reason: 'discard' } }
        }
        return action === 'advance'
          ? {
              ...undo,
              cards: resolvedCards,
              manaPool: emptyManaPool(),
              potentialMana: [],
              landPlaysThisTurn: 0,
              activePlayer: 'opponent' as const,
              currentPhase: 'beginning' as const,
              turnAnnouncement: { id: Date.now(), text: "OPPONENT'S TURN" },
              turnPrompt: null,
            }
          : { ...undo, cards: resolvedCards, turnPrompt: null, turnAnnouncement: { id: Date.now(), text: 'END TURN' } }
      })
      if (discarded) {
        get().emitGameEvent({ type: 'discard', cardId, cardName: discarded.name })
      }
      if (action === 'advance' && !get().turnPrompt) {
        // The end-step happens before the turn hands off: emit the end-of-turn
        // event on the advance path too, not only on 'end'.
        get().emitGameEvent({ type: 'end_of_turn' })
        get().runOpponentTurn()
      }
      if (action === 'end' && !get().turnPrompt) {
        get().emitGameEvent({ type: 'end_of_turn' })
      }
    },

    clearDrawNotice: (id) =>
      set((state) => state.drawNotice && (id === undefined || state.drawNotice.id === id) ? { drawNotice: null } : {}),

    clearTurnAnnouncement: (id) =>
      set((state) => state.turnAnnouncement && (id === undefined || state.turnAnnouncement.id === id) ? { turnAnnouncement: null } : {}),
  }
}
