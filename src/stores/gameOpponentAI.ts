import type { BoardCard, ManaPool, Zone } from '../types/card'
import type { ActivePlayer } from './gameStore'
import type { GameState } from './gameStore'
import { shuffle, classifyType, parseManaCost, getCardPower } from '../utils/misc'
import { pushUndo, attachAuras } from './gameRules'
import { getCardTypeFeatures } from '../data/cardFeatures'
import { getCachedCardRules } from './cardRulesLoader'
import { localCardImage } from '../data/localCardImages'
import { cacheDeckImages } from '../services/cardImageCache'
import { pickSpell, pickAttackers, pickCommanderCast } from './opponentAI'
import { resolveAISpellAbilities, resolveAIAutoAbilities, resolveAITriggerInstances } from './spellResolution'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

/**
 * Tap untapped opponent lands to pay a mana cost. Returns the updated card
 * list (tapped lands), the resulting mana pool after payment, and whether the
 * cost was fully payable.
 */
function tapLandsForCost(cards: BoardCard[], cost: string | undefined): { updated: BoardCard[]; pool: ManaPool; paid: boolean } {
  const empty = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } as ManaPool
  if (!cost) return { updated: cards, pool: empty, paid: true }
  const lands = cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield' && c.type === 'land' && !c.tapped)

  const parsed = parseManaCost(cost)
  const remainingColor: Record<string, number> = {}
  for (const p of parsed.colored) remainingColor[p.color] = (remainingColor[p.color] ?? 0) + p.count
  let genericRemaining = parsed.generic
  const landsToTap: string[] = []
  const pool = { ...empty }

  for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
    let need = remainingColor[color] ?? 0
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
    for (const l of lands) {
      if (genericRemaining <= 0) break
      if (landsToTap.includes(l.id)) continue
      landsToTap.push(l.id)
      genericRemaining--
      const color = l.manaProduction?.colors[0]
      if (color) pool[color] = (pool[color] ?? 0) + (l.manaProduction?.amount ?? 1)
    }
    if (genericRemaining > 0) return { updated: cards, pool, paid: false }
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
              turnAnnouncement: { id: Date.now(), text: `OPPONENT plays ${land.name}` },
            }))
          }

          setTimeout(() => {
            if (get().gameOver) return
            const s3 = get()
            const oppHand2 = s3.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'hand')
            const oppBattlefield = s3.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield')
            const oppCommand = s3.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'command')
            const oppLands = oppBattlefield.filter((c) => c.type === 'land' && !c.tapped)
            const manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } as ManaPool
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
                const { updated, pool, paid } = tapLandsForCost(prev.cards, castCost)
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
              set({ cards: attachAuras(get().cards) })
              if (toCast.type !== 'instant' && toCast.type !== 'sorcery') {
                resolveAIAutoAbilities(set, get, toCast, 'etb')
              }
            }

            setTimeout(() => {
              if (get().gameOver) return
              const s4 = get()
              const oppBattlefield2 = s4.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield')
              const playerDefenders = s4.cards.filter((c) => (c.owner ?? 'player') === 'player' && c.zone === 'battlefield')
              const attackerIds = pickAttackers(oppBattlefield2, s4.turn, playerDefenders)

              // Combat trick: cast the first affordable instant before attacking.
              const oppHand3 = s4.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'hand' && c.type === 'instant')
              for (const trick of oppHand3) {
                if (!trick.manaCost) continue
                const { updated, pool, paid } = tapLandsForCost(s4.cards, trick.manaCost)
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
                set({ cards: attachAuras(get().cards) })
                break
              }

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
              setTimeout(() => {
                const s5 = get()
                if (s5.activePlayer !== 'opponent' || s5.gameOver) return
                get().resolveCombat()
                resolveAITriggerInstances(set, get)

                // End-of-turn cleanup: discard down to a 7-card hand.
                const oppHand = s5.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'hand')
                if (oppHand.length > 7) {
                  const excess = oppHand.length - 7
                  const discardIds = new Set(oppHand.slice(0, excess).map((c) => c.id))
                  set({
                    cards: get().cards.map((c) =>
                      discardIds.has(c.id) ? { ...c, zone: 'graveyard' as const, revealed: true } : c,
                    ),
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
