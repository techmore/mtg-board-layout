import type { GameState } from './gameStore'
import type { Token, TriggerInstance } from '../types/card'
import { CARD_BACK_URL } from '../constants'
import { canPayManaCost } from '../utils/misc'
import { hasKeyword } from './cardRulesLoader'
import { useToastStore } from './toastStore'

export function resolveTrigger(get: () => GameState, set: (partial: Partial<GameState>) => void, triggerId: string) {
  const state = get()
  const trigger = state.triggerStack.find((t) => t.id === triggerId)
  if (!trigger) return

  const needsTarget = trigger.ability.targets > 0

  if (needsTarget) {
    if (trigger.selectedTargets !== undefined) {
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: undefined } : t,
        ),
      })
    } else {
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: [] } : t,
        ),
      })
    }
    return
  }

  const effect = trigger.ability.effect
  const params = effect.params as Record<string, unknown>

  switch (effect.kind) {
    case 'draw_cards': {
      const amount = (params.amount as number) ?? 1
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if ((source?.owner ?? 'player') === 'opponent') {
        let remaining = Math.max(0, Math.floor(amount))
        set({
          cards: state.cards.map((c) => {
            if (remaining > 0 && (c.owner ?? 'player') === 'opponent' && c.zone === 'library') {
              remaining--
              return { ...c, zone: 'hand' as const }
            }
            return c
          }),
        })
      } else {
        get().drawCards(amount)
      }
      break
    }
    case 'gain_life': {
      const amount = (params.amount as number) ?? 1
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if ((source?.owner ?? 'player') === 'opponent') {
        get().setOpponentLife(state.opponentLifeTotal + amount)
      } else {
        get().setLife(state.lifeTotal + amount)
      }
      break
    }
    case 'lose_life': {
      const amount = (params.amount as number) ?? 1
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if ((source?.owner ?? 'player') === 'opponent') {
        get().setOpponentLife(state.opponentLifeTotal - amount)
      } else {
        get().setLife(state.lifeTotal - amount)
      }
      break
    }
    case 'create_token': {
      const tokenName = (params.tokenName as string) ?? 'Token'
      const token: Token = {
        id: crypto.randomUUID(),
        name: tokenName,
        imageUri: CARD_BACK_URL,
        counters: 0,
        tapped: false,
        power: params.tokenPower as number | undefined,
        toughness: params.tokenToughness as number | undefined,
      }
      get().addToken(token)
      break
    }
      case 'put_counter': {
        get().addCounter(trigger.sourceCardId)
        break
      }
      case 'pump': {
        // With no explicit targets the parser encodes mass pumps ("all creatures
        // get +1/+1 until end of turn").
        if (trigger.ability.targets > 0) break
        const power = (params.power as number) ?? 0
        const toughness = (params.toughness as number) ?? 0
        const victims = state.cards.filter((c) => c.zone === 'battlefield' && c.type === 'creature')
        set({
          cards: state.cards.map((c) =>
            victims.some((v) => v.id === c.id)
              ? { ...c, powerBoost: (c.powerBoost ?? 0) + power, toughnessBoost: (c.toughnessBoost ?? 0) + toughness }
              : c,
          ),
        })
        break
      }
    case 'sacrifice':
      get().moveCard(trigger.sourceCardId, 'graveyard')
      break
    case 'deal_damage': {
      // With no explicit targets the parser encodes mass effects (e.g. "deals 3
      // damage to each creature").
      if (trigger.ability.targets > 0) break
      const amount = (params.amount as number) ?? 1
      const victims = state.cards.filter((c) => c.zone === 'battlefield' && c.type === 'creature')
      for (const victim of victims) get().addDamage(victim.id, amount)
      break
    }
    case 'destroy': {
      if (trigger.ability.targets > 0) break
      const victims = state.cards.filter((c) => c.zone === 'battlefield' && c.type === 'creature')
      for (const victim of victims) get().moveCard(victim.id, 'graveyard')
      break
    }
    case 'exile': {
      if (trigger.ability.targets > 0) break
      const victims = state.cards.filter((c) => c.zone === 'battlefield' && c.type === 'creature')
      for (const victim of victims) get().moveCard(victim.id, 'exile')
      break
    }
    case 'return_from_graveyard': {
      const zone = (params.zone as string) ?? 'battlefield'
      get().moveCard(trigger.sourceCardId, zone as 'battlefield' | 'hand')
      break
    }
    case 'scry':
      // Enter scry mode via selectedTargets
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: [] } : t,
        ),
      })
      return
    case 'search_library':
      // Enter search mode via selectedTargets (single-select from library)
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: [] } : t,
        ),
      })
      return
    case 'proliferate':
      // Enter multi-select mode via selectedTargets like targeting
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: [] } : t,
        ),
      })
      return
    case 'add_mana': {
      const card = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (card?.manaProduction) {
        for (const color of card.manaProduction.colors) {
          get().addMana(color, { cardId: card.id, cardName: card.name })
        }
      }
      break
    }
    case 'other': {
      useToastStore.getState().push(
        `"${trigger.sourceCardName}" ability is not implemented yet — it had no effect.`,
        'error',
      )
      break
    }
    default:
      break
  }

  const triggerStack = get().triggerStack.filter((t) => t.id !== triggerId)
  if (triggerStack.length !== get().triggerStack.length) {
    set({ triggerStack })
  }
}

export function selectTarget(get: () => GameState, set: (partial: Partial<GameState>) => void, triggerId: string, cardId: string, bypassWard = false) {
  const state = get()
  const trigger = state.triggerStack.find((t) => t.id === triggerId)
  if (!trigger) return
  const needed = trigger.ability.targets
  const have = trigger.selectedTargets?.length ?? 0
  if (have >= needed) return

  const updated = {
    ...trigger,
    selectedTargets: [...(trigger.selectedTargets ?? []), cardId],
  }

  if (updated.selectedTargets.length >= needed) {
    // Ward: a targeted permanent with ward counters the spell unless its
    // controller pays. Defer resolution until the payer decides.
    const target = state.cards.find((c) => c.id === cardId)
    const source = state.cards.find((c) => c.id === trigger.sourceCardId)
    const wardCost = target && hasKeyword(target, 'ward') ? 2 : 0
    const wardTriggers = wardCost > 0 && !bypassWard && (source?.owner ?? 'player') !== (target?.owner ?? 'player')
    if (wardTriggers && target) {
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? updated : t,
        ),
        wardPrompt: {
          triggerId,
          targetCardId: cardId,
          cost: wardCost,
          spellName: trigger.sourceCardName,
          targetName: target.name,
        },
      })
      return
    }
    applyTargetedEffect(get, set, state, trigger, cardId)
  } else {
    set({
      triggerStack: state.triggerStack.map((t) =>
        t.id === triggerId ? updated : t,
      ),
    })
  }
}

function applyTargetedEffect(get: () => GameState, set: (partial: Partial<GameState>) => void, state: GameState, trigger: TriggerInstance, cardId: string) {
  const effect = trigger.ability.effect
  const params = effect.params as Record<string, unknown>
  switch (effect.kind) {
    case 'put_counter':
      get().addCounter(cardId)
      break
    case 'pump': {
      const power = (params.power as number) ?? 0
      const toughness = (params.toughness as number) ?? 0
      set({
        cards: state.cards.map((c) =>
          c.id === cardId
            ? { ...c, powerBoost: (c.powerBoost ?? 0) + power, toughnessBoost: (c.toughnessBoost ?? 0) + toughness }
            : c,
        ),
      })
      break
    }
    case 'destroy': {
      const target = state.cards.find((c) => c.id === cardId)
      if (target) get().moveCard(cardId, 'graveyard')
      break
    }
    case 'deal_damage': {
      const amount = (params.amount as number) ?? 1
      const target = state.cards.find((c) => c.id === cardId)
      if (target) get().addDamage(cardId, amount)
      break
    }
    case 'return_from_graveyard': {
      const zone = (params.zone as string) ?? 'battlefield'
      get().moveCard(cardId, zone as 'battlefield' | 'hand')
      break
    }
    case 'exile':
      get().moveCard(cardId, 'exile')
      break
  }
  set({
    triggerStack: state.triggerStack.filter((t) => t.id !== trigger.id),
  })
  get().checkStateBasedActions()
}

export function payWardImpl(get: () => GameState, set: (partial: Partial<GameState>) => void) {
  const state = get()
  const prompt = state.wardPrompt
  if (!prompt) return
  const trigger = state.triggerStack.find((t) => t.id === prompt.triggerId)
  if (!trigger) {
    set({ wardPrompt: null })
    return
  }
  const cost = `{${prompt.cost}}`
  if (!canPayManaCost(state.manaPool, cost)) {
    // Cannot pay — the spell is countered.
    set({
      wardPrompt: null,
      triggerStack: state.triggerStack.filter((t) => t.id !== prompt.triggerId),
    })
    return
  }
  get().spendManaCost(cost, `Ward (${prompt.spellName})`)
  applyTargetedEffect(get, set, get(), trigger, prompt.targetCardId)
  set({ wardPrompt: null })
}

export function refuseWardImpl(get: () => GameState, set: (partial: Partial<GameState>) => void) {
  const state = get()
  const prompt = state.wardPrompt
  if (!prompt) return
  set({
    wardPrompt: null,
    triggerStack: state.triggerStack.filter((t) => t.id !== prompt.triggerId),
  })
}
