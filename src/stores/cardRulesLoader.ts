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

/**
 * Sum of static pump effects ("creatures you control get +1/+1") currently
 * applying to a creature from same-owner battlefield permanents.
 */
export function computeStaticPump(
  cards: { id: string; name: string; type: string; zone: string; owner?: 'player' | 'opponent' }[],
  card: { id: string; name: string; type: string; owner?: 'player' | 'opponent' },
): { power: number; toughness: number } {
  if (card.type !== 'creature') return { power: 0, toughness: 0 }
  const owner = card.owner ?? 'player'
  let power = 0
  let toughness = 0
  for (const source of cards) {
    if (source.zone !== 'battlefield' || (source.owner ?? 'player') !== owner) continue
    if (source.id === card.id) continue
    const rule = getCardRule(source.name, rulesCache)
    for (const ability of rule?.abilities ?? []) {
      if (ability.abilityType !== 'static' || ability.effect?.kind !== 'pump') continue
      const params = ability.effect.params as { power?: number; toughness?: number }
      power += params.power ?? 0
      toughness += params.toughness ?? 0
    }
  }
  return { power, toughness }
}

/** Test hook: seed the rules cache without a fetch. */
export function primeCardRules(rules: Record<string, CardRuleEntry>): void {
  rulesCache = rules
}
