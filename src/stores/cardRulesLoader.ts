import type { CardRuleEntry } from '../types/card'

let rulesCache: Record<string, CardRuleEntry> | null = null

export async function loadCardRules(_deckName = 'blight-curse'): Promise<Record<string, CardRuleEntry>> {
  if (rulesCache) return rulesCache
  const res = await fetch('/all-decks-rules.json')
  if (!res.ok) throw new Error('Failed to load card rules')
  const loaded = await res.json() as Record<string, CardRuleEntry>
  rulesCache = loaded
  return loaded
}

export function getCachedCardRules(): Record<string, CardRuleEntry> | null {
  return rulesCache
}

export function getCardRule(
  cardName: string,
  rules: Record<string, CardRuleEntry> | null,
): CardRuleEntry | undefined {
  if (!rules) return undefined
  return rules[cardName] ?? Object.values(rules).find(
    (r) => r.cardName.toLowerCase() === cardName.toLowerCase(),
  )
}

export function getCardKeywords(card: { name: string }): Set<string> {
  const rule = getCardRule(card.name, rulesCache)
  return new Set(rule?.keywords ?? [])
}

export function hasKeyword(card: { name: string }, keyword: string): boolean {
  return getCardKeywords(card).has(keyword)
}

/** Test hook: seed the rules cache without a fetch. */
export function primeCardRules(rules: Record<string, CardRuleEntry>): void {
  rulesCache = rules
}
