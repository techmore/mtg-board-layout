import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'
import { primeCardRules } from './cardRulesLoader'
import { clearTurnBoosts } from './gameTurnPhases'
import { processSuspendedCards } from './triggerActions'
import type { BoardCard, CardAbilityDef, ManaPool, TriggerInstance } from '../types/card'

const emptyManaPool = (): ManaPool => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 })

function boardCard(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: 'card-1',
    scryfallId: 'sf-1',
    name: 'Test Card',
    imageUri: '',
    typeLine: 'Creature 2/2',
    subtypes: [],
    isBasicLand: false,
    zone: 'battlefield',
    tapped: false,
    counters: 0,
    type: 'creature',
    revealed: false,
    ...overrides,
  }
}

function makeTrigger(overrides: Partial<TriggerInstance> = {}): TriggerInstance {
  return {
    id: 't1',
    sourceCardId: 'source-1',
    sourceCardName: 'Source',
    ability: {
      abilityType: 'triggered',
      triggerEvent: 'etb',
      triggerCondition: null,
      isOptional: false,
      cost: null,
      targets: 0,
      targetFilter: null,
      effect: { kind: 'ring_tempts', params: {} },
    },
    event: 'etb',
    context: {},
    ...overrides,
  }
}

function pushTrigger(instance: TriggerInstance) {
  useGameStore.setState((state) => ({ triggerStack: [...state.triggerStack, instance] }))
}

beforeEach(() => {
  primeCardRules({})
  useGameStore.setState({
    cards: [],
    tokens: [],
    manaPool: emptyManaPool(),
    opponentManaPool: emptyManaPool(),
    lifeTotal: 20,
    opponentLifeTotal: 40,
    turn: 3,
    activePlayer: 'player',
    triggerStack: [],
    wardPrompt: null,
    auraPrompt: null,
    ring: undefined,
    graveyardIntake: { player: 0, opponent: 0 },
    lastResolvedAbility: null,
    combatState: { active: false, attackers: [], blockers: {} },
  })
})

afterEach(() => {
  useGameStore.setState({ triggerStack: [] })
})

describe('Ring ladder', () => {
  it('ring_tempts increments temptations and picks the strongest creature as bearer', () => {
    const small = boardCard({ id: 'small', name: 'Squire' })
    const big = boardCard({ id: 'big', name: 'Big Beast', typeLine: 'Creature 5/5' })
    useGameStore.setState({ cards: [small, big] })
    pushTrigger(makeTrigger({ id: 't-ring', sourceCardId: 'big', sourceCardName: 'Big Beast' }))

    useGameStore.getState().resolveTrigger('t-ring')

    const ring = useGameStore.getState().ring?.player
    expect(ring?.temptations).toBe(1)
    expect(ring?.bearerId).toBe('big')
  })

  it('L1: a greater-power creature cannot block the Ring-bearer', () => {
    const bearer = boardCard({ id: 'bearer', name: 'Bearer', typeLine: 'Creature 2/2' })
    const big = boardCard({ id: 'big', name: 'Big', typeLine: 'Creature 3/3', owner: 'opponent' })
    useGameStore.setState({
      cards: [bearer, big],
      ring: { player: { temptations: 1, bearerId: 'bearer' } },
      combatState: { active: true, attackers: ['bearer'], blockers: { bearer: ['big'] } },
    })

    useGameStore.getState().resolveCombat()

    // The illegal blocker never blocked: it takes no damage and stays alive,
    // while the bearer deals its 2 to the opponent.
    expect(useGameStore.getState().cards.find((c) => c.id === 'big')?.zone).toBe('battlefield')
    expect(useGameStore.getState().opponentLifeTotal).toBe(38)
  })

  it('L2: the attacking Ring-bearer draws then discards', () => {
    const bearer = boardCard({ id: 'bearer', name: 'Bearer', typeLine: 'Creature 2/2' })
    const inLibrary = boardCard({ id: 'lib', name: 'Drawn Card', zone: 'library', owner: 'player', revealed: false })
    useGameStore.setState({
      cards: [bearer, inLibrary],
      ring: { player: { temptations: 2, bearerId: 'bearer' } },
      combatState: { active: true, attackers: ['bearer'], blockers: {} },
    })

    useGameStore.getState().resolveCombat()

    // The drawn card becomes the discard (it was the only hand card).
    expect(useGameStore.getState().cards.find((c) => c.id === 'lib')?.zone).toBe('graveyard')
  })

  it('L3: a creature blocking the Ring-bearer is sacrificed at end of combat', () => {
    // Equal powers (L1 only bans GREATER power); the blocker's extra toughness
    // lets it survive the damage exchange so L3 is what kills it.
    const bearer = boardCard({ id: 'bearer', name: 'Bearer', typeLine: 'Creature 4/4' })
    const blocker = boardCard({ id: 'blocker', name: 'Blocker', typeLine: 'Creature 4/5', owner: 'opponent' })
    useGameStore.setState({
      cards: [bearer, blocker],
      ring: { player: { temptations: 3, bearerId: 'bearer' } },
      combatState: { active: true, attackers: ['bearer'], blockers: { bearer: ['blocker'] } },
    })

    useGameStore.getState().resolveCombat()

    expect(useGameStore.getState().cards.find((c) => c.id === 'bearer')?.zone).toBe('graveyard')
    expect(useGameStore.getState().cards.find((c) => c.id === 'blocker')?.zone).toBe('graveyard')
  })

  it('L4: Ring-bearer combat damage makes each opponent lose 3 more life', () => {
    const bearer = boardCard({ id: 'bearer', name: 'Bearer', typeLine: 'Creature 2/2' })
    useGameStore.setState({
      cards: [bearer],
      ring: { player: { temptations: 4, bearerId: 'bearer' } },
      combatState: { active: true, attackers: ['bearer'], blockers: {} },
    })

    useGameStore.getState().resolveCombat()

    // 40 − 2 (combat damage) − 3 (L4 drain).
    expect(useGameStore.getState().opponentLifeTotal).toBe(35)
  })
})

describe('partner tutor', () => {
  it('puts the named partner from the library into the hand', () => {
    const merry = boardCard({
      id: 'merry',
      name: 'Merry, Esquire of Rohan',
      oracleText: 'Partner with Pippin, Warden of Isengard (When this creature enters the battlefield, target player may put Pippin into their hand from their library, then shuffle.)',
    })
    const pippin = boardCard({ id: 'pippin', name: 'Pippin, Warden of Isengard', zone: 'library', owner: 'player', revealed: false })
    useGameStore.setState({ cards: [merry, pippin] })
    pushTrigger(makeTrigger({
      id: 't-partner',
      sourceCardId: 'merry',
      sourceCardName: 'Merry, Esquire of Rohan',
      ability: {
        abilityType: 'triggered',
        triggerEvent: 'etb',
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 0,
        targetFilter: null,
        effect: { kind: 'partner_tutor', params: {} },
      },
    }))

    useGameStore.getState().resolveTrigger('t-partner')

    expect(useGameStore.getState().cards.find((c) => c.id === 'pippin')?.zone).toBe('hand')
  })
})

describe('animate revert at cleanup', () => {
  it('restores the original type and clears temporary boosts/keywords', () => {
    const animatedLand = boardCard({
      id: 'land',
      name: 'Destiny Spinner Land',
      typeLine: 'Land',
      type: 'creature',
      originalType: 'land',
      powerBoost: 3,
      toughnessBoost: 3,
      keywordBoosts: ['trample', 'haste'],
    })
    const restored = clearTurnBoosts([animatedLand])
    expect(restored[0]).toMatchObject({
      type: 'land',
      originalType: undefined,
      powerBoost: 0,
      toughnessBoost: 0,
      keywordBoosts: undefined,
    })
  })
})

describe('suspend engine (Suspended Sentence)', () => {
  const sentenceAbility: CardAbilityDef = {
    abilityType: 'spell',
    triggerEvent: null,
    triggerCondition: null,
    isOptional: false,
    cost: null,
    targets: 1,
    targetFilter: 'creature an opponent controls',
    effect: { kind: 'suspended_sentence', params: {} },
  }

  function sentenceSetup() {
    const sentence = boardCard({
      id: 'sentence',
      name: 'Suspended Sentence',
      typeLine: 'Instant',
      type: 'instant',
      zone: 'hand',
      oracleText: 'Destroy target creature an opponent controls. That player loses 3 life. Exile Suspended Sentence with three time counters on it.',
    })
    const victim = boardCard({ id: 'victim', name: 'Victim', typeLine: 'Creature 2/2', owner: 'opponent' })
    useGameStore.setState({ cards: [sentence, victim] })
    pushTrigger(makeTrigger({
      id: 't-sentence',
      sourceCardId: 'sentence',
      sourceCardName: 'Suspended Sentence',
      ability: sentenceAbility,
      selectedTargets: [],
    }))
    return sentence
  }

  it('resolves destroy + drain, then suspends itself with three time counters', () => {
    sentenceSetup()
    const state = useGameStore.getState()
    state.selectTarget('t-sentence', 'victim')

    const zones = Object.fromEntries(useGameStore.getState().cards.map((c) => [c.id, c.zone]))
    expect(zones.victim).toBe('graveyard')
    expect(zones.sentence).toBe('exile')
    expect(useGameStore.getState().cards.find((c) => c.id === 'sentence')?.suspendTimeCounters).toBe(3)
    expect(useGameStore.getState().opponentLifeTotal).toBe(37)
  })

  it('ticks one counter per upkeep and free-recasts at zero (destroy + drain + re-suspend)', () => {
    const sentence = boardCard({
      id: 'sentence',
      name: 'Suspended Sentence',
      typeLine: 'Instant',
      type: 'instant',
      zone: 'exile',
      revealed: true,
      owner: 'player',
      suspendTimeCounters: 1,
      oracleText: 'Exile Suspended Sentence with three time counters on it.',
    })
    const enemy = boardCard({ id: 'enemy', name: 'Enemy', typeLine: 'Creature 4/4', owner: 'opponent' })
    useGameStore.setState({ cards: [sentence, enemy], opponentLifeTotal: 30 })

    processSuspendedCards(() => useGameStore.getState(), (partial) => useGameStore.setState(partial), 'player')

    const after = useGameStore.getState()
    expect(after.cards.find((c) => c.id === 'enemy')?.zone).toBe('graveyard')
    expect(after.opponentLifeTotal).toBe(27)
    const suspended = after.cards.find((c) => c.id === 'sentence')
    expect(suspended?.zone).toBe('exile')
    expect(suspended?.suspendTimeCounters).toBe(3)
  })

  it('leaves the card exiled at zero when no legal target exists', () => {
    const sentence = boardCard({
      id: 'sentence',
      name: 'Suspended Sentence',
      typeLine: 'Instant',
      type: 'instant',
      zone: 'exile',
      revealed: true,
      owner: 'player',
      suspendTimeCounters: 1,
    })
    useGameStore.setState({ cards: [sentence], opponentLifeTotal: 30 })

    processSuspendedCards(() => useGameStore.getState(), (partial) => useGameStore.setState(partial), 'player')

    const after = useGameStore.getState()
    expect(after.cards.find((c) => c.id === 'sentence')?.suspendTimeCounters).toBe(0)
    expect(after.opponentLifeTotal).toBe(30)
  })

  it('ticks only the owner\'s suspended cards', () => {
    const mine = boardCard({ id: 'mine', zone: 'exile', owner: 'player', suspendTimeCounters: 2 })
    const theirs = boardCard({ id: 'theirs', zone: 'exile', owner: 'opponent', suspendTimeCounters: 2 })
    useGameStore.setState({ cards: [mine, theirs] })

    processSuspendedCards(() => useGameStore.getState(), (partial) => useGameStore.setState(partial), 'player')

    expect(useGameStore.getState().cards.find((c) => c.id === 'mine')?.suspendTimeCounters).toBe(1)
    expect(useGameStore.getState().cards.find((c) => c.id === 'theirs')?.suspendTimeCounters).toBe(2)
  })
})
