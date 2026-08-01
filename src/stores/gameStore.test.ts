import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from './gameStore'
import type { BoardCard, DeckCard, ManaPool } from '../types/card'

const emptyManaPool = (): ManaPool => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 })

function deckCard(name: string, typeLine: string, quantity = 1): DeckCard {
  return {
    scryfallId: `sf-${name}`,
    name,
    manaCost: typeLine === 'Land' ? '' : '{1}',
    manaValue: typeLine === 'Land' ? 0 : 2,
    typeLine,
    imageUri: '',
    quantity,
  }
}

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

function resetStore() {
  useGameStore.setState({
    cards: [],
    manaPool: emptyManaPool(),
    potentialMana: [],
    manaLog: [],
    effectHistory: [],
    tokens: [],
    lifeTotal: 40,
    opponentLifeTotal: 40,
    turn: 1,
    landPlaysThisTurn: 0,
    drawNotice: null,
    turnAnnouncement: null,
    turnPrompt: null,
    currentPhase: 'beginning',
    activePlayer: 'player',
    opponentManaPool: emptyManaPool(),
    opponentPotentialMana: [],
    opponentLandPlaysThisTurn: 0,
    combatState: { active: false, attackers: [], blockers: {} },
    triggerStack: [],
    undoStack: [],
    redoStack: [],
    gameOver: null,
  })
}

afterEach(resetStore)

describe('game over', () => {
  it('marks the opponent as winner when player life reaches zero', () => {
    useGameStore.getState().setLife(0)
    expect(useGameStore.getState().gameOver).toEqual({ winner: 'opponent' })
  })

  it('marks the player as winner when opponent life reaches zero', () => {
    useGameStore.getState().setOpponentLife(0)
    expect(useGameStore.getState().gameOver).toEqual({ winner: 'player' })
  })

  it('does not set game over for life above zero', () => {
    useGameStore.getState().setLife(5)
    useGameStore.getState().setOpponentLife(12)
    expect(useGameStore.getState().gameOver).toBeNull()
  })

  it('clears game over and resets life on redeal', () => {
    useGameStore.getState().setLife(0)
    expect(useGameStore.getState().gameOver).toEqual({ winner: 'opponent' })

    useGameStore.getState().redeal(7)
    const state = useGameStore.getState()
    expect(state.gameOver).toBeNull()
    expect(state.lifeTotal).toBe(40)
    expect(state.opponentLifeTotal).toBe(40)
    expect(state.activePlayer).toBe('player')
  })

  it('sets game over when combat defeats the opponent', () => {
    useGameStore.setState({
      cards: [card({ id: 'attacker', typeLine: '10/10', type: 'creature', zone: 'battlefield', tapped: true })],
      opponentLifeTotal: 5,
      combatState: { active: true, attackers: ['attacker'], blockers: {} },
    })

    useGameStore.getState().resolveCombat()

    expect(useGameStore.getState().opponentLifeTotal).toBe(-5)
    expect(useGameStore.getState().gameOver).toEqual({ winner: 'player' })
  })
})

describe('state-based actions', () => {
  it('kills a creature when damage reaches its toughness', () => {
    useGameStore.setState({
      cards: [card({ id: 'grizzly', name: 'Grizzly Bears', typeLine: '2/2', type: 'creature', zone: 'battlefield' })],
    })
    useGameStore.getState().addDamage('grizzly', 2)
    expect(useGameStore.getState().cards.find((c) => c.id === 'grizzly')?.zone).toBe('battlefield')

    useGameStore.getState().checkStateBasedActions()

    const dead = useGameStore.getState().cards.find((c) => c.id === 'grizzly')
    expect(dead?.zone).toBe('graveyard')
    expect(dead?.damage).toBe(0)
    expect(useGameStore.getState().cards.length).toBe(1)
  })

  it('spares a creature with non-lethal damage', () => {
    useGameStore.setState({
      cards: [card({ id: 'wall', name: 'Wall', typeLine: '1/3', type: 'creature', zone: 'battlefield' })],
    })
    useGameStore.getState().addDamage('wall', 2)
    useGameStore.getState().checkStateBasedActions()
    expect(useGameStore.getState().cards.find((c) => c.id === 'wall')?.zone).toBe('battlefield')
  })

  it('kills a creature whose toughness dropped below one from counters', () => {
    useGameStore.setState({
      cards: [card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', counters: -2 })],
    })
    useGameStore.getState().checkStateBasedActions()
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('graveyard')
  })

  it('clears damage and untaps on the beginning phase of the player turn', () => {
    useGameStore.setState({
      cards: [card({ id: 'grizzly', name: 'Grizzly Bears', typeLine: '2/2', type: 'creature', zone: 'battlefield', damage: 1, tapped: true })],
      currentPhase: 'beginning',
    })
    useGameStore.getState().advancePhase()
    const after = useGameStore.getState().cards.find((c) => c.id === 'grizzly')
    expect(after?.tapped).toBe(false)
    expect(after?.damage).toBe(0)
  })

  it('combat damage kills a blocked creature through state-based actions', () => {
    useGameStore.setState({
      cards: [
        card({ id: 'attacker', name: 'Beater', typeLine: '4/4', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'blocker', name: 'Chump', typeLine: '1/3', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      combatState: { active: true, attackers: ['attacker'], blockers: { attacker: ['blocker'] } },
    })

    useGameStore.getState().resolveCombat()

    const attacker = useGameStore.getState().cards.find((c) => c.id === 'attacker')
    const blocker = useGameStore.getState().cards.find((c) => c.id === 'blocker')
    expect(blocker?.zone).toBe('graveyard')
    expect(attacker?.zone).toBe('battlefield')
    expect(attacker?.damage).toBe(1)
  })

  it('undoes state-based action deaths as one step', () => {
    useGameStore.setState({
      cards: [card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', damage: 2 })],
    })
    useGameStore.getState().checkStateBasedActions()
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('graveyard')

    useGameStore.getState().undo()
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('battlefield')
  })

  it('kills a planeswalker whose loyalty drops to zero', () => {
    useGameStore.setState({
      cards: [card({ id: 'walk', name: 'Chandra', typeLine: 'Planeswalker', type: 'planeswalker', zone: 'battlefield', counters: 1 })],
    })
    useGameStore.getState().removeCounter('walk')
    expect(useGameStore.getState().cards.find((c) => c.id === 'walk')?.zone).toBe('graveyard')
  })

  it('kills a creature when counter removal drops its toughness below one', () => {
    useGameStore.setState({
      cards: [card({ id: 'bear', name: 'Bear', typeLine: '1/1', type: 'creature', zone: 'battlefield', counters: 0 })],
    })
    useGameStore.getState().removeCounter('bear')
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('graveyard')
  })
})

describe('loadOpponentDeck', () => {
  it('loads a simple commander deck with the commander in the command zone', () => {
    vi.useFakeTimers()
    try {
      const cards = [
        deckCard('Atarka, World Render', 'Legendary Creature — Dragon'),
        deckCard('Mountain', 'Land', 6),
        deckCard('Dragon Fodder', 'Sorcery'),
        deckCard('Thunderbreak Regent', 'Creature — Dragon'),
      ]
      useGameStore.getState().loadOpponentDeck(['Atarka, World Render'], cards, 'Draconic Destruction')

      const state = useGameStore.getState()
      const opponentCards = state.cards.filter((c) => (c.owner ?? 'player') === 'opponent')

      expect(state.showOpponent).toBe(true)
      expect(state.opponentName).toBe('Draconic Destruction')
      expect(state.activePlayer).toBe('opponent')
      expect(state.opponentLifeTotal).toBe(40)

      const commander = opponentCards.find((c) => c.name === 'Atarka, World Render')
      expect(commander?.zone).toBe('command')
      expect(commander?.revealed).toBe(true)
      expect(commander?.owner).toBe('opponent')

      const hand = opponentCards.filter((c) => c.zone === 'hand')
      expect(hand).toHaveLength(7)
      const library = opponentCards.filter((c) => c.zone === 'library')
      expect(library.length).toBeGreaterThan(0)
      expect(hand.every((c) => c.owner === 'opponent')).toBe(true)
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('plays a full AI turn and hands back to the player', () => {
    vi.useFakeTimers()
    try {
      const cards = [
        deckCard('Atarka, World Render', 'Legendary Creature — Dragon'),
        ...Array.from({ length: 8 }, () => deckCard('Mountain', 'Land')),
        deckCard('Dragon Whelp', 'Creature — Dragon'),
      ]
      useGameStore.getState().loadOpponentDeck(['Atarka, World Render'], cards, 'Draconic Destruction')

      vi.advanceTimersByTime(3200)

      const state = useGameStore.getState()
      expect(state.turn).toBe(2)
      expect(state.activePlayer).toBe('player')
      const opponentBattlefield = state.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'battlefield')
      expect(opponentBattlefield.some((c) => c.type === 'land')).toBe(true)
      expect(state.opponentLandPlaysThisTurn).toBe(0)
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })
})

describe('game store action history', () => {
  it('records one undo entry for mana generation and supports redo', () => {
    useGameStore.getState().addMana('W')
    expect(useGameStore.getState().manaPool.W).toBe(1)
    expect(useGameStore.getState().undoStack).toHaveLength(1)

    useGameStore.getState().undo()
    expect(useGameStore.getState().manaPool.W).toBe(0)
    expect(useGameStore.getState().redoStack).toHaveLength(1)

    useGameStore.getState().redo()
    expect(useGameStore.getState().manaPool.W).toBe(1)
    expect(useGameStore.getState().undoStack).toHaveLength(1)
    expect(useGameStore.getState().redoStack).toHaveLength(0)
  })

  it('coalesces nested mana spending into one undo entry', () => {
    useGameStore.setState({ manaPool: { ...emptyManaPool(), W: 1, U: 1 } })

    const spent = useGameStore.getState().spendManaCost('{W}{U}', 'Test spell')

    expect(spent).toBe(true)
    expect(useGameStore.getState().manaPool).toEqual(emptyManaPool())
    expect(useGameStore.getState().undoStack).toHaveLength(1)

    useGameStore.getState().undo()
    expect(useGameStore.getState().manaPool).toEqual({ ...emptyManaPool(), W: 1, U: 1 })
    expect(useGameStore.getState().manaLog).toHaveLength(0)
  })

  it('undoes a phase transition as one action', () => {
    useGameStore.getState().advancePhase()

    expect(useGameStore.getState().currentPhase).toBe('precombat_main')
    expect(useGameStore.getState().undoStack).toHaveLength(1)

    useGameStore.getState().undo()
    expect(useGameStore.getState().currentPhase).toBe('beginning')
  })

  it('undoes combat damage and combat cleanup together', () => {
    useGameStore.setState({
      cards: [card({ id: 'attacker', typeLine: '2/2', type: 'creature', zone: 'battlefield' })],
      opponentLifeTotal: 40,
      combatState: { active: true, attackers: ['attacker'], blockers: {} },
    })

    useGameStore.getState().resolveCombat()

    expect(useGameStore.getState().opponentLifeTotal).toBe(38)
    expect(useGameStore.getState().combatState.active).toBe(false)
    expect(useGameStore.getState().undoStack).toHaveLength(1)

    useGameStore.getState().undo()
    expect(useGameStore.getState().opponentLifeTotal).toBe(40)
    expect(useGameStore.getState().combatState).toEqual({ active: true, attackers: ['attacker'], blockers: {} })
  })

  it('undoes an automatically resolved conditional ETB', () => {
    const land = card({
      id: 'conditional-land',
      name: 'Conditional Land',
      type: 'land',
      typeLine: 'Land',
      oracleText: 'This land enters tapped unless you control two or more basic lands.',
    })
    useGameStore.setState({ cards: [land] })

    useGameStore.getState().moveCard(land.id, 'battlefield')

    const entered = useGameStore.getState().cards.find((candidate) => candidate.id === land.id)
    expect(entered?.zone).toBe('battlefield')
    expect(entered?.tapped).toBe(true)
    expect(useGameStore.getState().undoStack).toHaveLength(1)

    useGameStore.getState().undo()
    expect(useGameStore.getState().cards).toEqual([land])

    useGameStore.getState().redo()
    const redone = useGameStore.getState().cards.find((candidate) => candidate.id === land.id)
    expect(redone?.zone).toBe('battlefield')
    expect(redone?.tapped).toBe(true)
  })
})
