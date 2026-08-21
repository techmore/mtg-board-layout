import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'
import { primeCardRules } from './cardRulesLoader'
import { clearTurnBoosts } from './gameTurnPhases'
import { executeActivated } from '../components/Board/contextMenuActions'
import { graveyardIntakeDelta, withGraveyardIntake } from './gameRules'
import type { BoardCard, CardAbilityDef, CardRuleEntry, ManaPool, TriggerInstance } from '../types/card'

const emptyManaPool = (): ManaPool => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 })

function boardCard(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: 'card-1',
    scryfallId: 'sf-1',
    name: 'Test Card',
    imageUri: '',
    typeLine: 'Creature',
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

function activated(overrides: Partial<CardAbilityDef> = {}): CardAbilityDef {
  return {
    abilityType: 'activated',
    triggerEvent: null,
    triggerCondition: null,
    isOptional: false,
    cost: '{2}',
    targets: 1,
    targetFilter: 'artifact, creature, enchantment, land',
    effect: { kind: 'become_copy', params: {} },
    ...overrides,
  }
}

function pushTrigger(instance: TriggerInstance) {
  useGameStore.setState((state) => ({ triggerStack: [...state.triggerStack, instance] }))
}

function makeTrigger(overrides: Partial<TriggerInstance> = {}): TriggerInstance {
  return {
    id: 't1',
    sourceCardId: 'mirror',
    sourceCardName: 'Mirage Mirror',
    ability: activated(),
    event: 'cast',
    context: {},
    selectedTargets: [],
    ...overrides,
  }
}

beforeEach(() => {
  useGameStore.setState({
    cards: [],
    tokens: [],
    manaPool: emptyManaPool(),
    opponentManaPool: emptyManaPool(),
    energyCounters: 0,
    opponentEnergyCounters: 0,
    experienceCounters: 0,
    opponentExperienceCounters: 0,
    lifeTotal: 20,
    opponentLifeTotal: 20,
    turn: 3,
    activePlayer: 'player',
    triggerStack: [],
    wardPrompt: null,
    auraPrompt: null,
    graveyardIntake: { player: 0, opponent: 0 },
    lastResolvedAbility: null,
    combatState: { active: false, attackers: [], blockers: {} },
  })
})

afterEach(() => {
  useGameStore.setState({ triggerStack: [] })
})

describe('become_copy (Mirage Mirror)', () => {
  it('swaps the printed identity onto the mirror and remembers the original', () => {
    const mirror = boardCard({ id: 'mirror', name: 'Mirage Mirror', typeLine: 'Artifact', subtypes: [], type: 'artifact' })
    const bear = boardCard({ id: 'bear', name: 'Grizzly Bears', typeLine: 'Creature — Bear 2/2', subtypes: ['Bear'] })
    useGameStore.setState({ cards: [mirror, bear] })
    pushTrigger(makeTrigger())

    const state = useGameStore.getState()
    expect(state.triggerStack).toHaveLength(1)
    state.selectTarget('t1', 'bear')

    const cloned = useGameStore.getState().cards.find((c) => c.id === 'mirror')
    expect(cloned?.name).toBe('Grizzly Bears')
    expect(cloned?.typeLine).toBe('Creature — Bear 2/2')
    expect(cloned?.cloneOriginal).toMatchObject({ name: 'Mirage Mirror', typeLine: 'Artifact' })
    // The copy's power reads through the swapped type line.
    expect(getPowerText(cloned?.typeLine)).toBe('2/2')
    expect(useGameStore.getState().triggerStack).toHaveLength(0)
  })

  it('reverts the clone at the turn handoff (cleanup step)', () => {
    const mirror = boardCard({
      id: 'mirror',
      name: 'Grizzly Bears',
      typeLine: 'Creature — Bear 2/2',
      subtypes: ['Bear'],
      type: 'creature',
      cloneOriginal: { name: 'Mirage Mirror', typeLine: 'Artifact', subtypes: [], oracleText: '{2}: …' },
    })
    const restored = clearTurnBoosts([mirror])
    expect(restored[0]).toMatchObject({ name: 'Mirage Mirror', typeLine: 'Artifact', cloneOriginal: undefined })
  })

  it('is reachable from the context-menu activation (cost paid, targeting enqueued)', () => {
    const mirror = boardCard({ id: 'mirror', name: 'Mirage Mirror', typeLine: 'Artifact', subtypes: [], type: 'artifact' })
    useGameStore.setState({ cards: [mirror], manaPool: { ...emptyManaPool(), C: 2 } })

    executeActivated(activated(), 'mirror', 'Mirage Mirror')

    const state = useGameStore.getState()
    expect(state.manaPool.C).toBe(0)
    expect(state.triggerStack).toHaveLength(1)
    expect(state.triggerStack[0].selectedTargets).toEqual([])
  })
})

describe('copy_ability (Abstruse Archaic)', () => {
  it('re-resolves the last colorless-source ability resolved this turn', () => {
    const rules: Record<string, CardRuleEntry> = {}
    primeCardRules(rules)
    const archaic = boardCard({ id: 'archaic', name: 'Abstruse Archaic', manaCost: '{4}' })
    const solRing = boardCard({
      id: 'ring',
      name: 'Sol Ring',
      typeLine: 'Artifact',
      type: 'artifact',
      manaCost: '{1}',
      manaProduction: { colors: ['C'], amount: 2 },
    })
    useGameStore.setState({
      cards: [archaic, solRing],
      lastResolvedAbility: {
        sourceCardId: 'ring',
        sourceCardName: 'Sol Ring',
        owner: 'player',
        turn: 3,
        ability: {
          abilityType: 'triggered',
          triggerEvent: null,
          triggerCondition: null,
          isOptional: false,
          cost: null,
          targets: 0,
          targetFilter: null,
          effect: { kind: 'add_mana', params: {} },
        },
      },
    })
    pushTrigger(makeTrigger({
      id: 't-copy',
      sourceCardId: 'archaic',
      sourceCardName: 'Abstruse Archaic',
      ability: activated({
        cost: '{T}, {1}',
        targets: 0,
        targetFilter: null,
        effect: { kind: 'copy_ability', params: {} },
      }),
    }))

    useGameStore.getState().resolveTrigger('t-copy')

    // The copied Sol Ring ability resolved again through the real action
    // (add_mana adds one mana of each produced color).
    expect(useGameStore.getState().manaPool.C).toBe(1)
    expect(useGameStore.getState().triggerStack.filter((t) => t.id === 't-copy')).toHaveLength(0)
  })

  it('fizzles honestly when nothing copyable resolved this turn', () => {
    primeCardRules({})
    const archaic = boardCard({ id: 'archaic', name: 'Abstruse Archaic' })
    useGameStore.setState({ cards: [archaic], lastResolvedAbility: null })
    pushTrigger(makeTrigger({
      id: 't-copy2',
      sourceCardId: 'archaic',
      ability: activated({ targets: 0, targetFilter: null, effect: { kind: 'copy_ability', params: {} } }),
    }))

    useGameStore.getState().resolveTrigger('t-copy2')

    expect(useGameStore.getState().triggerStack.filter((t) => t.id === 't-copy2')).toHaveLength(0)
  })
})

describe('graveyard_intake_mill (Fraying Sanity)', () => {
  it('mills the enchanted side X cards where X is that side\'s intake this turn', () => {
    const sanity = boardCard({ id: 'sanity', name: 'Fraying Sanity', typeLine: 'Enchantment — Aura Curse', type: 'enchantment' })
    const lib = [boardCard({ id: 'l1', zone: 'library', owner: 'opponent' }), boardCard({ id: 'l2', zone: 'library', owner: 'opponent' }), boardCard({ id: 'l3', zone: 'library', owner: 'opponent' })]
    useGameStore.setState({ cards: [sanity, ...lib], graveyardIntake: { player: 0, opponent: 3 } })
    pushTrigger(makeTrigger({
      id: 't-sanity',
      sourceCardId: 'sanity',
      sourceCardName: 'Fraying Sanity',
      ability: activated({ targets: 0, targetFilter: null, effect: { kind: 'graveyard_intake_mill', params: {} } }),
    }))

    useGameStore.getState().resolveTrigger('t-sanity')

    const zones = Object.fromEntries(useGameStore.getState().cards.map((c) => [c.id, c.zone]))
    expect(zones.l1).toBe('graveyard')
    expect(zones.l2).toBe('graveyard')
    expect(zones.l3).toBe('graveyard')
  })

  it('caps the mill at the library size and counts the mill itself as intake', () => {
    const sanity = boardCard({ id: 'sanity', name: 'Fraying Sanity', type: 'enchantment' })
    const lib = [boardCard({ id: 'only', zone: 'library', owner: 'opponent' })]
    useGameStore.setState({ cards: [sanity, ...lib], graveyardIntake: { player: 0, opponent: 5 } })
    pushTrigger(makeTrigger({
      id: 't-sanity2',
      sourceCardId: 'sanity',
      ability: activated({ targets: 0, targetFilter: null, effect: { kind: 'graveyard_intake_mill', params: {} } }),
    }))

    useGameStore.getState().resolveTrigger('t-sanity2')

    expect(useGameStore.getState().cards.find((c) => c.id === 'only')?.zone).toBe('graveyard')
    // The mill feeds the intake counter for later end-step triggers this turn.
    expect(useGameStore.getState().graveyardIntake?.opponent).toBe(6)
  })
})

describe('monstrosity activation', () => {
  it('puts N +1/+1 counters on the source', () => {
    primeCardRules({})
    const giggling = boardCard({ id: 'gig', name: 'Giggling Skitterspike' })
    useGameStore.setState({ cards: [giggling] })
    pushTrigger(makeTrigger({
      id: 't-mono',
      sourceCardId: 'gig',
      ability: activated({
        cost: '{5}',
        targets: 0,
        targetFilter: null,
        effect: { kind: 'monstrosity', params: { amount: 5 } },
      }),
    }))

    useGameStore.getState().resolveTrigger('t-mono')

    expect(useGameStore.getState().cards.find((c) => c.id === 'gig')?.counters).toBe(5)
  })
})

describe('graveyard intake counting', () => {
  it('counts only cards newly entering the graveyard', () => {
    const before = [
      boardCard({ id: 'a', zone: 'battlefield' }),
      boardCard({ id: 'dead', zone: 'battlefield', owner: 'opponent' }),
      boardCard({ id: 'gy', zone: 'graveyard' }),
    ]
    const after = [
      boardCard({ id: 'a', zone: 'battlefield' }),
      boardCard({ id: 'dead', zone: 'graveyard', owner: 'opponent' }),
      boardCard({ id: 'gy', zone: 'graveyard' }),
    ]
    expect(graveyardIntakeDelta(before, after)).toEqual({ player: 0, opponent: 1 })
    const partial = withGraveyardIntake({ cards: before, graveyardIntake: { player: 2, opponent: 0 } }, after)
    expect(partial.graveyardIntake).toEqual({ player: 2, opponent: 1 })
  })

  it('returns an empty patch when nothing moved', () => {
    const same = [boardCard({ id: 'a', zone: 'battlefield' })]
    expect(withGraveyardIntake({ cards: same, graveyardIntake: { player: 0, opponent: 0 } }, same)).toEqual({})
  })

  it('moveCard deaths feed the intake counter', () => {
    const victim = boardCard({ id: 'victim' })
    useGameStore.setState({ cards: [victim] })
    useGameStore.getState().moveCard('victim', 'graveyard')
    expect(useGameStore.getState().graveyardIntake?.player).toBe(1)
  })
})

// Local helper — avoids importing misc just for one assertion shape.
function getPowerText(typeLine?: string): string {
  return typeLine?.match(/(\d+\/\d+)/)?.[1] ?? ''
}
