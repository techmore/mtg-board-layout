import { describe, expect, it, vi } from 'vitest'
import type { BoardCard, CardAbilityDef, TriggerInstance } from '../types/card'
import { resolveTrigger, selectTarget } from './triggerActions'
import type { GameState } from './gameStore'
import { useToastStore } from './toastStore'

function card(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: 'card-1',
    scryfallId: 'scryfall-1',
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

function trigger(id: string, effect: CardAbilityDef['effect'], overrides: Partial<TriggerInstance> = {}): TriggerInstance {
  return {
    id,
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
      effect,
    },
    event: 'etb',
    context: {},
    ...overrides,
  }
}

interface Harness {
  state: GameState
  get: () => GameState
  set: (partial: Partial<GameState>) => void
  drawCards: ReturnType<typeof vi.fn>
  setLife: ReturnType<typeof vi.fn>
  addToken: ReturnType<typeof vi.fn>
  addCounter: ReturnType<typeof vi.fn>
  moveCard: ReturnType<typeof vi.fn>
  addMana: ReturnType<typeof vi.fn>
  addDamage: ReturnType<typeof vi.fn>
  checkStateBasedActions: ReturnType<typeof vi.fn>
}

function makeHarness(initial: Partial<GameState> = {}): Harness {
  const callbacks = {
    drawCards: vi.fn(),
    setLife: vi.fn(),
    addToken: vi.fn(),
    addCounter: vi.fn(),
    moveCard: vi.fn(),
    addMana: vi.fn(),
    addDamage: vi.fn(),
    checkStateBasedActions: vi.fn(),
  }
  const state = {
    triggerStack: [],
    cards: [],
    lifeTotal: 20,
    ...callbacks,
    ...initial,
  } as unknown as GameState
  return {
    state,
    get: () => state,
    set: (partial) => Object.assign(state, partial),
    ...callbacks,
  }
}

describe('resolveTrigger', () => {
  it('draws cards for a draw_cards effect and removes the trigger', () => {
    const harness = makeHarness({ triggerStack: [trigger('t1', { kind: 'draw_cards', params: { amount: 2 } })] })

    resolveTrigger(harness.get, harness.set, 't1')

    expect(harness.drawCards).toHaveBeenCalledWith(2)
    expect(harness.state.triggerStack).toHaveLength(0)
  })

  it('announces honestly when an unimplemented "other" ability is resolved', () => {
    const harness = makeHarness({ triggerStack: [trigger('t1', { kind: 'other', params: { description: 'Choose a creature type.' } })] })
    const push = vi.spyOn(useToastStore.getState(), 'push').mockImplementation(() => {})

    resolveTrigger(harness.get, harness.set, 't1')

    expect(push).toHaveBeenCalledWith(expect.stringContaining('not implemented'), 'error')
    expect(harness.state.triggerStack).toHaveLength(0)
    push.mockRestore()
  })

  it('gains life for a gain_life effect based on the current total', () => {
    const harness = makeHarness({ triggerStack: [trigger('t1', { kind: 'gain_life', params: { amount: 3 } })] })

    resolveTrigger(harness.get, harness.set, 't1')

    expect(harness.setLife).toHaveBeenCalledWith(23)
    expect(harness.state.triggerStack).toHaveLength(0)
  })

  it('creates a token with the configured name', () => {
    const harness = makeHarness({ triggerStack: [trigger('t1', { kind: 'create_token', params: { tokenName: 'Goat' } })] })

    resolveTrigger(harness.get, harness.set, 't1')

    expect(harness.addToken).toHaveBeenCalledWith(expect.objectContaining({ name: 'Goat' }))
    expect(harness.state.triggerStack).toHaveLength(0)
  })

  it('mills cards from the top of the source owner\'s library', () => {
    const source = card({ id: 'source-1', zone: 'battlefield' })
    const library = [card({ id: 'l1', zone: 'library' }), card({ id: 'l2', zone: 'library' }), card({ id: 'l3', zone: 'library' })]
    const hand = card({ id: 'h1', zone: 'hand' })
    const harness = makeHarness({
      cards: [source, ...library, hand],
      triggerStack: [trigger('t1', { kind: 'mill', params: { amount: 2 } })],
    })

    resolveTrigger(harness.get, harness.set, 't1')

    const milled = harness.state.cards.filter((c) => c.zone === 'graveyard').map((c) => c.id)
    expect(milled).toEqual(['l1', 'l2'])
    expect(harness.state.cards.find((c) => c.id === 'h1')?.zone).toBe('hand')
    expect(harness.state.triggerStack).toHaveLength(0)
  })

  it('mills the opponent\'s library for opponent-owned triggers', () => {
    const source = card({ id: 'source-1', zone: 'battlefield', owner: 'opponent' })
    const library = [card({ id: 'l1', zone: 'library', owner: 'opponent' }), card({ id: 'l2', zone: 'library', owner: 'opponent' })]
    const playerLibrary = [card({ id: 'p1', zone: 'library' })]
    const harness = makeHarness({
      cards: [source, ...library, ...playerLibrary],
      triggerStack: [trigger('t1', { kind: 'mill', params: { amount: 1 } })],
    })

    resolveTrigger(harness.get, harness.set, 't1')

    const milled = harness.state.cards.filter((c) => c.zone === 'graveyard').map((c) => c.id)
    expect(milled).toEqual(['l1'])
    expect(harness.state.cards.find((c) => c.id === 'p1')?.zone).toBe('library')
  })

  it('mills nothing when the library is empty', () => {
    const harness = makeHarness({
      cards: [card({ id: 'source-1', zone: 'battlefield' })],
      triggerStack: [trigger('t1', { kind: 'mill', params: { amount: 3 } })],
    })

    resolveTrigger(harness.get, harness.set, 't1')

    expect(harness.state.cards.every((c) => c.zone !== 'graveyard')).toBe(true)
    expect(harness.state.triggerStack).toHaveLength(0)
  })

  it('applies parsed power and toughness to the token', () => {
    const harness = makeHarness({ triggerStack: [trigger('t1', { kind: 'create_token', params: { tokenName: 'Dragon', tokenPower: 4, tokenToughness: 4 } })] })

    resolveTrigger(harness.get, harness.set, 't1')

    expect(harness.addToken).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dragon', power: 4, toughness: 4 }))
    expect(harness.state.triggerStack).toHaveLength(0)
  })

  it('adds mana for each color the source card produces', () => {
    const source = card({ id: 'source-1', manaProduction: { colors: ['W', 'U'], amount: 1 } })
    const harness = makeHarness({
      cards: [source],
      triggerStack: [trigger('t1', { kind: 'add_mana', params: {} })],
    })

    resolveTrigger(harness.get, harness.set, 't1')

    expect(harness.addMana).toHaveBeenCalledTimes(2)
    expect(harness.addMana).toHaveBeenCalledWith('W', { cardId: 'source-1', cardName: 'Test Card' })
    expect(harness.addMana).toHaveBeenCalledWith('U', { cardId: 'source-1', cardName: 'Test Card' })
    expect(harness.state.triggerStack).toHaveLength(0)
  })

  it('enters targeting mode when the ability requires targets', () => {
    const t = trigger('t1', { kind: 'destroy', params: {} }, {
      ability: {
        abilityType: 'triggered',
        triggerEvent: 'etb',
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 1,
        targetFilter: null,
        effect: { kind: 'destroy', params: {} },
      },
    })
    const harness = makeHarness({ triggerStack: [t] })

    resolveTrigger(harness.get, harness.set, 't1')

    expect(harness.state.triggerStack[0].selectedTargets).toEqual([])
    expect(harness.moveCard).not.toHaveBeenCalled()
  })

  it('is a no-op for an unknown trigger id', () => {
    const harness = makeHarness()

    resolveTrigger(harness.get, harness.set, 'missing')

    expect(harness.state.triggerStack).toHaveLength(0)
  })
})

describe('selectTarget', () => {
  it('applies the effect once the target count is reached and removes the trigger', () => {
    const t = trigger('t1', { kind: 'put_counter', params: {} }, {
      ability: {
        abilityType: 'triggered',
        triggerEvent: 'etb',
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 1,
        targetFilter: null,
        effect: { kind: 'put_counter', params: {} },
      },
    })
    const harness = makeHarness({ triggerStack: [t] })

    selectTarget(harness.get, harness.set, 't1', 'target-1')

    expect(harness.addCounter).toHaveBeenCalledWith('target-1')
    expect(harness.state.triggerStack).toHaveLength(0)
  })

  it('accumulates targets until the required count is reached', () => {
    const t = trigger('t1', { kind: 'destroy', params: {} }, {
      ability: {
        abilityType: 'triggered',
        triggerEvent: 'etb',
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 2,
        targetFilter: null,
        effect: { kind: 'destroy', params: {} },
      },
    })
    const harness = makeHarness({
      cards: [card({ id: 'target-1' }), card({ id: 'target-2' })],
      triggerStack: [t],
    })

    selectTarget(harness.get, harness.set, 't1', 'target-1')
    expect(harness.state.triggerStack).toHaveLength(1)
    expect(harness.state.triggerStack[0].selectedTargets).toEqual(['target-1'])

    selectTarget(harness.get, harness.set, 't1', 'target-2')
    expect(harness.moveCard).toHaveBeenCalledWith('target-2', 'graveyard')
    expect(harness.state.triggerStack).toHaveLength(0)
  })

  it('ignores selections beyond the target count', () => {
    const t = trigger('t1', { kind: 'destroy', params: {} }, {
      ability: {
        abilityType: 'triggered',
        triggerEvent: 'etb',
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 1,
        targetFilter: null,
        effect: { kind: 'destroy', params: {} },
      },
      selectedTargets: ['target-1'],
    })
    const harness = makeHarness({ triggerStack: [t] })

    selectTarget(harness.get, harness.set, 't1', 'target-2')

    expect(harness.state.triggerStack[0].selectedTargets).toEqual(['target-1'])
    expect(harness.moveCard).not.toHaveBeenCalled()
  })

  it('deals damage to a target for a deal_damage effect', () => {
    const target = card({ id: 'target-1' })
    const t = trigger('t1', { kind: 'deal_damage', params: { amount: 2 } }, {
      ability: {
        abilityType: 'triggered',
        triggerEvent: 'etb',
        triggerCondition: null,
        isOptional: false,
        cost: null,
        targets: 1,
        targetFilter: null,
        effect: { kind: 'deal_damage', params: { amount: 2 } },
      },
    })
    const harness = makeHarness({ cards: [target], triggerStack: [t] })

    selectTarget(harness.get, harness.set, 't1', 'target-1')

    expect(harness.addDamage).toHaveBeenCalledWith('target-1', 2)
    expect(harness.addCounter).not.toHaveBeenCalled()
    expect(harness.checkStateBasedActions).toHaveBeenCalled()
    expect(harness.state.triggerStack).toHaveLength(0)
  })
})
