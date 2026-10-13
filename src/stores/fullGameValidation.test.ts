/**
 * Full-game validation: every prebuilt deck plays against the AI engine using
 * the REAL rules database (public/all-decks-rules.json) — not the empty
 * fixtures the smoke tests use. Each game runs up to 25 AI turns; the "player"
 * side idles as a defender so pickBlockers, combat resolution, deaths and
 * state-based actions all run for real.
 *
 * Validated per deck:
 *  - no crash across the whole simulation
 *  - zero "not implemented" ability toasts
 *  - finite life totals, drained trigger stack, turn progression
 *  - the AI actually developed a board (permanents entered play)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import allRulesJson from '../../public/all-decks-rules.json'
import { useGameStore } from './gameStore'
import { useToastStore } from './toastStore'
import { primeCardRules } from './cardRulesLoader'
import { filterMatch } from '../components/Board/triggerUtils'
import { prebuiltDecks, type PrebuiltDeck } from '../data/prebuiltDecks'
import type { CardRuleEntry, DeckCard, ManaPool } from '../types/card'

const allRules = allRulesJson as unknown as Record<string, CardRuleEntry>

const emptyManaPool = (): ManaPool => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 })
const MAX_TURNS = 25

function deckCardsFromRules(deck: PrebuiltDeck): DeckCard[] {
  const names = [deck.commander, ...(deck.partners ?? []), ...deck.cards]
  return names.map((name) => {
    const entry = allRules[name]
    if (!entry) {
      const basic = /plains|island|swamp|mountain|forest/i.test(name)
      return {
        scryfallId: `sf-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        manaCost: '',
        manaValue: 0,
        typeLine: basic ? `Basic Land — ${name}` : 'Creature',
        imageUri: '',
        quantity: 1,
      }
    }
    return {
      scryfallId: entry.scryfallId,
      name,
      manaCost: entry.manaCost,
      manaValue: entry.manaValue,
      typeLine: entry.typeLine,
      oracleText: entry.oracleText,
      imageUri: '',
      quantity: 1,
    }
  })
}

function resetStore() {
  useGameStore.setState({
    cards: [],
    tokens: [],
    manaPool: emptyManaPool(),
    potentialMana: [],
    opponentManaPool: emptyManaPool(),
    opponentPotentialMana: [],
    lifeTotal: 40,
    opponentLifeTotal: 40,
    energyCounters: 0,
    opponentEnergyCounters: 0,
    radCounters: 0,
    opponentRadCounters: 0,
    experienceCounters: 0,
    opponentExperienceCounters: 0,
    turn: 1,
    landPlaysThisTurn: 0,
    activePlayer: 'player',
    currentPhase: 'beginning',
    combatState: { active: false, attackers: [], blockers: {} },
    triggerStack: [],
    graveyardCast: null,
    graveyardIntake: { player: 0, opponent: 0 },
    lastResolvedAbility: null,
    ring: undefined,
    poisonCounters: undefined,
    forceAttack: null,
    parityBan: null,
    scourgeUntapTurn: null,
    monarch: null,
    gameOver: null,
    turnPrompt: null,
    turnAnnouncement: null,
    drawNotice: null,
    commanderDamage: {},
  })
}

let toasts: string[] = []
let originalPush: ReturnType<typeof useToastStore.getState>['push']
let nanStack: string | null = null

beforeEach(() => {
  primeCardRules(allRules)
  resetStore()
  toasts = []
  nanStack = null
  originalPush = useToastStore.getState().push
  useToastStore.setState({
    push: (message: string, kind) => {
      toasts.push(`${kind ?? 'info'}: ${message}`)
    },
  })
  // Capture where the first NaN life total comes from.
  useGameStore.subscribe((state) => {
    if ((!Number.isFinite(state.lifeTotal) || !Number.isFinite(state.opponentLifeTotal)) && !nanStack) {
      nanStack = new Error('first NaN life').stack ?? 'unknown'
    }
  })
})

afterEach(() => {
  useToastStore.setState({ push: originalPush })
  vi.clearAllTimers()
  vi.useRealTimers()
})

function assertSaneState(label: string) {
  const state = useGameStore.getState()
  expect(Number.isFinite(state.lifeTotal), `${label}: player life NaN\n${nanStack ?? ''}`).toBe(true)
  expect(Number.isFinite(state.opponentLifeTotal), `${label}: opponent life NaN\n${nanStack ?? ''}`).toBe(true)
  expect(state.triggerStack.length, `${label}: trigger stack backed up: ${describeStack(state)}`).toBeLessThan(20)
}

function describeStack(state: ReturnType<typeof useGameStore.getState>): string {
  return state.triggerStack.slice(0, 8).map((t) => {
    const src = state.cards.find((c) => c.id === t.sourceCardId)
    return `${src?.name ?? t.sourceCardName}/${(src?.owner ?? 'player')}${t.ability.targets > 0 ? ` (targets ${t.selectedTargets?.length ?? 0}/${t.ability.targets})` : ''}:${t.ability.effect.kind}`
  }).join(' | ')
}

/** Play like a real person: resolve/cancel the player's pending triggers. */
function drainPlayerTriggers() {
  for (let guard = 0; guard < 60; guard++) {
    const state = useGameStore.getState()
    const next = state.triggerStack.find((t) => {
      const src = state.cards.find((c) => c.id === t.sourceCardId)
      return (src?.owner ?? 'player') === 'player'
    })
    if (!next) return
    const needsTarget = next.selectedTargets !== undefined && (next.ability.targets ?? 0) > (next.selectedTargets?.length ?? 0)
    if (needsTarget) {
      const candidates = state.cards.filter((c) =>
        (c.zone === 'battlefield' || c.zone === 'graveyard') &&
        c.id !== next.sourceCardId &&
        filterMatch(next.ability.targetFilter, c))
      const candidate = candidates[0]
      if (candidate) useGameStore.getState().selectTarget(next.id, candidate.id)
      else useGameStore.getState().skipTrigger(next.id)
    } else {
      useGameStore.getState().resolveTrigger(next.id)
    }
  }
}

function playAiTurns(maxTurns: number) {
  let maxOpponentBoard = 0
  for (let i = 0; i < maxTurns; i++) {
    if (useGameStore.getState().gameOver) break
    useGameStore.setState({ activePlayer: 'opponent' })
    useGameStore.getState().runOpponentTurn()
    vi.advanceTimersByTime(16000)
    drainPlayerTriggers()
    assertSaneState(`turn ${i + 1}`)
    maxOpponentBoard = Math.max(
      maxOpponentBoard,
      useGameStore.getState().cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield').length,
    )
  }
  return { maxOpponentBoard }
}

describe('full-game validation (real rules database)', () => {
  it.each(prebuiltDecks.map((d) => [d.name, d] as const))(
    '%s: up to 25 AI turns with real rules — no crashes, no unimplemented abilities',
    (_, deck) => {
      const cards = deckCardsFromRules(deck)
      useGameStore.getState().loadDeck([deck.commander, ...(deck.partners ?? [])], cards, deck.id)
      useGameStore.getState().loadOpponentDeck([deck.commander, ...(deck.partners ?? [])], cards, deck.name)

      vi.useFakeTimers()
      const { maxOpponentBoard } = playAiTurns(MAX_TURNS)

      const state = useGameStore.getState()
      // The simulation made real progress: turns advanced and the AI developed
      // a board (or won — an ended game is a valid outcome).
      expect(state.turn).toBeGreaterThan(1)
      expect(maxOpponentBoard).toBeGreaterThan(0)
      // Zero unimplemented-ability toasts across the whole game.
      const unimplemented = toasts.filter((t) => /not implemented/i.test(t))
      expect(unimplemented, unimplemented.slice(0, 5).join(' | ')).toEqual([])
    },
  )

  it('a longer game still holds together (40 turns, first deck)', () => {
    const deck = prebuiltDecks[0]
    const cards = deckCardsFromRules(deck)
    useGameStore.getState().loadDeck([deck.commander, ...(deck.partners ?? [])], cards, deck.id)
    useGameStore.getState().loadOpponentDeck([deck.commander, ...(deck.partners ?? [])], cards, deck.name)

    vi.useFakeTimers()
    playAiTurns(40)

    const state = useGameStore.getState()
    expect(Number.isFinite(state.turn)).toBe(true)
    const unimplemented = toasts.filter((t) => /not implemented/i.test(t))
    expect(unimplemented, unimplemented.slice(0, 5).join(' | ')).toEqual([])
  })

  it('the rules database covers every card in every prebuilt deck', () => {
    const missing: string[] = []
    for (const deck of prebuiltDecks) {
      for (const name of [deck.commander, ...(deck.partners ?? []), ...deck.cards]) {
        if (!allRules[name]) missing.push(`${deck.name}: ${name}`)
      }
    }
    expect(missing, missing.join(' | ')).toEqual([])
  })
})
