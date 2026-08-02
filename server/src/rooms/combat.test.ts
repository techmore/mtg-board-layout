import { describe, expect, it } from 'vitest'
import { parsePower, parseToughness, resolveCombat, type Combatant } from './combat'

function attacker(id: string, pt: string): Combatant {
  return { id, typeLine: pt, ownerId: 'a', teamId: 'team1' }
}

function defender(id: string, pt: string, ownerId = 'b', teamId = 'team2'): Combatant {
  return { id, typeLine: pt, ownerId, teamId }
}

const playersOf = (battlefields: Record<string, Combatant[]>, teams: Record<string, string> = {}) =>
  Object.entries(battlefields).map(([id, battlefield]) => ({
    id,
    teamId: teams[id] ?? (id === 'a' ? 'team1' : 'team2'),
    battlefield,
  }))

describe('combat parsing', () => {
  it('parses power and toughness from type lines', () => {
    expect(parsePower('2/2')).toBe(2)
    expect(parseToughness('2/3')).toBe(3)
    expect(parsePower('Creature — Wolf')).toBe(0)
    expect(parseToughness('Creature — Wolf')).toBe(0)
  })
})

describe('resolveCombat', () => {
  it('a 2/2 attacker kills a 1/1 blocker and survives', () => {
    const bear = attacker('bear', '2/2')
    const wolf = defender('wolf', '1/1')
    const result = resolveCombat([bear], ['wolf'], playersOf({ a: [bear], b: [wolf] }), 'a', 'team1')
    expect(result.deadBlockerIds).toEqual(['wolf'])
    expect(result.deadAttackerIds).toEqual([])
    expect(result.damage).toEqual([])
    expect(result.assignments).toEqual({ bear: ['wolf'] })
  })

  it('both combatants die in an even trade', () => {
    const bear = attacker('bear', '1/1')
    const wolf = defender('wolf', '1/1')
    const result = resolveCombat([bear], ['wolf'], playersOf({ a: [bear], b: [wolf] }), 'a', 'team1')
    expect(result.deadBlockerIds).toEqual(['wolf'])
    expect(result.deadAttackerIds).toEqual(['bear'])
  })

  it('a 1/1 attacker dies to a 2/2 blocker without killing it', () => {
    const wolf = attacker('wolf', '1/1')
    const bear = defender('bear', '2/2')
    const result = resolveCombat([wolf], ['bear'], playersOf({ a: [wolf], b: [bear] }), 'a', 'team1')
    expect(result.deadAttackerIds).toEqual(['wolf'])
    expect(result.deadBlockerIds).toEqual([])
  })

  it('unblocked attackers deal damage to every opposing player', () => {
    const bear = attacker('bear', '2/2')
    const bob = defender('bob-other', '1/1', 'c', 'team2')
    const result = resolveCombat([bear], [], playersOf({ a: [bear], b: [], c: [bob] }), 'a', 'team1')
    expect(result.damage).toHaveLength(2)
    expect(result.damage.map((d) => d.amount)).toEqual([2, 2])
    expect(result.deadBlockerIds).toEqual([])
  })

  it('does not damage players on the attacker team', () => {
    const bear = attacker('bear', '2/2')
    const ally = defender('ally', '1/1', 'a2', 'team1')
    const result = resolveCombat([bear], [], playersOf({ a: [bear], a2: [ally], b: [] }, { a2: 'team1' }), 'a', 'team1')
    expect(result.damage).toHaveLength(1)
    expect(result.damage[0].defenderId).toBe('b')
  })

  it('assigns blockers round-robin across attackers', () => {
    const a1 = attacker('a1', '1/1')
    const a2 = attacker('a2', '1/1')
    const b1 = defender('b1', '1/1')
    const b2 = defender('b2', '1/1')
    const result = resolveCombat([a1, a2], ['b1', 'b2'], playersOf({ a: [a1, a2], b: [b1, b2] }), 'a', 'team1')
    expect(result.assignments.a1).toEqual(['b1'])
    expect(result.assignments.a2).toEqual(['b2'])
    expect(result.deadAttackerIds).toEqual(['a1', 'a2'])
    expect(result.deadBlockerIds).toEqual(['b1', 'b2'])
  })
})
