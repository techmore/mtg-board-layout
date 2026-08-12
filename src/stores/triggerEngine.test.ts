import { afterEach, describe, expect, it } from 'vitest'
import type { BoardCard, CardAbilityDef, CardRuleEntry, TriggerInstance } from '../types/card'
import {
  buildTriggerInstances,
  clearRegistry,
  getTriggersForEvent,
  registerCardTriggers,
  reindexTriggers,
  unregisterCardTriggers,
} from './triggerEngine'

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

function triggeredAbility(event: string, overrides: Partial<CardAbilityDef> = {}): CardAbilityDef {
  return {
    abilityType: 'triggered',
    triggerEvent: event as CardAbilityDef['triggerEvent'],
    triggerCondition: null,
    isOptional: false,
    cost: null,
    targets: 0,
    targetFilter: null,
    effect: { kind: 'draw_cards', params: { amount: 1 } },
    ...overrides,
  }
}

afterEach(clearRegistry)

describe('registerCardTriggers', () => {
  it('registers triggered abilities for battlefield cards', () => {
    const rules: CardRuleEntry = {
      cardName: 'Test Card',
      manaCost: '{1}{W}',
      manaValue: 2,
      typeLine: 'Creature',
      cardType: 'creature',
      subtypes: [],
      keywords: [],
      manaProduction: null,
      entryTapRule: 'never',
      conditionalEntryText: null,
      oracleText: '',
      scryfallId: 'scryfall-1',
      abilities: [triggeredAbility('etb')],
    }

    registerCardTriggers(card({ id: 'grizzly' }), rules)

    const triggers = getTriggersForEvent('etb')
    expect(triggers).toHaveLength(1)
    expect(triggers[0]).toMatchObject({ cardId: 'grizzly', cardName: 'Test Card' })
  })

  it('skips non-triggered abilities', () => {
    const rules: CardRuleEntry = {
      cardName: 'Test Card',
      manaCost: '',
      manaValue: 0,
      typeLine: 'Creature',
      cardType: 'creature',
      subtypes: [],
      keywords: [],
      manaProduction: null,
      entryTapRule: 'never',
      conditionalEntryText: null,
      oracleText: '',
      scryfallId: 'scryfall-1',
      abilities: [
        { ...triggeredAbility('etb'), abilityType: 'activated' },
        { ...triggeredAbility(null as unknown as string), triggerEvent: null },
      ],
    }

    registerCardTriggers(card(), rules)

    expect(getTriggersForEvent('etb')).toHaveLength(0)
  })

  it('ignores cards not on the battlefield and missing rules', () => {
    const rules: CardRuleEntry = {
      cardName: 'Test Card',
      manaCost: '',
      manaValue: 0,
      typeLine: 'Creature',
      cardType: 'creature',
      subtypes: [],
      keywords: [],
      manaProduction: null,
      entryTapRule: 'never',
      conditionalEntryText: null,
      oracleText: '',
      scryfallId: 'scryfall-1',
      abilities: [triggeredAbility('etb')],
    }

    registerCardTriggers(card({ zone: 'hand' }), rules)
    registerCardTriggers(card({ id: 'no-rules' }), undefined)

    expect(getTriggersForEvent('etb')).toHaveLength(0)
  })
})

describe('unregisterCardTriggers', () => {
  it('removes all triggers for a card', () => {
    const rules: CardRuleEntry = {
      cardName: 'Test Card',
      manaCost: '',
      manaValue: 0,
      typeLine: 'Creature',
      cardType: 'creature',
      subtypes: [],
      keywords: [],
      manaProduction: null,
      entryTapRule: 'never',
      conditionalEntryText: null,
      oracleText: '',
      scryfallId: 'scryfall-1',
      abilities: [triggeredAbility('etb'), triggeredAbility('dies')],
    }

    registerCardTriggers(card({ id: 'grizzly' }), rules)
    unregisterCardTriggers('grizzly')

    expect(getTriggersForEvent('etb')).toHaveLength(0)
    expect(getTriggersForEvent('dies')).toHaveLength(0)
  })
})

describe('reindexTriggers', () => {
  it('rebuilds the registry from battlefield cards only', () => {
    const rulesMap: Record<string, CardRuleEntry> = {
      'Grizzly Bears': {
        cardName: 'Grizzly Bears',
        manaCost: '{1}{G}',
        manaValue: 2,
        typeLine: 'Creature',
        cardType: 'creature',
        subtypes: [],
        keywords: [],
        manaProduction: null,
        entryTapRule: 'never',
        conditionalEntryText: null,
        oracleText: '',
        scryfallId: 's1',
        abilities: [triggeredAbility('etb')],
      },
      'Runeclaw Bear': {
        cardName: 'Runeclaw Bear',
        manaCost: '{1}{G}',
        manaValue: 2,
        typeLine: 'Creature',
        cardType: 'creature',
        subtypes: [],
        keywords: [],
        manaProduction: null,
        entryTapRule: 'never',
        conditionalEntryText: null,
        oracleText: '',
        scryfallId: 's2',
        abilities: [triggeredAbility('upkeep')],
      },
    }

    reindexTriggers(
      [
        card({ id: 'on-field', name: 'Grizzly Bears' }),
        card({ id: 'in-hand', name: 'Runeclaw Bear', zone: 'hand' }),
        card({ id: 'unknown', name: 'No Rules' }),
      ],
      rulesMap,
    )

    expect(getTriggersForEvent('etb').map((trigger) => trigger.cardId)).toEqual(['on-field'])
    expect(getTriggersForEvent('upkeep')).toHaveLength(0)
  })

  it('matches rules by case-insensitive name fallback', () => {
    const rulesMap: Record<string, CardRuleEntry> = {
      'GRIZZLY BEARS': {
        cardName: 'Grizzly Bears',
        manaCost: '',
        manaValue: 0,
        typeLine: 'Creature',
        cardType: 'creature',
        subtypes: [],
        keywords: [],
        manaProduction: null,
        entryTapRule: 'never',
        conditionalEntryText: null,
        oracleText: '',
        scryfallId: 's1',
        abilities: [triggeredAbility('dies')],
      },
    }

    reindexTriggers([card({ id: 'bear', name: 'grizzly bears' })], rulesMap)

    expect(getTriggersForEvent('dies').map((trigger) => trigger.cardId)).toEqual(['bear'])
  })
})

describe('buildTriggerInstances', () => {
  it('returns the stack untouched when nothing matches the event', () => {
    const existing: TriggerInstance[] = [
      {
        id: 'existing-1',
        sourceCardId: 'a',
        sourceCardName: 'A',
        ability: triggeredAbility('etb'),
        event: 'etb',
        context: {},
      },
    ]

    const result = buildTriggerInstances({ type: 'dies', cardId: 'a', cardName: 'A' }, existing)

    expect(result.newTriggers).toBe(0)
    expect(result.stack).toEqual(existing)
  })

  it('appends one instance per matching registered trigger', () => {
    const rules: CardRuleEntry = {
      cardName: 'Soul Warden',
      manaCost: '{W}',
      manaValue: 1,
      typeLine: 'Creature',
      cardType: 'creature',
      subtypes: [],
      keywords: [],
      manaProduction: null,
      entryTapRule: 'never',
      conditionalEntryText: null,
      oracleText: '',
      scryfallId: 's1',
      abilities: [triggeredAbility('etb'), triggeredAbility('dies')],
    }

    registerCardTriggers(card({ id: 'warden', name: 'Soul Warden' }), rules)

    const result = buildTriggerInstances({ type: 'etb', cardId: 'other', cardName: 'Other' }, [])

    expect(result.newTriggers).toBe(1)
    expect(result.stack).toHaveLength(1)
    expect(result.stack[0]).toMatchObject({
      sourceCardId: 'warden',
      sourceCardName: 'Soul Warden',
      event: 'etb',
      context: { gameEvent: { type: 'etb', cardId: 'other', cardName: 'Other' } },
    })
  })

  it('preserves existing stack ordering with new triggers appended', () => {
    const rules: CardRuleEntry = {
      cardName: 'Soul Warden',
      manaCost: '',
      manaValue: 0,
      typeLine: 'Creature',
      cardType: 'creature',
      subtypes: [],
      keywords: [],
      manaProduction: null,
      entryTapRule: 'never',
      conditionalEntryText: null,
      oracleText: '',
      scryfallId: 's1',
      abilities: [triggeredAbility('etb')],
    }

    registerCardTriggers(card({ id: 'warden' }), rules)

    const existing: TriggerInstance[] = [{
      id: 'old',
      sourceCardId: 'old',
      sourceCardName: 'Old',
      ability: triggeredAbility('etb'),
      event: 'etb',
      context: {},
    }]
    const result = buildTriggerInstances({ type: 'etb', cardId: 'other', cardName: 'Other' }, existing)

    expect(result.stack.map((instance) => instance.id)).toEqual(['old', expect.any(String)])
  })
})

function conditionTrigger(condition: string, event: string = 'dies'): CardAbilityDef {
  return {
    abilityType: 'triggered',
    triggerEvent: event as CardAbilityDef['triggerEvent'],
    triggerCondition: condition,
    isOptional: false,
    cost: null,
    targets: 0,
    targetFilter: null,
    effect: { kind: 'other', params: {} },
  }
}

function conditionRules(abilities: CardAbilityDef[]): CardRuleEntry {
  return { cardName: 'Test', manaCost: '', manaValue: 0, typeLine: 'Creature', cardType: 'creature', subtypes: [], keywords: [], manaProduction: null, entryTapRule: 'never', conditionalEntryText: null, oracleText: '', scryfallId: 's1', abilities }
}

describe('trigger condition enforcement', () => {
  it('"another creature you control dies" does not fire when the source itself dies', () => {
    registerCardTriggers(card({ id: 'source', name: 'Butcher' }), conditionRules([conditionTrigger('another creature you control dies')]))
    const result = buildTriggerInstances({ type: 'dies', cardId: 'source', cardName: 'Butcher' }, [], [card({ id: 'source', name: 'Butcher' })])
    expect(result.newTriggers).toBe(0)
  })

  it('"another creature you control dies" fires for a friendly creature, not an enemy one', () => {
    registerCardTriggers(card({ id: 'source', name: 'Butcher' }), conditionRules([conditionTrigger('another creature you control dies')]))
    const friendly = buildTriggerInstances({ type: 'dies', cardId: 'bob', cardName: 'Bob' }, [], [
      card({ id: 'source', name: 'Butcher' }),
      card({ id: 'bob', name: 'Bob', owner: 'player' }),
    ])
    expect(friendly.newTriggers).toBe(1)
    const enemy = buildTriggerInstances({ type: 'dies', cardId: 'enemy', cardName: 'Enemy' }, [], [
      card({ id: 'source', name: 'Butcher' }),
      card({ id: 'enemy', name: 'Enemy', owner: 'opponent' }),
    ])
    expect(enemy.newTriggers).toBe(0)
  })

  it('"this creature dies" only fires for the source card', () => {
    registerCardTriggers(card({ id: 'source', name: 'Scorpion God' }), conditionRules([conditionTrigger('this creature dies')]))
    const self = buildTriggerInstances({ type: 'dies', cardId: 'source', cardName: 'Scorpion God' }, [], [card({ id: 'source', name: 'Scorpion God' })])
    expect(self.newTriggers).toBe(1)
    const other = buildTriggerInstances({ type: 'dies', cardId: 'bear', cardName: 'Bear' }, [], [
      card({ id: 'source', name: 'Scorpion God' }),
      card({ id: 'bear', name: 'Bear' }),
    ])
    expect(other.newTriggers).toBe(0)
  })

  it('"a creature an opponent controls dies" fires only for enemy creatures', () => {
    registerCardTriggers(card({ id: 'source', name: 'Reaper' }), conditionRules([conditionTrigger('a creature an opponent controls dies')]))
    const enemy = buildTriggerInstances({ type: 'dies', cardId: 'e', cardName: 'Enemy' }, [], [
      card({ id: 'source', name: 'Reaper' }),
      card({ id: 'e', name: 'Enemy', owner: 'opponent' }),
    ])
    expect(enemy.newTriggers).toBe(1)
    const friendly = buildTriggerInstances({ type: 'dies', cardId: 'f', cardName: 'Friendly' }, [], [
      card({ id: 'source', name: 'Reaper' }),
      card({ id: 'f', name: 'Friendly', owner: 'player' }),
    ])
    expect(friendly.newTriggers).toBe(0)
  })

  it('timing conditions without a card are unconstrained', () => {
    registerCardTriggers(card({ id: 'source', name: 'Bitterblossom' }), conditionRules([conditionTrigger('at the beginning of your upkeep', 'upkeep')]))
    const result = buildTriggerInstances({ type: 'upkeep' }, [], [card({ id: 'source', name: 'Bitterblossom' })])
    expect(result.newTriggers).toBe(1)
  })
})
