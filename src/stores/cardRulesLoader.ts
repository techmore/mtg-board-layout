import type { CardRuleEntry } from '../types/card'
import { getStaticKeywords } from 'mtg-protocol/combat'

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

export function getCardKeywords(card: { id?: string; name: string; typeLine?: string; keywordBoosts?: string[]; owner?: 'player' | 'opponent' }, cards?: { id: string; typeLine: string; oracleText?: string; owner?: 'player' | 'opponent'; enchantsCardId?: string }[]): Set<string> {
  const rule = getCardRule(card.name, rulesCache)
  const set = new Set(rule?.keywords ?? [])
  for (const keyword of card.keywordBoosts ?? []) set.add(keyword)
  if (cards) {
    const statics = getStaticKeywords(
      { id: card.id ?? '', typeLine: card.typeLine ?? '', ownerId: card.owner ?? 'player', type: 'creature' },
      cards.map((c) => ({ id: c.id, name: '', typeLine: c.typeLine, oracleText: c.oracleText ?? '', ownerId: c.owner ?? 'player', type: 'creature', enchantsCardId: c.enchantsCardId })),
    )
    for (const keyword of statics) set.add(keyword)
  }
  return set
}

export function hasKeyword(card: { id?: string; name: string; typeLine?: string; keywordBoosts?: string[]; owner?: 'player' | 'opponent' }, keyword: string, cards?: { id: string; typeLine: string; oracleText?: string; owner?: 'player' | 'opponent'; enchantsCardId?: string }[]): boolean {
  return getCardKeywords(card, cards).has(keyword)
}

/**
 * Sum of static pump effects ("creatures you control get +1/+1") currently
 * applying to a creature from same-owner battlefield permanents.
 */
export function computeStaticPump(
  cards: { id: string; name: string; type: string; typeLine?: string; zone: string; owner?: 'player' | 'opponent'; enchantsCardId?: string }[],
  card: { id: string; name: string; type: string; owner?: 'player' | 'opponent' },
): { power: number; toughness: number } {
  if (card.type !== 'creature') return { power: 0, toughness: 0 }
  const owner = card.owner ?? 'player'
  let power = 0
  let toughness = 0
  for (const source of cards) {
    if (source.zone !== 'battlefield') continue
    if (source.id === card.id) continue
    const sourceOwner = source.owner ?? 'player'
    // Auras and equipment attach to a single creature: their pump applies
    // only to the card they are attached to.
    if (/\bauras?\b/i.test(source.typeLine ?? '') || /\bequipment\b/i.test(source.typeLine ?? '')) {
      if (source.enchantsCardId !== card.id) continue
    }
    const rule = getCardRule(source.name, rulesCache)
    for (const ability of rule?.abilities ?? []) {
      if (ability.abilityType !== 'static' || ability.effect?.kind !== 'pump') continue
      const params = ability.effect.params as { power?: number; toughness?: number; scope?: string }
      // Scope guards: "creatures you control" only affects the source's own
      // creatures; "creatures your opponents control" only the other side.
      // Fall back to the oracle text for fixtures/rules without a scope field.
      let scope = params.scope
      if (!scope) {
        const text = rule?.oracleText ?? ''
        if (/\byour opponents control\b/i.test(text)) scope = 'opponent'
        else if (/\b(you|your) control\b/i.test(text)) scope = 'own'
        else if (/\beach other creature\b|\bother creatures\b/i.test(text)) scope = 'others'
        else scope = 'all'
      }
      if (scope === 'own' && sourceOwner !== owner) continue
      if (scope === 'opponent' && sourceOwner === owner) continue
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
