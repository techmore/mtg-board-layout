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
    // Only lethal damage is assigned to the blocker; the rest stays on the
    // attacker (no player damage without trample).
    expect(result.cardDamage).toEqual([{ cardId: 'wolf', amount: 1 }, { cardId: 'bear', amount: 1 }])
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

  it('unblocked attackers deal damage in 1v1/4ffa where teamIds are empty', () => {
    const bear = attacker('bear', '2/2')
    const result = resolveCombat([bear], [], playersOf({ a: [bear], b: [] }), 'a', '')
    expect(result.playerDamage.map((d) => d.amount)).toEqual([2])
  })

  it('trample excess deals to the defender in 1v1/4ffa where teamIds are empty', () => {
    const wolf = attacker('wolf', '3/3', 'trample')
    const wall = defender('wall', '0/2')
    const result = resolveCombat([wolf], ['wall'], playersOf({ a: [wolf], b: [wall] }), 'a', '')
    expect(result.playerDamage.map((d) => ({ id: d.attackerId, amount: d.amount }))).toEqual([{ id: 'wolf', amount: 1 }])
  })

  it('does not damage players on the attacker team', () => {
    const bear = attacker('bear', '2/2')
    const ally = defender('ally', '1/1', 'a2', 'team1')
    const result = resolveCombat([bear], [], playersOf({ a: [bear], a2: [ally], b: [] }, { a2: 'team1' }), 'a', 'team1')
    expect(result.playerDamage).toHaveLength(1)
    expect(result.playerDamage[0].defenderId).toBe('b')
  })

  it('a single blocker cannot block a menace attacker', () => {
    const knight = attacker('knight', '3/3', 'Menace')
    const wall = defender('wall', '0/4')
    const result = resolveCombat([knight], ['wall'], playersOf({ a: [knight], b: [wall] }), 'a', 'team1')
    expect(result.playerDamage.map((d) => d.amount)).toEqual([3])
  })

  it('two blockers can block a menace attacker', () => {
    const knight = attacker('knight', '3/3', 'Menace')
    const w1 = defender('w1', '0/2')
    const w2 = defender('w2', '0/2')
    const result = resolveCombat([knight], ['w1', 'w2'], playersOf({ a: [knight], b: [w1, w2] }), 'a', 'team1')
    expect(result.playerDamage).toHaveLength(0)
    expect(result.deadIds).toContain('w1')
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

describe('combat options (ring bearer + parity ban)', () => {
  it('Ring L1: a greater-power creature cannot block the Ring-bearer', () => {
    const bearer = attacker('bearer', '2/2')
    const big = defender('big', '3/3')
    const small = defender('small', '1/1')
    const players = playersOf({ a: [bearer], b: [big, small] })
    // Both declared; only the 1/1 is a legal blocker — the 3/3's assignment is
    // ignored, so it takes no damage and the bearer stays unblocked by it.
    const result = resolveCombat([bearer], ['big', 'small'], players, 'a', 'team1', { ringBearerIds: ['bearer'] })
    expect(result.cardDamage).toEqual([{ cardId: 'small', amount: 1 }, { cardId: 'bearer', amount: 1 }])
    expect(result.deadIds).toEqual(['small'])
    // Without the option both block and both die to the 2-power attack? No —
    // damage splits lethal-first: big takes 2 (survives 3 toughness).
    const plain = resolveCombat([attacker('bearer', '2/2')], ['big', 'small'], playersOf({ a: [attacker('bearer', '2/2')], b: [big, small] }), 'a', 'team1')
    expect(plain.cardDamage.map((d) => d.cardId)).toContain('big')
  })

  it('parity ban filters blockers by mana value (zero counts as even)', () => {
    const atk = attacker('atk', '2/2')
    const even = { ...defender('even', '2/2'), manaCost: '{2}' }
    const odd = { ...defender('odd', '2/2'), manaCost: '{3}' }
    const zero = { ...defender('zero', '2/2'), manaCost: '' }
    const players = playersOf({ a: [atk], b: [even, odd, zero] })
    const result = resolveCombat([atk], ['even', 'odd', 'zero'], players, 'a', 'team1', { parityBan: 'even' })
    // Only the odd-MV creature actually blocks/takes damage.
    expect(result.cardDamage.filter((d) => d.cardId !== 'atk').map((d) => d.cardId)).toEqual(['odd'])
  })
})

describe('combat options (Ring L3/L4 effects)', () => {
  it('L3: blockers that block the Ring-bearer are sacrificed at end of combat', () => {
    // Equal power keeps the block legal under L1; extra toughness lets the
    // blocker survive the exchange so L3 is what removes it.
    const bearer = attacker('bearer', '2/2')
    const blocker = defender('blocker', '2/3')
    const players = playersOf({ a: [bearer], b: [blocker] })
    const result = resolveCombat([bearer], ['blocker'], players, 'a', 'team1', { ringBearerIds: ['bearer'] })
    // The bearer dies to the blocker's 2 damage; the blocker survives the
    // exchange (takes 2 of 3 toughness) but L3 takes it.
    expect(result.deadIds).toEqual(['bearer'])
    expect(result.sacrificeIds).toEqual(['blocker'])
  })

  it('L3: an unblocked Ring-bearer sacrifices nothing', () => {
    const bearer = attacker('bearer', '2/2')
    const players = playersOf({ a: [bearer], b: [] })
    const result = resolveCombat([bearer], [], players, 'a', 'team1', { ringBearerIds: ['bearer'] })
    expect(result.sacrificeIds).toEqual([])
  })

  it('L4: a Ring-bearer dealing combat damage drains each opponent 3', () => {
    const bearer = attacker('bearer', '2/2')
    const players = playersOf({ a: [bearer], b: [] })
    const result = resolveCombat([bearer], [], players, 'a', 'team1', { ringBearerIds: ['bearer'] })
    expect(result.playerDamage).toEqual([{ attackerId: 'bearer', defenderId: 'b', amount: 2 }])
    expect(result.lifeLoss).toEqual([{ playerId: 'b', amount: 3 }])
  })

  it('L4: no drain when the bearer is blocked and deals no player damage', () => {
    const bearer = attacker('bearer', '2/2')
    const blocker = defender('blocker', '2/3')
    const players = playersOf({ a: [bearer], b: [blocker] })
    const result = resolveCombat([bearer], ['blocker'], players, 'a', 'team1', { ringBearerIds: ['bearer'] })
    expect(result.playerDamage).toEqual([])
    expect(result.lifeLoss).toEqual([])
  })

  it('L1+L3 together: an illegal greater-power blocker neither blocks nor dies', () => {
    const bearer = attacker('bearer', '2/2')
    const big = defender('big', '5/5')
    const small = defender('small', '1/1')
    const players = playersOf({ a: [bearer], b: [big, small] })
    const result = resolveCombat([bearer], ['big', 'small'], players, 'a', 'team1', { ringBearerIds: ['bearer'] })
    // big was never a legal blocker: untouched, not sacrificed. small blocked,
    // died in combat — L3 is redundant for it.
    expect(result.cardDamage.find((d) => d.cardId === 'big')).toBeUndefined()
    expect(result.sacrificeIds).toEqual(['small'])
    expect(result.deadIds).toEqual(['small'])
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

  it('tapped creatures can block (only attackers must be untapped)', () => {
    const bear = attacker('bear', '2/2')
    const sleepy = { ...defender('sleepy', '1/4'), tapped: true }
    const result = resolveCombat([bear], ['sleepy'], playersOf({ a: [bear], b: [sleepy] }), 'a', 'team1')
    // The tapped blocker still blocks: no player damage, and the attacker and
    // blocker trade damage.
    expect(result.playerDamage).toEqual([])
    expect(result.cardDamage).toEqual([{ cardId: 'sleepy', amount: 2 }, { cardId: 'bear', amount: 1 }])
    expect(deadIds(result)).toEqual([])
  })

  it('allocates attacker damage across multiple blockers', () => {
    const bear = attacker('bear', '3/3')
    const small = defender('small', '1/1')
    const wall = defender('wall', '0/4')
    const result = resolveCombat([bear], ['small', 'wall'], playersOf({ a: [bear], b: [small, wall] }), 'a', 'team1')
    // Lethal to the first blocker (1), then 2 to the next; both blockers hit
    // back (1 + 0). No player damage.
    expect(result.cardDamage).toEqual([
      { cardId: 'small', amount: 1 },
      { cardId: 'wall', amount: 2 },
      { cardId: 'bear', amount: 1 },
    ])
    expect(deadIds(result)).toEqual(['small'])
    expect(result.playerDamage).toEqual([])
  })

  it('attached equipment pumps the equipped creature in combat', () => {
    const bear = attacker('bear', '2/2')
    const sword = { ...defender('sword', 'Artifact — Equipment'), enchantsCardId: 'bear', oracleText: 'Equipped creature gets +2/+2.' }
    const wolf = defender('wolf', '3/3')
    const result = resolveCombat([bear], ['wolf'], playersOf({ a: [bear, sword], b: [wolf] }), 'a', 'team1')
    // Bear is effectively 4/4: it deals 3 (lethal to the 3/3 wolf) and survives
    // the wolf's 3-damage counterattack.
    expect(deadIds(result)).toEqual(['wolf'])
    expect(result.cardDamage).toEqual([{ cardId: 'wolf', amount: 3 }, { cardId: 'bear', amount: 3 }])
  })

  it('applies static anthem pumps to effective P/T', () => {
    const bear = attacker('bear', '2/2')
    const wolf = defender('wolf', '2/2')
    const anthem = defender('anthem', 'Enchantment', 'b', 'team2', 'Creatures you control get +1/+1.')
    const result = resolveCombat([bear], ['wolf'], playersOf({ a: [bear], b: [wolf, anthem] }), 'a', 'team1')
    // The wolf is effectively 3/3: the bear deals 2 (not lethal), the wolf
    // deals 3 and kills the bear.
    expect(deadIds(result)).toEqual(['bear'])
    expect(result.cardDamage).toEqual([{ cardId: 'wolf', amount: 2 }, { cardId: 'bear', amount: 3 }])
    expect(result.playerDamage).toEqual([])
  })

  it('does not apply an opponent anthem to the attacker', () => {
    const bear = attacker('bear', '2/2')
    const wolf = defender('wolf', '1/1')
    const anthem = defender('anthem', 'Enchantment', 'b', 'team2', 'Creatures you control get +1/+1.')
    const result = resolveCombat([bear], ['wolf'], playersOf({ a: [bear], b: [wolf, anthem] }), 'a', 'team1')
    // Only the defender's creatures are buffed: the wolf is effectively 2/2, so
    // it takes 2 (not the 3 a buffed attacker would deal) and its counterattack
    // of 2 kills the unbuffed 2/2 bear.
    expect(deadIds(result)).toEqual(['bear', 'wolf'])
    expect(result.cardDamage).toEqual([{ cardId: 'wolf', amount: 2 }, { cardId: 'bear', amount: 2 }])
  })

  it('a trampler spills leftover damage past its blockers to the player', () => {
    const wurm = attacker('wurm', '5/5', 'Trample')
    const small = defender('small', '1/1')
    const wall = defender('wall', '1/3')
    const result = resolveCombat([wurm], ['small', 'wall'], playersOf({ a: [wurm], b: [small, wall] }), 'a', 'team1')
    // 1 lethal to small, then 3 to wall (min of remaining 4 / toughness 3),
    // and 1 spills over. Both blockers hit back (1 + 1).
    expect(result.cardDamage).toEqual([
      { cardId: 'small', amount: 1 },
      { cardId: 'wall', amount: 3 },
      { cardId: 'wurm', amount: 2 },
    ])
    expect(result.playerDamage.map((d) => d.amount)).toEqual([1])
    expect(deadIds(result)).toEqual(['small', 'wall'])
  })
})
