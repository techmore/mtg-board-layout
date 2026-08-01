import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from './gameStore'
import { primeCardRules } from './cardRulesLoader'
import type { BoardCard, CardRuleEntry, DeckCard, ManaPool } from '../types/card'

const emptyManaPool = (): ManaPool => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 })

function ruleFor(name: string, keywords: string[] = []): CardRuleEntry {
  return {
    cardName: name,
    manaCost: '{1}',
    manaValue: 2,
    typeLine: 'Creature',
    cardType: 'creature',
    subtypes: [],
    keywords,
    manaProduction: null,
    entryTapRule: null,
    conditionalEntryText: null,
    oracleText: '',
    scryfallId: `sf-${name}`,
    abilities: [],
  }
}

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

describe('aiFixedDeck setting', () => {
  it('defaults to the fixed simple deck', () => {
    expect(useGameStore.getState().aiFixedDeck).toBe(true)
  })

  it('can be toggled off to enable deck selection', () => {
    useGameStore.getState().setAiFixedDeck(false)
    expect(useGameStore.getState().aiFixedDeck).toBe(false)
    useGameStore.getState().setAiFixedDeck(true)
    expect(useGameStore.getState().aiFixedDeck).toBe(true)
  })
})

beforeEach(() => {
  primeCardRules({})
})

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

describe('combat keywords', () => {
  function startCombat(cards: BoardCard[], rules: CardRuleEntry[], attackerIds: string[], blockers: Record<string, string[]> = {}) {
    primeCardRules(Object.fromEntries(rules.map((r) => [r.cardName, r])))
    useGameStore.setState({
      cards,
      combatState: { active: true, attackers: attackerIds, blockers },
    })
  }

  it('lifelink heals the attacker controller for unblocked damage', () => {
    startCombat(
      [card({ id: 'vamp', name: 'Vampire', typeLine: '2/2', type: 'creature', zone: 'battlefield', tapped: true })],
      [ruleFor('Vampire', ['lifelink'])],
      ['vamp'],
    )
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().opponentLifeTotal).toBe(38)
    expect(useGameStore.getState().lifeTotal).toBe(42)
  })

  it('a non-flying blocker cannot block a flying attacker', () => {
    startCombat(
      [
        card({ id: 'drake', name: 'Drake', typeLine: '3/2', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'wall', name: 'Wall', typeLine: '0/4', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      [ruleFor('Drake', ['flying'])],
      ['drake'],
      { drake: ['wall'] },
    )
    useGameStore.getState().resolveCombat()
    const wall = useGameStore.getState().cards.find((c) => c.id === 'wall')
    expect(wall?.zone).toBe('battlefield')
    expect(wall?.damage ?? 0).toBe(0)
    expect(useGameStore.getState().opponentLifeTotal).toBe(37)
  })

  it('trample sends excess damage to the defending player', () => {
    startCombat(
      [
        card({ id: 'stamp', name: 'Stampede', typeLine: '5/3', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'chump', name: 'Chump', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      [ruleFor('Stampede', ['trample'])],
      ['stamp'],
      { stamp: ['chump'] },
    )
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().cards.find((c) => c.id === 'chump')?.zone).toBe('graveyard')
    expect(useGameStore.getState().opponentLifeTotal).toBe(37)
  })

  it('indestructible creatures survive lethal damage', () => {
    primeCardRules({ 'Darksteel': ruleFor('Darksteel', ['indestructible']) })
    useGameStore.setState({
      cards: [card({ id: 'steel', name: 'Darksteel', typeLine: '2/2', type: 'creature', zone: 'battlefield', damage: 2 })],
    })
    useGameStore.getState().checkStateBasedActions()
    expect(useGameStore.getState().cards.find((c) => c.id === 'steel')?.zone).toBe('battlefield')
  })

  it('deathtouch lets a small attacker kill a bigger blocker', () => {
    startCombat(
      [
        card({ id: 'cobra', name: 'Cobra', typeLine: '1/1', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'giant', name: 'Giant', typeLine: '6/6', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      [ruleFor('Cobra', ['deathtouch'])],
      ['cobra'],
      { cobra: ['giant'] },
    )
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().cards.find((c) => c.id === 'giant')?.zone).toBe('graveyard')
    expect(useGameStore.getState().opponentLifeTotal).toBe(40)
  })

  it('every attacker deals damage in a multi-attacker combat', () => {
    startCombat(
      [
        card({ id: 'a1', name: 'Grizzly Bears', typeLine: '2/2', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'a2', name: 'Hill Giant', typeLine: '3/3', type: 'creature', zone: 'battlefield', tapped: true }),
      ],
      [],
      ['a1', 'a2'],
    )
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().opponentLifeTotal).toBe(35)
  })
})

describe('combat damage steps', () => {
  function startCombat(cards: BoardCard[], rules: CardRuleEntry[], attackerIds: string[], blockers: Record<string, string[]> = {}) {
    primeCardRules(Object.fromEntries(rules.map((r) => [r.cardName, r])))
    useGameStore.setState({
      cards,
      combatState: { active: true, attackers: attackerIds, blockers },
    })
  }

  it('a first striker kills a blocker before it can deal damage', () => {
    startCombat(
      [
        card({ id: 'knight', name: 'Knight', typeLine: '2/2', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'goblin', name: 'Goblin', typeLine: '2/1', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      [ruleFor('Knight', ['first strike'])],
      ['knight'],
      { knight: ['goblin'] },
    )
    useGameStore.getState().resolveCombat()
    const knight = useGameStore.getState().cards.find((c) => c.id === 'knight')
    const goblin = useGameStore.getState().cards.find((c) => c.id === 'goblin')
    expect(goblin?.zone).toBe('graveyard')
    expect(knight?.zone).toBe('battlefield')
    expect(knight?.damage ?? 0).toBe(0)
  })

  it('a first striker trades when the blocker survives the first-strike step', () => {
    startCombat(
      [
        card({ id: 'knight', name: 'Knight', typeLine: '2/2', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'wall', name: 'Wall', typeLine: '2/3', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      [ruleFor('Knight', ['first strike'])],
      ['knight'],
      { knight: ['wall'] },
    )
    useGameStore.getState().resolveCombat()
    const knight = useGameStore.getState().cards.find((c) => c.id === 'knight')
    const wall = useGameStore.getState().cards.find((c) => c.id === 'wall')
    // Knight's first-strike damage (2) doesn't kill the 3-toughness wall, so the
    // wall survives the step and deals 2 back in the regular step — lethal.
    expect(knight?.zone).toBe('graveyard')
    expect(wall?.zone).toBe('battlefield')
    expect(wall?.damage).toBe(2)
  })

  it('a double striker deals damage in both steps', () => {
    startCombat(
      [
        card({ id: 'dt', name: 'Dual', typeLine: '2/2', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'chump', name: 'Chump', typeLine: '1/3', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      [ruleFor('Dual', ['double strike'])],
      ['dt'],
      { dt: ['chump'] },
    )
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().cards.find((c) => c.id === 'chump')?.zone).toBe('graveyard')
  })

  it('a first-strike blocker hits before a non-first-strike attacker', () => {
    startCombat(
      [
        card({ id: 'bear', name: 'Bear', typeLine: '3/3', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'guard', name: 'Guard', typeLine: '1/1', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      [ruleFor('Guard', ['first strike'])],
      ['bear'],
      { bear: ['guard'] },
    )
    useGameStore.getState().resolveCombat()
    const bear = useGameStore.getState().cards.find((c) => c.id === 'bear')
    const guard = useGameStore.getState().cards.find((c) => c.id === 'guard')
    // Guard's 1 first-strike damage isn't lethal to the 3-toughness bear, so the
    // bear deals 3 in the regular step — lethal to the guard.
    expect(bear?.zone).toBe('battlefield')
    expect(bear?.damage).toBe(1)
    expect(guard?.zone).toBe('graveyard')
  })

  it('first-strike damage still counts toward defeat', () => {
    startCombat(
      [
        card({ id: 'knight', name: 'Knight', typeLine: '6/1', type: 'creature', zone: 'battlefield', tapped: true }),
      ],
      [ruleFor('Knight', ['first strike'])],
      ['knight'],
    )
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().opponentLifeTotal).toBe(34)
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
