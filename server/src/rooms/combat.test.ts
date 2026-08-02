import { describe, expect, it } from 'vitest'
import { parseKeywords, parsePower, parseToughness, resolveCombat, type Combatant } from './combat'

function attacker(id: string, pt: string, oracle = ''): Combatant {
  return { id, typeLine: pt, oracleText: oracle, ownerId: 'a', teamId: 'team1', damage: 0, tapped: false }
}

function defender(id: string, pt: string, ownerId = 'b', teamId = 'team2', oracle = ''): Combatant {
  return { id, typeLine: pt, oracleText: oracle, ownerId, teamId, damage: 0, tapped: false }
}

const playersOf = (battlefields: Record<string, Combatant[]>, teams: Record<string, string> = {}) =>
  Object.entries(battlefields).map(([id, battlefield]) => ({
    id,
    teamId: teams[id] ?? (id === 'a' ? 'team1' : 'team2'),
    battlefield,
  }))

const deadIds = (result: { deadIds: string[] }) => result.deadIds.sort()

describe('combat parsing', () => {
  it('parses power and toughness from type lines', () => {
    expect(parsePower('2/2')).toBe(2)
    expect(parseToughness('2/3')).toBe(3)
    expect(parsePower('Creature — Wolf')).toBe(0)
    expect(parseToughness('Creature — Wolf')).toBe(0)
  })

  it('parses keywords from oracle text', () => {
    expect(parseKeywords('Flying, trample\nOther text')).toEqual(new Set(['flying', 'trample']))
    expect(parseKeywords('Lifelink, first strike')).toEqual(new Set(['lifelink', 'first strike']))
    expect(parseKeywords('No keywords here')).toEqual(new Set())
  })
})

describe('resolveCombat', () => {
  it('a 2/2 attacker kills a 1/1 blocker and survives', () => {
    const bear = attacker('bear', '2/2')
    const wolf = defender('wolf', '1/1')
    const result = resolveCombat([bear], ['wolf'], playersOf({ a: [bear], b: [wolf] }), 'a', 'team1')
    expect(deadIds(result)).toEqual(['wolf'])
    expect(result.cardDamage).toEqual([{ cardId: 'wolf', amount: 2 }, { cardId: 'bear', amount: 1 }])
    expect(result.playerDamage).toEqual([])
    expect(result.assignments).toEqual({ bear: ['wolf'] })
  })

  it('both combatants die in an even trade', () => {
    const bear = attacker('bear', '1/1')
    const wolf = defender('wolf', '1/1')
    const result = resolveCombat([bear], ['wolf'], playersOf({ a: [bear], b: [wolf] }), 'a', 'team1')
    expect(deadIds(result)).toEqual(['bear', 'wolf'])
  })

  it('a 1/1 attacker dies to a 2/2 blocker without killing it', () => {
    const wolf = attacker('wolf', '1/1')
    const bear = defender('bear', '2/2')
    const result = resolveCombat([wolf], ['bear'], playersOf({ a: [wolf], b: [bear] }), 'a', 'team1')
    expect(deadIds(result)).toEqual(['wolf'])
  })

  it('unblocked attackers deal damage to every opposing player', () => {
    const bear = attacker('bear', '2/2')
    const result = resolveCombat([bear], [], playersOf({ a: [bear], b: [] }), 'a', 'team1')
    expect(result.playerDamage.map((d) => d.amount)).toEqual([2])
  })

  it('does not damage players on the attacker team', () => {
    const bear = attacker('bear', '2/2')
    const ally = defender('ally', '1/1', 'a2', 'team1')
    const result = resolveCombat([bear], [], playersOf({ a: [bear], a2: [ally], b: [] }, { a2: 'team1' }), 'a', 'team1')
    expect(result.playerDamage).toHaveLength(1)
    expect(result.playerDamage[0].defenderId).toBe('b')
  })

  it('assigns blockers round-robin across attackers', () => {
    const a1 = attacker('a1', '1/1')
    const a2 = attacker('a2', '1/1')
    const b1 = defender('b1', '1/1')
    const b2 = defender('b2', '1/1')
    const result = resolveCombat([a1, a2], ['b1', 'b2'], playersOf({ a: [a1, a2], b: [b1, b2] }), 'a', 'team1')
    expect(result.assignments.a1).toEqual(['b1'])
    expect(result.assignments.a2).toEqual(['b2'])
    expect(deadIds(result)).toEqual(['a1', 'a2', 'b1', 'b2'])
  })
})

describe('damage accumulation', () => {
  it('a creature with prior damage dies when new damage reaches its toughness', () => {
    const bear = attacker('bear', '2/2', '')
    const bearState = { ...bear, damage: 1 }
    const wolf = defender('wolf', '1/1')
    const result = resolveCombat([bearState], ['wolf'], playersOf({ a: [bearState], b: [wolf] }), 'a', 'team1')
    // Wolf 1/1 hits the 2/2 bear for 1: total 2 damage = lethal.
    expect(deadIds(result)).toEqual(['bear', 'wolf'])
  })

  it('a creature survives with non-lethal accumulated damage', () => {
    const wall = attacker('wall', '1/4', '')
    const wallState = { ...wall, damage: 2 }
    const goblin = defender('goblin', '1/1')
    const result = resolveCombat([wallState], ['goblin'], playersOf({ a: [wallState], b: [goblin] }), 'a', 'team1')
    expect(deadIds(result)).toEqual(['goblin'])
  })
})

describe('combat keywords', () => {
  it('a first-strike attacker kills a blocker before it can deal damage', () => {
    const knight = attacker('knight', '2/2', 'First strike')
    const goblin = defender('goblin', '2/1')
    const result = resolveCombat([knight], ['goblin'], playersOf({ a: [knight], b: [goblin] }), 'a', 'team1')
    expect(deadIds(result)).toEqual(['goblin'])
    // The knight took no damage: the goblin never got to hit.
    expect(result.cardDamage.find((d) => d.cardId === 'knight')).toBeUndefined()
  })

  it('a first-strike blocker hits before a non-first-strike attacker', () => {
    const bear = attacker('bear', '3/3')
    const guard = defender('guard', '1/1', 'b', 'team2', 'First strike')
    const result = resolveCombat([bear], ['guard'], playersOf({ a: [bear], b: [guard] }), 'a', 'team1')
    // Guard hits for 1 in the first-strike step; the 3/3 bear survives and
    // kills the guard in the regular step.
    expect(deadIds(result)).toEqual(['guard'])
    expect(result.cardDamage.find((d) => d.cardId === 'bear')?.amount).toBe(1)
  })

  it('trample sends excess damage to the defending player', () => {
    const stampede = attacker('stampede', '5/3', 'Trample')
    const chump = defender('chump', '2/2')
    const result = resolveCombat([stampede], ['chump'], playersOf({ a: [stampede], b: [chump] }), 'a', 'team1')
    expect(deadIds(result)).toEqual(['chump'])
    expect(result.playerDamage.map((d) => d.amount)).toEqual([3])
  })

  it('lifelink heals the attacker controller', () => {
    const vamp = attacker('vamp', '2/2', 'Lifelink')
    const result = resolveCombat([vamp], [], playersOf({ a: [vamp], b: [] }), 'a', 'team1')
    expect(result.playerDamage.map((d) => d.amount)).toEqual([2])
    expect(result.lifeGain).toEqual([{ ownerId: 'a', amount: 2 }])
  })

  it('deathtouch makes one damage lethal', () => {
    const cobra = attacker('cobra', '1/1', 'Deathtouch')
    const giant = defender('giant', '6/6')
    const result = resolveCombat([cobra], ['giant'], playersOf({ a: [cobra], b: [giant] }), 'a', 'team1')
    expect(deadIds(result)).toEqual(['cobra', 'giant'])
  })

  it('indestructible survives lethal damage', () => {
    const darksteel = attacker('steel', '2/2', 'Indestructible')
    const wolf = defender('wolf', '2/2')
    const result = resolveCombat([darksteel], ['wolf'], playersOf({ a: [darksteel], b: [wolf] }), 'a', 'team1')
    expect(deadIds(result)).toEqual(['wolf'])
  })

  it('non-flying blockers cannot block flying attackers', () => {
    const drake = attacker('drake', '3/2', 'Flying')
    const wall = defender('wall', '0/4')
    const result = resolveCombat([drake], ['wall'], playersOf({ a: [drake], b: [wall] }), 'a', 'team1')
    // The wall can't block: the drake is unblocked.
    expect(result.playerDamage.map((d) => d.amount)).toEqual([3])
    expect(result.cardDamage).toEqual([])
  })

  it('reach blocks flying attackers', () => {
    const drake = attacker('drake', '3/2', 'Flying')
    const spider = defender('spider', '2/3', 'b', 'team2', 'Reach')
    const result = resolveCombat([drake], ['spider'], playersOf({ a: [drake], b: [spider] }), 'a', 'team1')
    expect(deadIds(result)).toEqual(['drake', 'spider'])
  })

  it('tapped creatures cannot block', () => {
    const bear = attacker('bear', '2/2')
    const sleepy = { ...defender('sleepy', '1/4'), tapped: true }
    const result = resolveCombat([bear], ['sleepy'], playersOf({ a: [bear], b: [sleepy] }), 'a', 'team1')
    expect(result.playerDamage.map((d) => d.amount)).toEqual([2])
  })
})
