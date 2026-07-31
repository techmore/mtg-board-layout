import type { BoardCard, ManaPool, Zone } from '../types/card'
import type { ActivePlayer } from './gameStore'
import type { GameState } from './gameStore'
import { shuffle, classifyType, parseManaCost } from '../utils/misc'
import { pushUndo } from './gameRules'
import { getCardTypeFeatures } from '../data/cardFeatures'
import { getCachedCardRules } from './cardRulesLoader'
import { localCardImage } from '../data/localCardImages'
import { cacheDeckImages } from '../services/cardImageCache'
import { pickSpell, pickAttackers } from './opponentAI'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

export function createOpponentAI(set: SetFn, get: () => GameState): Pick<GameState, 'runOpponentTurn' | 'loadOpponentDeck'> {
  return {
    runOpponentTurn: () => {
      set((prev) => {
        const cards = prev.cards.map((c) =>
          (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield'
            ? { ...c, tapped: false } : c
        )
        return { cards, opponentManaPool: emptyManaPool(), opponentPotentialMana: [], opponentLandPlaysThisTurn: 0 }
      })

      setTimeout(() => {
        const s = get()
        const oppCards = s.cards.filter((c) => (c.owner ?? 'player') === 'opponent')
        const libraryCard = oppCards.find((c) => c.zone === 'library')
        if (libraryCard) {
          set({ cards: s.cards.map((c) => c.id === libraryCard.id ? { ...c, zone: 'hand' as const } : c) })
        }
        set({ turnAnnouncement: { id: Date.now(), text: 'OPPONENT untaps and draws' } })

        setTimeout(() => {
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
            const s3 = get()
            const oppHand2 = s3.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'hand')
            const oppBattlefield = s3.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield')
            const oppLands = oppBattlefield.filter((c) => c.type === 'land' && !c.tapped)
            const manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } as ManaPool
            for (const l of oppLands) {
              if (l.manaProduction) {
                for (const c of l.manaProduction.colors) manaPool[c] = (manaPool[c] ?? 0) + l.manaProduction.amount
              }
            }

            const toCast = pickSpell(oppHand2, oppBattlefield, manaPool)
            if (toCast && toCast.manaCost) {
              const parsed = parseManaCost(toCast.manaCost)
              const remainingColor: Record<string, number> = {}
              for (const p of parsed.colored) remainingColor[p.color] = (remainingColor[p.color] ?? 0) + p.count
              let genericRemaining = parsed.generic

              set((prev) => {
                const landsToTap: string[] = []
                const newPool = { ...prev.opponentManaPool } as ManaPool
                const updatedCards = [...prev.cards]

                for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
                  const need = remainingColor[color] ?? 0
                  let have = need
                  for (const l of oppLands) {
                    if (have <= 0) break
                    if (l.tapped || landsToTap.includes(l.id)) break
                    if (l.manaProduction?.colors.includes(color)) {
                      landsToTap.push(l.id)
                      have--
                      newPool[color] = (newPool[color] ?? 0) + l.manaProduction!.amount
                    }
                  }
                }

                if (genericRemaining > 0) {
                  for (const l of oppLands) {
                    if (genericRemaining <= 0) break
                    if (l.tapped || landsToTap.includes(l.id)) continue
                    landsToTap.push(l.id)
                    genericRemaining--
                    if (l.manaProduction) {
                      const c = l.manaProduction.colors[0]
                      newPool[c] = (newPool[c] ?? 0) + l.manaProduction.amount
                    }
                  }
                }

                for (const lid of landsToTap) {
                  const idx = updatedCards.findIndex((c) => c.id === lid)
                  if (idx >= 0) updatedCards[idx] = { ...updatedCards[idx], tapped: true }
                }

                if (toCast.manaCost) {
                  const bp = parseManaCost(toCast.manaCost)
                  for (const p of bp.colored) newPool[p.color] = Math.max(0, (newPool[p.color] ?? 0) - p.count)
                  let g = bp.generic
                  for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
                    while (g > 0 && (newPool[color] ?? 0) > 0) { newPool[color]!--; g-- }
                  }
                }

                const idx = updatedCards.findIndex((c) => c.id === toCast.id)
                if (idx >= 0) updatedCards[idx] = { ...updatedCards[idx], zone: 'battlefield' as const, tapped: false, revealed: false, enteredAtTurn: prev.turn }

                return {
                  cards: updatedCards,
                  opponentManaPool: newPool,
                  turnAnnouncement: { id: Date.now(), text: `OPPONENT casts ${toCast.name}` },
                }
              })
            }

            setTimeout(() => {
              const s4 = get()
              const oppBattlefield2 = s4.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield')
              const attackerIds = pickAttackers(oppBattlefield2, s4.turn)
              set({
                combatState: { active: true, attackers: attackerIds, blockers: {} },
                currentPhase: 'combat',
                turnAnnouncement: { id: Date.now(), text: attackerIds.length > 0
                  ? `OPPONENT attacks with ${attackerIds.length} creature(s)`
                  : 'OPPONENT has no attackers' },
              })

              setTimeout(() => {
                const s5 = get()
                if (s5.activePlayer !== 'opponent') return
                get().resolveCombat()
                get().advanceTurn()
              }, 1200)
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
