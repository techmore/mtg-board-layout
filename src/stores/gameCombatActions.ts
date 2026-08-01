import type { GameState } from './gameStore'
import { pickBlockers } from './opponentAI'
import { getCreaturePower, getCreatureToughness } from '../utils/misc'
import { hasKeyword } from './cardRulesLoader'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

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
      for (const attackerId of attackers) {
        const current = get()
        const attacker = current.cards.find((c) => c.id === attackerId)
        if (!attacker) continue
        const power = getCreaturePower(attacker.typeLine)
        if (power === 0) continue
        const isOpponentAttacker = (attacker.owner ?? 'player') === 'opponent'

        const attackerFlying = hasKeyword(attacker, 'flying')
        const attackerTrample = hasKeyword(attacker, 'trample')
        const attackerLifelink = hasKeyword(attacker, 'lifelink')

        // Only flying/reach creatures can block a flying attacker.
        let assignedBlockers: string[] | undefined = finalBlockers[attackerId]
        if (attackerFlying && assignedBlockers && assignedBlockers.length > 0) {
          const valid = assignedBlockers.filter((blockerId) => {
            const blocker = current.cards.find((c) => c.id === blockerId)
            return blocker ? hasKeyword(blocker, 'flying') || hasKeyword(blocker, 'reach') : false
          })
          assignedBlockers = valid.length > 0 ? valid : undefined
        }

        if (assignedBlockers && assignedBlockers.length > 0) {
          const blockerId = assignedBlockers[0]
          const blocker = current.cards.find((c) => c.id === blockerId)
          if (blocker) {
            const blockerPower = getCreaturePower(blocker.typeLine)
            const blockerLifelink = hasKeyword(blocker, 'lifelink')
            const attackerDeathtouch = hasKeyword(attacker, 'deathtouch')

            // Deathtouch makes any damage lethal — mark the target's full toughness.
            const damageToBlocker = attackerDeathtouch
              ? Math.max(1, getCreatureToughness(blocker.typeLine) + blocker.counters)
              : power
            if (damageToBlocker > 0) {
              state.addDamage(blockerId, damageToBlocker)
              if (attackerLifelink) {
                if (isOpponentAttacker) set({ opponentLifeTotal: current.opponentLifeTotal + power })
                else state.setLife(current.lifeTotal + power)
              }
            }
            state.emitGameEvent({
              type: 'combat_damage',
              sourceCardId: attackerId,
              sourceCardName: attacker.name,
              targetCardId: blockerId,
              amount: power,
            })

            // Trample: excess damage spills over to the defending player.
            if (attackerTrample && power > 0) {
              const blockerToughness = getCreatureToughness(blocker.typeLine) + blocker.counters
              const excess = power - blockerToughness
              if (excess > 0) {
                if (isOpponentAttacker) state.setLife(current.lifeTotal - excess)
                else set({ opponentLifeTotal: current.opponentLifeTotal - excess })
              }
            }

            if (blockerPower > 0) {
              const damageToAttacker = hasKeyword(blocker, 'deathtouch')
                ? Math.max(1, getCreatureToughness(attacker.typeLine) + attacker.counters)
                : blockerPower
              if (damageToAttacker > 0) state.addDamage(attackerId, damageToAttacker)
              if (blockerLifelink) {
                if (isOpponentAttacker) set({ opponentLifeTotal: current.opponentLifeTotal + blockerPower })
                else state.setLife(current.lifeTotal + blockerPower)
              }
              state.emitGameEvent({
                type: 'combat_damage',
                sourceCardId: blockerId,
                sourceCardName: blocker.name,
                targetCardId: attackerId,
                amount: blockerPower,
              })
            }
          }
        } else if (isOpponentAttacker) {
          const newLife = current.lifeTotal - power
          if (attackerLifelink) set({ opponentLifeTotal: current.opponentLifeTotal + power })
          state.setLife(newLife)
          if (newLife <= 0) {
            set({ turnAnnouncement: { id: Date.now(), text: 'YOU DEFEATED' }, turnPrompt: null, gameOver: { winner: 'opponent' } })
          }
          state.emitGameEvent({
            type: 'combat_damage',
            sourceCardId: attackerId,
            sourceCardName: attacker.name,
            amount: power,
          })
        } else {
          const newOppLife = current.opponentLifeTotal - power
          if (attackerLifelink) state.setLife(current.lifeTotal + power)
          set({ opponentLifeTotal: newOppLife })
          if (newOppLife <= 0) {
            set({ turnAnnouncement: { id: Date.now(), text: 'OPPONENT DEFEATED' }, turnPrompt: null, gameOver: { winner: 'player' } })
          }
          state.emitGameEvent({
            type: 'combat_damage',
            sourceCardId: attackerId,
            sourceCardName: attacker.name,
            amount: power,
          })
        }
      }

      set({
        combatState: { active: false, attackers: [], blockers: {} },
      })
      get().checkStateBasedActions()
    },
  }
}
