import { describe, expect, it } from 'vitest'
import { cardFromState, extractPlayers, normalizePrivateState } from './roomState'

describe('cardFromState', () => {
  it('parses a minimal Schema-like card object into CardData', () => {
    const card = cardFromState({
      id: 'p1:s0:1',
      name: 'Elvish Mystic',
      typeLine: 'Creature — Elf Druid',
      type: 'creature',
      tapped: true,
      counters: 2,
      damage: 1,
    })
    expect(card).not.toBeNull()
    expect(card?.id).toBe('p1:s0:1')
    expect(card?.name).toBe('Elvish Mystic')
    expect(card?.tapped).toBe(true)
    expect(card?.counters).toBe(2)
    expect(card?.damage).toBe(1)
    expect(card?.zone).toBe('battlefield')
    expect(card?.revealed).toBe(true)
    // Type features are hydrated from the type line.
    expect(card?.type).toBe('creature')
    expect(card?.isBasicLand).toBe(false)
  })

  it('returns null for non-card values', () => {
    expect(cardFromState(null)).toBeNull()
    expect(cardFromState('card')).toBeNull()
    expect(cardFromState({ name: 'No Id' })).toBeNull()
    expect(cardFromState({ id: 'no name' })).toBeNull()
  })

  it('defaults missing optional fields safely', () => {
    const card = cardFromState({ id: 'x', name: 'X', typeLine: '', type: 'other' })
    expect(card?.scryfallId).toBe('')
    expect(card?.imageUri).toBe('')
    expect(card?.oracleText).toBe('')
    expect(card?.counters).toBe(0)
    expect(card?.damage).toBe(0)
  })
})

describe('extractPlayers', () => {
  it('parses a Map-like players structure, including battlefield cards', () => {
    const players = new Map([
      ['session-1', {
        sessionId: 'session-1',
        playerId: 'alice',
        name: 'Alice',
        teamId: 'team1',
        turnOrder: 0,
        ready: true,
        connected: true,
        lifeTotal: 30,
        landPlaysThisTurn: 1,
        manaW: 2,
        manaU: 0,
        manaB: 0,
        manaR: 1,
        manaG: 0,
        manaC: 0,
        handCount: 6,
        libraryCount: 20,
        battlefield: [{ id: 'a1', name: 'Bear', typeLine: 'Creature 2/2', type: 'creature' }],
        graveyard: [],
        exile: [],
        command: [],
        tokens: [{ id: 't1', name: 'Goat', imageUri: '', counters: 0, tapped: false }],
        commanderDamage: new Map([['cmd', 12]]),
      }],
    ])
    const result = extractPlayers(players)
    expect(result).toHaveLength(1)
    const alice = result[0]
    expect(alice.name).toBe('Alice')
    expect(alice.teamId).toBe('team1')
    expect(alice.turnOrder).toBe(0)
    expect(alice.ready).toBe(true)
    expect(alice.lifeTotal).toBe(30)
    expect(alice.landPlaysThisTurn).toBe(1)
    expect(alice.mana).toEqual({ W: 2, U: 0, B: 0, R: 1, G: 0, C: 0 })
    expect(alice.handCount).toBe(6)
    expect(alice.libraryCount).toBe(20)
    expect(alice.battlefield).toHaveLength(1)
    expect(alice.battlefield[0].name).toBe('Bear')
    expect(alice.tokens).toHaveLength(1)
    expect(alice.tokens[0].name).toBe('Goat')
    expect(alice.commanderDamage).toEqual({ cmd: 12 })
  })

  it('drops invalid players and defaults missing numbers', () => {
    const players = new Map<string, unknown>([
      ['good', { name: 'Good', lifeTotal: 20, battlefield: [], graveyard: [], exile: [], command: [], tokens: [] }],
      ['bad', 'not a player'],
    ])
    const result = extractPlayers(players)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('good')
    expect(result[0].lifeTotal).toBe(20)
  })

  it('accepts plain-object maps too', () => {
    const players = {
      'session-2': { name: 'Bob', battlefield: [], graveyard: [], exile: [], command: [], tokens: [], lifeTotal: 40 },
    }
    const result = extractPlayers(players)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bob')
  })
})

describe('normalizePrivateState', () => {
  it('parses a privateState message', () => {
    const result = normalizePrivateState({
      type: 'privateState',
      hand: [{ id: 'h1', name: 'Island', typeLine: 'Basic Land — Island', type: 'land' }],
      libraryCount: 32,
    })
    expect(result.hand).toHaveLength(1)
    expect(result.hand[0].name).toBe('Island')
    expect(result.libraryCount).toBe(32)
  })

  it('defaults to an empty hand for garbage input', () => {
    expect(normalizePrivateState(null)).toEqual({ hand: [], libraryCount: 0 })
    expect(normalizePrivateState({ libraryCount: 'many' })).toEqual({ hand: [], libraryCount: 0 })
  })
})
