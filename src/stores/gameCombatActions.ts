import type { GameState } from './gameStore'
import { pickBlockers } from './opponentAI'

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
        const attacker = state.cards.find((c) => c.id === attackerId)
        if (!attacker) continue
        const power = parseInt(attacker.typeLine?.match(/(\d+)\//)?.[1] ?? '0')
        if (power === 0) continue
        const isOpponentAttacker = (attacker.owner ?? 'player') === 'opponent'

        const assignedBlockers = finalBlockers[attackerId]
        if (assignedBlockers && assignedBlockers.length > 0) {
          const blockerId = assignedBlockers[0]
          const blocker = state.cards.find((c) => c.id === blockerId)
          if (blocker) {
            for (let i = 0; i < power; i++) state.addCounter(blockerId)
            state.emitGameEvent({
              type: 'combat_damage',
              sourceCardId: attackerId,
              sourceCardName: attacker.name,
              targetCardId: blockerId,
              amount: power,
            })
            const blockerPower = parseInt(blocker.typeLine?.match(/(\d+)\//)?.[1] ?? '0')
            if (blockerPower > 0) {
              for (let i = 0; i < blockerPower; i++) state.addCounter(attackerId)
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
          const newLife = state.lifeTotal - power
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
          const newOppLife = state.opponentLifeTotal - power
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
    },
  }
}
