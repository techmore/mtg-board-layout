import type { BoardCard, ManaPool, Zone } from '../types/card'
import type { ActivePlayer } from './gameStore'
import type { GameState } from './gameStore'
import { shuffle, classifyType, parseManaCost, getCardPower, canPayManaCost } from '../utils/misc'
import { pushUndo, attachAuras, moveCastSpellsToGraveyard } from './gameRules'
import { getCardTypeFeatures } from '../data/cardFeatures'
import { getCachedCardRules, getCardRule } from './cardRulesLoader'
import { localCardImage } from '../data/localCardImages'
import { cacheDeckImages } from '../services/cardImageCache'
import { pickSpell, pickAttackers, pickCommanderCast } from './opponentAI'
import { resolveAISpellAbilities, resolveAIAutoAbilities, resolveAITriggerInstances, resolveAIActivatedAbility } from './spellResolution'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

/**
 * Cast the first affordable instant in the AI's hand (combat trick / response).
 * Returns true when something was cast.
 */
export function aiCastInstant(set: SetFn, get: () => GameState): boolean {
  const cards = get().cards
  const hand = cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'hand' && c.type === 'instant')
  for (const trick of hand) {
    if (!trick.manaCost) continue
    const { updated, pool, paid } = tapLandsForCost(cards, trick.manaCost)
    if (!paid) continue
    set((prev) => ({
      cards: updated.map((c) =>
        c.id === trick.id
          ? { ...c, zone: 'battlefield' as const, tapped: false, revealed: false, enteredAtTurn: prev.turn }
          : c,
      ),
      opponentManaPool: pool,
      turnAnnouncement: { id: Date.now(), text: `OPPONENT casts ${trick.name}` },
    }))
    resolveAISpellAbilities(set, get, trick)
    set({ cards: attachAuras(moveCastSpellsToGraveyard(get().cards)) })
    return true
  }
  return false
}

/** Effects the AI is willing to activate on its planeswalkers. */
const BENEFICIAL_EFFECTS = new Set(['create_token', 'draw_cards', 'gain_life', 'add_mana', 'destroy', 'deal_damage', 'exile', 'put_counter', 'proliferate', 'scry'])

/**
 * Tap the AI's mana-producing creatures/artifacts ({T}: Add mana) and credit
 * its mana pool, so it can cast spells with dork mana as well as lands.
 */
function aiTapManaDorks(set: SetFn, get: () => GameState) {
  const cards = get().cards
  const pool = { ...get().opponentManaPool }
  let tappedAny = false
  for (const card of cards) {
    if ((card.owner ?? 'player') !== 'opponent' || card.zone !== 'battlefield' || card.tapped) continue
    if (!card.manaProduction) continue
    const rule = getCardRule(card.name, getCachedCardRules())
    const hasManaTap = (rule?.abilities ?? []).some(
      (a) => a.abilityType === 'activated' && a.effect?.kind === 'add_mana' && (a.cost ?? '').includes('{T}'),
    )
    if (!hasManaTap) continue
    for (const color of card.manaProduction.colors) {
      pool[color] = (pool[color] ?? 0) + card.manaProduction.amount
    }
    tappedAny = true
    set({ cards: get().cards.map((c) => c.id === card.id ? { ...c, tapped: true } : c) })
  }
  if (tappedAny) set({ opponentManaPool: pool })
}

/**
 * Activate one beneficial ability on each of the AI's planeswalkers (loyalty
 * abilities with positive or payable costs).
 */
function aiActivatePlaneswalkers(set: SetFn, get: () => GameState) {
  const cards = get().cards
  for (const card of cards) {
    if ((card.owner ?? 'player') !== 'opponent' || card.zone !== 'battlefield' || card.type !== 'planeswalker') continue
    const rule = getCardRule(card.name, getCachedCardRules())
    const loyalty = (rule?.abilities ?? []).filter((a) => a.abilityType === 'activated' && /^[+\u2212−]\d+$/.test(a.cost ?? ''))
    for (const ability of loyalty) {
      const sign = (ability.cost ?? '').charAt(0)
      const amount = parseInt((ability.cost ?? '').slice(1), 10)
      // Scryfall/parser emit the Unicode minus (U+2212); ASCII '-' also occurs.
      if (sign === '-' || sign === '\u2212' || sign === '−') {
        if ((card.counters ?? 0) < amount) continue
        set({ cards: get().cards.map((c) => c.id === card.id ? { ...c, counters: (c.counters ?? 0) - amount } : c) })
      } else {
        set({ cards: get().cards.map((c) => c.id === card.id ? { ...c, counters: (c.counters ?? 0) + amount } : c) })
      }
      resolveAIActivatedAbility(set, get, card, ability)
      break
    }
  }
}

/**
 * Activate the first affordable non-mana activated ability (draw, tokens,
 * removal) on the AI's permanents.
 */
function aiActivateUtilityAbilities(set: SetFn, get: () => GameState) {
  const cards = get().cards
  for (const card of cards) {
    if ((card.owner ?? 'player') !== 'opponent' || card.zone !== 'battlefield') continue
    if (card.type === 'planeswalker') continue
    const rule = getCardRule(card.name, getCachedCardRules())
    const abilities = (rule?.abilities ?? []).filter(
      (a) => a.abilityType === 'activated' && a.effect?.kind !== 'add_mana' && BENEFICIAL_EFFECTS.has(a.effect?.kind ?? ''),
    )
    for (const ability of abilities) {
      const cost = ability.cost ?? ''
      const manaSymbols = [...cost.matchAll(/\{[WUBRGC0-9]+\}/g)].map((m) => m[0]).join('')
      if (manaSymbols && !canPayManaCost(get().opponentManaPool, manaSymbols)) continue
      if (cost.includes('{T}') && card.tapped) continue
      if (cost.toLowerCase().includes('sacrifice')) {
        set({ cards: get().cards.map((c) => c.id === card.id ? { ...c, zone: 'graveyard' as const } : c) })
      }
      if (manaSymbols) {
        const parsed = parseManaCost(manaSymbols)
        const nextPool = { ...get().opponentManaPool }
        for (const p of parsed.colored) nextPool[p.color] = Math.max(0, (nextPool[p.color] ?? 0) - p.count)
        let g = parsed.generic
        for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
          while (g > 0 && (nextPool[color] ?? 0) > 0) { nextPool[color]!--; g-- }
        }
        set({ opponentManaPool: nextPool })
      }
      if (cost.includes('{T}') && !card.tapped) {
        set({ cards: get().cards.map((c) => c.id === card.id ? { ...c, tapped: true } : c) })
      }
      resolveAIActivatedAbility(set, get, card, ability)
      break
    }
  }
}

/**
 * Tap untapped opponent lands to pay a mana cost. Returns the updated card
 * list (tapped lands), the resulting mana pool after payment, and whether the
 * cost was fully payable.
 */
function tapLandsForCost(cards: BoardCard[], cost: string | undefined, startingPool?: ManaPool): { updated: BoardCard[]; pool: ManaPool; paid: boolean } {
  const empty = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } as ManaPool
  if (!cost) return { updated: cards, pool: { ...empty, ...(startingPool ?? {}) }, paid: true }
  const lands = cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield' && c.type === 'land' && !c.tapped)

  const parsed = parseManaCost(cost)
  const remainingColor: Record<string, number> = {}
  for (const p of parsed.colored) remainingColor[p.color] = (remainingColor[p.color] ?? 0) + p.count
  let genericRemaining = parsed.generic
  const landsToTap: string[] = []
  const pool = { ...empty, ...(startingPool ?? {}) }

  for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
    let need = Math.max(0, (remainingColor[color] ?? 0) - (pool[color] ?? 0))
    for (const l of lands) {
      if (need <= 0) break
      if (landsToTap.includes(l.id)) continue
      if (l.manaProduction?.colors.includes(color)) {
        landsToTap.push(l.id)
        need--
        pool[color] = (pool[color] ?? 0) + l.manaProduction!.amount
      }
    }
    if (need > 0) return { updated: cards, pool, paid: false }
  }

  if (genericRemaining > 0) {
    const poolTotal = Object.values(pool).reduce((sum, amount) => sum + amount, 0)
    let g = Math.max(0, genericRemaining - poolTotal)
    // Prefer colorless lands, then lands whose colors are NOT still needed for
    // the colored part of the cost — keeps colored sources available.
    const genericLands = lands
      .filter((l) => !landsToTap.includes(l.id))
      .sort((a, b) => {
        const aColorless = a.manaProduction?.colors.includes('C') ? 0 : 1
        const bColorless = b.manaProduction?.colors.includes('C') ? 0 : 1
        if (aColorless !== bColorless) return aColorless - bColorless
        const aNeeded = a.manaProduction?.colors.some((c) => (remainingColor[c] ?? 0) > 0) ? 1 : 0
        const bNeeded = b.manaProduction?.colors.some((c) => (remainingColor[c] ?? 0) > 0) ? 1 : 0
        return aNeeded - bNeeded
      })
    for (const l of genericLands) {
      if (g <= 0) break
      landsToTap.push(l.id)
      g--
      const color = l.manaProduction?.colors[0]
      if (color) pool[color] = (pool[color] ?? 0) + (l.manaProduction?.amount ?? 1)
    }
    if (g > 0) return { updated: cards, pool, paid: false }
  }

  const bp = parseManaCost(cost)
  for (const p of bp.colored) pool[p.color] = Math.max(0, (pool[p.color] ?? 0) - p.count)
  let g = bp.generic
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
    while (g > 0 && (pool[color] ?? 0) > 0) { pool[color]!--; g-- }
  }

  const updated = cards.map((c) => landsToTap.includes(c.id) ? { ...c, tapped: true } : c)
  return { updated, pool, paid: true }
}

export function createOpponentAI(set: SetFn, get: () => GameState): Pick<GameState, 'runOpponentTurn' | 'loadOpponentDeck'> {
  return {
    runOpponentTurn: () => {
      if (get().gameOver) return
      set((prev) => {
        const cards = prev.cards.map((c) =>
          (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield'
            ? { ...c, tapped: false, damage: 0, powerBoost: 0, toughnessBoost: 0 } : c
        )
        return { cards, opponentManaPool: emptyManaPool(), opponentPotentialMana: [], opponentLandPlaysThisTurn: 0 }
      })

      setTimeout(() => {
        const s = get()
        const oppCards = s.cards.filter((c) => (c.owner ?? 'player') === 'opponent')
        const libraryCard = oppCards.find((c) => c.zone === 'library')
        if (libraryCard) {
          set({ cards: s.cards.map((c) => c.id === libraryCard.id ? { ...c, zone: 'hand' as const } : c) })
        } else if (oppCards.length > 0) {
          // Opponent tried to draw from an empty library — it loses.
          set({
            gameOver: { winner: 'player' },
            turnPrompt: null,
            turnAnnouncement: { id: Date.now(), text: 'OPPONENT DEFEATED — library empty' },
          })
          return
        }
        set({ turnAnnouncement: { id: Date.now(), text: 'OPPONENT untaps and draws' } })

        setTimeout(() => {
          if (get().gameOver) return
          const s2 = get()
          const oppHand = s2.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'hand')
          const land = oppHand.find((c) => c.type === 'land')
          if (land) {
            set((prev) => ({
              cards: prev.cards.map((c) => c.id === land.id ? { ...c, zone: 'battlefield' as const, tapped: false, revealed: false, enteredAtTurn: prev.turn } : c),
              opponentLandPlaysThisTurn: 1,
              currentPhase: 'precombat_main',
              turnAnnouncement: { id: Date.now(), text: `OPPONENT plays ${land.name}` },
            }))
          }

          setTimeout(() => {
            if (get().gameOver) return
            // Tap mana dorks so the cast step sees their mana too.
            aiTapManaDorks(set, get)
            const s3 = get()
            const oppHand2 = s3.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'hand')
            const oppBattlefield = s3.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield')
            const oppCommand = s3.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'command')
            const oppLands = oppBattlefield.filter((c) => c.type === 'land' && !c.tapped)
            const manaPool = { ...s3.opponentManaPool } as ManaPool
            for (const l of oppLands) {
              if (l.manaProduction) {
                for (const c of l.manaProduction.colors) manaPool[c] = (manaPool[c] ?? 0) + l.manaProduction.amount
              }
            }

            const commanderCast = pickCommanderCast(oppCommand, manaPool)
            const toCast = pickSpell(oppHand2, oppBattlefield, manaPool) ?? commanderCast?.card ?? null
            const castCost = toCast
              ? commanderCast && toCast.id === commanderCast.card.id ? commanderCast.cost : toCast.manaCost
              : undefined
            if (toCast && castCost) {
              const isCommanderCast = commanderCast !== null && toCast.id === commanderCast.card.id
              set((prev) => {
                const { updated, pool, paid } = tapLandsForCost(prev.cards, castCost, prev.opponentManaPool)
                if (!paid) return {}
                const cards = updated.map((c) =>
                  c.id === toCast.id
                    ? { ...c, zone: 'battlefield' as const, tapped: false, revealed: false, enteredAtTurn: prev.turn, commanderTax: isCommanderCast ? (toCast.commanderTax ?? 0) + 1 : (c.commanderTax ?? 0) }
                    : c,
                )
                return {
                  cards,
                  opponentManaPool: pool,
                  turnAnnouncement: { id: Date.now(), text: `OPPONENT casts ${toCast.name}` },
                }
              })
              resolveAISpellAbilities(set, get, toCast)
              set({ cards: attachAuras(moveCastSpellsToGraveyard(get().cards)) })
              if (toCast.type !== 'instant' && toCast.type !== 'sorcery') {
                resolveAIAutoAbilities(set, get, toCast, 'etb')
              }
            }

            setTimeout(() => {
              if (get().gameOver) return
              // Use the AI's permanents: planeswalker loyalty and utility taps.
              aiActivatePlaneswalkers(set, get)
              aiActivateUtilityAbilities(set, get)
              set({ cards: attachAuras(get().cards) })
            }, 600)

            setTimeout(() => {
              if (get().gameOver) return
              const s4 = get()
              const oppBattlefield2 = s4.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield')
              const playerDefenders = s4.cards.filter((c) => (c.owner ?? 'player') === 'player' && c.zone === 'battlefield')
              const attackerIds = pickAttackers(oppBattlefield2, s4.turn, playerDefenders, s4.lifeTotal, s4.commanderDamage)

              // Combat trick: cast the first affordable instant before attacking.
              aiCastInstant(set, get)

              set({
                combatState: { active: true, attackers: attackerIds, blockers: {} },
                currentPhase: 'combat',
                turnAnnouncement: { id: Date.now(), text: attackerIds.length > 0
                  ? `OPPONENT attacks with ${attackerIds.length} creature(s) — right-click your creatures to block`
                  : 'OPPONENT has no attackers' },
              })

              // Fire the AI's attack triggers ("whenever this attacks, ...").
              for (const id of attackerIds) {
                const attacker = get().cards.find((c) => c.id === id)
                if (attacker) resolveAIAutoAbilities(set, get, attacker, 'attack')
              }

              // Give the player a full blocking window only when they actually
              // have something that could block; otherwise resolve quickly.
              const playerCanBlock = get().cards.some(
                (c) => (c.owner ?? 'player') === 'player' && c.zone === 'battlefield' && c.type === 'creature' && !c.tapped && getCardPower(c) > 0,
              )
              const resolveDelay = attackerIds.length > 0 && playerCanBlock ? 8000 : 1500
              set({
                combatState: { ...get().combatState, resolveAt: Date.now() + resolveDelay },
              })
              setTimeout(() => {
                const s5 = get()
                if (s5.activePlayer !== 'opponent' || s5.gameOver) return
                get().resolveCombat()
                resolveAITriggerInstances(set, get)
                set({ currentPhase: 'postcombat_main' })

                // End-of-turn cleanup: discard down to a 7-card hand.
                const oppHand = s5.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'hand')
                if (oppHand.length > 7) {
                  const excess = oppHand.length - 7
                  const discardIds = new Set(oppHand.slice(0, excess).map((c) => c.id))
                  set({
                    cards: get().cards.map((c) =>
                      discardIds.has(c.id) ? { ...c, zone: 'graveyard' as const, revealed: true } : c,
                    ),
                    currentPhase: 'ending',
                  })
                }

                get().advanceTurn()
              }, resolveDelay)
            }, 600)
          }, 600)
        }, 400)
      }, 400)
    },

    loadOpponentDeck: (_commanderNames, deckCards, opponentName) => {
      cacheDeckImages(deckCards)
      set((state) => {
        const commanderIds = new Set(deckCards
          .filter((dc) => _commanderNames.some((name) => dc.name.toLowerCase() === name.toLowerCase()))
          .map((dc) => dc.name))
        const cards: BoardCard[] = []

        for (const dc of deckCards) {
          const rules = getCachedCardRules()?.[dc.name]
          const features = getCardTypeFeatures(dc.typeLine, dc.name)
          const isCommander = commanderIds.has(dc.name)
          for (let i = 0; i < dc.quantity; i++) {
            cards.push({
              id: crypto.randomUUID(),
              scryfallId: dc.scryfallId,
              name: dc.name,
              imageUri: localCardImage(dc.scryfallId) ?? dc.imageUri,
              manaCost: rules?.manaCost ?? dc.manaCost,
              manaValue: rules?.manaValue ?? dc.manaValue,
              oracleText: dc.oracleText,
              ...features,
              manaProduction: rules?.manaProduction ?? dc.manaProduction,
              entryTapMode: dc.entryTapMode ?? 'automatic',
              entersTapped: rules?.entryTapRule === 'always' || dc.entersTapped === true,
              entryTapRule: rules?.entryTapRule ?? dc.entryTapRule,
              zone: isCommander ? 'command' as Zone : 'library' as Zone,
              tapped: false,
              counters: 0,
              type: classifyType(dc.typeLine),
              revealed: isCommander,
              owner: 'opponent',
              isCommander,
            })
          }
        }
        const libraryCards = shuffle(cards.filter((c) => c.zone === 'library'))
        const commanders = cards.filter((c) => c.zone === 'command')
        const drawn = libraryCards.map((c, i) => i < 7 ? { ...c, zone: 'hand' as Zone } : c)
        return {
          ...pushUndo(state),
          showOpponent: true,
          opponentName: opponentName ?? null,
          cards: [...state.cards, ...commanders, ...drawn],
          activePlayer: 'opponent' as ActivePlayer,
          currentPhase: 'beginning',
          turnAnnouncement: { id: Date.now(), text: `${opponentName ?? 'OPPONENT'}'S FIRST TURN` },
        }
      })
      get().runOpponentTurn()
    },
  }
}

function emptyManaPool(): ManaPool {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
}
