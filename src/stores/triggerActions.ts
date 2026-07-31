import type { GameState } from './gameStore'
import type { Token } from '../types/card'
import { CARD_BACK_URL } from '../constants'

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
      get().drawCards((params.amount as number) ?? 1)
      break
    }
    case 'gain_life': {
      const amount = (params.amount as number) ?? 1
      get().setLife(state.lifeTotal + amount)
      break
    }
    case 'lose_life': {
      const amount = (params.amount as number) ?? 1
      get().setLife(state.lifeTotal - amount)
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
      }
      get().addToken(token)
      break
    }
    case 'put_counter': {
      get().addCounter(trigger.sourceCardId)
      break
    }
    case 'sacrifice':
      get().moveCard(trigger.sourceCardId, 'graveyard')
      break
    case 'deal_damage':
    case 'destroy':
    case 'exile':
      break
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
    default:
      break
  }

  const triggerStack = get().triggerStack.filter((t) => t.id !== triggerId)
  if (triggerStack.length !== get().triggerStack.length) {
    set({ triggerStack })
  }
}

export function selectTarget(get: () => GameState, set: (partial: Partial<GameState>) => void, triggerId: string, cardId: string) {
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
    const effect = trigger.ability.effect
    const params = effect.params as Record<string, unknown>
    switch (effect.kind) {
      case 'put_counter':
        get().addCounter(cardId)
        break
      case 'destroy': {
        const target = state.cards.find((c) => c.id === cardId)
        if (target) get().moveCard(cardId, 'graveyard')
        break
      }
      case 'deal_damage': {
        const amount = (params.amount as number) ?? 1
        const target = state.cards.find((c) => c.id === cardId)
        if (target) {
          for (let i = 0; i < amount; i++) get().addCounter(cardId)
        }
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
      triggerStack: state.triggerStack.filter((t) => t.id !== triggerId),
    })
  } else {
    set({
      triggerStack: state.triggerStack.map((t) =>
        t.id === triggerId ? updated : t,
      ),
    })
  }
}
