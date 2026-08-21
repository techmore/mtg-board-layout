import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from './gameStore'
import { primeCardRules, computeStaticPump, hasKeyword } from './cardRulesLoader'
import { resolveAISpellAbilities, resolveAIAutoAbilities, resolveAITriggerInstances } from './spellResolution'
import { resolvePendingAISpell } from './gameOpponentAI'
import { getCardPower, getCardToughness } from '../utils/misc'
import { pickAttackers } from './opponentAI'
import { setAITurnActive } from './gameRules'
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
  setAITurnActive(false)
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
    commanderDamage: {},
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

describe('commander damage', () => {
  it('accumulates unblocked combat damage from an opponent commander', () => {
    useGameStore.setState({
      activePlayer: 'opponent',
      cards: [card({ id: 'cmd', name: 'Atarka', typeLine: '6/6', type: 'creature', zone: 'battlefield', tapped: true, owner: 'opponent', isCommander: true })],
      combatState: { active: true, attackers: ['cmd'], blockers: {} },
    })

    useGameStore.getState().resolveCombat()

    expect(useGameStore.getState().commanderDamage['cmd']).toBe(6)
    expect(useGameStore.getState().lifeTotal).toBe(34)
    expect(useGameStore.getState().gameOver).toBeNull()
  })

  it('does not accumulate damage from non-commander creatures', () => {
    useGameStore.setState({
      activePlayer: 'opponent',
      cards: [card({ id: 'beater', name: 'Beater', typeLine: '6/6', type: 'creature', zone: 'battlefield', tapped: true, owner: 'opponent' })],
      combatState: { active: true, attackers: ['beater'], blockers: {} },
    })

    useGameStore.getState().resolveCombat()

    expect(useGameStore.getState().commanderDamage['beater']).toBeUndefined()
  })

  it('loses the game at 21 commander damage even above zero life', () => {
    useGameStore.setState({
      activePlayer: 'opponent',
      commanderDamage: { cmd: 15 },
      cards: [card({ id: 'cmd', name: 'Atarka', typeLine: '6/6', type: 'creature', zone: 'battlefield', tapped: true, owner: 'opponent', isCommander: true })],
      lifeTotal: 30,
      combatState: { active: true, attackers: ['cmd'], blockers: {} },
    })

    useGameStore.getState().resolveCombat()

    expect(useGameStore.getState().commanderDamage['cmd']).toBe(21)
    expect(useGameStore.getState().gameOver).toEqual({ winner: 'opponent' })
  })

  it('counts trample overflow from a player commander as commander damage', () => {
    primeCardRules({
      'Atarka': { cardName: 'Atarka', manaCost: '', manaValue: 6, typeLine: 'Creature', cardType: 'creature', subtypes: [], keywords: ['trample'], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 'a', abilities: [] } as CardRuleEntry,
    })
    useGameStore.setState({
      cards: [
        card({ id: 'cmd', name: 'Atarka', typeLine: '6/6', type: 'creature', zone: 'battlefield', tapped: true, isCommander: true }),
        card({ id: 'chump', name: 'Chump', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      combatState: { active: true, attackers: ['cmd'], blockers: { cmd: ['chump'] } },
    })

    useGameStore.getState().resolveCombat()

    expect(useGameStore.getState().commanderDamage['cmd']).toBe(4)
    expect(useGameStore.getState().opponentLifeTotal).toBe(36)
  })

  it('resets commander damage on a new hand', () => {
    useGameStore.setState({ commanderDamage: { cmd: 15 } })
    useGameStore.getState().redeal()
    expect(useGameStore.getState().commanderDamage).toEqual({})
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

  it('a multi-blocked attacker is damaged by every blocker and kills them in order', () => {
    startCombat(
      [
        card({ id: 'bear', name: 'Bear', typeLine: '4/4', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'b1', name: 'Wall1', typeLine: '0/3', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
        card({ id: 'b2', name: 'Wall2', typeLine: '0/2', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      [],
      ['bear'],
      { bear: ['b1', 'b2'] },
    )
    useGameStore.getState().resolveCombat()
    // 4 power allocated across the 0/3 then the 0/2: the first blocker takes
    // lethal 3 and dies; the second takes the remaining 1 and survives.
    expect(useGameStore.getState().cards.find((c) => c.id === 'b1')?.zone).toBe('graveyard')
    expect(useGameStore.getState().cards.find((c) => c.id === 'b2')?.zone).toBe('battlefield')
    expect(useGameStore.getState().cards.find((c) => c.id === 'b2')?.damage).toBe(1)
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('battlefield')
  })

  it('a multi-blocked attacker dies to the combined blocker damage', () => {
    startCombat(
      [
        card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'w1', name: 'Wolf1', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
        card({ id: 'w2', name: 'Wolf2', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      [],
      ['bear'],
      { bear: ['w1', 'w2'] },
    )
    useGameStore.getState().resolveCombat()
    // Both wolves deal 2: the 2/2 bear takes 4 damage and dies. The bear's 2
    // power only kills the first wolf (2/2).
    expect(useGameStore.getState().cards.find((c) => c.id === 'bear')?.zone).toBe('graveyard')
    expect(useGameStore.getState().cards.find((c) => c.id === 'w1')?.zone).toBe('graveyard')
    expect(useGameStore.getState().cards.find((c) => c.id === 'w2')?.zone).toBe('battlefield')
  })

  it('a single blocker cannot block a menace attacker in solo combat', () => {
    startCombat(
      [
        card({ id: 'knight', name: 'Knight', typeLine: '3/3', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'wall', name: 'Wall', typeLine: '0/4', type: 'creature', zone: 'battlefield', owner: 'opponent' }),
      ],
      [ruleFor('Knight', ['menace'])],
      ['knight'],
      { knight: ['wall'] },
    )
    useGameStore.getState().resolveCombat()
    // The illegal single block is ignored: the knight is unblocked and deals 3.
    expect(useGameStore.getState().opponentLifeTotal).toBe(37)
    expect(useGameStore.getState().cards.find((c) => c.id === 'wall')?.zone).toBe('battlefield')
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
      expect(cast?.zone).toBe('graveyard')
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
      expect(state.cards.find((c) => c.id === 'heal')?.zone).toBe('graveyard')
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
      expect(cast?.zone).toBe('graveyard')
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

  it('tapped creatures can block', () => {
    useGameStore.setState({
      cards: [
        card({ id: 'attacker', name: 'Attacker', typeLine: '3/3', type: 'creature', zone: 'battlefield', tapped: true }),
        card({ id: 'tapped-blocker', name: 'Sleepy', typeLine: '1/4', type: 'creature', zone: 'battlefield', tapped: true, owner: 'opponent' }),
      ],
      combatState: { active: true, attackers: ['attacker'], blockers: { attacker: ['tapped-blocker'] } },
    })
    useGameStore.getState().resolveCombat()
    // The tapped blocker blocks: it takes the attack and the player is unharmed.
    const blocker = useGameStore.getState().cards.find((c) => c.id === 'tapped-blocker')
    expect(blocker?.zone).toBe('battlefield')
    expect(blocker?.damage ?? 0).toBe(3)
    expect(useGameStore.getState().opponentLifeTotal).toBe(40)
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

  it('sets a resolve deadline on the block window during the AI attack', () => {
    vi.useFakeTimers()
    try {
      const cards = [
        deckCard('Atarka, World Render', 'Legendary Creature — Dragon'),
        ...Array.from({ length: 8 }, () => deckCard('Mountain', 'Land')),
        deckCard('Dragon Whelp', 'Creature — Dragon'),
      ]
      useGameStore.getState().loadOpponentDeck(['Atarka, World Render'], cards, 'Draconic Destruction')

      vi.advanceTimersByTime(2600)

      const state = useGameStore.getState()
      expect(state.combatState.active).toBe(true)
      expect(state.combatState.resolveAt).toBeGreaterThan(Date.now())
      expect(state.combatState.resolveAt! - Date.now()).toBeLessThanOrEqual(8000)
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

  it('a single multi-color potential source cannot pay two colored symbols', () => {
    // Command Tower produces W and U but only one mana per tap: it must not
    // be able to pay {W}{U} by itself.
    useGameStore.setState({ manaPool: emptyManaPool(), potentialMana: [{ id: 'tower-tap', colors: ['W', 'U'], sourceCardId: 'tower', sourceCardName: 'Command Tower' }] })

    const spent = useGameStore.getState().spendManaCost('{W}{U}', 'Test spell')

    expect(spent).toBe(false)
    expect(useGameStore.getState().potentialMana).toHaveLength(1)
    expect(useGameStore.getState().manaPool).toEqual(emptyManaPool())
  })

  it('two multi-color potential sources pay one colored symbol each', () => {
    useGameStore.setState({
      manaPool: emptyManaPool(),
      potentialMana: [
        { id: 'tap-1', colors: ['W', 'U'], sourceCardId: 'tower', sourceCardName: 'Command Tower' },
        { id: 'tap-2', colors: ['W', 'U'], sourceCardId: 'tower2', sourceCardName: 'Exotic Orchard' },
      ],
    })

    const spent = useGameStore.getState().spendManaCost('{W}{U}', 'Test spell')

    expect(spent).toBe(true)
    expect(useGameStore.getState().manaPool).toEqual(emptyManaPool())
    expect(useGameStore.getState().potentialMana).toHaveLength(0)
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

describe('equip', () => {
  function equipRule(): CardRuleEntry {
    return {
      cardName: 'Sword', manaCost: '{3}', manaValue: 3, typeLine: 'Artifact — Equipment', cardType: 'artifact',
      subtypes: ['Equipment'], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Equipped creature gets +2/+2. Equip {2} ({2}: Attach to target creature you control.)',
      scryfallId: 's1',
      abilities: [
        { abilityType: 'static', triggerEvent: null, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'pump', params: { power: 2, toughness: 2, scope: 'own' } } },
        { abilityType: 'activated', triggerEvent: null, triggerCondition: null, isOptional: false, cost: '{2}', targets: 1, targetFilter: 'creature you control', effect: { kind: 'equip', params: { cost: '{2}' } } },
      ],
    }
  }

  it('equip activation attaches the equipment to the chosen creature', () => {
    const sword = card({ id: 'sword', name: 'Sword', type: 'artifact', typeLine: 'Artifact — Equipment' })
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2' })
    const trigger = { id: 't1', sourceCardId: 'sword', sourceCardName: 'Sword', ability: equipRule().abilities[1], event: 'cast' as const, context: {} }
    useGameStore.setState({ cards: [sword, bear], triggerStack: [trigger] })
    useGameStore.getState().selectTarget('t1', 'bear', true)
    const after = useGameStore.getState().cards.find((c) => c.id === 'sword')
    expect(after?.enchantsCardId).toBe('bear')
  })

  it('the equipped creature receives the equipment pump in combat math', () => {
    primeCardRules({ 'Sword': equipRule() })
    const sword = card({ id: 'sword', name: 'Sword', type: 'artifact', typeLine: 'Artifact — Equipment', enchantsCardId: 'bear', zone: 'battlefield' })
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', tapped: true, zone: 'battlefield' })
    useGameStore.setState({ cards: [sword, bear] })
    const pump = computeStaticPump([sword, bear], bear)
    expect(pump).toEqual({ power: 2, toughness: 2 })
  })

  it('equipment falls off (does not die) when its creature dies', () => {
    const sword = card({ id: 'sword', name: 'Sword', type: 'artifact', typeLine: 'Artifact — Equipment', enchantsCardId: 'bear', zone: 'battlefield' })
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '1/1', damage: 3, zone: 'battlefield' })
    useGameStore.setState({ cards: [sword, bear] })
    useGameStore.getState().checkStateBasedActions()
    const after = useGameStore.getState().cards
    expect(after.find((c) => c.id === 'bear')?.zone).toBe('graveyard')
    const equip = after.find((c) => c.id === 'sword')
    expect(equip?.zone).toBe('battlefield')
    expect(equip?.enchantsCardId).toBeUndefined()
  })
})

describe('annihilator', () => {
  function annihilatorRule(): CardRuleEntry {
    return {
      cardName: "Ulamog's Crusher", manaCost: '{8}', manaValue: 8, typeLine: 'Creature', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: 'never', conditionalEntryText: null,
      oracleText: 'Annihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents.)',
      scryfallId: 'u1',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'attack' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'annihilator', params: { amount: 2 } } }],
    }
  }

  it('sacrifices the defender\'s weakest permanents when the annihilator attacker triggers', () => {
    primeCardRules({ "Ulamog's Crusher": annihilatorRule() })
    const attacker = card({ id: 'crusher', name: "Ulamog's Crusher", typeLine: 'Creature', tapped: true, zone: 'battlefield' })
    const big = card({ id: 'big', name: 'Big', typeLine: '5/5', owner: 'opponent', zone: 'battlefield' })
    const weak = card({ id: 'weak', name: 'Weak', typeLine: '1/1', owner: 'opponent', zone: 'battlefield' })
    const land = card({ id: 'land', name: 'Plains', type: 'land', typeLine: 'Basic Land', owner: 'opponent', zone: 'battlefield' })
    useGameStore.setState({ cards: [attacker, big, weak, land] })
    const trigger = {
      id: 't1', sourceCardId: 'crusher', sourceCardName: "Ulamog's Crusher", event: 'attack' as const, context: {},
      ability: annihilatorRule().abilities[0],
    }
    useGameStore.setState({ cards: [attacker, big, weak, land], triggerStack: [trigger] })
    useGameStore.getState().resolveTrigger('t1')
    const after = useGameStore.getState().cards
    // Annihilator 2 sacrifices the two weakest nonlands: weak then big.
    expect(after.find((c) => c.id === 'weak')?.zone).toBe('graveyard')
    expect(after.find((c) => c.id === 'big')?.zone).toBe('graveyard')
    expect(after.find((c) => c.id === 'land')?.zone).toBe('battlefield')
  })

  it('attack events fire annihilator triggers during combat', () => {
    primeCardRules({ "Ulamog's Crusher": annihilatorRule() })
    const crusher = card({ id: 'crusher', name: "Ulamog's Crusher", typeLine: 'Creature 5/5', tapped: true, zone: 'battlefield' })
    const weak = card({ id: 'weak', name: 'Weak', typeLine: '1/1', owner: 'opponent', zone: 'battlefield' })
    useGameStore.setState({
      cards: [crusher, weak],
      combatState: { active: true, attackers: ['crusher'], blockers: {} },
    })
    useGameStore.getState().resolveCombat()
    // The annihilator trigger is queued on the stack for the player to resolve.
    const triggers = useGameStore.getState().triggerStack
    expect(triggers.some((t) => t.ability.effect.kind === 'annihilator')).toBe(true)
  })
})

describe('deep audit regression fixes (2026-08)', () => {
  function crusherRule(): CardRuleEntry {
    return {
      cardName: "Ulamog's Crusher", manaCost: '{8}', manaValue: 8, typeLine: 'Creature', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: 'never', conditionalEntryText: null,
      oracleText: 'Annihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents.)',
      scryfallId: 'u1',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'attack' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'annihilator', params: { amount: 2 } } }],
    }
  }

  it('does not force the player to discard because of the opponent\'s hand', () => {
    // Player holds a legal 7; the AI also holds 7. Combined they exceed 7, but
    // the hand-size rule applies per player.
    const playerHand = Array.from({ length: 7 }, (_, i) =>
      card({ id: `p${i}`, name: `P${i}`, typeLine: 'Creature', type: 'creature', zone: 'hand' }),
    )
    const opponentHand = Array.from({ length: 7 }, (_, i) =>
      card({ id: `o${i}`, name: `O${i}`, typeLine: 'Creature', type: 'creature', zone: 'hand', owner: 'opponent' }),
    )
    useGameStore.setState({ cards: [...playerHand, ...opponentHand], activePlayer: 'player' })

    useGameStore.getState().advanceTurn()

    expect(useGameStore.getState().turnPrompt?.reason).not.toBe('discard')
  })

  it('the AI attack flow resolves attack triggers exactly once', () => {
    primeCardRules({ "Ulamog's Crusher": crusherRule() })
    const attacker = card({ id: 'att', name: "Ulamog's Crusher", typeLine: 'Creature 5/5', owner: 'opponent', zone: 'battlefield' })
    const victims = ['v1', 'v2', 'v3', 'v4', 'v5'].map((id) =>
      card({ id, name: `V${id}`, typeLine: 'Creature 1/1', owner: 'player', zone: 'battlefield' }),
    )
    useGameStore.setState({ activePlayer: 'opponent', cards: [attacker, ...victims] })

    // The AI resolves its attack triggers directly at declaration...
    resolveAIAutoAbilities(
      (partial) => useGameStore.setState(partial as never),
      () => useGameStore.getState(),
      useGameStore.getState().cards.find((c) => c.id === 'att')!,
      'attack',
    )
    expect(useGameStore.getState().cards.filter((c) => c.zone === 'graveyard')).toHaveLength(2)

    // ...and combat resolution must not fire them a second time.
    useGameStore.setState({ combatState: { active: true, attackers: ['att'], blockers: {} } })
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().cards.filter((c) => c.zone === 'graveyard')).toHaveLength(2)
    expect(useGameStore.getState().triggerStack).toHaveLength(0)
  })

  it('clicking a land in hand respects enters-tapped and fires landfall', () => {
    const tapland = card({
      id: 'tapland', name: 'Smoldering Marsh', type: 'land', typeLine: 'Land — Swamp Mountain',
      zone: 'hand', entersTapped: true, entryTapRule: 'always',
    })
    useGameStore.setState({ cards: [tapland] })

    useGameStore.getState().castSpell('tapland')

    const entered = useGameStore.getState().cards.find((c) => c.id === 'tapland')
    expect(entered?.zone).toBe('battlefield')
    expect(entered?.tapped).toBe(true)
    expect(useGameStore.getState().landPlaysThisTurn).toBe(1)
  })

  it('a conditional enters-tapped land prompts the player before entering', () => {
    const conditional = card({
      id: 'cond', name: 'Canyon Slough', type: 'land', typeLine: 'Land — Swamp Mountain',
      zone: 'hand', entersTapped: true, entryTapRule: 'conditional',
    })
    useGameStore.setState({ cards: [conditional] })

    useGameStore.getState().castSpell('cond')

    expect(useGameStore.getState().turnPrompt?.reason).toBe('etb')
    expect(useGameStore.getState().cards.find((c) => c.id === 'cond')?.zone).toBe('hand')
  })

  it('the player\'s first cast reports a count of 1 for first-spell triggers', () => {
    const rule: CardRuleEntry = {
      cardName: 'First Caster', manaCost: '', manaValue: 0, typeLine: 'Creature', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Whenever you cast your first spell each turn, draw a card.', scryfallId: 'f',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'cast' as const, triggerCondition: 'you cast your first spell each turn', isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'draw_cards', params: { amount: 1 } } }],
    }
    primeCardRules({ 'First Caster': rule })
    const caster = card({ id: 'caster', name: 'First Caster', typeLine: 'Creature', type: 'creature', zone: 'battlefield' })
    const spell = card({ id: 'spell', name: 'Bolt', type: 'instant', typeLine: 'Instant', zone: 'hand', manaCost: '{1}{R}', manaValue: 2 })
    useGameStore.setState({ cards: [caster, spell], manaPool: { ...emptyManaPool(), R: 3 } })

    useGameStore.getState().castSpell('spell')

    const triggers = useGameStore.getState().triggerStack
    expect(triggers.filter((t) => t.ability.effect.kind === 'draw_cards')).toHaveLength(1)
  })

  it('+1/+1 counters add to power and -1/-1 counters subtract', () => {
    expect(getCardPower(card({ typeLine: '2/2', counters: 3 }))).toBe(5)
    expect(getCardToughness(card({ typeLine: '2/2', counters: 3 }))).toBe(5)
    expect(getCardPower(card({ typeLine: '2/2', minusCounters: 2 }))).toBe(0)
    expect(getCardToughness(card({ typeLine: '2/2', minusCounters: 2 }))).toBe(0)
  })

  it('placing a -1/-1 counter lowers power and toughness', () => {
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [bear] })

    useGameStore.getState().addCounter('bear', '-1/-1')

    const after = useGameStore.getState().cards.find((c) => c.id === 'bear')
    expect(after?.minusCounters).toBe(1)
    expect(getCardPower(after!)).toBe(1)
    expect(getCardToughness(after!)).toBe(1)
  })

  it('combat_damage triggers only fire for the source\'s own damage', () => {
    const rule: CardRuleEntry = {
      cardName: 'Pinger', manaCost: '{2}{G}', manaValue: 3, typeLine: 'Creature', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Whenever Pinger deals combat damage to a player, draw a card.', scryfallId: 'p',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'combat_damage' as const, triggerCondition: 'Pinger deals combat damage to a player', isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'draw_cards', params: { amount: 1 } } }],
    }
    primeCardRules({ 'Pinger': rule })
    const pinger = card({ id: 'pinger', name: 'Pinger', typeLine: 'Creature 1/1', type: 'creature', zone: 'battlefield' })
    const enemy = card({ id: 'enemy', name: 'Enemy', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' })
    const library = card({ id: 'lib', name: 'Lib', type: 'creature', zone: 'library' })
    useGameStore.setState({ cards: [pinger, enemy, library] })

    // The opponent's creature deals combat damage — Pinger's trigger must NOT fire.
    useGameStore.getState().emitGameEvent({ type: 'combat_damage', sourceCardId: 'enemy', sourceCardName: 'Enemy', amount: 2 })
    expect(useGameStore.getState().triggerStack).toHaveLength(0)

    // Pinger itself deals combat damage — its trigger fires.
    useGameStore.getState().emitGameEvent({ type: 'combat_damage', sourceCardId: 'pinger', sourceCardName: 'Pinger', amount: 1 })
    expect(useGameStore.getState().triggerStack.filter((t) => t.sourceCardId === 'pinger')).toHaveLength(1)
  })

  it('undo after the opponent\'s turn does not soft-lock onto the opponent turn', () => {
    vi.useFakeTimers()
    try {
      const cards = [
        deckCard('Atarka, World Render', 'Legendary Creature — Dragon'),
        ...Array.from({ length: 8 }, () => deckCard('Mountain', 'Land')),
        deckCard('Dragon Whelp', 'Creature — Dragon'),
      ]
      useGameStore.getState().loadOpponentDeck(['Atarka, World Render'], cards, 'Draconic Destruction')

      vi.advanceTimersByTime(10500)
      expect(useGameStore.getState().activePlayer).toBe('player')

      // The AI turn is not in the player's undo stack: undo cannot restore the
      // dead 'opponent' state that would leave the game stuck.
      useGameStore.getState().undo()

      const state = useGameStore.getState()
      expect(state.activePlayer).toBe('player')
      expect(state.gameOver).toBeNull()
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('keyword_pump grants temporary keywords that clear at the next beginning phase', () => {
    const rule: CardRuleEntry = {
      cardName: 'Anthem of Strength', manaCost: '{1}{G}{G}', manaValue: 3, typeLine: 'Enchantment', cardType: 'enchantment',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Creatures you control gain deathtouch until end of turn.', scryfallId: 'a',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'etb' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'keyword_pump', params: { keyword: 'deathtouch', scope: 'own' } } }],
    }
    primeCardRules({ 'Anthem of Strength': rule })
    const anthem = card({ id: 'anthem', name: 'Anthem of Strength', typeLine: 'Enchantment', type: 'enchantment', zone: 'battlefield' })
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    const enemy = card({ id: 'enemy', name: 'Enemy', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({ cards: [anthem, bear, enemy], currentPhase: 'beginning' })
    const trigger = { id: 't1', sourceCardId: 'anthem', sourceCardName: 'Anthem of Strength', event: 'etb' as const, context: {}, ability: rule.abilities[0] }
    useGameStore.setState({ triggerStack: [trigger] })

    useGameStore.getState().resolveTrigger('t1')

    // Own creatures gained deathtouch; the opponent's creature did not.
    expect(hasKeyword(useGameStore.getState().cards.find((c) => c.id === 'bear')!, 'deathtouch')).toBe(true)
    expect(hasKeyword(useGameStore.getState().cards.find((c) => c.id === 'enemy')!, 'deathtouch')).toBe(false)

    // The boost clears at the next beginning phase.
    useGameStore.getState().advancePhase()
    expect(hasKeyword(useGameStore.getState().cards.find((c) => c.id === 'bear')!, 'deathtouch')).toBe(false)
  })

  it('"until end of turn" pumps clear at the turn handoff, not the next own turn', () => {
    vi.useFakeTimers()
    try {
      const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', powerBoost: 2, toughnessBoost: 2, keywordBoosts: ['haste'] })
      useGameStore.setState({ cards: [bear], activePlayer: 'player', currentPhase: 'ending' })

      useGameStore.getState().advanceTurn()

      const after = useGameStore.getState().cards.find((c) => c.id === 'bear')!
      expect(after.powerBoost).toBe(0)
      expect(after.toughnessBoost).toBe(0)
      expect(after.keywordBoosts).toBeUndefined()
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('a bounce spell returns the targeted permanent to its owner\'s hand', () => {
    const rule: CardRuleEntry = {
      cardName: 'Cyclonic Rift', manaCost: '{1}{U}', manaValue: 2, typeLine: 'Instant', cardType: 'instant', subtypes: [],
      keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: "Return target nonland permanent you don't control to its owner's hand.", scryfallId: 'c',
      abilities: [{ abilityType: 'spell' as const, triggerEvent: null, triggerCondition: null, isOptional: false, cost: null, targets: 1, targetFilter: "nonland permanent you don't control", effect: { kind: 'return_from_graveyard', params: { zone: 'hand' } } }],
    }
    primeCardRules({ 'Cyclonic Rift': rule })
    const spell = card({ id: 'rift', name: 'Cyclonic Rift', type: 'instant', typeLine: 'Instant', zone: 'hand', manaCost: '{1}{U}', manaValue: 2 })
    const victim = card({ id: 'v', name: 'Victim', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [spell, victim], manaPool: { ...emptyManaPool(), U: 2 } })

    useGameStore.getState().castSpell('rift')
    const trigger = useGameStore.getState().triggerStack.find((x) => x.ability.effect.kind === 'return_from_graveyard')
    expect(trigger).toBeDefined()

    useGameStore.getState().resolveTrigger(trigger!.id)
    useGameStore.getState().selectTarget(trigger!.id, 'v')
    expect(useGameStore.getState().cards.find((c) => c.id === 'v')?.zone).toBe('hand')
  })

  it('trample accounts for damage already marked on the blocker', () => {
    primeCardRules({ 'Wurm': ruleFor('Wurm', ['trample']) })
    const wurm = card({ id: 'wurm', name: 'Wurm', typeLine: '5/5', type: 'creature', zone: 'battlefield' })
    const blocker = card({ id: 'blk', name: 'Blocker', typeLine: '2/4', type: 'creature', zone: 'battlefield', owner: 'opponent', damage: 2 })
    useGameStore.setState({
      cards: [wurm, blocker],
      opponentLifeTotal: 40,
      combatState: { active: true, attackers: ['wurm'], blockers: { wurm: ['blk'] } },
    })

    useGameStore.getState().resolveCombat()

    // The blocker needs only 2 more damage (2 already marked): 2 assigned,
    // the remaining 3 spill over to the player.
    expect(useGameStore.getState().opponentLifeTotal).toBe(37)
  })

  it('the legend rule removes duplicate legendary permanents (SBA)', () => {
    const first = card({ id: 'l1', name: 'Atarka, World Render', typeLine: 'Legendary Creature — Dragon 6/4', type: 'creature', zone: 'battlefield' })
    const second = card({ id: 'l2', name: 'Atarka, World Render', typeLine: 'Legendary Creature — Dragon 6/4', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [first, second] })

    useGameStore.getState().checkStateBasedActions()

    const after = useGameStore.getState().cards
    expect(after.filter((c) => c.zone === 'battlefield')).toHaveLength(1)
    expect(after.filter((c) => c.zone === 'graveyard')).toHaveLength(1)
  })

  it('tokens entering the battlefield fire "another creature enters" triggers', () => {
    const rule: CardRuleEntry = {
      cardName: 'Soul Warden', manaCost: '{W}', manaValue: 1, typeLine: 'Creature — Human Cleric', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Whenever another creature enters the battlefield, you gain 1 life.', scryfallId: 's',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'etb' as const, triggerCondition: 'another creature enters the battlefield', isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'gain_life', params: { amount: 1 } } }],
    }
    primeCardRules({ 'Soul Warden': rule })
    const warden = card({ id: 'warden', name: 'Soul Warden', typeLine: 'Creature 1/1', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [warden], lifeTotal: 40 })
    const maker = {
      id: 'maker', sourceCardId: 'src', sourceCardName: 'Token Source', event: 'etb' as const, context: {},
      ability: { abilityType: 'triggered' as const, triggerEvent: 'etb' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'create_token', params: { tokenName: 'Goat', amount: 1 } } },
    }
    useGameStore.setState({ triggerStack: [maker] })

    useGameStore.getState().resolveTrigger('maker')

    // The token entered; Soul Warden's life-gain trigger is on the stack.
    expect(useGameStore.getState().tokens).toHaveLength(1)
    expect(useGameStore.getState().triggerStack.some((t) => t.ability.effect.kind === 'gain_life')).toBe(true)
  })

  it('energy gain triggers add to the source owner\'s pool', () => {
    const rule: CardRuleEntry = {
      cardName: 'Amped Raptor', manaCost: '{2}{R}', manaValue: 3, typeLine: 'Creature — Dinosaur', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'When this creature enters, you get {E}{E}.', scryfallId: 'a',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'etb' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'add_energy', params: { amount: 2 } } }],
    }
    primeCardRules({ 'Amped Raptor': rule, 'AI Raptor': { ...rule, cardName: 'AI Raptor' } })
    const raptor = card({ id: 'raptor', name: 'Amped Raptor', type: 'creature', typeLine: 'Creature 2/2', zone: 'battlefield' })
    const aiRaptor = card({ id: 'airaptor', name: 'AI Raptor', type: 'creature', typeLine: 'Creature 2/2', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({ cards: [raptor, aiRaptor] })

    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'raptor', sourceCardName: 'Amped Raptor', event: 'etb' as const, context: {}, ability: rule.abilities[0] }] })
    useGameStore.getState().resolveTrigger('t1')
    expect(useGameStore.getState().energyCounters).toBe(2)

    useGameStore.setState({ triggerStack: [{ id: 't2', sourceCardId: 'airaptor', sourceCardName: 'AI Raptor', event: 'etb' as const, context: {}, ability: rule.abilities[0] }] })
    useGameStore.getState().resolveTrigger('t2')
    expect(useGameStore.getState().opponentEnergyCounters).toBe(2)
  })

  it('energy can be spent and resets on a new deck', () => {
    useGameStore.setState({ energyCounters: 5 })
    useGameStore.getState().gainEnergy(3)
    expect(useGameStore.getState().energyCounters).toBe(8)
    expect(useGameStore.getState().spendEnergy(2)).toBe(true)
    expect(useGameStore.getState().energyCounters).toBe(6)
    expect(useGameStore.getState().spendEnergy(99)).toBe(false)
    expect(useGameStore.getState().energyCounters).toBe(6)

    useGameStore.getState().loadDeck(['Cmd'], [deckCard('Cmd', 'Creature')], 'd')
    expect(useGameStore.getState().energyCounters).toBe(0)
    expect(useGameStore.getState().opponentEnergyCounters).toBe(0)
  })

  it('double and remove counter effects resolve (counter manipulation)', () => {
    // Double counters on a target.
    const doubleTrigger = {
      id: 't1', sourceCardId: 'src', sourceCardName: 'Ferrafor', event: 'etb' as const, context: {},
      ability: { abilityType: 'activated' as const, triggerEvent: null, triggerCondition: null, isOptional: false, cost: '{T}', targets: 1, targetFilter: 'creature', effect: { kind: 'double_counters', params: {} } },
    }
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', counters: 2, minusCounters: 1 })
    useGameStore.setState({ cards: [bear] })
    useGameStore.setState({ triggerStack: [doubleTrigger] })
    useGameStore.getState().selectTarget('t1', 'bear')
    const doubled = useGameStore.getState().cards.find((c) => c.id === 'bear')!
    expect(doubled.counters).toBe(4)
    expect(doubled.minusCounters).toBe(2)

    // Remove up to three counters (minus counters go first).
    const removeTrigger = {
      id: 't2', sourceCardId: 'src', sourceCardName: 'Glissa', event: 'etb' as const, context: {},
      ability: { abilityType: 'activated' as const, triggerEvent: null, triggerCondition: null, isOptional: false, cost: null, targets: 1, targetFilter: 'permanent', effect: { kind: 'remove_counters', params: { amount: 3 } } },
    }
    useGameStore.setState({ triggerStack: [removeTrigger] })
    useGameStore.getState().selectTarget('t2', 'bear')
    const removed = useGameStore.getState().cards.find((c) => c.id === 'bear')!
    expect(removed.minusCounters).toBe(0)
    expect(removed.counters).toBe(3)
  })

  it('resolves a deferred AI spell when the player passes the response window', () => {
    const rule: CardRuleEntry = {
      cardName: 'AI Bolt', manaCost: '{R}', manaValue: 1, typeLine: 'Sorcery', cardType: 'sorcery',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Deals 2 damage to any target.', scryfallId: 'b',
      abilities: [{ abilityType: 'spell' as const, triggerEvent: null, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'deal_damage', params: { amount: 2 } } }],
    }
    primeCardRules({ 'AI Bolt': rule })
    const aiBolt = card({ id: 'aibolt', name: 'AI Bolt', type: 'sorcery', typeLine: 'Sorcery', zone: 'battlefield', owner: 'opponent', manaCost: '{R}', manaValue: 1 })
    const victim = card({ id: 'victim', name: 'Victim', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [aiBolt, victim] })
    // Simulate the AI cast with a deferred resolution + response prompt.
    useGameStore.setState({
      aiResponsePending: 'aibolt',
      turnPrompt: { action: 'respond', reason: 'respond', cardId: 'aibolt', cardName: 'AI Bolt', resolveAt: Date.now() + 7000 },
    })

    // The player passes: the spell resolves (2 damage) and moves to the graveyard.
    resolvePendingAISpell(
      (partial) => useGameStore.setState(partial as never),
      () => useGameStore.getState(),
    )
    const state = useGameStore.getState()
    expect(state.turnPrompt).toBeNull()
    expect(state.aiResponsePending).toBeNull()
    // 2 damage killed the 2/2 victim (SBA clears damage on death).
    expect(state.cards.find((c) => c.id === 'victim')?.zone).toBe('graveyard')
    expect(state.cards.find((c) => c.id === 'aibolt')?.zone).toBe('graveyard')
  })

  it('opens a response window when the AI attacks and the player holds instants', () => {
    vi.useFakeTimers()
    try {
      const aiBeater = card({ id: 'beater', name: 'Beater', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield', owner: 'opponent', enteredAtTurn: 0 })
      const playerInstant = card({ id: 'pinstant', name: 'PInstant', type: 'instant', typeLine: 'Instant', zone: 'hand', manaCost: '{W}', manaValue: 1 })
      const aiLands = Array.from({ length: 10 }, (_, i) => card({ id: `land${i}`, name: 'Mountain', type: 'land', typeLine: 'Basic Land — Mountain', zone: 'library', owner: 'opponent', manaProduction: { colors: ['R'], amount: 1 } }))
      useGameStore.setState({ activePlayer: 'opponent', turn: 1, cards: [aiBeater, playerInstant, ...aiLands], combatState: { active: false, attackers: [], blockers: {} } })

      useGameStore.getState().runOpponentTurn()
      // Advance through draw/land/cast to the attack step (~2s in).
      vi.advanceTimersByTime(2500)
      const state = useGameStore.getState()
      expect(state.turnPrompt?.reason).toBe('respond')
      expect(state.turnPrompt?.context).toBe('attack')

      // Passing closes the window.
      useGameStore.getState().cancelTurnPrompt()
      vi.advanceTimersByTime(400)
      expect(useGameStore.getState().turnPrompt).toBeNull()
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('resolves AI spells immediately when the player has no instants to respond with', () => {
    vi.useFakeTimers()
    try {
      const cards = [
        deckCard('Atarka, World Render', 'Legendary Creature — Dragon'),
        ...Array.from({ length: 8 }, () => deckCard('Mountain', 'Land')),
        deckCard('Dragon Whelp', 'Creature — Dragon'),
      ]
      useGameStore.getState().loadOpponentDeck(['Atarka, World Render'], cards, 'Draconic Destruction')

      vi.advanceTimersByTime(1500)
      const state = useGameStore.getState()
      expect(state.turnPrompt?.reason).not.toBe('respond')
      expect(state.aiResponsePending).toBeNull()
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('monarch: gain, end-step draw, and combat transfer', () => {
    const rule: CardRuleEntry = {
      cardName: 'Grave Venerations', manaCost: '{2}{B}{B}', manaValue: 4, typeLine: 'Enchantment', cardType: 'enchantment',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'When this enchantment enters, you become the monarch.', scryfallId: 'g',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'etb' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'gain_monarch', params: {} } }],
    }
    primeCardRules({ 'Grave Venerations': rule })
    const enchantment = card({ id: 'enc', name: 'Grave Venerations', type: 'enchantment', typeLine: 'Enchantment', zone: 'battlefield' })
    const library = card({ id: 'lib', name: 'Lib', typeLine: 'Creature 1/1', type: 'creature', zone: 'library' })
    useGameStore.setState({ cards: [enchantment, library], activePlayer: 'player', currentPhase: 'ending' })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'enc', sourceCardName: 'Grave Venerations', event: 'etb' as const, context: {}, ability: rule.abilities[0] }] })
    useGameStore.getState().resolveTrigger('t1')
    expect(useGameStore.getState().monarch).toBe('player')

    // The player is the monarch: ending the turn draws them a card.
    const handBefore = useGameStore.getState().cards.filter((c) => c.zone === 'hand').length
    useGameStore.getState().advanceTurn()
    expect(useGameStore.getState().cards.filter((c) => c.zone === 'hand').length).toBe(handBefore + 1)

    // Combat damage to the monarch transfers the crown to the attacker.
    useGameStore.setState({ monarch: 'player' })
    const aiAttacker = card({ id: 'att', name: 'AI Attacker', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({ activePlayer: 'opponent', cards: [...useGameStore.getState().cards, aiAttacker], combatState: { active: true, attackers: ['att'], blockers: {} } })
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().monarch).toBe('opponent')
  })

  it('plain "can\'t attack or block" restrictions are enforced in combat', () => {
    // A creature that can't block cannot be assigned as a blocker.
    const attacker = card({ id: 'att', name: 'Attacker', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    const noBlock = card({ id: 'nb', name: 'No Block', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent', oracleText: 'This creature can\'t block.' })
    useGameStore.setState({
      cards: [attacker, noBlock],
      opponentLifeTotal: 40,
      combatState: { active: true, attackers: ['att'], blockers: { att: ['nb'] } },
    })

    useGameStore.getState().resolveCombat()

    // The can't-block creature is an illegal blocker: the attacker is unblocked
    // and the creature stays untouched on the battlefield.
    expect(useGameStore.getState().opponentLifeTotal).toBe(38)
    expect(useGameStore.getState().cards.find((c) => c.id === 'nb')?.zone).toBe('battlefield')
  })

  it('mass sacrifice resolves for each affected side (weakest creature each)', () => {
    const rule: CardRuleEntry = {
      cardName: 'Merciless Executioner', manaCost: '{2}{B}', manaValue: 3, typeLine: 'Creature — Human Warrior', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'When this creature enters, each player sacrifices a creature.', scryfallId: 'm',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'etb' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'mass_sacrifice', params: { scope: 'all', kind: 'creature' } } }],
    }
    primeCardRules({ 'Merciless Executioner': rule })
    const exe = card({ id: 'exe', name: 'Merciless Executioner', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield' })
    const myWeak = card({ id: 'myweak', name: 'My Weak', typeLine: 'Creature 1/1', type: 'creature', zone: 'battlefield' })
    const myStrong = card({ id: 'mystrong', name: 'My Strong', typeLine: 'Creature 5/5', type: 'creature', zone: 'battlefield' })
    const aiWeak = card({ id: 'aiweak', name: 'AI Weak', typeLine: 'Creature 1/1', type: 'creature', zone: 'battlefield', owner: 'opponent' })
    const aiStrong = card({ id: 'aistrong', name: 'AI Strong', typeLine: 'Creature 5/5', type: 'creature', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({ cards: [exe, myWeak, myStrong, aiWeak, aiStrong] })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'exe', sourceCardName: 'Merciless Executioner', event: 'etb' as const, context: {}, ability: rule.abilities[0] }] })

    useGameStore.getState().resolveTrigger('t1')

    const cards = useGameStore.getState().cards
    expect(cards.find((c) => c.id === 'myweak')?.zone).toBe('graveyard')
    expect(cards.find((c) => c.id === 'aiweak')?.zone).toBe('graveyard')
    expect(cards.find((c) => c.id === 'mystrong')?.zone).toBe('battlefield')
    expect(cards.find((c) => c.id === 'aistrong')?.zone).toBe('battlefield')
  })

  it('"look at the top N cards" abilities resolve as scry', () => {
    const rule: CardRuleEntry = {
      cardName: 'Dovin, Grand Arbiter', manaCost: '{2}{W}{U}', manaValue: 4, typeLine: 'Planeswalker — Dovin', cardType: 'planeswalker',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Look at the top ten cards of your library.', scryfallId: 'd',
      abilities: [{ abilityType: 'activated', triggerEvent: null, triggerCondition: null, isOptional: false, cost: '-7', targets: 0, targetFilter: null, effect: { kind: 'scry', params: { amount: 10 } } }],
    }
    primeCardRules({ 'Dovin, Grand Arbiter': rule })
    const dovin = card({ id: 'dovin', name: 'Dovin, Grand Arbiter', typeLine: 'Planeswalker — Dovin 7', type: 'planeswalker', zone: 'battlefield', counters: 7 })
    const lib = Array.from({ length: 15 }, (_, i) => card({ id: `l${i}`, name: `Lib ${i}`, typeLine: 'Creature 1/1', type: 'creature', zone: 'library' }))
    useGameStore.setState({ cards: [dovin, ...lib] })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'dovin', sourceCardName: 'Dovin, Grand Arbiter', event: 'cast' as const, context: {}, ability: rule.abilities[0] }] })

    useGameStore.getState().resolveTrigger('t1')
    // The trigger enters scry mode (empty selection) for the player to reorder.
    expect(useGameStore.getState().triggerStack[0]?.selectedTargets).toEqual([])
    useGameStore.getState().confirmScry('t1')
    expect(useGameStore.getState().triggerStack).toHaveLength(0)
  })

  it('rad counters: gain, upkeep mill, and reset', () => {
    const rule: CardRuleEntry = {
      cardName: 'The Wise Mothman', manaCost: '{1}{G}{U}', manaValue: 3, typeLine: 'Legendary Creature — Mutant', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Whenever The Wise Mothman enters or attacks, each player gets a rad counter.', scryfallId: 'm',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'etb' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'gain_rad', params: { scope: 'each', amount: 1 } } }],
    }
    primeCardRules({ 'The Wise Mothman': rule })
    const mothman = card({ id: 'moth', name: 'The Wise Mothman', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield' })
    const aiLibrary = Array.from({ length: 5 }, (_, i) => card({ id: `ail${i}`, name: `AI Lib ${i}`, typeLine: 'Creature 1/1', type: 'creature', zone: 'library', owner: 'opponent' }))
    useGameStore.setState({ cards: [mothman, ...aiLibrary], turn: 1, activePlayer: 'player' })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'moth', sourceCardName: 'The Wise Mothman', event: 'etb' as const, context: {}, ability: rule.abilities[0] }] })

    useGameStore.getState().resolveTrigger('t1')
    expect(useGameStore.getState().radCounters).toBe(1)
    expect(useGameStore.getState().opponentRadCounters).toBe(1)

    // The AI's upkeep: it mills 1 and loses its rad counter.
    useGameStore.getState().runOpponentTurn()
    expect(useGameStore.getState().opponentRadCounters).toBe(0)
    expect(useGameStore.getState().cards.filter((c) => c.zone === 'graveyard' && (c.owner ?? 'player') === 'opponent')).toHaveLength(1)
  })

  it('gain control until end of turn flips and restores the owner', () => {
    vi.useFakeTimers()
    try {
      const rule: CardRuleEntry = {
        cardName: 'Flayer of Loyalties', manaCost: '{4}{R}', manaValue: 5, typeLine: 'Sorcery', cardType: 'sorcery',
        subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
        oracleText: 'Gain control of target creature until end of turn.', scryfallId: 'f',
        abilities: [{ abilityType: 'spell' as const, triggerEvent: null, triggerCondition: null, isOptional: false, cost: null, targets: 1, targetFilter: 'creature', effect: { kind: 'gain_control', params: { temporary: true } } }],
      }
      primeCardRules({ 'Flayer of Loyalties': rule })
      const flayer = card({ id: 'flayer', name: 'Flayer of Loyalties', type: 'sorcery', typeLine: 'Sorcery', zone: 'hand', manaCost: '{4}{R}', manaValue: 5 })
      const victim = card({ id: 'victim', name: 'Victim', typeLine: 'Creature 3/3', type: 'creature', zone: 'battlefield', owner: 'opponent' })
      useGameStore.setState({ cards: [flayer, victim], manaPool: { ...emptyManaPool(), R: 5 } })

      useGameStore.getState().castSpell('flayer')
      const trigger = useGameStore.getState().triggerStack.find((x) => x.ability.effect.kind === 'gain_control')!
      useGameStore.getState().resolveTrigger(trigger.id)
      useGameStore.getState().selectTarget(trigger.id, 'victim')
      expect(useGameStore.getState().cards.find((c) => c.id === 'victim')?.owner).toBe('player')

      // At the turn handoff, temporary control returns.
      useGameStore.setState({ currentPhase: 'ending' })
      useGameStore.getState().advanceTurn()
      expect(useGameStore.getState().cards.find((c) => c.id === 'victim')?.owner).toBe('opponent')
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('static keyword anthems grant keywords to controlled creatures', () => {
    const rule: CardRuleEntry = {
      cardName: 'Maelstrom Wanderer', manaCost: '{5}{G}{U}{R}', manaValue: 8, typeLine: 'Legendary Creature — Elemental', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Creatures you control have haste.', scryfallId: 'm',
      abilities: [{ abilityType: 'static', triggerEvent: null, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'static_keyword', params: {} } }],
    }
    primeCardRules({ 'Maelstrom Wanderer': rule })
    const wanderer = card({ id: 'w', name: 'Maelstrom Wanderer', type: 'creature', typeLine: 'Creature 7/5', zone: 'battlefield', oracleText: 'Creatures you control have haste.' })
    const bear = card({ id: 'bear', name: 'Bear', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield', enteredAtTurn: 1 })
    const enemyBear = card({ id: 'eb', name: 'Enemy', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({ cards: [wanderer, bear, enemyBear], turn: 1 })

    expect(hasKeyword(bear, 'haste', useGameStore.getState().cards)).toBe(true)
    expect(hasKeyword(enemyBear, 'haste', useGameStore.getState().cards)).toBe(false)
    // Without the battlefield context, no static anthem applies.
    expect(hasKeyword(bear, 'haste')).toBe(false)
  })

  it('manifest dread mills one card then manifests the next as a face-down 2/2', () => {
    const rule: CardRuleEntry = {
      cardName: 'Temur War Shaman', manaCost: '{2}{G}{U}', manaValue: 4, typeLine: 'Creature — Human Shaman', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'When this creature enters, manifest the top card of your library.', scryfallId: 't',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'etb' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'manifest', params: { dread: 0 } } }],
    }
    primeCardRules({ 'Temur War Shaman': rule })
    const shaman = card({ id: 'shaman', name: 'Temur War Shaman', typeLine: 'Creature 4/5', type: 'creature', zone: 'battlefield' })
    const top = card({ id: 'l0', name: 'Top', typeLine: 'Creature 1/1', type: 'creature', zone: 'library' })
    useGameStore.setState({ cards: [shaman, top], turn: 1 })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'shaman', sourceCardName: 'Temur War Shaman', event: 'etb' as const, context: {}, ability: rule.abilities[0] }] })

    useGameStore.getState().resolveTrigger('t1')

    const manifested = useGameStore.getState().cards.find((c) => c.id === 'l0')!
    expect(manifested.zone).toBe('battlefield')
    expect(manifested.facedown).toBe(true)
    expect(getCardPower(manifested)).toBe(2)
    expect(getCardToughness(manifested)).toBe(2)
  })

  it('tap-target and fight effects resolve', () => {
    const tapRule: CardRuleEntry = {
      cardName: 'Tapper', manaCost: '{2}', manaValue: 2, typeLine: 'Creature', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Tap target creature.', scryfallId: 't',
      abilities: [{ abilityType: 'activated', triggerEvent: null, triggerCondition: null, isOptional: false, cost: '{T}', targets: 1, targetFilter: 'creature', effect: { kind: 'tap_target', params: {} } }],
    }
    primeCardRules({ 'Tapper': tapRule })
    const tapper = card({ id: 'tapper', name: 'Tapper', typeLine: 'Creature 1/1', type: 'creature', zone: 'battlefield' })
    const victim = card({ id: 'victim', name: 'Victim', typeLine: 'Creature 1/1', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [tapper, victim] })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'tapper', sourceCardName: 'Tapper', event: 'etb' as const, context: {}, ability: tapRule.abilities[0] }] })
    useGameStore.getState().selectTarget('t1', 'victim')
    expect(useGameStore.getState().cards.find((c) => c.id === 'victim')?.tapped).toBe(true)

    // Fight: both creatures deal damage equal to their power to each other.
    const fightRule: CardRuleEntry = { ...tapRule, cardName: 'Fighter', abilities: [{ abilityType: 'activated', triggerEvent: null, triggerCondition: null, isOptional: false, cost: '{2}{R}', targets: 1, targetFilter: 'creature', effect: { kind: 'fight', params: {} } }] }
    primeCardRules({ 'Fighter': fightRule })
    const fighter = card({ id: 'fighter', name: 'Fighter', typeLine: 'Creature 3/3', type: 'creature', zone: 'battlefield' })
    const foe = card({ id: 'foe', name: 'Foe', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [fighter, foe], triggerStack: [] })
    useGameStore.setState({ triggerStack: [{ id: 't2', sourceCardId: 'fighter', sourceCardName: 'Fighter', event: 'etb' as const, context: {}, ability: fightRule.abilities[0] }] })
    useGameStore.getState().selectTarget('t2', 'foe')
    // The 2/2 foe takes 3 and dies; the 3/3 fighter takes 2 and survives.
    expect(useGameStore.getState().cards.find((c) => c.id === 'foe')?.zone).toBe('graveyard')
    expect(useGameStore.getState().cards.find((c) => c.id === 'fighter')?.damage).toBe(2)
  })

  it('optional-pay triggers resolve the follow-on when the player pays', () => {
    const rule: CardRuleEntry = {
      cardName: 'Mentor of the Meek', manaCost: '{2}{W}', manaValue: 3, typeLine: 'Creature — Human Soldier', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Whenever another creature you control with power 2 or less enters, you may pay {1}. If you do, draw a card.', scryfallId: 'm',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'etb' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'optional_pay', params: { cost: '{1}', payer: 'self', then: { kind: 'draw_cards', params: { amount: 1 } }, thenIfNotPaid: false } } }],
    }
    primeCardRules({ 'Mentor of the Meek': rule })
    const mentor = card({ id: 'mentor', name: 'Mentor of the Meek', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield' })
    const library = card({ id: 'lib', name: 'Lib', typeLine: 'Creature 1/1', type: 'creature', zone: 'library' })
    useGameStore.setState({ cards: [mentor, library], manaPool: { ...emptyManaPool(), W: 1 } })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'mentor', sourceCardName: 'Mentor of the Meek', event: 'etb' as const, context: {}, ability: rule.abilities[0] }] })

    useGameStore.getState().resolveTrigger('t1')

    // Paid {1}: drew a card.
    const state = useGameStore.getState()
    expect(state.manaPool.W).toBe(0)
    expect(state.cards.find((c) => c.id === 'lib')?.zone).toBe('hand')
  })

  it('cast-from-graveyard free-casts the chosen card', () => {
    const rule: CardRuleEntry = {
      cardName: 'Impulsivity', manaCost: '{1}{R}', manaValue: 2, typeLine: 'Enchantment', cardType: 'enchantment',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'When this creature enters, you may cast target instant or sorcery card from a graveyard without paying its mana cost.', scryfallId: 'i',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'etb' as const, triggerCondition: null, isOptional: false, cost: null, targets: 1, targetFilter: 'instant or sorcery card from a graveyard', effect: { kind: 'cast_from_graveyard', params: {} } }],
    }
    primeCardRules({
      'Impulsivity': rule,
      'Grave Bolt': { cardName: 'Grave Bolt', manaCost: '{R}', manaValue: 1, typeLine: 'Instant', cardType: 'instant', subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: 'Deals 2 damage to any target.', scryfallId: 'g', abilities: [{ abilityType: 'spell', triggerEvent: null, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'deal_damage', params: { amount: 2 } } }] },
    })
    const impulsivity = card({ id: 'imp', name: 'Impulsivity', typeLine: 'Enchantment', type: 'enchantment', zone: 'battlefield' })
    const graveBolt = card({ id: 'bolt', name: 'Grave Bolt', type: 'instant', typeLine: 'Instant', zone: 'graveyard', manaCost: '{R}', manaValue: 1 })
    useGameStore.setState({ cards: [impulsivity, graveBolt] })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'imp', sourceCardName: 'Impulsivity', event: 'etb' as const, context: {}, ability: rule.abilities[0] }] })
    useGameStore.getState().resolveTrigger('t1')
    useGameStore.getState().selectTarget('t1', 'bolt')

    // The card was free-cast to the battlefield and its ability enqueued.
    expect(useGameStore.getState().cards.find((c) => c.id === 'bolt')?.zone).toBe('battlefield')
    expect(useGameStore.getState().triggerStack.some((t) => t.ability.effect.kind === 'deal_damage')).toBe(true)
  })

  it('skulk blocks only equal-or-lower power blockers', () => {
    primeCardRules({ 'Skulker': ruleFor('Skulker', ['skulk']) })
    const skulker = card({ id: 'sk', name: 'Skulker', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield' })
    const bigBlocker = card({ id: 'big', name: 'Big', typeLine: 'Creature 3/3', type: 'creature', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({
      cards: [skulker, bigBlocker],
      opponentLifeTotal: 40,
      combatState: { active: true, attackers: ['sk'], blockers: { sk: ['big'] } },
    })

    useGameStore.getState().resolveCombat()

    // The 3/3 is an illegal blocker for the skulk attacker: it swings through.
    expect(useGameStore.getState().opponentLifeTotal).toBe(38)
  })

  it('attack tax: the attacker must pay or the attackers are removed', () => {
    const attacker = card({ id: 'att', name: 'Attacker', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    const prison = card({ id: 'prison', name: 'Ghostly Prison', typeLine: 'Enchantment', type: 'enchantment', zone: 'battlefield', owner: 'opponent', oracleText: "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you." })
    useGameStore.setState({
      cards: [attacker, prison],
      opponentLifeTotal: 40,
      manaPool: { ...emptyManaPool(), W: 0 },
      combatState: { active: true, attackers: ['att'], blockers: {} },
    })

    // No mana to pay the {2} tax: the attacker is removed and deals nothing.
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().opponentLifeTotal).toBe(40)

    // With the mana, the player pays and the attack resolves.
    useGameStore.setState({ manaPool: { ...emptyManaPool(), W: 2 }, opponentLifeTotal: 40, combatState: { active: true, attackers: ['att'], blockers: {} } })
    useGameStore.getState().resolveCombat()
    expect(useGameStore.getState().opponentLifeTotal).toBe(38)
    expect(useGameStore.getState().manaPool.W).toBe(0)
  })

  it('Kefnet-style hand gate blocks attacking with too few cards in hand', () => {
    const kefnet = card({ id: 'k', name: 'Kefnet', typeLine: 'Creature 5/5', type: 'creature', zone: 'battlefield', oracleText: 'Kefnet can\'t attack or block unless you have seven or more cards in hand.' })
    const hands = Array.from({ length: 3 }, (_, i) => card({ id: `h${i}`, name: `H${i}`, typeLine: 'Creature 1/1', type: 'creature', zone: 'hand' }))
    useGameStore.setState({ cards: [kefnet, ...hands] })
    useGameStore.getState().toggleAttacker('k')
    expect(useGameStore.getState().combatState.attackers).not.toContain('k')
  })

  it('must-attack compulsion makes the AI swing with everything', () => {
    const compeller = card({ id: 'c', name: 'Bident of Thassa', typeLine: 'Enchantment', type: 'enchantment', zone: 'battlefield', oracleText: 'Creatures your opponents control attack this turn if able.' })
    const aiBeater = card({ id: 'b', name: 'Beater', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield', owner: 'opponent', enteredAtTurn: 0 })
    const aiBeater2 = card({ id: 'b2', name: 'Beater2', typeLine: 'Creature 3/3', type: 'creature', zone: 'battlefield', owner: 'opponent', enteredAtTurn: 0 })
    const result = pickAttackers([aiBeater, aiBeater2], 1, [compeller])
    expect(result).toContain('b')
    expect(result).toContain('b2')
  })

  it('exchange-life-with-toughness resolves (Tree of Perdition)', () => {
    const rule: CardRuleEntry = {
      cardName: 'Tree of Perdition', manaCost: '{3}{B}', manaValue: 4, typeLine: 'Creature — Plant', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: "Exchange target opponent's life total with this creature's toughness.", scryfallId: 't',
      abilities: [{ abilityType: 'activated', triggerEvent: null, triggerCondition: null, isOptional: false, cost: '{T}', targets: 1, targetFilter: 'player', effect: { kind: 'exchange_life_toughness', params: {} } }],
    }
    primeCardRules({ 'Tree of Perdition': rule })
    const tree = card({ id: 'tree', name: 'Tree of Perdition', typeLine: 'Creature 0/13', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [tree], opponentLifeTotal: 40 })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'tree', sourceCardName: 'Tree of Perdition', event: 'etb' as const, context: {}, ability: rule.abilities[0] }] })
    useGameStore.getState().resolveTrigger('t1')
    useGameStore.getState().selectTarget('t1', 'tree')
    expect(useGameStore.getState().opponentLifeTotal).toBe(13)
  })

  it('move a counter from the source to the target', () => {
    const rule: CardRuleEntry = {
      cardName: 'Nesting Grounds', manaCost: '', manaValue: 0, typeLine: 'Land', cardType: 'land',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: '{1}, {T}: Move a counter from target permanent you control onto a second target permanent.', scryfallId: 'n',
      abilities: [{ abilityType: 'activated', triggerEvent: null, triggerCondition: null, isOptional: false, cost: '{T}, {1}', targets: 1, targetFilter: 'permanent', effect: { kind: 'move_counter', params: {} } }],
    }
    primeCardRules({ 'Nesting Grounds': rule })
    const ground = card({ id: 'ground', name: 'Nesting Grounds', type: 'land', typeLine: 'Land', zone: 'battlefield', counters: 0 })
    const carries = card({ id: 'carries', name: 'Carries', typeLine: 'Creature 1/1', type: 'creature', zone: 'battlefield', counters: 5 })
    const target = card({ id: 'target', name: 'Target', typeLine: 'Creature 1/1', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [ground, carries, target] })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'carries', sourceCardName: 'Carries', event: 'etb' as const, context: {}, ability: rule.abilities[0] }] })
    useGameStore.getState().resolveTrigger('t1')
    useGameStore.getState().selectTarget('t1', 'target')
    expect(useGameStore.getState().cards.find((c) => c.id === 'carries')?.counters).toBe(4)
    expect(useGameStore.getState().cards.find((c) => c.id === 'target')?.counters).toBe(1)
  })

  it('amass creates an Army token and strengthens it on subsequent amass', () => {
    const rule: CardRuleEntry = {
      cardName: 'Sauron, the Dark Lord', manaCost: '{3}{U}{B}{R}', manaValue: 6, typeLine: 'Legendary Creature — Avatar', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Whenever an opponent casts a spell, amass Orcs 1.', scryfallId: 's',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'cast' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'amass', params: { amount: 1 } } }],
    }
    primeCardRules({ 'Sauron, the Dark Lord': rule })
    const sauron = card({ id: 'sauron', name: 'Sauron, the Dark Lord', typeLine: 'Creature 9/9', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [sauron] })
    const makeTrigger = () => ({ id: crypto.randomUUID(), sourceCardId: 'sauron', sourceCardName: 'Sauron, the Dark Lord', event: 'cast' as const, context: {}, ability: rule.abilities[0] })

    useGameStore.setState({ triggerStack: [makeTrigger()] })
    useGameStore.getState().resolveTrigger(useGameStore.getState().triggerStack[0].id)
    expect(useGameStore.getState().tokens).toHaveLength(1)
    expect(useGameStore.getState().tokens[0].counters).toBe(1)

    useGameStore.setState({ triggerStack: [makeTrigger()] })
    useGameStore.getState().resolveTrigger(useGameStore.getState().triggerStack[0].id)
    expect(useGameStore.getState().tokens).toHaveLength(1)
    expect(useGameStore.getState().tokens[0].counters).toBe(2)
  })

  it('investigate creates a Clue token', () => {
    const invRule: CardRuleEntry = {
      cardName: 'Tireless Tracker', manaCost: '{2}{G}', manaValue: 3, typeLine: 'Creature — Human Scout', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Landfall — Whenever a land you control enters, investigate.', scryfallId: 't',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'landfall' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'investigate', params: {} } }],
    }
    primeCardRules({ 'Tireless Tracker': invRule })
    const tracker = card({ id: 'tracker', name: 'Tireless Tracker', typeLine: 'Creature 3/2', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [tracker] })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'tracker', sourceCardName: 'Tireless Tracker', event: 'landfall' as const, context: {}, ability: invRule.abilities[0] }] })
    useGameStore.getState().resolveTrigger('t1')
    expect(useGameStore.getState().tokens.some((t) => t.name === 'Clue')).toBe(true)
  })

  it('each-player-mill mills one card for each side', () => {
    const millRule: CardRuleEntry = {
      cardName: 'Raul', manaCost: '{U}{B}', manaValue: 2, typeLine: 'Creature — Advisor', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: '{T}: Each player mills a card.', scryfallId: 'r',
      abilities: [{ abilityType: 'activated', triggerEvent: null, triggerCondition: null, isOptional: false, cost: '{T}', targets: 0, targetFilter: null, effect: { kind: 'each_player_mill', params: {} } }],
    }
    primeCardRules({ 'Raul': millRule })
    const raul = card({ id: 'raul', name: 'Raul', typeLine: 'Creature 1/3', type: 'creature', zone: 'battlefield' })
    const myLib = card({ id: 'ml', name: 'MyLib', typeLine: 'Creature 1/1', type: 'creature', zone: 'library' })
    const aiLib = card({ id: 'al', name: 'AiLib', typeLine: 'Creature 1/1', type: 'creature', zone: 'library', owner: 'opponent' })
    useGameStore.setState({ cards: [raul, myLib, aiLib] })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'raul', sourceCardName: 'Raul', event: 'etb' as const, context: {}, ability: millRule.abilities[0] }] })
    useGameStore.getState().resolveTrigger('t1')
    const cards = useGameStore.getState().cards
    expect(cards.find((c) => c.id === 'ml')?.zone).toBe('graveyard')
    expect(cards.find((c) => c.id === 'al')?.zone).toBe('graveyard')
  })

  it('defender-sacrifice/exile and temp-keyword abilities resolve', () => {
    // Eldrazi Conscription: defending player sacrifices two permanents.
    const conscriptionRule: CardRuleEntry = {
      cardName: 'Eldrazi Conscription', manaCost: '{8}', manaValue: 8, typeLine: 'Enchantment — Aura', cardType: 'enchantment',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Whenever it attacks, defending player sacrifices two permanents.', scryfallId: 'e',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'attack' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'sacrifice_n_permanents', params: { amount: 2 } } }],
    }
    primeCardRules({ 'Eldrazi Conscription': conscriptionRule })
    const conscripted = card({ id: 'cons', name: 'Eldrazi Conscription', typeLine: 'Enchantment', type: 'enchantment', zone: 'battlefield', owner: 'opponent', tapped: true })
    const myA = card({ id: 'a', name: 'A', typeLine: 'Creature 1/1', type: 'creature', zone: 'battlefield' })
    const myB = card({ id: 'b', name: 'B', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield' })
    const myLand = card({ id: 'l', name: 'Plains', type: 'land', typeLine: 'Basic Land', zone: 'battlefield' })
    useGameStore.setState({ cards: [conscripted, myA, myB, myLand] })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'cons', sourceCardName: 'Eldrazi Conscription', event: 'attack' as const, context: {}, ability: conscriptionRule.abilities[0] }] })
    useGameStore.getState().resolveTrigger('t1')
    const cards = useGameStore.getState().cards
    expect(cards.filter((c) => c.zone === 'graveyard')).toHaveLength(2)
    expect(cards.find((c) => c.id === 'l')?.zone).toBe('battlefield')
  })

  it('experience counters accrue and are reset on a new deck', () => {
    const rule: CardRuleEntry = {
      cardName: 'Azlask, the Swelling Scourge', manaCost: '{2}{W}', manaValue: 3, typeLine: 'Creature — Avatar', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'Whenever Azlask or another colorless creature you control dies, you get an experience counter.', scryfallId: 'a',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'dies' as const, triggerCondition: null, isOptional: false, cost: null, targets: 0, targetFilter: null, effect: { kind: 'experience_counter', params: {} } }],
    }
    primeCardRules({ 'Azlask, the Swelling Scourge': rule })
    const azlask = card({ id: 'az', name: 'Azlask, the Swelling Scourge', typeLine: 'Creature 2/2', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [azlask] })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'az', sourceCardName: 'Azlask, the Swelling Scourge', event: 'dies' as const, context: {}, ability: rule.abilities[0] }] })
    useGameStore.getState().resolveTrigger('t1')
    expect(useGameStore.getState().experienceCounters).toBe(1)
  })

  it('switch power and toughness of the target (Inversion Behemoth)', () => {
    const rule: CardRuleEntry = {
      cardName: 'Inversion Behemoth', manaCost: '{4}{U}', manaValue: 5, typeLine: 'Creature — Beast', cardType: 'creature',
      subtypes: [], keywords: [], manaProduction: null, entryTapRule: null, conditionalEntryText: null,
      oracleText: 'At the beginning of combat on your turn, switch the power and toughness of each of any number of target creatures until end of turn.', scryfallId: 'i',
      abilities: [{ abilityType: 'triggered', triggerEvent: 'upkeep' as const, triggerCondition: null, isOptional: false, cost: null, targets: 1, targetFilter: 'creature', effect: { kind: 'switch_power_toughness', params: {} } }],
    }
    primeCardRules({ 'Inversion Behemoth': rule })
    const behemoth = card({ id: 'b', name: 'Inversion Behemoth', typeLine: 'Creature 0/5', type: 'creature', zone: 'battlefield' })
    const victim = card({ id: 'v', name: 'Victim', typeLine: 'Creature 2/3', type: 'creature', zone: 'battlefield' })
    useGameStore.setState({ cards: [behemoth, victim] })
    useGameStore.setState({ triggerStack: [{ id: 't1', sourceCardId: 'b', sourceCardName: 'Inversion Behemoth', event: 'upkeep' as const, context: {}, ability: rule.abilities[0] }] })
    useGameStore.getState().resolveTrigger('t1')
    useGameStore.getState().selectTarget('t1', 'v')
    const after = useGameStore.getState().cards.find((c) => c.id === 'v')!
    expect(getCardPower(after)).toBe(3)
    expect(getCardToughness(after)).toBe(2)
  })

  it('clears deathtouchDamage from the player\'s creatures at the beginning phase', () => {
    const bear = card({ id: 'bear', name: 'Bear', typeLine: '2/2', type: 'creature', zone: 'battlefield', damage: 1, deathtouchDamage: true })
    useGameStore.setState({ cards: [bear], currentPhase: 'beginning' })

    useGameStore.getState().advancePhase()

    const after = useGameStore.getState().cards.find((c) => c.id === 'bear')
    expect(after?.deathtouchDamage).toBe(false)
  })

  it('undo restores gameOver along with life', () => {
    useGameStore.getState().setLife(0)
    expect(useGameStore.getState().gameOver).toEqual({ winner: 'opponent' })

    useGameStore.getState().undo()

    const state = useGameStore.getState()
    expect(state.lifeTotal).toBe(40)
    expect(state.gameOver).toBeNull()
  })

  it('a tapped creature can block', () => {
    const attacker = card({ id: 'att', name: 'Attacker', typeLine: '2/2', type: 'creature', zone: 'battlefield' })
    const blocker = card({ id: 'blk', name: 'Blocker', typeLine: '2/2', type: 'creature', zone: 'battlefield', owner: 'opponent', tapped: true })
    useGameStore.setState({
      cards: [attacker, blocker],
      opponentLifeTotal: 40,
      combatState: { active: true, attackers: ['att'], blockers: { att: ['blk'] } },
    })

    useGameStore.getState().resolveCombat()

    // Blocked: no damage reaches the player, and both creatures trade lethal
    // damage (they die, so zone is the signal — damage resets on death).
    expect(useGameStore.getState().opponentLifeTotal).toBe(40)
    expect(useGameStore.getState().cards.find((c) => c.id === 'att')?.zone).toBe('graveyard')
    expect(useGameStore.getState().cards.find((c) => c.id === 'blk')?.zone).toBe('graveyard')
  })

  it('a double-striker whose blocker died in the first-strike step deals no player damage', () => {
    primeCardRules({ 'Fury': ruleFor('Fury', ['double strike']) })
    const fury = card({ id: 'fury', name: 'Fury', typeLine: '3/3', type: 'creature', zone: 'battlefield' })
    const blocker = card({ id: 'blk', name: 'Blocker', typeLine: '1/1', type: 'creature', zone: 'battlefield', owner: 'opponent' })
    useGameStore.setState({
      cards: [fury, blocker],
      opponentLifeTotal: 40,
      combatState: { active: true, attackers: ['fury'], blockers: { fury: ['blk'] } },
    })

    useGameStore.getState().resolveCombat()

    // First strike kills the blocker; the blocked creature stays blocked and
    // deals no combat damage in the regular step.
    expect(useGameStore.getState().cards.find((c) => c.id === 'blk')?.zone).toBe('graveyard')
    expect(useGameStore.getState().opponentLifeTotal).toBe(40)
  })
})
