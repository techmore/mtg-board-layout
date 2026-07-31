import type {
  CardAbilityDef, CardRuleEntry, GameEvent, TriggerEvent, TriggerInstance,
} from '../types/card'
import type { BoardCard } from '../types/card'

export interface RegisteredTrigger {
  cardId: string
  cardName: string
  ability: CardAbilityDef
  event: TriggerEvent
}

let triggerRegistry: RegisteredTrigger[] = []

export function clearRegistry() {
  triggerRegistry = []
}

export function registerCardTriggers(card: BoardCard, rules: CardRuleEntry | undefined) {
  if (!rules || card.zone !== 'battlefield') return
  for (const ability of rules.abilities) {
    if (ability.abilityType !== 'triggered' || !ability.triggerEvent) continue
    triggerRegistry.push({
      cardId: card.id,
      cardName: card.name,
      ability,
      event: ability.triggerEvent,
    })
  }
}

export function unregisterCardTriggers(cardId: string) {
  triggerRegistry = triggerRegistry.filter((t) => t.cardId !== cardId)
}

export function reindexTriggers(cards: BoardCard[], rulesMap: Record<string, CardRuleEntry> | null) {
  triggerRegistry = []
  for (const card of cards) {
    if (card.zone !== 'battlefield') continue
    const rule = rulesMap?.[card.name] ?? Object.values(rulesMap ?? {}).find(
      (r) => r.cardName.toLowerCase() === card.name.toLowerCase(),
    )
    if (!rule) continue
    for (const ability of rule.abilities) {
      if (ability.abilityType !== 'triggered' || !ability.triggerEvent) continue
      triggerRegistry.push({
        cardId: card.id,
        cardName: card.name,
        ability,
        event: ability.triggerEvent,
      })
    }
  }
}

export function getTriggersForEvent(event: TriggerEvent): RegisteredTrigger[] {
  return triggerRegistry.filter((t) => t.event === event)
}

export function buildTriggerInstances(
  event: GameEvent,
  existingStack: TriggerInstance[],
): { stack: TriggerInstance[]; newTriggers: number } {
  const matching = getTriggersForEvent(event.type)
  if (matching.length === 0) return { stack: existingStack, newTriggers: 0 }

  const newInstances: TriggerInstance[] = matching.map((t) => ({
    id: crypto.randomUUID(),
    sourceCardId: t.cardId,
    sourceCardName: t.cardName,
    ability: t.ability,
    event: event.type,
    context: { gameEvent: event },
  }))

  return {
    stack: [...existingStack, ...newInstances],
    newTriggers: newInstances.length,
  }
}