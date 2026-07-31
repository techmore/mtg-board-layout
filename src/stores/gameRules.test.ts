import { afterEach, describe, expect, it } from 'vitest'
import type { BoardCard, ManaPool } from '../types/card'
import {
  advanceTurnState,
  beginUndoTransaction,
  emptyManaPool,
  endUndoTransaction,
  generatedManaState,
  moveCastSpellsToGraveyard,
  prepareCardPlay,
  pushUndo,
  pushUndoSnapshot,
  resetAndDealCards,
  resolveEntryRules,
  takeSnapshot,
} from './gameRules'
import type { GameState } from './gameStore'

const fullManaPool = (): ManaPool => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 })

function card(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: 'card-1',
    scryfallId: 'scryfall-1',
    name: 'Test Card',
    imageUri: '',
    typeLine: 'Creature',
    subtypes: [],
    isBasicLand: false,
    zone: 'hand',
    tapped: false,
    counters: 0,
    type: 'creature',
    revealed: false,
    ...overrides,
  }
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    cards: [],
    manaPool: fullManaPool(),
    potentialMana: [],
    manaLog: [],
    effectHistory: [],
    tokens: [],
    lifeTotal: 40,
    opponentLifeTotal: 40,
    turn: 3,
    landPlaysThisTurn: 0,
    drawNotice: null,
    turnAnnouncement: null,
    turnPrompt: null,
    currentPhase: 'beginning',
    activePlayer: 'player',
    combatState: { active: false, attackers: [], blockers: {} },
    opponentManaPool: fullManaPool(),
    opponentPotentialMana: [],
    opponentLandPlaysThisTurn: 0,
    undoStack: [],
    redoStack: [],
    triggerStack: [],
    ...overrides,
  } as unknown as GameState
}

afterEach(() => {
  endUndoTransaction()
})

describe('resolveEntryRules', () => {
  it('flags a card that enters the battlefield tapped', () => {
    const rules = resolveEntryRules(card({ oracleText: 'Test Card enters the battlefield tapped.' }))
    expect(rules).toEqual({ entryTapRule: 'always', entersTapped: true })
  })

  it('flags a conditional entry tap as conditional', () => {
    const rules = resolveEntryRules(card({ oracleText: 'This land enters tapped unless you control a Plains.' }))
    expect(rules.entryTapRule).toBe('conditional')
  })
})

describe('prepareCardPlay — lands', () => {
  it('blocks a second land play when the land limit is reached', () => {
    const land = card({ type: 'land', typeLine: 'Land', zone: 'hand' })
    const preparation = prepareCardPlay(land, { landPlaysThisTurn: 1, manaPool: fullManaPool(), cards: [] })

    expect(preparation.blockReason).toBe('land')
    expect(preparation.entersBattlefield).toBe(true)
    expect(preparation.isLandPlay).toBe(true)
    expect(preparation.canPayMana).toBe(true)
  })

  it('allows the first land play of the turn', () => {
    const land = card({ type: 'land', typeLine: 'Land', zone: 'hand' })
    const preparation = prepareCardPlay(land, { landPlaysThisTurn: 0, manaPool: fullManaPool(), cards: [] })

    expect(preparation.blockReason).toBeNull()
  })

  it('ignores the land limit with ignoreLandLimit', () => {
    const land = card({ type: 'land', typeLine: 'Land', zone: 'hand' })
    const preparation = prepareCardPlay(
      land,
      { landPlaysThisTurn: 1, manaPool: fullManaPool(), cards: [] },
      { ignoreLandLimit: true },
    )

    expect(preparation.blockReason).toBeNull()
  })

  it('never blocks a commander cast from the command zone with the land limit', () => {
    const land = card({ type: 'land', typeLine: 'Land', zone: 'command' })
    const preparation = prepareCardPlay(land, { landPlaysThisTurn: 1, manaPool: fullManaPool(), cards: [] })

    expect(preparation.blockReason).toBeNull()
    expect(preparation.castFromCommand).toBe(true)
  })
})

describe('prepareCardPlay — non-land spells', () => {
  it('deducts the mana cost from the pool when affordable', () => {
    const spell = card({ type: 'creature', typeLine: 'Creature', zone: 'hand', manaCost: '{1}{W}' })
    const preparation = prepareCardPlay(spell, {
      landPlaysThisTurn: 0,
      manaPool: { ...fullManaPool(), W: 1, C: 1 },
      cards: [],
    })

    expect(preparation.canPayMana).toBe(true)
    expect(preparation.manaPoolAfterPlay).toEqual(fullManaPool())
  })

  it('reports canPayMana false when the pool cannot cover the cost', () => {
    const spell = card({ type: 'creature', typeLine: 'Creature', zone: 'hand', manaCost: '{1}{W}' })
    const preparation = prepareCardPlay(spell, {
      landPlaysThisTurn: 0,
      manaPool: { ...fullManaPool(), W: 1 },
      cards: [],
    })

    expect(preparation.canPayMana).toBe(false)
    expect(preparation.blockReason).toBeNull()
  })

  it('charges nothing for a card with no mana cost', () => {
    const spell = card({ type: 'creature', typeLine: 'Creature', zone: 'hand' })
    const preparation = prepareCardPlay(spell, {
      landPlaysThisTurn: 0,
      manaPool: fullManaPool(),
      cards: [],
    })

    expect(preparation.canPayMana).toBe(true)
    expect(preparation.manaPoolAfterPlay).toEqual(fullManaPool())
  })

  it('leaves a card already on the battlefield untouched', () => {
    const spell = card({ type: 'creature', typeLine: 'Creature', zone: 'battlefield', manaCost: '{W}' })
    const preparation = prepareCardPlay(spell, {
      landPlaysThisTurn: 1,
      manaPool: { ...fullManaPool(), W: 1 },
      cards: [],
    })

    expect(preparation.entersBattlefield).toBe(false)
    expect(preparation.isLandPlay).toBe(false)
    expect(preparation.entersTapped).toBe(false)
    expect(preparation.blockReason).toBeNull()
    expect(preparation.manaPoolAfterPlay).toEqual({ ...fullManaPool(), W: 1 })
  })
})

describe('prepareCardPlay — commanders', () => {
  it('increments the commander tax and adds the tax to the cost for later casts', () => {
    const commander = card({
      type: 'creature',
      typeLine: 'Legendary Creature',
      zone: 'command',
      manaCost: '{2}{W}',
      commanderTax: 2,
    })
    const preparation = prepareCardPlay(commander, {
      landPlaysThisTurn: 0,
      manaPool: { ...fullManaPool(), W: 1, C: 6 },
      cards: [],
    })

    expect(preparation.castFromCommand).toBe(true)
    expect(preparation.commanderTax).toBe(3)
    expect(preparation.effectiveCost).toBe('{2}{W}{4}')
    expect(preparation.canPayMana).toBe(true)
  })

  it('does not add a tax surcharge on the first cast', () => {
    const commander = card({
      type: 'creature',
      typeLine: 'Legendary Creature',
      zone: 'command',
      manaCost: '{2}{W}',
      commanderTax: 0,
    })
    const preparation = prepareCardPlay(commander, {
      landPlaysThisTurn: 0,
      manaPool: { ...fullManaPool(), W: 1, C: 2 },
      cards: [],
    })

    expect(preparation.commanderTax).toBe(1)
    expect(preparation.effectiveCost).toBe('{2}{W}')
  })

  it('treats a non-commander card in hand without affecting the tax', () => {
    const creature = card({ type: 'creature', typeLine: 'Creature', zone: 'hand', commanderTax: 2, manaCost: '{W}' })
    const preparation = prepareCardPlay(creature, {
      landPlaysThisTurn: 0,
      manaPool: { ...fullManaPool(), W: 1 },
      cards: [],
    })

    expect(preparation.castFromCommand).toBe(false)
    expect(preparation.commanderTax).toBe(2)
    expect(preparation.effectiveCost).toBe('{W}')
  })
})

describe('prepareCardPlay — conditional entry tap', () => {
  it('blocks with reason etb when a conditional entry tap cannot be evaluated', () => {
    // evaluateConditionalEntryTap only understands lands, so a non-land with
    // "enters tapped unless..." text yields an unresolved condition.
    const creature = card({
      type: 'creature',
      typeLine: 'Creature',
      zone: 'hand',
      oracleText: 'This creature enters the battlefield tapped unless you control a Plains.',
    })
    const preparation = prepareCardPlay(creature, { landPlaysThisTurn: 0, manaPool: fullManaPool(), cards: [] })

    expect(preparation.entryTapRule).toBe('conditional')
    expect(preparation.blockReason).toBe('etb')
  })

  it('blocks with reason etb for unsupported conditional land text', () => {
    const land = card({
      type: 'land',
      typeLine: 'Land',
      zone: 'hand',
      oracleText: 'This land enters tapped unless you control a Gorgon.',
    })
    const preparation = prepareCardPlay(land, { landPlaysThisTurn: 0, manaPool: fullManaPool(), cards: [] })

    expect(preparation.blockReason).toBe('etb')
  })

  it('resolves the condition when the battlefield satisfies it', () => {
    const basic = card({
      id: 'plains',
      type: 'land',
      typeLine: 'Basic Land — Plains',
      subtypes: ['Plains'],
      isBasicLand: true,
      zone: 'battlefield',
    })
    const land = card({
      type: 'land',
      typeLine: 'Land',
      zone: 'hand',
      oracleText: 'This land enters tapped unless you control a Plains.',
    })
    const preparation = prepareCardPlay(land, { landPlaysThisTurn: 0, manaPool: fullManaPool(), cards: [basic] })

    expect(preparation.blockReason).toBeNull()
    expect(preparation.entersTapped).toBe(false)
  })

  it('resolves with the card default when resolveConditionalEntry is set', () => {
    const creature = card({
      type: 'creature',
      typeLine: 'Creature',
      zone: 'hand',
      oracleText: 'This creature enters the battlefield tapped unless you control a Plains.',
    })
    const preparation = prepareCardPlay(
      creature,
      { landPlaysThisTurn: 0, manaPool: fullManaPool(), cards: [] },
      { resolveConditionalEntry: true },
    )

    expect(preparation.blockReason).toBeNull()
    expect(preparation.entersTapped).toBe(false)
  })
})

describe('resetAndDealCards', () => {
  it('keeps commanders in the command zone and deals the opening hand from the library', () => {
    const commander = card({
      id: 'commander',
      type: 'creature',
      typeLine: 'Legendary Creature',
      zone: 'command',
      commanderTax: 2,
      tapped: true,
      counters: 3,
    })
    const library = Array.from({ length: 10 }, (_, index) =>
      card({ id: `library-${index}`, type: 'creature', zone: 'battlefield', tapped: true, counters: 1 }),
    )

    const dealt = resetAndDealCards([commander, ...library], 7)

    expect(dealt.find((candidate) => candidate.id === 'commander')).toMatchObject({
      zone: 'command',
      revealed: true,
      commanderTax: 2,
      tapped: false,
      counters: 0,
    })
    const inHand = dealt.filter((candidate) => candidate.zone === 'hand')
    expect(inHand).toHaveLength(7)
    expect(inHand.every((candidate) => !candidate.revealed && !candidate.tapped && candidate.counters === 0)).toBe(true)
    const handIds = new Set(inHand.map((candidate) => candidate.id))
    expect([...handIds].every((id) => id.startsWith('library-'))).toBe(true)
    expect(dealt.filter((candidate) => candidate.zone === 'library')).toHaveLength(3)
  })

  it('deals every library card when the opening hand exceeds the deck size', () => {
    const cards = Array.from({ length: 4 }, (_, index) => card({ id: `library-${index}` }))

    const dealt = resetAndDealCards(cards, 7)

    expect(dealt.filter((candidate) => candidate.zone === 'hand')).toHaveLength(4)
    expect(dealt.filter((candidate) => candidate.zone === 'library')).toHaveLength(0)
  })

  it('floors fractional opening hand sizes and clamps negatives to zero', () => {
    const cards = Array.from({ length: 5 }, (_, index) => card({ id: `library-${index}` }))

    expect(resetAndDealCards(cards, 2.9).filter((candidate) => candidate.zone === 'hand')).toHaveLength(2)
    expect(resetAndDealCards(cards, -1).filter((candidate) => candidate.zone === 'hand')).toHaveLength(0)
  })

  it('does not mutate the source cards', () => {
    const cards = Array.from({ length: 5 }, (_, index) => card({ id: `library-${index}`, zone: 'battlefield', tapped: true }))

    resetAndDealCards(cards, 2)

    expect(cards.every((candidate) => candidate.zone === 'battlefield' && candidate.tapped === true)).toBe(true)
  })
})

describe('moveCastSpellsToGraveyard', () => {
  it('moves battlefield instants and sorceries to the graveyard', () => {
    const instant = card({ id: 'bolt', type: 'instant', typeLine: 'Instant', zone: 'battlefield' })
    const sorcery = card({ id: 'wurm', type: 'sorcery', typeLine: 'Sorcery', zone: 'battlefield' })
    const creature = card({ id: 'beast', type: 'creature', typeLine: 'Creature', zone: 'battlefield' })
    const handInstant = card({ id: 'hand-bolt', type: 'instant', typeLine: 'Instant', zone: 'hand' })

    const moved = moveCastSpellsToGraveyard([instant, sorcery, creature, handInstant])

    expect(moved.find((candidate) => candidate.id === 'bolt')).toMatchObject({ zone: 'graveyard', tapped: false, revealed: true })
    expect(moved.find((candidate) => candidate.id === 'wurm')).toMatchObject({ zone: 'graveyard', tapped: false })
    expect(moved.find((candidate) => candidate.id === 'beast')?.zone).toBe('battlefield')
    expect(moved.find((candidate) => candidate.id === 'hand-bolt')?.zone).toBe('hand')
  })

  it('returns a new array without mutating the input', () => {
    const instant = card({ id: 'bolt', type: 'instant', typeLine: 'Instant', zone: 'battlefield' })
    const input = [instant]

    const moved = moveCastSpellsToGraveyard(input)

    expect(moved).not.toBe(input)
    expect(input[0].zone).toBe('battlefield')
  })
})

describe('emptyManaPool', () => {
  it('returns a fresh pool with every color at zero', () => {
    expect(emptyManaPool()).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 })
    expect(emptyManaPool()).not.toBe(emptyManaPool())
  })
})

describe('takeSnapshot', () => {
  it('deep-copies mutable state containers', () => {
    const state = makeState({
      cards: [card({ id: 'a', name: 'Original' })],
      manaPool: { ...fullManaPool(), W: 3 },
      combatState: { active: true, attackers: ['a'], blockers: { a: ['b'] } },
      tokens: [{ id: 't1', name: 'Token', imageUri: '', counters: 1, tapped: false }],
    })

    const snapshot = takeSnapshot(state)
    snapshot.cards[0].name = 'Mutated'
    snapshot.manaPool.W = 0
    snapshot.combatState.attackers.push('x')
    snapshot.combatState.blockers.a.push('y')
    snapshot.tokens[0].counters = 99

    expect(state.cards[0].name).toBe('Original')
    expect(state.manaPool.W).toBe(3)
    expect(state.combatState.attackers).toEqual(['a'])
    expect(state.combatState.blockers).toEqual({ a: ['b'] })
    expect(state.tokens[0].counters).toBe(1)
  })
})

describe('pushUndo / pushUndoSnapshot', () => {
  it('appends a snapshot and clears the redo stack', () => {
    const state = makeState({ manaPool: { ...fullManaPool(), R: 1 } })

    const result = pushUndo(state)

    expect(result.undoStack).toHaveLength(1)
    expect(result.redoStack).toEqual([])
    expect(result.undoStack[0].manaPool).toEqual({ ...fullManaPool(), R: 1 })
  })

  it('caps the undo stack at 50 entries', () => {
    let undoStack: GameState['undoStack'] = []
    for (let i = 0; i < 60; i++) {
      undoStack = pushUndo(makeState({ undoStack, redoStack: [] })).undoStack
    }

    expect(undoStack).toHaveLength(50)
  })

  it('keeps the newest snapshots when capped', () => {
    let undoStack: GameState['undoStack'] = []
    for (let i = 0; i < 60; i++) {
      undoStack = pushUndo(makeState({ undoStack, redoStack: [], turn: i + 1 })).undoStack
    }

    expect(undoStack[0].turn).toBe(11)
    expect(undoStack[49].turn).toBe(60)
  })

  it('does not push while an undo transaction is open', () => {
    const state = makeState()
    beginUndoTransaction()

    try {
      const result = pushUndo(state)
      expect(result.undoStack).toHaveLength(0)
    } finally {
      endUndoTransaction()
    }

    const result = pushUndo(state)
    expect(result.undoStack).toHaveLength(1)
  })

  it('pushUndoSnapshot appends the given snapshot without capturing state', () => {
    const state = makeState()
    const snapshot = takeSnapshot(state)
    snapshot.turn = 99

    const result = pushUndoSnapshot(state, snapshot)

    expect(result.undoStack).toEqual([snapshot])
    expect(result.undoStack[0].turn).toBe(99)
  })
})

describe('generatedManaState', () => {
  it('adds mana and logs a generated entry with source', () => {
    const state = { manaPool: { ...fullManaPool(), W: 1 }, manaLog: [], turn: 7 }

    const result = generatedManaState(state, 'W', 2, { cardId: 'plains-1', cardName: 'Plains' })

    expect(result.manaPool).toEqual({ ...fullManaPool(), W: 3 })
    expect(result.manaLog).toHaveLength(1)
    expect(result.manaLog[0]).toMatchObject({
      turn: 7,
      direction: 'generated',
      color: 'W',
      amount: 2,
      sourceCardId: 'plains-1',
      sourceCardName: 'Plains',
    })
  })

  it('does not mutate the input pool or log', () => {
    const state = { manaPool: { ...fullManaPool(), W: 1 }, manaLog: [], turn: 1 }

    generatedManaState(state, 'G', 1)

    expect(state.manaPool).toEqual({ ...fullManaPool(), W: 1 })
    expect(state.manaLog).toEqual([])
  })
})

describe('advanceTurnState', () => {
  it('untaps battlefield creatures, moves cast spells to the graveyard, and resets the pool', () => {
    const tappedCreature = card({ id: 'grizzly', type: 'creature', typeLine: 'Creature', zone: 'battlefield', tapped: true })
    const untappedCreature = card({ id: 'lion', type: 'creature', typeLine: 'Creature', zone: 'battlefield', tapped: false })
    const castInstant = card({ id: 'bolt', type: 'instant', typeLine: 'Instant', zone: 'battlefield', tapped: true })
    const state = makeState({
      cards: [tappedCreature, untappedCreature, castInstant],
      manaPool: { ...fullManaPool(), U: 2 },
      potentialMana: [{ id: 'p1', colors: ['U'] }],
      landPlaysThisTurn: 1,
      turn: 3,
      drawNotice: { id: 1, count: 1 },
      turnAnnouncement: { id: 2, text: 'X' },
      turnPrompt: { action: 'end', reason: 'discard' },
    })

    const next = advanceTurnState(state)

    expect(next.turn).toBe(4)
    expect(next.landPlaysThisTurn).toBe(0)
    expect(next.manaPool).toEqual(fullManaPool())
    expect(next.potentialMana).toEqual([])
    expect(next.drawNotice).toBeNull()
    expect(next.turnAnnouncement).toBeNull()
    expect(next.turnPrompt).toBeNull()
    const grizzly = next.cards?.find((candidate) => candidate.id === 'grizzly')
    const lion = next.cards?.find((candidate) => candidate.id === 'lion')
    const bolt = next.cards?.find((candidate) => candidate.id === 'bolt')
    expect(grizzly?.tapped).toBe(false)
    expect(lion?.tapped).toBe(false)
    expect(bolt?.zone).toBe('graveyard')
    expect(bolt?.tapped).toBe(false)
  })

  it('leaves the caller-provided state untouched', () => {
    const creature = card({ id: 'grizzly', type: 'creature', typeLine: 'Creature', zone: 'battlefield', tapped: true })
    const state = makeState({ cards: [creature], manaPool: { ...fullManaPool(), W: 1 } })

    advanceTurnState(state)

    expect(state.cards[0].tapped).toBe(true)
    expect(state.manaPool.W).toBe(1)
    expect(state.turn).toBe(3)
  })

  it('is a no-op on the initial state in tests', () => {
    // Note: the caller (advancePhase in gameTurnPhases.ts) issues the draw
    // itself; advanceTurnState only resets the turn-scoped state.
    const state = makeState({ cards: [card({ id: 'grizzly', type: 'creature', zone: 'battlefield' })], manaPool: { ...fullManaPool(), W: 1 } })
    const next = advanceTurnState(state)

    expect(next.cards?.[0].tapped).toBe(false)
    expect(next.manaPool).toEqual(fullManaPool())
  })
})

