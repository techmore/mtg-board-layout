import type { BoardCard, Zone } from '../types/card'
import type { GameState } from './gameStore'
import { pushUndo, attachAuras, isAura, isEquipment, withGraveyardIntake } from './gameRules'
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
  return (card.damage ?? 0) >= toughness || (card.deathtouchDamage === true && (card.damage ?? 0) > 0)
}

export function createStateBasedActions(set: SetFn, get: () => GameState): Pick<GameState, 'checkStateBasedActions'> {
  return {
    checkStateBasedActions: () => {
      const state = get()
      const dead = state.cards.filter((card) => isDead(card, state.cards))

      // Legend rule (CR 704.5j): a player can't control two permanents with
      // the same legendary name — keep one, the rest are put into the grave.
      const legendaries = new Map<string, BoardCard[]>()
      for (const card of state.cards) {
        if (card.zone !== 'battlefield') continue
        if (!/\blegendary\b/i.test(card.typeLine ?? '')) continue
        const key = `${card.owner ?? 'player'}:${card.name.toLowerCase()}`
        const list = legendaries.get(key) ?? []
        list.push(card)
        legendaries.set(key, list)
      }
      for (const group of legendaries.values()) {
        for (const duplicate of group.slice(1)) {
          if (!dead.some((c) => c.id === duplicate.id)) dead.push(duplicate)
        }
      }

      if (dead.length === 0) return

      const deadIds = new Set(dead.map((card) => card.id))
      // Auras whose enchanted creature died die with it; equipment falls off.
      // Orphaned auras attach to a new friendly creature or die.
      const updatedCards = attachAuras(state.cards.map((card) =>
        deadIds.has(card.id)
          ? { ...card, zone: 'graveyard' as Zone, tapped: false, revealed: true, damage: 0 }
          : card.enchantsCardId && deadIds.has(card.enchantsCardId)
            ? isEquipment(card)
              ? { ...card, enchantsCardId: undefined, enchantsCardName: undefined }
              : isAura(card)
                ? { ...card, zone: 'graveyard' as Zone, tapped: false, revealed: true, damage: 0 }
                : card
            : card,
      ))
      set((prev) => ({
        ...pushUndo(prev),
        cards: updatedCards,
        ...withGraveyardIntake(state, updatedCards),
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
