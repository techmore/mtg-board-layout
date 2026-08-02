import { describe, expect, it } from 'vitest'
import { modeToMaxPlayers, modeToStartingLife, modeToLabel } from 'mtg-protocol'

describe('mtg-protocol helpers', () => {
  it('modeToMaxPlayers matches each game mode', () => {
    expect(modeToMaxPlayers('1v1')).toBe(2)
    expect(modeToMaxPlayers('2v2')).toBe(4)
    expect(modeToMaxPlayers('4ffa')).toBe(4)
  })

  it('modeToStartingLife matches each game mode', () => {
    expect(modeToStartingLife('1v1')).toBe(20)
    expect(modeToStartingLife('2v2')).toBe(30)
    expect(modeToStartingLife('4ffa')).toBe(40)
  })

  it('modeToLabel returns human-readable labels', () => {
    expect(modeToLabel('1v1')).toBe('1 vs 1')
    expect(modeToLabel('2v2')).toBe('2 vs 2 (Two-Headed Giant)')
    expect(modeToLabel('4ffa')).toBe('4-Player Free for All')
  })
})
