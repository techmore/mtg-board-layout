export interface CardRuleOverride {
  manaCost?: string
  manaValue?: number
  entersTapped?: boolean
}

/**
 * Manual exceptions for cards whose rules need a deck-specific or conditional
 * interpretation. Prefer Scryfall's Oracle text for ordinary cards; add an
 * exact Scryfall ID here when a card needs an explicit override.
 */
export const CARD_RULE_OVERRIDES: Record<string, CardRuleOverride> = {
  // 'scryfall-id-or-card-name': { entersTapped: true },
}

type CardRuleInput = {
  scryfallId?: string
  name: string
  manaCost?: string
  manaValue?: number
  oracleText?: string
  entersTapped?: boolean
}

function normalizeName(name: string) {
  return name.trim().toLowerCase()
}

function getOverride(card: CardRuleInput) {
  if (card.scryfallId && CARD_RULE_OVERRIDES[card.scryfallId]) return CARD_RULE_OVERRIDES[card.scryfallId]
  const nameKey = Object.keys(CARD_RULE_OVERRIDES).find((key) => normalizeName(key) === normalizeName(card.name))
  return nameKey ? CARD_RULE_OVERRIDES[nameKey] : undefined
}

function inferEntersTapped(oracleText: string) {
  // Conditional text such as "enters tapped unless..." needs a manual/stateful
  // decision, so only guaranteed tapped entries are applied automatically.
  return /\benters(?: the battlefield)? tapped\b/i.test(oracleText) && !/\bunless\b/i.test(oracleText)
}

export function resolveCardRules(card: CardRuleInput) {
  const override = getOverride(card)
  return {
    manaCost: override?.manaCost ?? card.manaCost ?? '',
    manaValue: override?.manaValue ?? card.manaValue,
    entersTapped: override?.entersTapped ?? card.entersTapped ?? inferEntersTapped(card.oracleText ?? ''),
  }
}
