import type { BoardCard, CardAbilityDef, TriggerEvent, TriggerInstance } from '../types/card'
import type { GameState } from './gameStore'
import { getCachedCardRules, getCardRule, hasKeyword } from './cardRulesLoader'
import { targetsForEffect, filterMatch } from '../components/Board/triggerUtils'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

/**
 * Pick the AI's auto-target from the candidate list. Removal effects (destroy,
 * exile, damage, negative pumps, fight) prefer the player's cards; beneficial
 * effects (buffs, counters, recursion) prefer the AI's own.
 */
function autoTarget(kind: string, params: Record<string, unknown> | undefined, candidates: BoardCard[]): BoardCard | null {
  if (candidates.length === 0) return null
  const power = Number(params?.power ?? 0)
  const toughness = Number(params?.toughness ?? 0)
  const harmful = ['destroy', 'exile', 'deal_damage', 'fight', 'sacrifice'].includes(kind) ||
    (kind === 'pump' && (power < 0 || toughness < 0)) ||
    (kind === 'put_counter' && (params?.amount === -1 || String(params?.counterKind ?? '').includes('-1/-1')))
  const preferredOwner: 'player' | 'opponent' = harmful ? 'player' : 'opponent'
  const ranked = [...candidates].sort((a, b) => {
    const aScore = (a.owner ?? 'player') === preferredOwner ? 1 : 0
    const bScore = (b.owner ?? 'player') === preferredOwner ? 1 : 0
    if (aScore !== bScore) return bScore - aScore
    // Prefer the strongest creature for buffs, the weakest for removal.
    if (kind === 'pump' && harmful) return getToughness(b) - getToughness(a)
    if (kind === 'pump') return getToughness(a) - getToughness(b)
    if (kind === 'deal_damage') return getToughness(b) - getToughness(a)
    return 0
  })
  return ranked[0] ?? null
}

function getToughness(card: BoardCard): number {
  return parseInt(card.typeLine?.match(/\/(\d+)/)?.[1] ?? '0', 10) + (card.toughnessBoost ?? 0) + (card.counters ?? 0)
}

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
    autoResolveInstance(set, get, card, ability)
  }
}

/** Auto-resolve a single activated ability the AI used (tap abilities, loyalty, draw, etc.). */
export function resolveAIActivatedAbility(set: SetFn, get: () => GameState, card: BoardCard, ability: CardAbilityDef) {
  autoResolveInstance(set, get, card, ability)
}

function autoResolveInstance(set: SetFn, get: () => GameState, card: BoardCard, ability: CardAbilityDef) {
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
    const target = autoTarget(ability.effect.kind, ability.effect.params, candidates)
    if (!target) {
      set((prev) => ({ triggerStack: prev.triggerStack.filter((t) => t.id !== instance.id) }))
      return
    }

    // Ward: the AI pays when it can afford it, otherwise the spell fizzles.
    if (hasKeyword(target, 'ward') && (target.owner ?? 'player') !== 'opponent') {
      const pool = get().opponentManaPool
      const total = Object.values(pool).reduce((sum, amount) => sum + amount, 0)
      if (total < 2) {
        set((prev) => ({ triggerStack: prev.triggerStack.filter((t) => t.id !== instance.id) }))
        return
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

export function resolveAISpellAbilities(set: SetFn, get: () => GameState, card: BoardCard) {
  return resolveAIAutoAbilities(set, get, card, 'cast')
}

/**
 * Auto-resolve any trigger-stack instances that belong to the AI (e.g. its
 * death triggers fired during combat resolution), so they never land on the
 * player's stack UI.
 */
export function resolveAITriggerInstances(set: SetFn, get: () => GameState) {
  const state = get()
  const aiInstances = state.triggerStack.filter((t) => {
    const source = state.cards.find((c) => c.id === t.sourceCardId)
    return (source?.owner ?? 'player') === 'opponent'
  })
  if (aiInstances.length === 0) return

  for (const instance of aiInstances) {
    const source = get().cards.find((c) => c.id === instance.sourceCardId)
    if (!source) {
      set((prev) => ({ triggerStack: prev.triggerStack.filter((t) => t.id !== instance.id) }))
      continue
    }
    const ability = instance.ability
    if (ability.targets > 0) {
      const candidates = targetsForEffect(ability.effect.kind, get().cards)
        .filter((c) => c.id !== source.id)
        .filter((c) => filterMatch(ability.targetFilter, c))
        .filter((c) => !(hasKeyword(c, 'hexproof') && (c.owner ?? 'player') !== 'opponent'))
      const target = autoTarget(ability.effect.kind, ability.effect.params, candidates)
      if (!target) {
        set((prev) => ({ triggerStack: prev.triggerStack.filter((t) => t.id !== instance.id) }))
        continue
      }
      if (hasKeyword(target, 'ward') && (target.owner ?? 'player') !== 'opponent') {
        const pool = get().opponentManaPool
        const total = Object.values(pool).reduce((sum, amount) => sum + amount, 0)
        if (total >= 2) {
          let remaining = 2
          const nextPool = { ...pool }
          for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
            while (remaining > 0 && nextPool[color] > 0) {
              nextPool[color] -= 1
              remaining -= 1
            }
          }
          set({ opponentManaPool: nextPool })
        } else {
          set((prev) => ({ triggerStack: prev.triggerStack.filter((t) => t.id !== instance.id) }))
          continue
        }
      }
      get().selectTarget(instance.id, target.id, true)
    } else {
      get().resolveTrigger(instance.id)
    }
  }
}
