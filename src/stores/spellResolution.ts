import type { BoardCard, TriggerEvent, TriggerInstance } from '../types/card'
import type { GameState } from './gameStore'
import { getCachedCardRules, getCardRule, hasKeyword } from './cardRulesLoader'
import { targetsForEffect, filterMatch } from '../components/Board/triggerUtils'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

/** Push a cast card's parsed spell abilities onto the trigger stack for manual resolution. */
export function enqueueSpellAbilities(set: SetFn, _get: () => GameState, card: BoardCard) {
  const rule = getCardRule(card.name, getCachedCardRules())
  const abilities = (rule?.abilities ?? []).filter((a) => a.abilityType === 'spell')
  if (abilities.length === 0) return
  const instances: TriggerInstance[] = abilities.map((ability) => ({
    id: crypto.randomUUID(),
    sourceCardId: card.id,
    sourceCardName: card.name,
    ability,
    event: 'cast' as TriggerEvent,
    context: {},
  }))
  set((prev) => ({ triggerStack: [...prev.triggerStack, ...instances] }))
}

/**
 * Auto-resolve abilities for a card the AI just cast or put onto the
 * battlefield. For a cast spell this resolves its spell abilities; for a
 * permanent entering the battlefield it resolves its ETB triggered abilities.
 * Targeted abilities pick the first valid target (respecting the target filter,
 * hexproof, and ward payment); untargeted abilities resolve immediately.
 * Unknown effect kinds fizzle silently.
 */
export function resolveAIAutoAbilities(set: SetFn, get: () => GameState, card: BoardCard, event: 'cast' | TriggerEvent) {
  const rule = getCardRule(card.name, getCachedCardRules())
  const abilities = (rule?.abilities ?? []).filter((a) =>
    a.abilityType === 'spell'
      ? event === 'cast'
      : a.abilityType === 'triggered' && a.triggerEvent === event,
  )
  for (const ability of abilities) {
    const instance: TriggerInstance = {
      id: crypto.randomUUID(),
      sourceCardId: card.id,
      sourceCardName: card.name,
      ability,
      event: 'cast' as TriggerEvent,
      context: {},
    }
    set((prev) => ({ triggerStack: [...prev.triggerStack, instance] }))
    if (ability.targets > 0) {
      const candidates = targetsForEffect(ability.effect.kind, get().cards)
        .filter((c) => c.id !== card.id)
        .filter((c) => filterMatch(ability.targetFilter, c))
        .filter((c) => !(hasKeyword(c, 'hexproof') && (c.owner ?? 'player') !== 'opponent'))
      if (candidates.length === 0) continue
      const target = candidates[0]

      // Ward: the AI pays when it can afford it, otherwise the spell fizzles.
      if (hasKeyword(target, 'ward') && (target.owner ?? 'player') !== 'opponent') {
        const pool = get().opponentManaPool
        const total = Object.values(pool).reduce((sum, amount) => sum + amount, 0)
        if (total < 2) {
          set((prev) => ({ triggerStack: prev.triggerStack.filter((t) => t.id !== instance.id) }))
          continue
        }
        let remaining = 2
        const nextPool = { ...pool }
        for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
          while (remaining > 0 && nextPool[color] > 0) {
            nextPool[color] -= 1
            remaining -= 1
          }
        }
        set({ opponentManaPool: nextPool })
      }

      get().selectTarget(instance.id, target.id, true)
    } else {
      get().resolveTrigger(instance.id)
    }
  }
}

export function resolveAISpellAbilities(set: SetFn, get: () => GameState, card: BoardCard) {
  return resolveAIAutoAbilities(set, get, card, 'cast')
}
