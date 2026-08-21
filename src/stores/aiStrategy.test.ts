import { beforeEach, describe, expect, it } from 'vitest'
import { classifySpellRole, pickSpellSmart } from './gameOpponentAI'
import { primeCardRules, getCachedCardRules } from './cardRulesLoader'
import type { BoardCard, CardRuleEntry, ManaPool } from '../types/card'

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
    zone: 'hand',
    tapped: false,
    counters: 0,
    type: 'creature',
    revealed: false,
    ...overrides,
  }
}

function rule(name: string, oracleText: string, abilities: CardRuleEntry['abilities'] = []): CardRuleEntry {
  return {
    cardName: name,
    manaCost: '{2}',
    manaValue: 2,
    typeLine: 'Instant',
    cardType: 'instant',
    subtypes: [],
    keywords: [],
    manaProduction: null,
    entryTapRule: null,
    conditionalEntryText: null,
    oracleText,
    scryfallId: `sf-${name}`,
    abilities,
  }
}

beforeEach(() => {
  primeCardRules({
    'Doom Blade': rule('Doom Blade', 'Destroy target creature.', [
      { abilityType: 'spell', triggerEvent: null, triggerCondition: null, isOptional: false, cost: null, targets: 1, targetFilter: 'creature', effect: { kind: 'destroy', params: {} } },
    ]),
    'Sol Rock': {
      ...rule('Sol Rock', '{T}: Add {C}.'),
      typeLine: 'Artifact',
      cardType: 'artifact',
      manaProduction: { colors: ['C'], amount: 1 },
    },
    'Rampant Growth': rule('Rampant Growth', 'Search your library for a basic land card.', []),
    'Big Beast': {
      ...rule('Big Beast', ''),
      typeLine: 'Creature 5/5',
      cardType: 'creature',
      manaValue: 5,
      manaCost: '{5}',
    },
    'Small Bear': {
      ...rule('Small Bear', ''),
      typeLine: 'Creature 2/2',
      cardType: 'creature',
      manaValue: 2,
      manaCost: '{2}',
    },
    'Shiny Aura': {
      ...rule('Shiny Aura', 'Enchant creature'),
      typeLine: 'Enchantment — Aura',
      cardType: 'enchantment',
    },
  })
})

describe('classifySpellRole', () => {
  const rules = {
    'Doom Blade': rule('Doom Blade', 'Destroy target creature.', [
      { abilityType: 'spell', triggerEvent: null, triggerCondition: null, isOptional: false, cost: null, targets: 1, targetFilter: 'creature', effect: { kind: 'destroy', params: {} } },
    ]),
    'Sol Rock': { ...rule('Sol Rock', '{T}: Add {C}.'), manaProduction: { colors: ['C'] as const, amount: 1 } },
    'Rampant Growth': rule('Rampant Growth', 'Search your library for a basic land card.'),
  }

  it('classifies removal by effect kinds', () => {
    expect(classifySpellRole({ type: 'instant', typeLine: 'Instant', manaProduction: undefined }, rules['Doom Blade'])).toBe('removal')
  })

  it('classifies mana rocks and land-search as ramp', () => {
    expect(classifySpellRole({ type: 'artifact', typeLine: 'Artifact', manaProduction: { colors: ['C'], amount: 1 } }, rules['Sol Rock'])).toBe('ramp')
    expect(classifySpellRole({ type: 'sorcery', typeLine: 'Sorcery', manaProduction: undefined }, rules['Rampant Growth'])).toBe('ramp')
  })

  it('classifies creatures and everything else', () => {
    expect(classifySpellRole({ type: 'creature', typeLine: 'Creature 2/2', manaProduction: undefined }, rule('Bear', ''))).toBe('creature')
    expect(classifySpellRole({ type: 'enchantment', typeLine: 'Enchantment', manaProduction: undefined }, rule('Aura', 'Enchant creature'))).toBe('other')
  })
})

describe('pickSpellSmart', () => {
  const hand = () => [
    boardCard({ id: 'bolt', name: 'Doom Blade', type: 'instant', typeLine: 'Instant', manaCost: '{2}', manaValue: 2 }),
    boardCard({ id: 'rock', name: 'Sol Rock', type: 'artifact', typeLine: 'Artifact', manaCost: '{2}', manaValue: 2 }),
    boardCard({ id: 'beast', name: 'Big Beast', manaCost: '{5}', manaValue: 5 }),
    boardCard({ id: 'bear', name: 'Small Bear', manaCost: '{2}', manaValue: 2 }),
  ]
  const pool = (): ManaPool => ({ ...emptyManaPool(), C: 9 })

  it('answers a real threat (power >= 4) with removal first', () => {
    const picked = pickSpellSmart(hand(), [], pool(), useRules(), { turn: 5, playerThreatPower: 4 })
    expect(picked?.name).toBe('Doom Blade')
  })

  it('ignores removal priority when the player has no real threat', () => {
    // No threat → develop; lands < 4 → ramp before development.
    const picked = pickSpellSmart(hand(), [], pool(), useRules(), { turn: 2, playerThreatPower: 2 })
    expect(picked?.name).toBe('Sol Rock')
  })

  it('develops the biggest affordable spell once the early game is over', () => {
    const battlefield = [boardCard({ id: 'l1', name: 'Forest', type: 'land', typeLine: 'Basic Land — Forest' }), boardCard({ id: 'l2', name: 'Forest', type: 'land', typeLine: 'Basic Land — Forest' }), boardCard({ id: 'l3', name: 'Forest', type: 'land', typeLine: 'Basic Land — Forest' }), boardCard({ id: 'l4', name: 'Forest', type: 'land', typeLine: 'Basic Land — Forest' })]
    const picked = pickSpellSmart(hand(), battlefield, pool(), useRules(), { turn: 6, playerThreatPower: 2 })
    expect(picked?.name).toBe('Big Beast')
  })

  it('prefers creatures over non-creatures on a mana-value tie', () => {
    const battlefield = [boardCard({ id: 'l1', name: 'Forest', type: 'land', typeLine: 'Basic Land — Forest' }), boardCard({ id: 'l2', name: 'Forest', type: 'land', typeLine: 'Basic Land — Forest' }), boardCard({ id: 'l3', name: 'Forest', type: 'land', typeLine: 'Basic Land — Forest' }), boardCard({ id: 'l4', name: 'Forest', type: 'land', typeLine: 'Basic Land — Forest' })]
    const twoCreatures = [
      boardCard({ id: 'bear', name: 'Small Bear', manaCost: '{2}', manaValue: 2 }),
      boardCard({ id: 'rock', name: 'Sol Rock', type: 'artifact', typeLine: 'Artifact', manaCost: '{2}', manaValue: 2 }),
    ]
    const picked = pickSpellSmart(twoCreatures, battlefield, pool(), useRules(), { turn: 6, playerThreatPower: 0 })
    expect(picked?.name).toBe('Small Bear')
  })

  it('holds Auras while nothing is on the board to enchant', () => {
    const auraHand = [boardCard({ id: 'aura', name: 'Shiny Aura', type: 'enchantment', typeLine: 'Enchantment — Aura', manaCost: '{2}', manaValue: 2 }), boardCard({ id: 'bear', name: 'Small Bear', manaCost: '{2}', manaValue: 2 })]
    const picked = pickSpellSmart(auraHand, [], pool(), useRules(), { turn: 6, playerThreatPower: 0 })
    expect(picked?.name).toBe('Small Bear')
    // With a creature out, the aura is castable.
    const withBoard = pickSpellSmart(auraHand, [boardCard({ id: 'bear2', name: 'Small Bear', zone: 'battlefield' })], pool(), useRules(), { turn: 6, playerThreatPower: 0 })
    expect(withBoard).not.toBeNull()
  })

  it('returns null when nothing is affordable or legal', () => {
    expect(pickSpellSmart([boardCard({ id: 'x', name: 'Big Beast', manaCost: '{9}', manaValue: 9 })], [], emptyManaPool(), useRules(), { turn: 6, playerThreatPower: 0 })).toBeNull()
    const auraOnly = [boardCard({ id: 'aura', name: 'Shiny Aura', type: 'enchantment', typeLine: 'Enchantment — Aura', manaCost: '{2}', manaValue: 2 })]
    expect(pickSpellSmart(auraOnly, [], pool(), useRules(), { turn: 6, playerThreatPower: 0 })).toBeNull()
  })
})

// Helper: the rules map keyed the way getCachedCardRules returns it.
function useRules(): Record<string, CardRuleEntry> {
  return getCachedCardRules() ?? {}
}
