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
 * Resolve a spell the AI cast, automatically. Targeted abilities pick the first
 * valid target (respecting the target filter and hexproof); untargeted abilities
 * resolve immediately. Unknown effect kinds fizzle silently.
 */
export function resolveAISpellAbilities(set: SetFn, get: () => GameState, card: BoardCard) {
  const rule = getCardRule(card.name, getCachedCardRules())
  const abilities = (rule?.abilities ?? []).filter((a) => a.abilityType === 'spell')
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
      get().selectTarget(instance.id, candidates[0].id)
    } else {
      get().resolveTrigger(instance.id)
    }
  }
}
