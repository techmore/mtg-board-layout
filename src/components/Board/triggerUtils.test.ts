import { describe, expect, it } from 'vitest'
import { groupModalRuns, modalChoiceCount } from './triggerUtils'
import type { CardAbilityDef, TriggerInstance } from '../../types/card'

function mode(id: string, overrides: Partial<CardAbilityDef> = {}): TriggerInstance {
  return {
    id,
    sourceCardId: 'pyre',
    sourceCardName: 'Pyre',
    ability: {
      abilityType: 'spell',
      triggerEvent: null,
      triggerCondition: null,
      isOptional: true,
      cost: null,
      targets: 0,
      targetFilter: null,
      effect: { kind: 'draw_cards', params: { amount: 2 } },
      ...overrides,
    },
    event: 'cast',
    context: {},
  }
}

describe('modalChoiceCount', () => {
  it('parses the chosen count from oracle text', () => {
    expect(modalChoiceCount('Choose one — Draw a card; destroy a creature')).toBe(1)
    expect(modalChoiceCount('Choose two —')).toBe(2)
    expect(modalChoiceCount('Choose three —')).toBe(3)
    expect(modalChoiceCount('Kicker {2}')).toBe(1)
    expect(modalChoiceCount(undefined)).toBe(1)
  })
})

describe('groupModalRuns', () => {
  it('groups consecutive optional modes of one source', () => {
    const stack = [mode('a'), mode('b'), mode('c')]
    const runs = groupModalRuns(stack, () => 'Choose one —')
    expect(runs).toHaveLength(1)
    expect(runs[0].ids).toEqual(['a', 'b', 'c'])
    expect(runs[0].maxChoices).toBe(1)
  })

  it('honors choose-two limits capped at available modes', () => {
    const runs = groupModalRuns([mode('a'), mode('b')], () => 'Choose two —')
    expect(runs[0].maxChoices).toBe(2)
  })

  it('does not group across different sources', () => {
    const other = { ...mode('b'), sourceCardId: 'other', sourceCardName: 'Other' }
    expect(groupModalRuns([mode('a'), other], () => '')).toEqual([])
  })

  it('does not group non-optional abilities or modes already targeting', () => {
    const mandatory = mode('m', { isOptional: false })
    expect(groupModalRuns([mandatory, mode('a')], () => 'Choose one —')).toEqual([])
    const targeting = { ...mode('t'), selectedTargets: [] }
    expect(groupModalRuns([targeting, mode('a')], () => 'Choose one —')).toEqual([])
  })

  it('breaks groups when a non-modal instance sits between runs', () => {
    const other = { ...mode('x'), sourceCardId: 'other', sourceCardName: 'Other' }
    const stack = [mode('a'), other, mode('c')]
    // a/x differ (no group); x/c differ → no groups at all.
    expect(groupModalRuns(stack, () => 'Choose one —')).toEqual([])
    // Same-source instances separated by another card do not merge either.
    const stack2 = [mode('a'), other, { ...mode('b'), sourceCardId: 'pyre' }]
    expect(groupModalRuns(stack2, () => 'Choose one —')).toEqual([])
  })
})
