import type { BoardCard, Zone } from '../types/card'
import type { GameState } from './gameStore'
import { pushUndo, attachAuras, isAura } from './gameRules'
import { getCardToughness } from '../utils/misc'
import { hasKeyword, computeStaticPump } from './cardRulesLoader'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

function isDead(card: BoardCard, cards: BoardCard[]): boolean {
  if (card.zone !== 'battlefield') return false
  if (hasKeyword(card, 'indestructible')) return false
  if (card.type === 'planeswalker') return (card.counters ?? 0) <= 0
  if (card.type !== 'creature') return false
  const toughness = getCardToughness(card) + computeStaticPump(cards, card).toughness
  if (toughness < 1) return true
  return (card.damage ?? 0) >= toughness
}

export function createStateBasedActions(set: SetFn, get: () => GameState): Pick<GameState, 'checkStateBasedActions'> {
  return {
    checkStateBasedActions: () => {
      const state = get()
      const dead = state.cards.filter((card) => isDead(card, state.cards))
      if (dead.length === 0) return

      const deadIds = new Set(dead.map((card) => card.id))
      // Auras whose enchanted creature died die with it; orphaned auras attach
      // to a new friendly creature or die.
      const updatedCards = attachAuras(state.cards.map((card) =>
        deadIds.has(card.id) || (isAura(card) && card.enchantsCardId && deadIds.has(card.enchantsCardId))
          ? { ...card, zone: 'graveyard' as Zone, tapped: false, revealed: true, damage: 0 }
          : card,
      ))
      set((prev) => ({
        ...pushUndo(prev),
        cards: updatedCards,
        turnAnnouncement: {
          id: Date.now(),
          text: dead.length === 1 ? `${dead[0].name} died` : `${dead.length} creatures died`,
        },
      }))

      for (const card of dead) {
        get().emitGameEvent({ type: 'dies', cardId: card.id, cardName: card.name })
      }
    },
  }
}
