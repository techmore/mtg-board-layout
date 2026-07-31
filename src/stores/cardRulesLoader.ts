import type { CardRuleEntry } from '../types/card'

let rulesCache: Record<string, CardRuleEntry> | null = null

export async function loadCardRules(deckName = 'blight-curse'): Promise<Record<string, CardRuleEntry>> {
  if (rulesCache) return rulesCache
  const res = await fetch(`/${deckName}-rules.json`)
  if (!res.ok) throw new Error(`Failed to load rules for ${deckName}`)
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
