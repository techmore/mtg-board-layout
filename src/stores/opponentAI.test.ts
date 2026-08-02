import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BoardCard, CardRuleEntry, ManaPool } from '../types/card'
import { pickAttackers, pickBlockers, pickCommanderCast, pickSpell } from './opponentAI'
import { primeCardRules } from './cardRulesLoader'

const manaPool = (overrides: Partial<ManaPool> = {}): ManaPool => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...overrides })

function commander(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: 'cmd',
    scryfallId: 'sf-cmd',
    name: 'Atarka, World Render',
    imageUri: '',
    typeLine: 'Legendary Creature — Dragon',
    subtypes: [],
    isBasicLand: false,
    zone: 'command',
    tapped: false,
    counters: 0,
    type: 'creature',
    revealed: true,
    owner: 'opponent',
    ...overrides,
  }
}

function creature(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: 'creature',
    scryfallId: 'sf-c',
    name: 'Creature',
    imageUri: '',
    typeLine: '1/1',
    subtypes: [],
    isBasicLand: false,
    zone: 'battlefield',
    tapped: false,
    counters: 0,
    type: 'creature',
    revealed: true,
    owner: 'opponent',
    ...overrides,
  }
}

beforeEach(() => {
  primeCardRules({})
})

afterEach(() => {
  primeCardRules({})
})

describe('pickSpell', () => {
  function handCard(name: string, type: string, manaCost: string, overrides: Partial<BoardCard> = {}): BoardCard {
    return { ...creature({ id: `sf-${name}`, name, type: type as BoardCard['type'], manaCost, zone: 'hand' }), ...overrides }
  }

  it('returns null when nothing is playable', () => {
    expect(pickSpell([handCard('Bear', 'creature', '{1}{G}')], [], manaPool())).toBeNull()
  })

  it('prefers a creature over a non-creature when both are affordable', () => {
    const bear = handCard('Bear', 'creature', '{1}{G}')
    const bolt = handCard('Bolt', 'instant', '{R}')
    const picked = pickSpell([bolt, bear], [], manaPool({ G: 1, R: 1 }))
    expect(picked?.name).toBe('Bear')
  })

  it('skips lands entirely', () => {
    const forest = handCard('Forest', 'land', '')
    const bolt = handCard('Bolt', 'instant', '{R}')
    const picked = pickSpell([forest, bolt], [], manaPool({ R: 1 }))
    expect(picked?.name).toBe('Bolt')
  })

  it('ignores cards without a mana cost and unaffordable ones', () => {
    const noCost = handCard('Weird', 'creature', '')
    const expensive = handCard('Colossus', 'creature', '{10}')
    expect(pickSpell([noCost, expensive], [], manaPool())).toBeNull()
  })
})

describe('pickCommanderCast', () => {
  it('returns null when the commander is unaffordable', () => {
    const card = commander({ manaCost: '{4}{R}{R}' })
    expect(pickCommanderCast([card], manaPool({ R: 1 }))).toBeNull()
  })

  it('returns the commander with its plain cost when affordable', () => {
    const card = commander({ manaCost: '{4}{R}{R}' })
    const result = pickCommanderCast([card], manaPool({ R: 2, C: 4 }))
    expect(result).not.toBeNull()
    expect(result?.card.id).toBe('cmd')
    expect(result?.cost).toBe('{4}{R}{R}')
  })

  it('applies the commander tax after the first cast', () => {
    const card = commander({ manaCost: '{4}{R}{R}', commanderTax: 1 })
    const result = pickCommanderCast([card], manaPool({ R: 2, C: 6 }))
    expect(result?.cost).toBe('{4}{R}{R}{2}')
  })

  it('returns null when taxed cost is unaffordable', () => {
    const card = commander({ manaCost: '{4}{R}{R}', commanderTax: 2 })
    expect(pickCommanderCast([card], manaPool({ R: 2, C: 4 }))).toBeNull()
  })

  it('skips commanders without a mana cost', () => {
    const card = commander({ manaCost: undefined })
    expect(pickCommanderCast([card], manaPool())).toBeNull()
  })
})

describe('pickAttackers', () => {
  it('lets creatures with haste attack the turn they entered', () => {
    primeCardRules({ 'Rager': { cardName: 'Rager', manaCost: '', manaValue: 2, typeLine: 'Creature', cardType: 'creature', subtypes: [], keywords: ['haste'], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 'r', abilities: [] } as CardRuleEntry })
    const attackers = pickAttackers([
      creature({ id: 'rager', name: 'Rager', enteredAtTurn: 5 }),
      creature({ id: 'bear', name: 'Bear', enteredAtTurn: 5 }),
    ], 5)
    expect(attackers).toContain('rager')
    expect(attackers).not.toContain('bear')
  })

  it('skips tapped creatures and those that entered this turn without haste', () => {
    const attackers = pickAttackers([
      creature({ id: 'tapped', tapped: true, enteredAtTurn: 4 }),
      creature({ id: 'fresh', enteredAtTurn: 5 }),
      creature({ id: 'ready', enteredAtTurn: 4 }),
    ], 5)
    expect(attackers).toEqual(['ready'])
  })

  it('swings freely when the opponent has no blockers', () => {
    const attackers = pickAttackers([
      creature({ id: 'a', enteredAtTurn: 4 }),
      creature({ id: 'b', enteredAtTurn: 4 }),
    ], 5, [])
    expect(attackers).toHaveLength(2)
  })

  it('holds back from an unfavorable ground trade', () => {
    const attackers = pickAttackers(
      [creature({ id: 'weak', typeLine: '2/2', enteredAtTurn: 4 })],
      5,
      [creature({ id: 'big', name: 'Big', typeLine: '6/6', enteredAtTurn: 4, owner: 'player' })],
    )
    expect(attackers).toHaveLength(0)
  })

  it('attacks when the ground trade is at least even', () => {
    const attackers = pickAttackers(
      [creature({ id: 'a', typeLine: '4/4', enteredAtTurn: 4 })],
      5,
      [creature({ id: 'd', name: 'Defender', typeLine: '4/4', enteredAtTurn: 4, owner: 'player' })],
    )
    expect(attackers).toEqual(['a'])
  })

  it('swings everything when its power is lethal against the player life', () => {
    // 2/2 would normally hold back against a 6/6 blocker, but a lethal
    // 6/6 + flyer closes the game this turn.
    primeCardRules({
      'Flyer': { cardName: 'Flyer', manaCost: '', manaValue: 3, typeLine: 'Creature', cardType: 'creature', subtypes: [], keywords: ['flying'], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 'f', abilities: [] } as CardRuleEntry,
    })
    const attackers = pickAttackers(
      [creature({ id: 'big', typeLine: '4/4', enteredAtTurn: 4 }), creature({ id: 'flier', name: 'Flyer', typeLine: '2/2', enteredAtTurn: 4 })],
      5,
      [creature({ id: 'wall', name: 'Wall', typeLine: '6/6', enteredAtTurn: 4, owner: 'player' })],
      6,
    )
    expect(attackers).toHaveLength(2)
  })

  it('does not swing into an unfavorable trade when not lethal', () => {
    const attackers = pickAttackers(
      [creature({ id: 'weak', typeLine: '2/2', enteredAtTurn: 4 })],
      5,
      [creature({ id: 'big', name: 'Big', typeLine: '6/6', enteredAtTurn: 4, owner: 'player' })],
      20,
    )
    expect(attackers).toHaveLength(0)
  })

  it('sends fliers even when the ground is blocked', () => {
    primeCardRules({
      'Flyer': { cardName: 'Flyer', manaCost: '', manaValue: 3, typeLine: 'Creature', cardType: 'creature', subtypes: [], keywords: ['flying'], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 'f', abilities: [] } as CardRuleEntry,
    })
    const attackers = pickAttackers(
      [
        creature({ id: 'flyer', name: 'Flyer', typeLine: '3/3', enteredAtTurn: 4 }),
        creature({ id: 'ground', name: 'Ground', typeLine: '2/2', enteredAtTurn: 4 }),
      ],
      5,
      [creature({ id: 'wall', name: 'Wall', typeLine: '6/6', enteredAtTurn: 4, owner: 'player' })],
    )
    expect(attackers).toContain('flyer')
    expect(attackers).not.toContain('ground')
  })
})

describe('pickBlockers', () => {
  it('refuses to block a flying attacker without flying or reach', () => {
    primeCardRules({ 'Drake': { cardName: 'Drake', manaCost: '', manaValue: 3, typeLine: 'Creature', cardType: 'creature', subtypes: [], keywords: ['flying'], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 'd', abilities: [] } as CardRuleEntry })
    const wall = creature({ id: 'wall', name: 'Wall' })
    const drake = creature({ id: 'drake', name: 'Drake', owner: 'player' })
    const result = pickBlockers(['drake'], [wall], [wall, drake], 5)
    expect(result.drake).toBeUndefined()
  })

  it('blocks a flying attacker with a reach creature', () => {
    primeCardRules({
      'Drake': { cardName: 'Drake', manaCost: '', manaValue: 3, typeLine: 'Creature', cardType: 'creature', subtypes: [], keywords: ['flying'], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 'd', abilities: [] } as CardRuleEntry,
      'Web': { cardName: 'Web', manaCost: '', manaValue: 2, typeLine: 'Creature', cardType: 'creature', subtypes: [], keywords: ['reach'], manaProduction: null, entryTapRule: null, conditionalEntryText: null, oracleText: '', scryfallId: 'w', abilities: [] } as CardRuleEntry,
    })
    const web = creature({ id: 'web', name: 'Web', typeLine: '2/4' })
    const drake = creature({ id: 'drake', name: 'Drake', owner: 'player' })
    const result = pickBlockers(['drake'], [web], [web, drake], 5)
    expect(result.drake).toEqual(['web'])
  })

  it('refuses to chump-block a losing trade when not facing lethal', () => {
    const weak = creature({ id: 'weak', typeLine: '1/1' })
    const big = creature({ id: 'big', name: 'Big', typeLine: '6/6', owner: 'player' })
    const result = pickBlockers(['big'], [weak], [weak, big], 5, 20)
    expect(result.big).toBeUndefined()
  })

  it('chump-blocks anything when incoming damage is lethal', () => {
    const weak = creature({ id: 'weak', typeLine: '1/1' })
    const big = creature({ id: 'big', name: 'Big', typeLine: '6/6', owner: 'player' })
    const result = pickBlockers(['big'], [weak], [weak, big], 5, 3)
    expect(result.big).toEqual(['weak'])
  })

  it('blocks when the blocker kills the attacker even if it dies', () => {
    const trade = creature({ id: 'trade', typeLine: '5/2' })
    const big = creature({ id: 'big', name: 'Big', typeLine: '4/4', owner: 'player' })
    const result = pickBlockers(['big'], [trade], [trade, big], 5, 20)
    expect(result.big).toEqual(['trade'])
  })
})
