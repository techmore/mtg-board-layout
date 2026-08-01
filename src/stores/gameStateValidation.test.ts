import { describe, expect, it } from 'vitest'
import {
  isBoardCard,
  isToken,
  isManaPool,
  isManaProduction,
  isPotentialManaSource,
  isCardScale,
  isManaLogEntry,
  isEffectHistoryEntry,
  isBackgroundOption,
  isOverlayState,
  isTriggerInstance,
  isTurnAnnouncement,
} from './gameStateValidation'

describe('isBoardCard', () => {
  const valid = {
    id: 'c1', scryfallId: 'sf-1', name: 'Forest', imageUri: '/cards/x.jpg',
    zone: 'battlefield', tapped: false, counters: 0, type: 'land', revealed: false,
  }

  it('accepts a valid card', () => {
    expect(isBoardCard(valid)).toBe(true)
  })

  it('rejects missing and malformed fields', () => {
    expect(isBoardCard(null)).toBe(false)
    expect(isBoardCard({ ...valid, zone: 'sideboard' })).toBe(false)
    expect(isBoardCard({ ...valid, type: 'not-a-type' })).toBe(false)
    expect(isBoardCard({ ...valid, counters: Infinity })).toBe(false)
    expect(isBoardCard({ ...valid, counters: -1 })).toBe(true)
    expect(isBoardCard({ ...valid, tapped: 'yes' })).toBe(false)
    expect(isBoardCard({ ...valid, tokenCount: 1.5 })).toBe(false)
    expect(isBoardCard({ ...valid, damage: -3 })).toBe(false)
    expect(isBoardCard({ ...valid, owner: 'spectator' })).toBe(false)
  })

  it('accepts optional fields when well-formed', () => {
    expect(isBoardCard({ ...valid, commanderTax: 2, damage: 1, powerBoost: 0, enchantsCardId: 'c0' })).toBe(true)
  })
})

describe('isToken', () => {
  it('accepts a valid token', () => {
    expect(isToken({ id: 't1', name: 'Goat', imageUri: '', counters: 0, tapped: false })).toBe(true)
  })
  it('rejects malformed tokens', () => {
    expect(isToken({ id: 't1', name: 'Goat', imageUri: '', counters: 'x', tapped: false })).toBe(false)
    expect(isToken(null)).toBe(false)
  })
})

describe('isManaPool', () => {
  it('accepts a valid pool and rejects malformed ones', () => {
    expect(isManaPool({ W: 1, U: 0, B: 0, R: 0, G: 2, C: 0 })).toBe(true)
    expect(isManaPool({ W: -1, U: 0, B: 0, R: 0, G: 0, C: 0 })).toBe(false)
    expect(isManaPool({ W: 1.5, U: 0, B: 0, R: 0, G: 0, C: 0 })).toBe(false)
    expect(isManaPool({ W: 1, U: 0, B: 0, R: 0, G: 0 })).toBe(false)
  })
})

describe('isManaProduction', () => {
  it('accepts valid production and rejects empty or invalid colors', () => {
    expect(isManaProduction({ colors: ['W', 'U'], amount: 1 })).toBe(true)
    expect(isManaProduction({ colors: [], amount: 1 })).toBe(false)
    expect(isManaProduction({ colors: ['X'], amount: 1 })).toBe(false)
    expect(isManaProduction({ colors: ['W'], amount: 0 })).toBe(false)
  })
})

describe('isPotentialManaSource', () => {
  it('accepts valid sources and rejects empty colors', () => {
    expect(isPotentialManaSource({ id: 's1', colors: ['G'] })).toBe(true)
    expect(isPotentialManaSource({ id: 's1', colors: [], sourceCardId: 'x' })).toBe(false)
    expect(isPotentialManaSource({ id: 5, colors: ['G'] })).toBe(false)
  })
})

describe('isCardScale', () => {
  it('accepts the known scales only', () => {
    expect(isCardScale(1)).toBe(true)
    expect(isCardScale(1.5)).toBe(true)
    expect(isCardScale(2)).toBe(true)
    expect(isCardScale(1.3)).toBe(false)
    expect(isCardScale(0)).toBe(false)
  })
})

describe('isManaLogEntry', () => {
  it('accepts a valid entry and rejects malformed ones', () => {
    expect(isManaLogEntry({ id: 'm1', turn: 3, direction: 'spent', color: 'R', amount: 2, usage: 'spell' })).toBe(true)
    expect(isManaLogEntry({ id: 'm1', turn: 3, direction: 'banked', color: 'R', amount: 2 })).toBe(false)
    expect(isManaLogEntry({ id: 'm1', turn: 3, direction: 'spent', color: 'R', amount: 0 })).toBe(false)
    expect(isManaLogEntry({ id: 'm1', turn: 3, direction: 'spent', color: 'P', amount: 2 })).toBe(false)
  })
})

describe('isEffectHistoryEntry', () => {
  it('accepts token entries and rejects others', () => {
    expect(isEffectHistoryEntry({ id: 'e1', turn: 2, kind: 'token', action: 'added', targetCardId: 'c1', targetCardName: 'X', amount: 1 })).toBe(true)
    expect(isEffectHistoryEntry({ id: 'e1', turn: 2, kind: 'pump', action: 'added', targetCardId: 'c1', targetCardName: 'X', amount: 1 })).toBe(false)
  })
})

describe('isBackgroundOption', () => {
  it('accepts data URLs and indexeddb references, rejects others', () => {
    expect(isBackgroundOption({ id: 'b1', name: 'B', dataUrl: 'data:image/png;base64,x' })).toBe(true)
    expect(isBackgroundOption({ id: 'b1', name: 'B', dataUrl: 'indexeddb:b1' })).toBe(true)
    expect(isBackgroundOption({ id: 'b1', name: 'B', dataUrl: 'https://example.com/img.png' })).toBe(false)
    expect(isBackgroundOption({ id: 'b1', name: 'B', dataUrl: 5 })).toBe(false)
  })
})

describe('isOverlayState', () => {
  it('accepts known overlay types and null', () => {
    expect(isOverlayState({ type: null })).toBe(true)
    expect(isOverlayState({ type: 'zoom', cardId: 'c1' })).toBe(true)
    expect(isOverlayState({ type: 'graveyard' })).toBe(true)
    expect(isOverlayState({ type: 'unknown' })).toBe(false)
    expect(isOverlayState(null)).toBe(false)
  })
})

describe('isTriggerInstance', () => {
  it('accepts valid instances and rejects incomplete ones', () => {
    expect(isTriggerInstance({ id: 't1', sourceCardId: 'c1', sourceCardName: 'X', ability: {}, event: {}, selectedTargets: ['c2'] })).toBe(true)
    expect(isTriggerInstance({ id: 't1', sourceCardId: 'c1', sourceCardName: 'X', ability: null, event: {} })).toBe(false)
    expect(isTriggerInstance({ id: 't1', sourceCardId: 'c1', sourceCardName: 'X', ability: {}, event: {}, selectedTargets: [7] })).toBe(false)
  })
})

describe('isTurnAnnouncement', () => {
  it('accepts null and well-formed announcements', () => {
    expect(isTurnAnnouncement(null)).toBe(true)
    expect(isTurnAnnouncement({ id: 1, text: 'YOUR TURN' })).toBe(true)
    expect(isTurnAnnouncement({ id: 1 })).toBe(false)
    expect(isTurnAnnouncement({ text: 'hi' })).toBe(false)
  })
})
