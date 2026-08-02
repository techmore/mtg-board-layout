import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from './gameStore'
import { primeCardRules } from './cardRulesLoader'
import { resolveAISpellAbilities, resolveAIAutoAbilities, resolveAITriggerInstances } from './spellResolution'
import type { BoardCard, CardAbilityDef, CardRuleEntry, DeckCard, ManaPool } from '../types/card'

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
    turnPlayerMs: 0,
    turnOpponentMs: 0,
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

describe('turn timer', () => {
  it('accumulates turn time per player', () => {
    useGameStore.getState().addTurnTime('player', 65_000)
    useGameStore.getState().addTurnTime('opponent', 30_000)
    useGameStore.getState().addTurnTime('player', 5_000)
    const state = useGameStore.getState()
    expect(state.turnPlayerMs).toBe(70_000)
    expect(state.turnOpponentMs).toBe(30_000)
  })

  it('ignores negative durations', () => {
    useGameStore.getState().addTurnTime('player', -100)
    expect(useGameStore.getState().turnPlayerMs).toBe(0)
  })

  it('resets accumulated time when a new game is dealt', () => {
    useGameStore.getState().addTurnTime('player', 65_000)
    useGameStore.getState().addTurnTime('opponent', 30_000)
    useGameStore.getState().redeal(7)
    const state = useGameStore.getState()
    expect(state.turnPlayerMs).toBe(0)
    expect(state.turnOpponentMs).toBe(0)
  })
})

describe('deck-out', () => {
  it('the player loses when drawing from an empty library', () => {
    useGameStore.setState({ cards: [] })
    useGameStore.getState().drawCards(1)
    const state = useGameStore.getState()
    expect(state.gameOver).toEqual({ winner: 'opponent' })
    expect(state.turnAnnouncement?.text).toContain('library empty')
  })

  it('partial draws do not cause a loss', () => {
    const cards = [
      card({ id: 'c1', name: 'One', typeLine: 'Creature', type: 'creature', zone: 'library' }),
      card({ id: 'c2', name: 'Two', typeLine: 'Creature', type: 'creature', zone: 'library' }),
      card({ id: 'c3', name: 'Three', typeLine: 'Creature', type: 'creature', zone: 'library' }),
    ]
    useGameStore.setState({ cards })
    useGameStore.getState().drawCards(7)
    const state = useGameStore.getState()
    expect(state.gameOver).toBeNull()
    expect(state.cards.filter((c) => c.zone === 'hand')).toHaveLength(3)
  })

  it('the AI loses when its library is empty at the draw step', () => {
    vi.useFakeTimers()
    try {
      const cards = [
        deckCard('Atarka, World Render', 'Legendary Creature — Dragon'),
        deckCard('Mountain', 'Land', 3),
        deckCard('Bear', 'Creature', 4),
      ]
      useGameStore.getState().loadOpponentDeck(['Atarka, World Render'], cards, 'Test')
      vi.advanceTimersByTime(500)
      const state = useGameStore.getState()
      expect(state.gameOver).toEqual({ winner: 'player' })
      expect(state.turnAnnouncement?.text).toContain('library empty')
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })
})

describe('end-of-turn discard', () => {
  it('prompts to discard to 7 before handing off when advancing phases', () => {
    const cards = Array.from({ length: 10 }, (_, i) =>
      card({ id: `c${i}`, name: `Card ${i}`, typeLine: 'Creature', type: 'creature', zone: 'hand' }),
    )
    useGameStore.setState({ cards })
    useGameStore.getState().advanceTurn()
    const state = useGameStore.getState()
    expect(state.turnPrompt?.reason).toBe('discard')
    expect(state.turnPrompt?.action).toBe('advance')
    expect(state.activePlayer).toBe('player')
  })

  it('hands off to the AI after the discard is resolved', () => {
    vi.useFakeTimers()
    try {
      const cards = Array.from({ length: 9 }, (_, i) =>
        card({ id: `c${i}`, name: `Card ${i}`, typeLine: 'Creature', type: 'creature', zone: 'hand' }),
      )
      useGameStore.setState({ cards })
      useGameStore.getState().advanceTurn()
      const prompt = useGameStore.getState().turnPrompt
      expect(prompt?.reason).toBe('discard')
      useGameStore.getState().discardForTurn('c0')
      useGameStore.getState().discardForTurn('c1')
      expect(useGameStore.getState().turnPrompt).toBeNull()
      expect(useGameStore.getState().activePlayer).toBe('opponent')
      expect(useGameStore.getState().cards.filter((c) => c.zone === 'hand')).toHaveLength(7)
      // The AI turn chain started (its untap/draw step fires shortly).
      vi.advanceTimersByTime(500)
      expect(useGameStore.getState().gameOver).toBeNull()
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
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

  it('the AI responds to declared attackers with an instant-speed spell', () => {
    vi.useFakeTimers()
    try {
      const instantRule: CardRuleEntry = {
        cardName: 'Healing Word', manaCost: '{1}{W}', manaValue: 2, typeLine: 'Instant', cardType: 'instant', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: 'You gain 4 life.', scryfallId: 'h', abilities: [{
          abilityType: 'spell',
          triggerEvent: null,
          triggerCondition: null,
          isOptional: false,
          cost: null,
          targets: 0,
          targetFilter: null,
          effect: { kind: 'gain_life', params: { amount: 4 } },
        }],
      }
      primeCardRules({ 'Healing Word': instantRule })
      const attacker = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
      const aiInstant = card({ id: 'heal', name: 'Healing Word', type: 'instant', typeLine: 'Instant', zone: 'hand', owner: 'opponent', manaCost: '{1}{W}' })
      const aiLand = card({ id: 'plains', name: 'Plains', type: 'land', typeLine: 'Basic Land — Plains', zone: 'battlefield', owner: 'opponent', manaProduction: { colors: ['W'], amount: 1 } })
      const aiLand2 = card({ id: 'plains2', name: 'Plains', type: 'land', typeLine: 'Basic Land — Plains', zone: 'battlefield', owner: 'opponent', manaProduction: { colors: ['W'], amount: 1 } })
      useGameStore.setState({ cards: [attacker, aiInstant, aiLand, aiLand2], combatState: { active: true, attackers: [], blockers: {} } })

      useGameStore.getState().toggleAttacker('bear')
      expect(useGameStore.getState().combatState.attackers).toEqual(['bear'])

      // After the AI's response window it casts the instant.
      vi.advanceTimersByTime(2600)
      const state = useGameStore.getState()
      const cast = state.cards.find((c) => c.id === 'heal')
      expect(cast?.zone).toBe('battlefield')
      expect(state.opponentLifeTotal).toBe(44)
      // The AI's land was tapped to pay.
      expect(state.cards.find((c) => c.id === 'plains')?.tapped).toBe(true)
      // Combat is still waiting for the player to resolve.
      expect(state.combatState.active).toBe(true)
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })
})

describe('AI activated abilities', () => {
  function manaDorkRule(): CardRuleEntry {
    return {
      cardName: 'Llanowar Elves', manaCost: '{G}', manaValue: 1, typeLine: 'Creature — Elf Druid', cardType: 'creature', subtypes: [], keywords: [], manaProduction: { colors: ['G'], amount: 1 }, entryTapRule: null, conditionalEntryText: null, oracleText: '{T}: Add {G}.', scryfallId: 'l', abilities: [{
        abilityType: 'activated',
        triggerEvent: null,
        triggerCondition: null,
        isOptional: false,
        cost: '{T}',
        targets: 0,
        targetFilter: null,
        effect: { kind: 'add_mana', params: {} },
      }],
    }
  }

  function planeswalkerRule(): CardRuleEntry {
    return {
      cardName: 'Chandra', manaCost: '{2}{R}{R}', manaValue: 4, typeLine: 'Planeswalker — Chandra', cardType: 'planeswalker', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '+1: Create a 1/1 red Elemental creature token.', scryfallId: 'c', abilities: [{
        abilityType: 'activated',
        triggerEvent: null,
        triggerCondition: null,
        isOptional: false,
        cost: '+1',
        targets: 0,
        targetFilter: null,
        effect: { kind: 'create_token', params: { tokenName: 'Elemental', tokenPower: 1, tokenToughness: 1, amount: 1 } },
      }],
    }
  }

  it('taps a mana dork and credits the AI mana pool during its turn', () => {
    vi.useFakeTimers()
    try {
      primeCardRules({ 'Llanowar Elves': manaDorkRule() })
      const dork = card({ id: 'dork', name: 'Llanowar Elves', type: 'creature', typeLine: 'Creature — Elf Druid', zone: 'battlefield', owner: 'opponent', manaProduction: { colors: ['G'], amount: 1 } })
      useGameStore.setState({ cards: [dork] })

      // The dork tap runs inside the AI turn chain; trigger it via the full turn.
      const cards = [
        deckCard('Atarka, World Render', 'Legendary Creature — Dragon'),
        deckCard('Mountain', 'Land', 5),
        deckCard('Dork', 'Creature', 4),
      ]
      useGameStore.getState().loadOpponentDeck(['Atarka, World Render'], cards, 'Test')
      useGameStore.setState({ cards: [...useGameStore.getState().cards.filter((c) => c.id !== 'dork'), dork] })

      vi.advanceTimersByTime(1600)
      const state = useGameStore.getState()
      const tappedDork = state.cards.find((c) => c.id === 'dork')
      expect(tappedDork?.tapped).toBe(true)
      // The dork's mana enabled a cast the AI couldn't otherwise afford (its
      // lands produce no mana in this fixture): a {1} Dork reached the board.
      const castDork = state.cards.find((c) => c.name === 'Dork' && c.zone === 'battlefield')
      expect(castDork).toBeDefined()
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('activates a planeswalker loyalty ability with a positive cost', () => {
    vi.useFakeTimers()
    try {
      primeCardRules({ 'Chandra': planeswalkerRule() })
      const walker = card({ id: 'chandra', name: 'Chandra', type: 'planeswalker', typeLine: 'Planeswalker — Chandra', zone: 'battlefield', owner: 'opponent', counters: 5 })
      useGameStore.setState({ cards: [walker] })

      const cards = [
        deckCard('Atarka, World Render', 'Legendary Creature — Dragon'),
        deckCard('Mountain', 'Land', 5),
        deckCard('Walker', 'Planeswalker', 4),
      ]
      useGameStore.getState().loadOpponentDeck(['Atarka, World Render'], cards, 'Test')
      useGameStore.setState({ cards: [...useGameStore.getState().cards.filter((c) => c.id !== 'chandra'), walker] })

      vi.advanceTimersByTime(2200)
      const state = useGameStore.getState()
      const walkerAfter = state.cards.find((c) => c.id === 'chandra')
      expect(walkerAfter?.counters).toBe(6)
      // The token effect resolved (an Elemental token exists or the stack is clean).
      expect(state.tokens.length).toBeGreaterThan(0)
      expect(state.triggerStack).toHaveLength(0)
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })
})

describe('AI responses to player casts', () => {
  const healingWordRule = (): CardRuleEntry => ({
    cardName: 'Healing Word', manaCost: '{1}{W}', manaValue: 2, typeLine: 'Instant', cardType: 'instant', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: 'You gain 4 life.', scryfallId: 'h', abilities: [{
      abilityType: 'spell',
      triggerEvent: null,
      triggerCondition: null,
      isOptional: false,
      cost: null,
      targets: 0,
      targetFilter: null,
      effect: { kind: 'gain_life', params: { amount: 4 } },
    }],
  })

  it('casts an affordable instant in response to the player casting a spell', () => {
    vi.useFakeTimers()
    try {
      primeCardRules({ 'Healing Word': healingWordRule() })
      const playerSpell = card({ id: 'ps', name: 'Player Spell', type: 'instant', typeLine: 'Instant', zone: 'hand' })
      const aiInstant = card({ id: 'heal', name: 'Healing Word', type: 'instant', typeLine: 'Instant', zone: 'hand', owner: 'opponent', manaCost: '{1}{W}' })
      const aiLand1 = card({ id: 'p1', name: 'Plains', type: 'land', typeLine: 'Basic Land — Plains', zone: 'battlefield', owner: 'opponent', manaProduction: { colors: ['W'], amount: 1 } })
      const aiLand2 = card({ id: 'p2', name: 'Plains', type: 'land', typeLine: 'Basic Land — Plains', zone: 'battlefield', owner: 'opponent', manaProduction: { colors: ['W'], amount: 1 } })
      useGameStore.setState({ cards: [playerSpell, aiInstant, aiLand1, aiLand2], manaPool: { ...emptyManaPool(), W: 5 } })

      useGameStore.getState().castSpell('ps')
      expect(useGameStore.getState().cards.find((c) => c.id === 'heal')?.zone).toBe('hand')

      vi.advanceTimersByTime(2200)
      const state = useGameStore.getState()
      expect(state.cards.find((c) => c.id === 'heal')?.zone).toBe('battlefield')
      expect(state.opponentLifeTotal).toBe(44)
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })
})

describe('AI mana sequencing', () => {
  it('pays generic costs with lands whose colors are not needed', () => {
    vi.useFakeTimers()
    try {
      const boltRule: CardRuleEntry = {
        cardName: 'Red Bolt', manaCost: '{1}{R}', manaValue: 2, typeLine: 'Sorcery', cardType: 'sorcery', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 'rb', abilities: [{
          abilityType: 'spell',
          triggerEvent: null,
          triggerCondition: null,
          isOptional: false,
          cost: null,
          targets: 0,
          targetFilter: null,
          effect: { kind: 'gain_life', params: { amount: 1 } },
        }],
      }
      primeCardRules({ 'Red Bolt': boltRule })
      const mountain = card({ id: 'm', name: 'Mountain', type: 'land', typeLine: 'Basic Land — Mountain', zone: 'battlefield', owner: 'opponent', manaProduction: { colors: ['R'], amount: 1 } })
      const plains = card({ id: 'w', name: 'Plains', type: 'land', typeLine: 'Basic Land — Plains', zone: 'battlefield', owner: 'opponent', manaProduction: { colors: ['W'], amount: 1 } })
      const bolt = card({ id: 'bolt', name: 'Red Bolt', type: 'sorcery', typeLine: 'Sorcery', zone: 'hand', owner: 'opponent', manaCost: '{1}{R}' })
      useGameStore.setState({ cards: [bolt, mountain, plains] })

      // Run a full AI turn with a lands-only deck so the injected bolt is the
      // only castable spell.
      const cards = [
        deckCard('Atarka, World Render', 'Legendary Creature — Dragon'),
        ...Array.from({ length: 8 }, () => deckCard('Mountain', 'Land')),
      ]
      useGameStore.getState().loadOpponentDeck(['Atarka, World Render'], cards, 'Test')
      useGameStore.setState({
        cards: [
          ...useGameStore.getState().cards.filter((c) => c.id !== 'bolt'),
          bolt, mountain, plains,
        ],
      })

      vi.advanceTimersByTime(1800)
      const state = useGameStore.getState()
      const cast = state.cards.find((c) => c.id === 'bolt')
      expect(cast?.zone).toBe('battlefield')
      // {1}{R}: the generic {1} is covered by the tapped Mountain's mana, so the
      // Plains stays untapped — its white source is preserved.
      expect(state.cards.find((c) => c.id === 'm')?.tapped).toBe(true)
      expect(state.cards.find((c) => c.id === 'w')?.tapped).toBe(false)
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
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

describe('spell resolution', () => {
  function spellRule(name: string, ability: CardAbilityDef): CardRuleEntry {
    return {
      cardName: name,
      manaCost: '{1}{W}',
      manaValue: 2,
      typeLine: 'Instant',
      cardType: 'instant',
      subtypes: [],
      keywords: [],
      manaProduction: null,
      entryTapRule: null,
      conditionalEntryText: null,
      oracleText: '',
      scryfallId: `sf-${name}`,
      abilities: [ability],
    }
  }

  const exileAbility = (): CardAbilityDef => ({
    abilityType: 'spell',
    triggerEvent: null,
    triggerCondition: null,
    isOptional: false,
    cost: null,
    targets: 1,
    targetFilter: 'creature',
    effect: { kind: 'exile', params: { targetHint: 'target creature' } },
  })

  const destroyAllAbility = (): CardAbilityDef => ({
    abilityType: 'spell',
    triggerEvent: null,
    triggerCondition: null,
    isOptional: false,
    cost: null,
    targets: 0,
    targetFilter: null,
    effect: { kind: 'destroy', params: {} },
  })

  const dealDamageAbility = (): CardAbilityDef => ({
    abilityType: 'spell',
    triggerEvent: null,
    triggerCondition: null,
    isOptional: false,
    cost: null,
    targets: 1,
    targetFilter: null,
    effect: { kind: 'deal_damage', params: { amount: 3 } },
  })

  it('casting a spell enqueues its spell abilities on the trigger stack', () => {
    primeCardRules({ 'Path to Exile': spellRule('Path to Exile', exileAbility()) })
    const spell = card({ id: 'path', name: 'Path to Exile', type: 'instant', typeLine: 'Instant', zone: 'hand' })
    useGameStore.setState({ cards: [spell], manaPool: { ...emptyManaPool(), W: 5 } })

    useGameStore.getState().castSpell('path')

    const stack = useGameStore.getState().triggerStack
    expect(stack).toHaveLength(1)
    expect(stack[0].sourceCardName).toBe('Path to Exile')
    expect(stack[0].ability.abilityType).toBe('spell')
    expect(stack[0].event).toBe('cast')
  })

  it('a targeted exile spell removes its target from the game', () => {
    primeCardRules({ 'Path to Exile': spellRule('Path to Exile', exileAbility()) })
    const spell = card({ id: 'path', name: 'Path to Exile', type: 'instant', typeLine: 'Instant', zone: 'hand' })
    const victim = card({ id: 'victim', name: 'Grizzly Bears', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [spell, victim], manaPool: { ...emptyManaPool(), W: 5 } })

    useGameStore.getState().castSpell('path')
    const triggerId = useGameStore.getState().triggerStack[0].id
    useGameStore.getState().resolveTrigger(triggerId)
    useGameStore.getState().selectTarget(triggerId, 'victim')

    expect(useGameStore.getState().cards.find((c) => c.id === 'victim')?.zone).toBe('exile')
    expect(useGameStore.getState().triggerStack).toHaveLength(0)
  })

  it('a mass-destruction spell kills all creatures', () => {
    primeCardRules({ 'Wrath of God': spellRule('Wrath of God', destroyAllAbility()) })
    const spell = card({ id: 'wrath', name: 'Wrath of God', type: 'sorcery', typeLine: 'Sorcery', zone: 'hand' })
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    const land = card({ id: 'land', name: 'Forest', typeLine: 'Basic Land', type: 'land', zone: 'battlefield' })
    useGameStore.setState({ cards: [spell, bear, land], manaPool: { ...emptyManaPool(), W: 5 } })

    useGameStore.getState().castSpell('wrath')
    const triggerId = useGameStore.getState().triggerStack[0].id
    useGameStore.getState().resolveTrigger(triggerId)

    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('graveyard')
    expect(useGameStore.getState().cards.find((c) => c.id === 'land')?.zone).toBe('battlefield')
  })

  it('damage from a spell kills a creature through state-based actions', () => {
    primeCardRules({ 'Bolt': spellRule('Bolt', dealDamageAbility()) })
    const spell = card({ id: 'bolt', name: 'Bolt', type: 'instant', typeLine: 'Instant', zone: 'hand' })
    const victim = card({ id: 'victim', name: 'Bird', typeLine: '1/1', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [spell, victim], manaPool: { ...emptyManaPool(), R: 5 } })

    useGameStore.getState().castSpell('bolt')
    const triggerId = useGameStore.getState().triggerStack[0].id
    useGameStore.getState().resolveTrigger(triggerId)
    useGameStore.getState().selectTarget(triggerId, 'victim')

    expect(useGameStore.getState().cards.find((c) => c.id === 'victim')?.zone).toBe('graveyard')
    expect(useGameStore.getState().cards.find((c) => c.id === 'victim')?.damage).toBe(0)
  })

  it('an AI-cast spell resolves automatically against the player', () => {
    primeCardRules({ 'Bolt': spellRule('Bolt', dealDamageAbility()) })
    const aiBolt = card({ id: 'bolt', name: 'Bolt', type: 'instant', typeLine: 'Instant', zone: 'battlefield', owner: 'opponent' })
    const victim = card({ id: 'victim', name: 'Bird', typeLine: '1/1', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [aiBolt, victim] })

    resolveAISpellAbilities(
      (partial) => useGameStore.setState(partial as never),
      () => useGameStore.getState(),
      aiBolt,
    )

    expect(useGameStore.getState().cards.find((c) => c.id === 'victim')?.zone).toBe('graveyard')
    expect(useGameStore.getState().triggerStack).toHaveLength(0)
  })

  it('the AI avoids hexproof creatures when auto-targeting', () => {
    primeCardRules({ 'Bolt': spellRule('Bolt', dealDamageAbility()) })
    const aiBolt = card({ id: 'bolt', name: 'Bolt', type: 'instant', typeLine: 'Instant', zone: 'battlefield', owner: 'opponent' })
    const hexproof = card({ id: 'hex', name: 'Mist', typeLine: '1/1', type: 'creature', zone: 'battlefield' })
    const plain = card({ id: 'plain', name: 'Bear', typeLine: '1/1', type: 'creature', zone: 'battlefield' })
    primeCardRules({ 'Bolt': spellRule('Bolt', dealDamageAbility()), 'Mist': ruleFor('Mist', ['hexproof']) })
    useGameStore.setState({ cards: [aiBolt, hexproof, plain] })

    resolveAISpellAbilities(
      (partial) => useGameStore.setState(partial as never),
      () => useGameStore.getState(),
      aiBolt,
    )

    expect(useGameStore.getState().cards.find((c) => c.id === 'hex')?.zone).toBe('battlefield')
    expect(useGameStore.getState().cards.find((c) => c.id === 'plain')?.zone).toBe('graveyard')
  })

  it('an AI life-gain spell heals the opponent, not the player', () => {
    primeCardRules({
      'Heal': spellRule('Heal', {
        abilityType: 'spell',
        triggerEvent: null,
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 0,
        targetFilter: null,
        effect: { kind: 'gain_life', params: { amount: 4 } },
      }),
    })
    const aiHeal = card({ id: 'heal', name: 'Heal', type: 'instant', typeLine: 'Instant', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({ cards: [aiHeal] })

    resolveAISpellAbilities(
      (partial) => useGameStore.setState(partial as never),
      () => useGameStore.getState(),
      aiHeal,
    )

    const state = useGameStore.getState()
    expect(state.lifeTotal).toBe(40)
    expect(state.opponentLifeTotal).toBe(44)
  })

  it('a pump spell boosts its target until end of turn', () => {
    primeCardRules({
      'Giant Growth': spellRule('Giant Growth', {
        abilityType: 'spell',
        triggerEvent: null,
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 1,
        targetFilter: 'creature',
        effect: { kind: 'pump', params: { power: 3, toughness: 3 } },
      }),
    })
    const spell = card({ id: 'gg', name: 'Giant Growth', type: 'instant', typeLine: 'Instant', zone: 'hand' })
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [spell, bear], manaPool: { ...emptyManaPool(), G: 5 } })

    useGameStore.getState().castSpell('gg')
    const triggerId = useGameStore.getState().triggerStack[0].id
    useGameStore.getState().resolveTrigger(triggerId)
    useGameStore.getState().selectTarget(triggerId, 'bear')

    const pumped = useGameStore.getState().cards.find((c) => c.id === 'bear')
    expect(pumped?.powerBoost).toBe(3)
    expect(pumped?.toughnessBoost).toBe(3)
  })

  it('a boosted creature survives lethal damage', () => {
    primeCardRules({})
    useGameStore.setState({
      cards: [card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', damage: 2, powerBoost: 3, toughnessBoost: 3 })],
    })
    useGameStore.getState().checkStateBasedActions()
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('battlefield')
  })

  it('boosts are cleared at the beginning of the next turn', () => {
    useGameStore.setState({
      cards: [card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', powerBoost: 3, toughnessBoost: 3 })],
      currentPhase: 'beginning',
    })
    useGameStore.getState().advancePhase()
    const after = useGameStore.getState().cards.find((c) => c.id === 'bear')
    expect(after?.powerBoost).toBe(0)
    expect(after?.toughnessBoost).toBe(0)
  })

  it('combat damage uses boosted power and toughness', () => {
    useGameStore.setState({
      cards: [
        card({ id: 'pumped', name: 'Pumped', typeLine: '2/2', type: 'creature', zone: 'battlefield', tapped: true, powerBoost: 3, toughnessBoost: 3 }),
        card({ id: 'chump', name: 'Chump', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      combatState: { active: true, attackers: ['pumped'], blockers: { pumped: ['chump'] } },
    })
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().cards.find((c) => c.id === 'chump')?.zone).toBe('graveyard')
    const pumped = useGameStore.getState().cards.find((c) => c.id === 'pumped')
    expect(pumped?.zone).toBe('battlefield')
    expect(pumped?.damage).toBe(2)
  })

  it('attackers tap when they attack', () => {
    useGameStore.setState({
      cards: [card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', tapped: false })],
      combatState: { active: true, attackers: ['bear'], blockers: {} },
    })
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.tapped).toBe(true)
  })

  it('vigilant attackers stay untapped after attacking', () => {
    primeCardRules({ 'Sentinel': ruleFor('Sentinel', ['vigilance']) })
    useGameStore.setState({
      cards: [card({ id: 'sent', name: 'Sentinel', typeLine: '2/2', type: 'creature', zone: 'battlefield', tapped: false })],
      combatState: { active: true, attackers: ['sent'], blockers: {} },
    })
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().cards.find((c) => c.id === 'sent')?.tapped).toBe(false)
  })

  it('tapped creatures cannot block', () => {
    useGameStore.setState({
      cards: [
        card({ id: 'attacker', name: 'Attacker', typeLine: '3/3', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'tapped-blocker', name: 'Sleepy', typeLine: '1/4', type: 'creature', zone: 'battlefield', tapped: true, owner: 'opponent' }),
      ],
      combatState: { active: true, attackers: ['attacker'], blockers: { attacker: ['tapped-blocker'] } },
    })
    useGameStore.getState().resolveCombat()
    const blocker = useGameStore.getState().cards.find((c) => c.id === 'tapped-blocker')
    expect(blocker?.zone).toBe('battlefield')
    expect(blocker?.damage ?? 0).toBe(0)
    expect(useGameStore.getState().opponentLifeTotal).toBe(37)
  })
})

describe('static effects', () => {
  function anthemRule(): CardRuleEntry {
    return {
      cardName: 'Anthem', manaCost: '{1}{W}{W}', manaValue: 3, typeLine: 'Enchantment', cardType: 'enchantment', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: 'Creatures you control get +1/+1.', scryfallId: 'a', abilities: [{
        abilityType: 'static',
        triggerEvent: null,
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 0,
        targetFilter: null,
        effect: { kind: 'pump', params: { power: 1, toughness: 1 } },
      }],
    }
  }

  it('a static anthem pumps friendly creatures in combat', () => {
    primeCardRules({ 'Anthem': anthemRule() })
    const anthem = card({ id: 'anthem', name: 'Anthem', typeLine: 'Enchantment', type: 'enchantment', zone: 'battlefield' })
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', tapped: true })
    const chump = card({ id: 'chump', name: 'Chump', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({
      cards: [anthem, bear, chump],
      combatState: { active: true, attackers: ['bear'], blockers: { bear: ['chump'] } },
    })
    useGameStore.getState().resolveCombat()
    // Bear is effectively 3/3: kills the 2/2 chump and survives its 2 damage.
    expect(useGameStore.getState().cards.find((c) => c.id === 'chump')?.zone).toBe('graveyard')
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('battlefield')
  })

  it('an anthem does not pump the opponent\'s creatures', () => {
    primeCardRules({ 'Anthem': anthemRule() })
    const anthem = card({ id: 'anthem', name: 'Anthem', typeLine: 'Enchantment', type: 'enchantment', zone: 'battlefield' })
    const enemyBear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent', damage: 2 })
    useGameStore.setState({ cards: [anthem, enemyBear] })
    useGameStore.getState().checkStateBasedActions()
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('graveyard')
  })

  it('a static anthem saves a creature from lethal damage', () => {
    primeCardRules({ 'Anthem': anthemRule() })
    const anthem = card({ id: 'anthem', name: 'Anthem', typeLine: 'Enchantment', type: 'enchantment', zone: 'battlefield' })
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', damage: 2 })
    useGameStore.setState({ cards: [anthem, bear] })
    useGameStore.getState().checkStateBasedActions()
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('battlefield')
  })

  it('an aura does not pump the whole team (no attachment tracking)', () => {
    primeCardRules({ 'Giant Strength': anthemRule() })
    const aura = card({ id: 'aura', name: 'Giant Strength', typeLine: 'Enchantment — Aura', type: 'enchantment', zone: 'battlefield' })
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', damage: 2 })
    useGameStore.setState({ cards: [aura, bear] })
    useGameStore.getState().checkStateBasedActions()
    // Without the pump, the 2-damage bear dies.
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('graveyard')
  })
})

describe('auras', () => {
  function auraRule(): CardRuleEntry {
    return {
      cardName: 'Giant Strength', manaCost: '{1}{G}', manaValue: 2, typeLine: 'Enchantment — Aura', cardType: 'enchantment', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: 'Enchant creature. Enchanted creature gets +2/+2.', scryfallId: 'a', abilities: [{
        abilityType: 'static',
        triggerEvent: null,
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 0,
        targetFilter: null,
        effect: { kind: 'pump', params: { power: 2, toughness: 2 } },
      }],
    }
  }

  function auraCard(id: string, overrides: Partial<BoardCard> = {}): BoardCard {
    return card({ id, name: 'Giant Strength', typeLine: 'Enchantment — Aura', type: 'enchantment', zone: 'battlefield', ...overrides })
  }

  it('prompts for a target when it enters the battlefield via drag/drop', () => {
    useGameStore.setState({
      cards: [auraCard('aura', { zone: 'hand' }), card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield' })],
    })
    useGameStore.getState().moveCard('aura', 'battlefield')
    const attached = useGameStore.getState().cards.find((c) => c.id === 'aura')
    expect(attached?.zone).toBe('battlefield')
    expect(attached?.enchantsCardId).toBeUndefined()
    expect(useGameStore.getState().auraPrompt).not.toBeNull()
  })

  it('dies when there is no creature to enchant', () => {
    useGameStore.setState({
      cards: [auraCard('aura', { zone: 'hand' }), card({ id: 'land', name: 'Forest', typeLine: 'Basic Land', type: 'land', zone: 'battlefield' })],
    })
    useGameStore.getState().moveCard('aura', 'battlefield')
    expect(useGameStore.getState().cards.find((c) => c.id === 'aura')?.zone).toBe('graveyard')
  })

  it('casting an aura prompts the player to choose its target (A3)', () => {
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    const wolf = card({ id: 'wolf', name: 'Wolf', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({
      manaPool: { ...emptyManaPool(), G: 2 },
      cards: [auraCard('aura', { zone: 'hand' }), bear, wolf],
    })
    useGameStore.getState().castSpell('aura')

    const prompt = useGameStore.getState().auraPrompt
    expect(prompt?.auraCardId).toBe('aura')
    expect(prompt?.auraName).toBe('Giant Strength')
    expect(prompt?.candidates.map((c) => c.id).sort()).toEqual(['bear', 'wolf'])
    expect(useGameStore.getState().cards.find((c) => c.id === 'aura')?.zone).toBe('battlefield')
    expect(useGameStore.getState().cards.find((c) => c.id === 'aura')?.enchantsCardId).toBeUndefined()

    useGameStore.getState().attachAuraTo('aura', 'wolf')
    expect(useGameStore.getState().auraPrompt).toBeNull()
    expect(useGameStore.getState().cards.find((c) => c.id === 'aura')?.enchantsCardId).toBe('wolf')
  })

  it('declining the aura prompt sends it to the graveyard', () => {
    useGameStore.setState({
      manaPool: { ...emptyManaPool(), G: 2 },
      cards: [auraCard('aura', { zone: 'hand' }), card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield' })],
    })
    useGameStore.getState().castSpell('aura')
    expect(useGameStore.getState().auraPrompt).not.toBeNull()

    useGameStore.getState().declineAura('aura')
    expect(useGameStore.getState().auraPrompt).toBeNull()
    expect(useGameStore.getState().cards.find((c) => c.id === 'aura')?.zone).toBe('graveyard')
  })

  it('does not prompt when no friendly creature is on the battlefield', () => {
    useGameStore.setState({
      manaPool: { ...emptyManaPool(), G: 2 },
      cards: [auraCard('aura', { zone: 'hand' })],
    })
    useGameStore.getState().castSpell('aura')
    expect(useGameStore.getState().auraPrompt).toBeNull()
    // With no valid target the aura goes straight to the graveyard.
    expect(useGameStore.getState().cards.find((c) => c.id === 'aura')?.zone).toBe('graveyard')
  })

  it('pumps only the enchanted creature', () => {
    primeCardRules({ 'Giant Strength': auraRule() })
    const enchanted = card({ id: 'ench', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', damage: 3 })
    const other = card({ id: 'other', name: 'Wolf', typeLine: '2/2', type: 'creature', zone: 'battlefield', damage: 3 })
    const aura = auraCard('aura', { enchantsCardId: 'ench' })
    useGameStore.setState({ cards: [enchanted, other, aura] })
    useGameStore.getState().checkStateBasedActions()
    // The enchanted 2/2 is effectively 4/4: survives 3 damage. The other dies.
    expect(useGameStore.getState().cards.find((c) => c.id === 'ench')?.zone).toBe('battlefield')
    expect(useGameStore.getState().cards.find((c) => c.id === 'other')?.zone).toBe('graveyard')
  })

  it('dies with its enchanted creature', () => {
    primeCardRules({})
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', damage: 2 })
    const aura = auraCard('aura', { enchantsCardId: 'bear' })
    useGameStore.setState({ cards: [bear, aura] })
    useGameStore.getState().checkStateBasedActions()
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('graveyard')
    expect(useGameStore.getState().cards.find((c) => c.id === 'aura')?.zone).toBe('graveyard')
  })
})

describe('ward', () => {
  const wardExileAbility = (): CardAbilityDef => ({
    abilityType: 'spell',
    triggerEvent: null,
    triggerCondition: null,
    isOptional: false,
    cost: null,
    targets: 1,
    targetFilter: 'creature',
    effect: { kind: 'exile', params: {} },
  })

  function castTargetedSpell(spellId: string, spellName: string, rules: Record<string, CardRuleEntry>) {
    primeCardRules(rules)
    const spell = card({ id: spellId, name: spellName, type: 'instant', typeLine: 'Instant', zone: 'hand' })
    useGameStore.setState({ cards: [spell, ...useGameStore.getState().cards], manaPool: { ...emptyManaPool(), W: 5 } })
    useGameStore.getState().castSpell(spellId)
    const triggerId = useGameStore.getState().triggerStack[0].id
    useGameStore.getState().resolveTrigger(triggerId)
    return triggerId
  }

  it('defers targeting an opponent ward creature until payment', () => {
    const warded = card({ id: 'warded', name: 'Warded', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({ cards: [warded] })
    const triggerId = castTargetedSpell('ex', 'Exile Spell', {
      'Exile Spell': {
        cardName: 'Exile Spell', manaCost: '{1}{W}', manaValue: 2, typeLine: 'Instant', cardType: 'instant', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 's', abilities: [wardExileAbility()],
      },
      'Warded': ruleFor('Warded', ['ward']),
    })
    useGameStore.getState().selectTarget(triggerId, 'warded')

    const state = useGameStore.getState()
    expect(state.wardPrompt).not.toBeNull()
    expect(state.wardPrompt?.cost).toBe(2)
    expect(state.cards.find((c) => c.id === 'warded')?.zone).toBe('battlefield')
    expect(state.triggerStack).toHaveLength(1)
  })

  it('pays ward and resolves the spell', () => {
    const warded = card({ id: 'warded', name: 'Warded', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({ cards: [warded], manaPool: { ...emptyManaPool(), W: 5 } })
    const triggerId = castTargetedSpell('ex', 'Exile Spell', {
      'Exile Spell': {
        cardName: 'Exile Spell', manaCost: '{1}{W}', manaValue: 2, typeLine: 'Instant', cardType: 'instant', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 's', abilities: [wardExileAbility()],
      },
      'Warded': ruleFor('Warded', ['ward']),
    })
    useGameStore.getState().selectTarget(triggerId, 'warded')
    useGameStore.getState().payWard()

    const state = useGameStore.getState()
    expect(state.wardPrompt).toBeNull()
    expect(state.cards.find((c) => c.id === 'warded')?.zone).toBe('exile')
    expect(state.triggerStack).toHaveLength(0)
    expect(state.manaPool.W).toBe(3)
  })

  it('counters the spell when ward is refused', () => {
    const warded = card({ id: 'warded', name: 'Warded', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({ cards: [warded], manaPool: { ...emptyManaPool(), W: 5 } })
    const triggerId = castTargetedSpell('ex', 'Exile Spell', {
      'Exile Spell': {
        cardName: 'Exile Spell', manaCost: '{1}{W}', manaValue: 2, typeLine: 'Instant', cardType: 'instant', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 's', abilities: [wardExileAbility()],
      },
      'Warded': ruleFor('Warded', ['ward']),
    })
    useGameStore.getState().selectTarget(triggerId, 'warded')
    useGameStore.getState().refuseWard()

    const state = useGameStore.getState()
    expect(state.wardPrompt).toBeNull()
    expect(state.cards.find((c) => c.id === 'warded')?.zone).toBe('battlefield')
    expect(state.triggerStack).toHaveLength(0)
    expect(state.manaPool.W).toBe(5)
  })

  it('does not trigger ward for your own creatures', () => {
    const warded = card({ id: 'warded', name: 'Warded', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [warded], manaPool: { ...emptyManaPool(), W: 5 } })
    const triggerId = castTargetedSpell('ex', 'Exile Spell', {
      'Exile Spell': {
        cardName: 'Exile Spell', manaCost: '{1}{W}', manaValue: 2, typeLine: 'Instant', cardType: 'instant', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 's', abilities: [wardExileAbility()],
      },
      'Warded': ruleFor('Warded', ['ward']),
    })
    useGameStore.getState().selectTarget(triggerId, 'warded')

    const state = useGameStore.getState()
    expect(state.wardPrompt).toBeNull()
    expect(state.cards.find((c) => c.id === 'warded')?.zone).toBe('exile')
  })

  it('the AI pays ward when affordable and counters otherwise', () => {
    const boltRule: CardRuleEntry = {
      cardName: 'Bolt', manaCost: '{R}', manaValue: 1, typeLine: 'Instant', cardType: 'instant', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 'b', abilities: [{
        abilityType: 'spell',
        triggerEvent: null,
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 1,
        targetFilter: null,
        effect: { kind: 'deal_damage', params: { amount: 3 } },
      }],
    }
    primeCardRules({ 'Warded': ruleFor('Warded', ['ward']), 'Bolt': boltRule })
    const aiBolt = card({ id: 'bolt', name: 'Bolt', type: 'instant', typeLine: 'Instant', zone: 'battlefield', owner: 'opponent' })
    const warded = card({ id: 'warded', name: 'Warded', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({
      cards: [aiBolt, warded],
      opponentManaPool: { ...emptyManaPool(), R: 2 },
    })

    resolveAISpellAbilities(
      (partial) => useGameStore.setState(partial as never),
      () => useGameStore.getState(),
      aiBolt,
    )
    expect(useGameStore.getState().opponentManaPool.R).toBe(0)
    expect(useGameStore.getState().cards.find((c) => c.id === 'warded')?.zone).toBe('graveyard')

    useGameStore.setState({
      cards: [aiBolt, warded],
      opponentManaPool: { ...emptyManaPool() },
    })
    resolveAISpellAbilities(
      (partial) => useGameStore.setState(partial as never),
      () => useGameStore.getState(),
      aiBolt,
    )
    expect(useGameStore.getState().cards.find((c) => c.id === 'warded')?.zone).toBe('battlefield')
    expect(useGameStore.getState().triggerStack).toHaveLength(0)
  })
})

describe('modal spells', () => {
  function modalRule(name: string, modes: CardAbilityDef[]): CardRuleEntry {
    return {
      cardName: name,
      manaCost: '{1}{R}',
      manaValue: 2,
      typeLine: 'Instant',
      cardType: 'instant',
      subtypes: [],
      keywords: [],
      manaProduction: null,
      entryTapRule: null,
      conditionalEntryText: null,
      oracleText: 'Choose one —',
      scryfallId: `sf-${name}`,
      abilities: modes,
    }
  }

  const damageMode = (): CardAbilityDef => ({
    abilityType: 'spell',
    triggerEvent: null,
    triggerCondition: null,
    isOptional: true,
    cost: null,
    targets: 1,
    targetFilter: 'creature',
    effect: { kind: 'deal_damage', params: { amount: 3 } },
  })

  const drawMode = (): CardAbilityDef => ({
    abilityType: 'spell',
    triggerEvent: null,
    triggerCondition: null,
    isOptional: true,
    cost: null,
    targets: 0,
    targetFilter: null,
    effect: { kind: 'draw_cards', params: { amount: 2 } },
  })

  it('enqueues every mode of a modal spell as an optional ability', () => {
    primeCardRules({ 'Pyre': modalRule('Pyre', [damageMode(), drawMode()]) })
    const spell = card({ id: 'pyre', name: 'Pyre', type: 'instant', typeLine: 'Instant', zone: 'hand' })
    const victim = card({ id: 'victim', name: 'Bird', typeLine: '1/1', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [spell, victim], manaPool: { ...emptyManaPool(), R: 5 } })

    useGameStore.getState().castSpell('pyre')

    const stack = useGameStore.getState().triggerStack
    expect(stack).toHaveLength(2)
    expect(stack.every((t) => t.ability.isOptional)).toBe(true)
  })

  it('resolves one mode and skips the others', () => {
    primeCardRules({ 'Pyre': modalRule('Pyre', [damageMode(), drawMode()]) })
    const spell = card({ id: 'pyre', name: 'Pyre', type: 'instant', typeLine: 'Instant', zone: 'hand' })
    const victim = card({ id: 'victim', name: 'Bird', typeLine: '1/1', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [spell, victim], manaPool: { ...emptyManaPool(), R: 5 } })

    useGameStore.getState().castSpell('pyre')
    const stack = useGameStore.getState().triggerStack
    const damageTrigger = stack[0]
    const drawTrigger = stack[1]

    // Resolve the damage mode (target the bird).
    useGameStore.getState().resolveTrigger(damageTrigger.id)
    useGameStore.getState().selectTarget(damageTrigger.id, 'victim')
    expect(useGameStore.getState().cards.find((c) => c.id === 'victim')?.zone).toBe('graveyard')

    // Skip the draw mode.
    useGameStore.getState().skipTrigger(drawTrigger.id)
    expect(useGameStore.getState().triggerStack).toHaveLength(0)
  })

  it('the AI auto-resolves ETB triggers on permanents it casts', () => {
    const etbDrawRule: CardRuleEntry = {
      cardName: 'Solemn Simulacrum', manaCost: '{4}', manaValue: 4, typeLine: 'Artifact Creature — Golem', cardType: 'creature', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: 'When Solemn Simulacrum enters the battlefield, you may draw a card.', scryfallId: 's', abilities: [{
        abilityType: 'triggered',
        triggerEvent: 'etb',
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 0,
        targetFilter: null,
        effect: { kind: 'draw_cards', params: { amount: 1 } },
      }],
    }
    primeCardRules({ 'Solemn Simulacrum': etbDrawRule })
    const simulacrum = card({ id: 'sim', name: 'Solemn Simulacrum', type: 'creature', typeLine: 'Artifact Creature — Golem', zone: 'battlefield', owner: 'opponent' })
    const libraryCard = card({ id: 'lib', name: 'Library Card', type: 'creature', typeLine: 'Creature', zone: 'library', owner: 'opponent' })
    useGameStore.setState({ cards: [simulacrum, libraryCard] })

    resolveAIAutoAbilities(
      (partial) => useGameStore.setState(partial as never),
      () => useGameStore.getState(),
      simulacrum,
      'etb',
    )

    // The trigger resolved against the AI: it drew a card into its hand.
    const state = useGameStore.getState()
    expect(state.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'hand')).toHaveLength(1)
    expect(state.triggerStack).toHaveLength(0)
  })

  it('the AI resolves its attack triggers', () => {
    const attackRule: CardRuleEntry = {
      cardName: 'Raid Leader', manaCost: '{2}{R}', manaValue: 3, typeLine: 'Creature — Goblin', cardType: 'creature', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: 'Whenever Raid Leader attacks, it gets +1/+0 until end of turn.', scryfallId: 'r', abilities: [{
        abilityType: 'triggered',
        triggerEvent: 'attack',
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 0,
        targetFilter: null,
        effect: { kind: 'pump', params: { power: 1, toughness: 0 } },
      }],
    }
    primeCardRules({ 'Raid Leader': attackRule })
    const attacker = card({ id: 'raid', name: 'Raid Leader', type: 'creature', typeLine: 'Creature — Goblin', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({ cards: [attacker] })

    resolveAIAutoAbilities(
      (partial) => useGameStore.setState(partial as never),
      () => useGameStore.getState(),
      attacker,
      'attack',
    )

    const boosted = useGameStore.getState().cards.find((c) => c.id === 'raid')
    expect(boosted?.powerBoost).toBe(1)
    expect(useGameStore.getState().triggerStack).toHaveLength(0)
  })

  it('AI death triggers auto-resolve off the stack', () => {
    const diesRule: CardRuleEntry = {
      cardName: 'Mourner', manaCost: '{2}{B}', manaValue: 3, typeLine: 'Creature — Zombie', cardType: 'creature', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: 'When Mourner dies, you draw a card.', scryfallId: 'm', abilities: [{
        abilityType: 'triggered',
        triggerEvent: 'dies',
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 0,
        targetFilter: null,
        effect: { kind: 'draw_cards', params: { amount: 1 } },
      }],
    }
    primeCardRules({ 'Mourner': diesRule })
    const mourner = card({ id: 'mourner', name: 'Mourner', type: 'creature', typeLine: 'Creature — Zombie', zone: 'battlefield', owner: 'opponent', damage: 2 })
    const libraryCard = card({ id: 'lib', name: 'Library Card', type: 'creature', typeLine: 'Creature', zone: 'library', owner: 'opponent' })
    useGameStore.setState({ cards: [mourner, libraryCard] })

    // Death fires through the normal SBA + trigger-stack path, then the AI's
    // instances are swept off the stack automatically.
    useGameStore.getState().checkStateBasedActions()
    expect(useGameStore.getState().cards.find((c) => c.id === 'mourner')?.zone).toBe('graveyard')
    expect(useGameStore.getState().triggerStack.length).toBeGreaterThan(0)

    resolveAITriggerInstances(
      (partial) => useGameStore.setState(partial as never),
      () => useGameStore.getState(),
    )

    const state = useGameStore.getState()
    expect(state.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'hand')).toHaveLength(1)
    expect(state.triggerStack).toHaveLength(0)
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

      vi.advanceTimersByTime(10500)

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

  it('drives the phase bar through the AI turn stages', () => {
    vi.useFakeTimers()
    try {
      const cards = [
        deckCard('Atarka, World Render', 'Legendary Creature — Dragon'),
        ...Array.from({ length: 8 }, () => deckCard('Mountain', 'Land')),
        deckCard('Dragon Whelp', 'Creature — Dragon'),
      ]
      useGameStore.getState().loadOpponentDeck(['Atarka, World Render'], cards, 'Draconic Destruction')

      expect(useGameStore.getState().currentPhase).toBe('beginning')

      // Land play happens after untap+draw (~800ms in): phase becomes precombat_main.
      vi.advanceTimersByTime(1000)
      expect(useGameStore.getState().currentPhase).toBe('precombat_main')

      // Full turn: phase returns to beginning for the player's turn.
      vi.advanceTimersByTime(9500)
      const state = useGameStore.getState()
      expect(state.activePlayer).toBe('player')
      expect(state.currentPhase).toBe('beginning')
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('discards down to a 7-card hand at the end of its turn', () => {
    vi.useFakeTimers()
    try {
      // No lands: the AI can't play a land, so it ends its turn with 8 cards
      // (7 opening + 1 draw) and must discard one.
      const cards = [
        deckCard('Atarka, World Render', 'Legendary Creature — Dragon'),
        ...Array.from({ length: 10 }, (_, i) => deckCard(`Bear ${i}`, 'Creature')),
      ]
      useGameStore.getState().loadOpponentDeck(['Atarka, World Render'], cards, 'Draconic Destruction')

      vi.advanceTimersByTime(10500)

      const state = useGameStore.getState()
      const opponentHand = state.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'hand')
      expect(opponentHand.length).toBe(7)
      const opponentGraveyard = state.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'graveyard')
      expect(opponentGraveyard.length).toBe(1)
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
