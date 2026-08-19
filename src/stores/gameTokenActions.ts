import type { EffectHistoryEntry } from '../types/card'
import type { GameState } from './gameStore'
import { pushUndo } from './gameRules'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

export function createTokenActions(set: SetFn, get: () => GameState): Pick<GameState, 'addToken' | 'addTokenToCard' | 'toggleTokenTap' | 'addTokenCounter' | 'removeTokenCounter' | 'removeToken'> {
  return {
    addToken: (token) => {
      set((state) => ({ ...pushUndo(state), tokens: [...state.tokens, token] }))
      // Tokens enter the battlefield as creatures: "whenever another creature
      // enters" triggers must see them.
      get().emitGameEvent({ type: 'etb', cardId: token.id, cardName: token.name })
    },

    addTokenToCard: (cardId) =>
      set((state) => {
        const card = state.cards.find((candidate) => candidate.id === cardId)
        if (!card) return {}
        const effect: EffectHistoryEntry = {
          id: crypto.randomUUID(),
          turn: state.turn,
          kind: 'token',
          action: 'added',
          targetCardId: card.id,
          targetCardName: card.name,
          amount: 1,
        }
        return {
          ...pushUndo(state),
          cards: state.cards.map((candidate) => candidate.id === cardId
            ? { ...candidate, tokenCount: (candidate.tokenCount ?? 0) + 1 }
            : candidate),
          effectHistory: [...state.effectHistory, effect].slice(-250),
        }
      }),

    toggleTokenTap: (tokenId) =>
      set((state) => ({
        ...pushUndo(state),
        tokens: state.tokens.map((t) =>
          t.id === tokenId ? { ...t, tapped: !t.tapped } : t
        ),
      })),

    addTokenCounter: (tokenId) =>
      set((state) => ({
        ...pushUndo(state),
        tokens: state.tokens.map((t) =>
          t.id === tokenId ? { ...t, counters: t.counters + 1 } : t
        ),
      })),

    removeTokenCounter: (tokenId) =>
      set((state) => ({
        ...pushUndo(state),
        tokens: state.tokens.map((t) =>
          t.id === tokenId ? { ...t, counters: Math.max(0, t.counters - 1) } : t
        ),
      })),

    removeToken: (tokenId) =>
      set((state) => ({ ...pushUndo(state), tokens: state.tokens.filter((t) => t.id !== tokenId) })),
  }
}
