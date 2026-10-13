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

/**
 * Effect kind of the trigger currently being resolved. A counter-placing trigger (Evolve, "whenever you put a
 * counter on a creature you control, put another") must not be re-triggered by the very counter it just placed,
 * otherwise the stack grows without bound.
 */
let resolvingEffectKind: string | null = null

export function withResolvingEffect<T>(kind: string, run: () => T): T {
  const previous = resolvingEffectKind
  resolvingEffectKind = kind
  try {
    return run()
  } finally {
    resolvingEffectKind = previous
  }
}

export function clearRegistry() {
  triggerRegistry = []
}

export function registerCardTriggers(card: BoardCard, rules: CardRuleEntry | undefined) {
  if (!rules || card.zone !== 'battlefield') return
  for (const ability of rules.abilities) {
    if (ability.abilityType !== 'triggered' || !ability.triggerEvent) continue
    for (const event of ability.triggerEvents ?? [ability.triggerEvent]) {
      triggerRegistry.push({
        cardId: card.id,
        cardName: card.name,
        ability,
        event,
      })
    }
  }
}

export function unregisterCardTriggers(cardId: string) {
  triggerRegistry = triggerRegistry.filter((t) => t.cardId !== cardId)
}

/** Register a card's dies triggers after it has already left the battlefield. */
export function registerDiesTriggers(cardId: string, cardName: string, rules: CardRuleEntry) {
  for (const ability of rules.abilities) {
    if (ability.abilityType === 'triggered' && ability.triggerEvent === 'dies') {
      triggerRegistry.push({ cardId, cardName, ability, event: 'dies' })
    }
  }
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
      for (const event of ability.triggerEvents ?? [ability.triggerEvent]) {
        triggerRegistry.push({
          cardId: card.id,
          cardName: card.name,
          ability,
          event,
        })
      }
    }
  }
}

export function getTriggersForEvent(event: TriggerEvent): RegisteredTrigger[] {
  return triggerRegistry.filter((t) => t.event === event)
}

/**
 * Evaluate a parsed trigger condition ("another creature you control dies",
 * "this creature enters", ...) against the event that just fired. Returns
 * true when the condition is absent or unparseable (conservative).
 */
export function triggerConditionMatches(
  condition: string | null | undefined,
  event: GameEvent,
  sourceCard: { id: string; name: string; type: string; owner?: 'player' | 'opponent' } | undefined,
  eventCard: { id: string; name: string; type: string; owner?: 'player' | 'opponent' } | undefined,
): boolean {
  if (!condition) return true
  const cond = condition.toLowerCase()

  // "Whenever you cast your first spell each turn": the cast event carries the
  // caster-side count for this turn; only the first cast qualifies.
  if (/\bfirst spell\b/.test(cond)) {
    const count = 'count' in event ? event.count : undefined
    if (count === undefined) return true
    return count === 1
  }

  // "your upkeep / your end step / your draw step": only the active player's
  // events qualify, and only for the source's owner.
  if (/\byour\b.*\b(upkeep|end step|draw step)\b/.test(cond)) {
    const eventOwner = 'owner' in event ? event.owner : undefined
    if (!sourceCard || eventOwner === undefined) return true
    return eventOwner === (sourceCard.owner ?? 'player')
  }
  // Timing conditions ("at the beginning of each upkeep", ...) are already
  // encoded by the event type; nothing to evaluate here.
  if (/at the beginning|end step|upkeep|draw step/.test(cond)) return true

  // "one or more -1/-1 counters are put on a creature": only -1/-1 counter
  // events qualify. The engine only emits '+1/+1' counter events today.
  if (/-1\/-1/.test(cond) && !/-1\/-1/.test(String(event.type === 'counter_placed' ? (event as { kind?: string }).kind ?? '' : ''))) return false

  if (eventCard) {
    if (/\banother\b/.test(cond) && sourceCard && eventCard.id === sourceCard.id) return false
    if (/\byou control\b/.test(cond) && sourceCard && (eventCard.owner ?? 'player') !== (sourceCard.owner ?? 'player')) return false
    if (/\b(?:an opponent|your opponents) controls?\b/.test(cond) && sourceCard && (eventCard.owner ?? 'player') === (sourceCard.owner ?? 'player')) return false
    if (/\bthis (creature|enchantment|artifact|land|planeswalker|card|vehicle|equipment|aura|saga|class|permanent|token|spacecraft|battle)\b/.test(cond) && sourceCard && eventCard.id !== sourceCard.id) return false
    // The parser sometimes leaves only a keyword in the condition ("Flying" for Fabricate). Such a condition names
    // no event subject, so the trigger is the card's own: it fires for the card itself and never for other
    // cards entering or for counter events.
    if (!/\b(enters?|dies|whenever|another|counters?|put|attacks?|cast|deals?)\b/.test(cond) && sourceCard) {
      if (event.type === 'counter_placed') return false
      if (event.type === 'etb' && eventCard.id !== sourceCard.id) return false
    }
    if (sourceCard && cond.includes(sourceCard.name.toLowerCase()) && eventCard.id !== sourceCard.id) return false
    if (/\ba creature\b/.test(cond) && eventCard.type !== 'creature') return false
    if (/\ba land\b/.test(cond) && eventCard.type !== 'land') return false
    if (/\ban artifact\b/.test(cond) && eventCard.type !== 'artifact') return false
    if (/\ban enchantment\b/.test(cond) && eventCard.type !== 'enchantment') return false
    if (/\ba planeswalker\b/.test(cond) && eventCard.type !== 'planeswalker') return false
  }
  return true
}

export function buildTriggerInstances(
  event: GameEvent,
  existingStack: TriggerInstance[],
  cards?: { id: string; name: string; type: string; owner?: 'player' | 'opponent' }[],
  tokens?: { id: string; name: string; type?: string; owner?: 'player' | 'opponent' }[],
): { stack: TriggerInstance[]; newTriggers: number } {
  const matching = getTriggersForEvent(event.type)
  if (matching.length === 0) return { stack: existingStack, newTriggers: 0 }

  const eventCardId = 'cardId' in event
    ? event.cardId
    : 'sourceCardId' in event
      ? event.sourceCardId
      : undefined
  let eventCard: { id: string; name: string; type: string; owner?: 'player' | 'opponent' } | undefined
  if (eventCardId) {
    eventCard = cards?.find((c) => c.id === eventCardId)
    if (!eventCard) {
      const token = tokens?.find((t) => t.id === eventCardId)
      if (token) eventCard = { id: token.id, name: token.name, type: token.type ?? 'creature', owner: token.owner }
    }
  }
  const newInstances: TriggerInstance[] = matching
    .filter((t) => {
      if (event.type === 'counter_placed' && resolvingEffectKind === 'put_counter' && t.ability.effect.kind === 'put_counter') return false
      const sourceCard = cards?.find((c) => c.id === t.cardId)
      return triggerConditionMatches(t.ability.triggerCondition, event, sourceCard, eventCard)
    })
    .map((t) => ({
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