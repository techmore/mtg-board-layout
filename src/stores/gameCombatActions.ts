import type { BoardCard } from '../types/card'
import type { GameState } from './gameStore'
import { pickBlockers } from './opponentAI'
import { getCardPower, getCardToughness } from '../utils/misc'
import { hasKeyword, computeStaticPump } from './cardRulesLoader'
import { attackTax, canAttack, canBlock } from 'mtg-protocol/combat'
import { canPayManaCost, spendManaForCost } from 'mtg-protocol/mana'
import { aiCastInstant } from './gameOpponentAI'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

let aiResponseScheduled = false

const powerOf = (card: BoardCard, cards: BoardCard[]) => getCardPower(card) + computeStaticPump(cards, card).power
const toughnessOf = (card: BoardCard, cards: BoardCard[]) => getCardToughness(card) + computeStaticPump(cards, card).toughness

/** Give the AI a short instant-speed window after the player declares attackers. */
function scheduleAICombatResponse(set: SetFn, get: () => GameState) {
  if (aiResponseScheduled) return
  aiResponseScheduled = true
  setTimeout(() => {
    aiResponseScheduled = false
    const current = get()
    if (current.gameOver || current.activePlayer !== 'player') return
    if (!current.combatState.active || current.combatState.attackers.length === 0) return
    aiCastInstant(set, get)
  }, 2500)
}

interface CombatPair {
  attacker: BoardCard
  blockerIds: string[]
  /** True when the attacker was blocked at declaration (blockers may die later). */
  wasBlocked: boolean
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
      if (!canAttack(card, state.cards)) return
      // Kefnet-style hand gate: "can't attack or block unless you have N cards
      // in hand."
      const handGate = card.oracleText?.match(/can't attack or block unless you have (?:(\d+)|(one|two|three|four|five|six|seven|eight|nine|ten)) or more cards in hand/i)
      if (handGate) {
        const needed = handGate[1] ? parseInt(handGate[1], 10) : ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[handGate[2].toLowerCase()] ?? 7
        const hand = state.cards.filter((c) => (c.owner ?? 'player') === 'player' && c.zone === 'hand').length
        if (hand < needed) return
      }
      const current = state.combatState.attackers
      const next = current.includes(cardId)
        ? current.filter((id) => id !== cardId)
        : [...current, cardId]
      set({
        combatState: { ...state.combatState, attackers: next },
      })
      if (next.length > 0) scheduleAICombatResponse(set, get)
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
      if (state.activePlayer === 'player' && attackers.length > 0 && Object.keys(blockers).length === 0) {
        const oppBattlefield = state.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield')
        finalBlockers = pickBlockers(attackers, oppBattlefield, state.cards, state.turn, state.opponentLifeTotal, state.commanderDamage)
      }

      // Build combat pairs. Only flying/reach creatures can block a flying attacker.
      let pairs: CombatPair[] = []
      for (const attackerId of attackers) {
        const attacker = get().cards.find((c) => c.id === attackerId)
        if (!attacker) continue
        if (powerOf(attacker, get().cards) === 0) continue
        let assigned: string[] | undefined = finalBlockers[attackerId]
        if (assigned && assigned.length > 0) {
          const valid = assigned.filter((blockerId) => {
            const blocker = get().cards.find((c) => c.id === blockerId)
            if (!blocker || blocker.zone !== 'battlefield') return false
            if (attacker.cantBeBlockedThisTurn) return false
            if (!canBlock(blocker, get().cards)) return false
            if (hasKeyword(attacker, 'skulk', get().cards) && getCardPower(blocker) > getCardPower(attacker)) return false
            if (hasKeyword(attacker, 'flying', get().cards)) {
              return hasKeyword(blocker, 'flying', get().cards) || hasKeyword(blocker, 'reach', get().cards)
            }
            return true
          })
          // Menace requires two or more blockers, as does a custom "can't be
          // blocked except by N or more creatures"; fewer makes it unblocked.
          const exceptMatch = attacker.oracleText?.match(/can't be blocked except by (\w+) or more creatures/i)
          const exceptCount = exceptMatch ? ({ two: 2, three: 3, four: 4, five: 5, six: 6 })[exceptMatch[1].toLowerCase()] ?? 2 : 0
          const minBlockers = Math.max(hasKeyword(attacker, 'menace', get().cards) ? 2 : 0, exceptCount)
          if (minBlockers > 0 && valid.length < minBlockers) {
            assigned = undefined
          } else {
            assigned = valid.length > 0 ? valid : undefined
          }
        }
        pairs.push({ attacker, blockerIds: assigned ?? [], wasBlocked: (assigned?.length ?? 0) > 0 })
      }

      // Attack tax (Ghostly Prison / Propaganda): the attacking side must pay
      // {N} per attacker, or those attackers can't attack at all.
      let taxablePairs = pairs
      const playerAttackers = taxablePairs.filter((p) => (p.attacker.owner ?? 'player') === 'player')
      const opponentAttackers = taxablePairs.filter((p) => (p.attacker.owner ?? 'player') !== 'player')
      const playerTax = playerAttackers.length > 0
        ? attackTax(get().cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield'))
        : 0
      const opponentTax = opponentAttackers.length > 0
        ? attackTax(get().cards.filter((c) => (c.owner ?? 'player') === 'player' && c.zone === 'battlefield'))
        : 0
      if (playerTax > 0 && playerAttackers.length > 0) {
        const cost = `{${playerTax * playerAttackers.length}}`
        if (canPayManaCost(get().manaPool, cost)) {
          get().spendManaCost(cost, `Attack tax (${playerTax} per attacker)`)
        } else {
          taxablePairs = taxablePairs.filter((p) => (p.attacker.owner ?? 'player') !== 'player')
        }
      }
      if (opponentTax > 0 && opponentAttackers.length > 0) {
        const cost = `{${opponentTax * opponentAttackers.length}}`
        if (canPayManaCost(get().opponentManaPool, cost)) {
          set({ opponentManaPool: spendManaForCost(get().opponentManaPool, cost) })
        } else {
          taxablePairs = taxablePairs.filter((p) => (p.attacker.owner ?? 'player') === 'player')
        }
      }
      pairs = taxablePairs

      // Attack triggers ("whenever this creature attacks", annihilator) fire
      // for the player's attackers via the stack. AI attackers already had
      // their attack triggers resolved directly (resolveAIAutoAbilities in the
      // AI turn), so emitting the event here would fire them a second time.
      for (const pair of pairs) {
        if ((pair.attacker.owner ?? 'player') !== 'player') continue
        get().emitGameEvent({ type: 'attack', cardId: pair.attacker.id, cardName: pair.attacker.name })
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
        card ? hasKeyword(card, 'first strike', get().cards) || hasKeyword(card, 'double strike', get().cards) : false
      const dealsInRegularStep = (card: BoardCard | undefined) =>
        card ? !(hasKeyword(card, 'first strike', get().cards) && !hasKeyword(card, 'double strike', get().cards)) : false

      const deal = (pair: CombatPair, attackerDeals: boolean, blockerDeals: boolean) => {
        const current = get()
        const attacker = current.cards.find((c) => c.id === pair.attacker.id)
        if (!attacker || attacker.zone !== 'battlefield') return
        const power = powerOf(attacker, current.cards)
        const isOpponentAttacker = (attacker.owner ?? 'player') === 'opponent'
        const attackerLifelink = hasKeyword(attacker, 'lifelink', get().cards)
        const attackerTrample = hasKeyword(attacker, 'trample', get().cards)
        const attackerDeathtouch = hasKeyword(attacker, 'deathtouch', get().cards)

        const liveBlockers = pair.blockerIds
          .map((id) => current.cards.find((c) => c.id === id))
          .filter((c): c is BoardCard => Boolean(c && c.zone === 'battlefield'))

        if (blockerDeals) {
          // Every blocker deals its power to the attacker.
          for (const blocker of liveBlockers) {
            const blockerPower = powerOf(blocker, current.cards)
            if (blockerPower <= 0) continue
            const blockerDeathtouch = hasKeyword(blocker, 'deathtouch', get().cards)
            const damageToAttacker = blockerDeathtouch
              ? Math.max(1, toughnessOf(attacker, current.cards))
              : blockerPower
            state.addDamage(attacker.id, damageToAttacker)
            if (blockerDeathtouch) {
              set({ cards: get().cards.map((c) => c.id === attacker.id ? { ...c, deathtouchDamage: true } : c) })
            }
            if (hasKeyword(blocker, 'lifelink', get().cards)) {
              if (isOpponentAttacker) set({ opponentLifeTotal: current.opponentLifeTotal + blockerPower })
              else state.setLife(current.lifeTotal + blockerPower)
            }
            state.emitGameEvent({
              type: 'combat_damage',
              sourceCardId: blocker.id,
              sourceCardName: blocker.name,
              targetCardId: attacker.id,
              amount: blockerPower,
            })
          }
        }

        if (attackerDeals) {
          if (liveBlockers.length > 0) {
            // Allocate the attacker's power across blockers in blocking order:
            // lethal damage to the first (deathtouch counts any damage as
            // lethal), then the remainder to the next, etc.
            let remaining = power
            for (const blocker of liveBlockers) {
              if (remaining <= 0) break
              // Lethal accounts for damage already marked: a blocker with prior
              // damage needs less to die, so more trample damage spills over.
              const need = attackerDeathtouch
                ? 1
                : Math.max(0, toughnessOf(blocker, current.cards) - (blocker.damage ?? 0))
              const dealt = Math.min(remaining, need)
              if (dealt > 0) {
                state.addDamage(blocker.id, dealt)
                if (attackerDeathtouch) {
                  set({ cards: get().cards.map((c) => c.id === blocker.id ? { ...c, deathtouchDamage: true } : c) })
                }
                state.emitGameEvent({
                  type: 'combat_damage',
                  sourceCardId: attacker.id,
                  sourceCardName: attacker.name,
                  targetCardId: blocker.id,
                  amount: dealt,
                })
              }
              remaining -= dealt
            }
            if (attackerLifelink && power > 0) {
              if (isOpponentAttacker) set({ opponentLifeTotal: current.opponentLifeTotal + power })
              else state.setLife(current.lifeTotal + power)
            }

            // Trample: damage left over after all blockers spills to the player.
            if (attackerTrample && remaining > 0) {
              if (isOpponentAttacker) {
                state.setLife(current.lifeTotal - remaining)
                if (get().monarch === 'player') set({ monarch: 'opponent' })
                if (attacker.isCommander) {
                  get().recordCommanderDamage(attacker.id, remaining)
                  if ((get().commanderDamage[attacker.id] ?? 0) >= 21) {
                    set({ turnAnnouncement: { id: Date.now(), text: `YOU DEFEATED — commander damage from ${attacker.name}` }, turnPrompt: null, gameOver: { winner: 'opponent' } })
                    return
                  }
                }
              } else {
                set({ opponentLifeTotal: current.opponentLifeTotal - remaining })
                if (get().monarch === 'opponent') set({ monarch: 'player' })
                if (attacker.isCommander) {
                  get().recordCommanderDamage(attacker.id, remaining)
                  if ((get().commanderDamage[attacker.id] ?? 0) >= 21) {
                    set({ turnAnnouncement: { id: Date.now(), text: `OPPONENT DEFEATED — commander damage from ${attacker.name}` }, turnPrompt: null, gameOver: { winner: 'player' } })
                    return
                  }
                }
              }
            }
          } else if (pair.wasBlocked && !attackerTrample) {
            // The attacker was blocked, but every blocker died earlier (e.g. in
            // the first-strike step). A blocked creature stays blocked and deals
            // no combat damage to the player (CR 510.1c). A trampler may assign
            // all remaining damage to the player, handled by the branch below.
          } else {
            if (isOpponentAttacker) {
              const newLife = current.lifeTotal - power
              if (attackerLifelink) set({ opponentLifeTotal: current.opponentLifeTotal + power })
              state.setLife(newLife)
              // Combat damage to the monarch transfers the crown to the attacker.
              if (get().monarch === 'player') set({ monarch: 'opponent' })
              // Commander damage: 21+ from a single commander loses.
              if (attacker.isCommander) {
                get().recordCommanderDamage(attacker.id, power)
                if ((get().commanderDamage[attacker.id] ?? 0) >= 21) {
                  set({ turnAnnouncement: { id: Date.now(), text: `YOU DEFEATED — commander damage from ${attacker.name}` }, turnPrompt: null, gameOver: { winner: 'opponent' } })
                  return
                }
              }
              if (newLife <= 0) {
                set({ turnAnnouncement: { id: Date.now(), text: 'YOU DEFEATED' }, turnPrompt: null, gameOver: { winner: 'opponent' } })
              }
            } else {
              const newOppLife = current.opponentLifeTotal - power
              if (attackerLifelink) state.setLife(current.lifeTotal + power)
              set({ opponentLifeTotal: newOppLife })
              // Combat damage to the monarch transfers the crown to the attacker.
              if (get().monarch === 'opponent') set({ monarch: 'player' })
              if (attacker.isCommander) {
                get().recordCommanderDamage(attacker.id, power)
                if ((get().commanderDamage[attacker.id] ?? 0) >= 21) {
                  set({ turnAnnouncement: { id: Date.now(), text: `OPPONENT DEFEATED — commander damage from ${attacker.name}` }, turnPrompt: null, gameOver: { winner: 'player' } })
                  return
                }
              }
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
      }

      // First-strike damage step: only first/double strikers deal, then SBA.
      const anyFirstStrike = pairs.some((p) => fast(get().cards.find((c) => c.id === p.attacker.id))) ||
        pairs.some((p) => p.blockerIds.some((id) => fast(get().cards.find((c) => c.id === id))))
      if (anyFirstStrike) {
        for (const pair of pairs) {
          const attacker = get().cards.find((c) => c.id === pair.attacker.id)
          if (!attacker || attacker.zone !== 'battlefield') continue
          const blockers = pair.blockerIds
            .map((id) => get().cards.find((c) => c.id === id))
            .filter((c): c is BoardCard => Boolean(c && c.zone === 'battlefield'))
          const attackerFast = fast(attacker)
          const blockerFast = blockers.some((blocker) => fast(blocker))
          if (!attackerFast && !blockerFast) continue
          deal(pair, attackerFast, blockerFast)
        }
        get().checkStateBasedActions()
      }

      // Regular damage step: everyone else deals; double strikers deal again.
      for (const pair of pairs) {
        const attacker = get().cards.find((c) => c.id === pair.attacker.id)
        if (!attacker || attacker.zone !== 'battlefield') continue
        const blockers = pair.blockerIds
          .map((id) => get().cards.find((c) => c.id === id))
          .filter((c): c is BoardCard => Boolean(c && c.zone === 'battlefield'))
        const attackerDeals = dealsInRegularStep(attacker)
        const blockerDeals = blockers.some((blocker) => dealsInRegularStep(blocker))
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
