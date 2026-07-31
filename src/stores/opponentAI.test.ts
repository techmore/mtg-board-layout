import { describe, expect, it } from 'vitest'
import type { BoardCard, ManaPool } from '../types/card'
import { pickCommanderCast } from './opponentAI'

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
