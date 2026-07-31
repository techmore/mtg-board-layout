import type { EntryTapMode, EntryTapRule, ManaColor, ManaProduction } from '../types/card'
import { useCardRuleStore } from '../stores/cardRuleStore'
import { getCardDatabaseEntry } from './cardDatabase'

export interface CardRuleOverride {
  manaCost?: string
  manaValue?: number
  entryTapMode?: EntryTapMode
  entersTapped?: boolean
  entryTapRule?: EntryTapRule
  manaProduction?: ManaProduction
}

/**
 * Manual exceptions for cards whose rules need a deck-specific or conditional
 * interpretation. Prefer Scryfall's Oracle text for ordinary cards; add an
 * exact Scryfall ID here when a card needs an explicit override.
 */
export const CARD_RULE_OVERRIDES: Record<string, CardRuleOverride> = {
}

type CardRuleInput = {
  scryfallId?: string
  name: string
  manaCost?: string
  manaValue?: number
  oracleText?: string
  producedMana?: string[]
  manaProduction?: ManaProduction
  entryTapMode?: EntryTapMode
  entersTapped?: boolean
  entryTapRule?: EntryTapRule
}

function normalizeName(name: string) {
  return name.trim().toLowerCase()
}

function getOverride(card: CardRuleInput) {
  if (card.scryfallId && CARD_RULE_OVERRIDES[card.scryfallId]) return CARD_RULE_OVERRIDES[card.scryfallId]
  const nameKey = Object.keys(CARD_RULE_OVERRIDES).find((key) => normalizeName(key) === normalizeName(card.name))
  return nameKey ? CARD_RULE_OVERRIDES[nameKey] : undefined
}

function inferEntryTapRule(oracleText: string): EntryTapRule {
  const normalizedText = oracleText.replace(/\s+/g, ' ')
  // Match any clause about entering tapped — supports ~ (cardname), CARDNAME, "enters", "enters the battlefield", "comes into play"
  const entersTappedPattern = /\b(?:~|CARDNAME|\w+(?:\s+\w+){0,3})?\s*(?:enters|comes into play)(?: the battlefield)?\s+tapped\b/i

  const clause = normalizedText
    .split(/[.;]/)
    .find((part) => entersTappedPattern.test(part))
  if (!clause) {
    // Check for stun counter pattern: "~ enters the battlefield with a stun counter"
    const stunClause = normalizedText
      .split(/[.;]/)
      .find((part) => /\b(?:~|CARDNAME|\w+)?\s*enters\b[^.]*\bwith a stun counter\b/i.test(part))
    if (stunClause) return 'always'
    return 'never'
  }
  // Conditional text such as "enters tapped unless..." needs a player choice.
  const isConditional = /\b(?:unless|if|may|you decide whether)\b/i.test(clause)
  if (isConditional) return 'conditional'
  // Check for "you may have" near the tapped clause (e.g., "you may have ~ enter the battlefield tapped")
  if (/you may have/i.test(normalizedText)) return 'conditional'
  return 'always'
}

const MANA_COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C']
const ANY_COLOR_MANA: ManaColor[] = ['W', 'U', 'B', 'R', 'G']

function asManaColors(values: string[]) {
  return Array.from(new Set(values.filter((value): value is ManaColor => MANA_COLORS.includes(value as ManaColor))))
}

function inferManaAmount(text: string) {
  const numberWord = text.match(/\b(one|two|three|four|five)\b/i)?.[1]?.toLowerCase()
  if (numberWord) return ({ one: 1, two: 2, three: 3, four: 4, five: 5 } as const)[numberWord as 'one' | 'two' | 'three' | 'four' | 'five']
  const symbols = text.match(/\{[WUBRGC]\}/gi)
  return symbols?.length && !/\bor\b/i.test(text) ? symbols.length : 1
}

function inferManaProduction(oracleText: string, producedMana?: string[]): ManaProduction | undefined {
  const importedColors = asManaColors(producedMana ?? [])
  const addClauses = oracleText.match(/\badd\b[^.\n]*/gi) ?? []
  const colors = importedColors.length > 0 ? importedColors : asManaColors(
    addClauses.flatMap((clause) => {
      if (/any color|any combination of colors/i.test(clause)) return ANY_COLOR_MANA
      return (clause.match(/\{([WUBRGC])\}/gi) ?? []).map((symbol) => symbol.replace(/[{}]/g, '').toUpperCase())
    }),
  )
  if (colors.length === 0) return undefined

  const amount = addClauses.length > 0 ? Math.max(...addClauses.map(inferManaAmount)) : 1
  return { colors, amount }
}

export function resolveCardRules(card: CardRuleInput) {
  const databaseEntry = getCardDatabaseEntry(card.name)
  const override = getOverride(card)
  const savedMode = card.scryfallId ? useCardRuleStore.getState().rules[card.scryfallId] : undefined
  const inferredEntryTapRule = inferEntryTapRule(card.oracleText ?? databaseEntry?.oracleText ?? '')
  // A saved per-card mode is the deliberate user decision. Automatic mode
  // intentionally ignores previously persisted derived booleans and re-runs
  // the Oracle-text inference instead.
  const selectedMode = savedMode ?? card.entryTapMode ?? override?.entryTapMode
  const explicitMode = selectedMode && selectedMode !== 'automatic' ? selectedMode : undefined
  const automaticMode = selectedMode === 'automatic' || (selectedMode === undefined && card.oracleText !== undefined)
  const entryTapRule = explicitMode ?? override?.entryTapRule ?? databaseEntry?.entryTapRule ?? (automaticMode ? inferredEntryTapRule : card.entryTapRule ?? inferredEntryTapRule)
  const entersTapped = explicitMode === 'always'
    ? true
    : explicitMode === 'never' || explicitMode === 'conditional'
      ? false
      : automaticMode
        // A true value imported from Scryfall or an older hydrated deck is a
        // useful positive signal even if an unusual Oracle wording is not
        // recognized by the matcher. Only explicit modes may force false.
        ? override?.entersTapped ?? databaseEntry?.entersTapped ?? (card.entersTapped === true || entryTapRule === 'always')
        : override?.entersTapped ?? databaseEntry?.entersTapped ?? card.entersTapped ?? entryTapRule === 'always'
  return {
    manaCost: override?.manaCost ?? card.manaCost ?? '',
    manaValue: override?.manaValue ?? card.manaValue,
    entryTapMode: savedMode ?? card.entryTapMode ?? override?.entryTapMode ?? databaseEntry?.entryTapRule ?? 'automatic',
    entryTapRule,
    entersTapped,
    manaProduction: override?.manaProduction ?? card.manaProduction ?? inferManaProduction(card.oracleText ?? '', card.producedMana),
  }
}
