import type { BoardCard } from '../types/card'
import type { GameState } from './gameStore'
import { pickBlockers } from './opponentAI'
import { getCardPower, getCardToughness } from '../utils/misc'
import { hasKeyword, computeStaticPump } from './cardRulesLoader'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

const powerOf = (card: BoardCard, cards: BoardCard[]) => getCardPower(card) + computeStaticPump(cards, card).power
const toughnessOf = (card: BoardCard, cards: BoardCard[]) => getCardToughness(card) + computeStaticPump(cards, card).toughness

interface CombatPair {
  attacker: BoardCard
  blockerId?: string
}

export function createCombatActions(set: SetFn, get: () => GameState): Pick<GameState, 'toggleCombat' | 'toggleAttacker' | 'assignBlocker' | 'resolveCombat'> {
  return {
    toggleCombat: () => {
      const state = get()
      const next = !state.combatState.active
      set({
        combatState: next
          ? { active: true, attackers: [], blockers: {} }
          : { active: false, attackers: [], blockers: {} },
      })
    },

    toggleAttacker: (cardId) => {
      const state = get()
      if (state.activePlayer !== 'player') return
      const card = state.cards.find((c) => c.id === cardId)
      if (!card || (card.owner ?? 'player') !== 'player') return
      const current = state.combatState.attackers
      const next = current.includes(cardId)
        ? current.filter((id) => id !== cardId)
        : [...current, cardId]
      set({
        combatState: { ...state.combatState, attackers: next },
      })
    },

    assignBlocker: (attackerId, blockerId) => {
      const state = get()
      const current = state.combatState.blockers[attackerId] ?? []
      const next = current.includes(blockerId)
        ? current.filter((id) => id !== blockerId)
        : [...current, blockerId]
      set({
        combatState: {
          ...state.combatState,
          blockers: { ...state.combatState.blockers, [attackerId]: next },
        },
      })
    },

    resolveCombat: () => {
      const state = get()
      const { attackers, blockers } = state.combatState

      let finalBlockers = blockers
      if (state.activePlayer === 'player' && attackers.length > 0) {
        const oppBattlefield = state.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield')
        finalBlockers = pickBlockers(attackers, oppBattlefield, state.cards, state.turn)
      }

      // Build combat pairs. Only flying/reach creatures can block a flying attacker.
      const pairs: CombatPair[] = []
      for (const attackerId of attackers) {
        const attacker = get().cards.find((c) => c.id === attackerId)
        if (!attacker) continue
        if (powerOf(attacker, get().cards) === 0) continue
        let assigned: string[] | undefined = finalBlockers[attackerId]
        if (assigned && assigned.length > 0) {
          const valid = assigned.filter((blockerId) => {
            const blocker = get().cards.find((c) => c.id === blockerId)
            if (!blocker || blocker.tapped || blocker.zone !== 'battlefield') return false
            if (hasKeyword(attacker, 'flying')) {
              return hasKeyword(blocker, 'flying') || hasKeyword(blocker, 'reach')
            }
            return true
          })
          assigned = valid.length > 0 ? valid : undefined
        }
        pairs.push({ attacker, blockerId: assigned?.[0] })
      }

      // Attackers tap when they attack — vigilance keeps them untapped.
      const tappingIds = pairs
        .filter((p) => !hasKeyword(p.attacker, 'vigilance'))
        .map((p) => p.attacker.id)
      if (tappingIds.length > 0) {
        set({
          cards: get().cards.map((c) => tappingIds.includes(c.id) ? { ...c, tapped: true } : c),
        })
      }

      const fast = (card: BoardCard | undefined) =>
        card ? hasKeyword(card, 'first strike') || hasKeyword(card, 'double strike') : false
      const dealsInRegularStep = (card: BoardCard | undefined) =>
        card ? !(hasKeyword(card, 'first strike') && !hasKeyword(card, 'double strike')) : false

      const deal = (pair: CombatPair, attackerDeals: boolean, blockerDeals: boolean) => {
        const current = get()
        const attacker = current.cards.find((c) => c.id === pair.attacker.id)
        if (!attacker || attacker.zone !== 'battlefield') return
        const power = powerOf(attacker, current.cards)
        if (power === 0) return
        const isOpponentAttacker = (attacker.owner ?? 'player') === 'opponent'
        const attackerLifelink = hasKeyword(attacker, 'lifelink')
        const attackerTrample = hasKeyword(attacker, 'trample')
        const attackerDeathtouch = hasKeyword(attacker, 'deathtouch')

        const blocker = pair.blockerId ? current.cards.find((c) => c.id === pair.blockerId) : undefined
        const liveBlocker = blocker && blocker.zone === 'battlefield' ? blocker : undefined

        if (attackerDeals) {
          if (liveBlocker) {
            // Deathtouch makes any damage lethal — mark the target's full toughness.
            const damageToBlocker = attackerDeathtouch
              ? Math.max(1, toughnessOf(liveBlocker, current.cards))
              : power
            if (damageToBlocker > 0) {
              state.addDamage(liveBlocker.id, damageToBlocker)
              if (attackerLifelink) {
                if (isOpponentAttacker) set({ opponentLifeTotal: current.opponentLifeTotal + power })
                else state.setLife(current.lifeTotal + power)
              }
            }
            state.emitGameEvent({
              type: 'combat_damage',
              sourceCardId: attacker.id,
              sourceCardName: attacker.name,
              targetCardId: liveBlocker.id,
              amount: power,
            })

            // Trample: excess damage spills over to the defending player.
            if (attackerTrample && power > 0) {
              const blockerToughness = toughnessOf(liveBlocker, current.cards)
              const excess = power - blockerToughness
              if (excess > 0) {
                if (isOpponentAttacker) state.setLife(current.lifeTotal - excess)
                else set({ opponentLifeTotal: current.opponentLifeTotal - excess })
              }
            }
          } else {
            if (isOpponentAttacker) {
              const newLife = current.lifeTotal - power
              if (attackerLifelink) set({ opponentLifeTotal: current.opponentLifeTotal + power })
              state.setLife(newLife)
              if (newLife <= 0) {
                set({ turnAnnouncement: { id: Date.now(), text: 'YOU DEFEATED' }, turnPrompt: null, gameOver: { winner: 'opponent' } })
              }
            } else {
              const newOppLife = current.opponentLifeTotal - power
              if (attackerLifelink) state.setLife(current.lifeTotal + power)
              set({ opponentLifeTotal: newOppLife })
              if (newOppLife <= 0) {
                set({ turnAnnouncement: { id: Date.now(), text: 'OPPONENT DEFEATED' }, turnPrompt: null, gameOver: { winner: 'player' } })
              }
            }
            state.emitGameEvent({
              type: 'combat_damage',
              sourceCardId: attacker.id,
              sourceCardName: attacker.name,
              amount: power,
            })
          }
        }

        if (blockerDeals && liveBlocker) {
          const blockerPower = powerOf(liveBlocker, current.cards)
          if (blockerPower > 0) {
            const damageToAttacker = hasKeyword(liveBlocker, 'deathtouch')
              ? Math.max(1, toughnessOf(attacker, current.cards))
              : blockerPower
            if (damageToAttacker > 0) state.addDamage(attacker.id, damageToAttacker)
            if (hasKeyword(liveBlocker, 'lifelink')) {
              if (isOpponentAttacker) set({ opponentLifeTotal: current.opponentLifeTotal + blockerPower })
              else state.setLife(current.lifeTotal + blockerPower)
            }
            state.emitGameEvent({
              type: 'combat_damage',
              sourceCardId: liveBlocker.id,
              sourceCardName: liveBlocker.name,
              targetCardId: attacker.id,
              amount: blockerPower,
            })
          }
        }
      }

      // First-strike damage step: only first/double strikers deal, then SBA.
      const anyFirstStrike = pairs.some((p) => fast(get().cards.find((c) => c.id === p.attacker.id))) ||
        pairs.some((p) => fast(get().cards.find((c) => c.id === p.blockerId)))
      if (anyFirstStrike) {
        for (const pair of pairs) {
          const attacker = get().cards.find((c) => c.id === pair.attacker.id)
          if (!attacker || attacker.zone !== 'battlefield') continue
          const blocker = pair.blockerId ? get().cards.find((c) => c.id === pair.blockerId) : undefined
          const attackerFast = fast(attacker)
          const blockerFast = blocker && blocker.zone === 'battlefield' ? fast(blocker) : false
          if (!attackerFast && !blockerFast) continue
          deal(pair, attackerFast, blockerFast)
        }
        get().checkStateBasedActions()
      }

      // Regular damage step: everyone else deals; double strikers deal again.
      for (const pair of pairs) {
        const attacker = get().cards.find((c) => c.id === pair.attacker.id)
        if (!attacker || attacker.zone !== 'battlefield') continue
        const blocker = pair.blockerId ? get().cards.find((c) => c.id === pair.blockerId) : undefined
        const attackerDeals = dealsInRegularStep(attacker)
        const blockerDeals = blocker && blocker.zone === 'battlefield' ? dealsInRegularStep(blocker) : false
        if (!attackerDeals && !blockerDeals) continue
        deal(pair, attackerDeals, blockerDeals)
      }

      set({
        combatState: { active: false, attackers: [], blockers: {} },
      })
      get().checkStateBasedActions()
    },
  }
}
