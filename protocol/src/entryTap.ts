/**
 * Shared conditional enters-tapped evaluation used by both the client and the
 * Colyseus server. Kept dependency-free so it runs anywhere the protocol
 * package is imported.
 */

export interface EntryTapCard {
  type: string
  oracleText?: string
  isBasicLand?: boolean
  subtypes?: Iterable<string>
}

export interface EntryTapBattlefieldCard {
  type: string
  isBasicLand?: boolean
  subtypes?: Iterable<string>
}

/**
 * Evaluate a land's conditional entry-tap clause ("enters tapped unless you
 * control two or more basic lands" / "unless you control a Plains ...").
 * Returns:
 *   - true  when the land must enter tapped
 *   - false when it enters untapped
 *   - undefined when the card has no conditional clause (caller handles the
 *     plain "enters tapped" rule separately)
 */
export function evaluateConditionalEntryTap(
  card: EntryTapCard,
  battlefield: Iterable<EntryTapBattlefieldCard>,
): boolean | undefined {
  if (card.type !== 'land') return undefined
  const text = card.oracleText ?? ''
  if (!/\bunless you control\b/i.test(text)) return undefined

  const controlled = Array.from(battlefield).filter((candidate) => candidate.type === 'land')

  if (/(?:two or more|at least two) basic lands/i.test(text)) {
    return controlled.filter((candidate) => candidate.isBasicLand).length < 2
  }

  const landTypes = [...text.matchAll(/\b(?:a|an)\s+(Plains|Island|Swamp|Mountain|Forest)\b/gi)]
    .map((match) => match[1].toLowerCase())
  if (landTypes.length > 0) {
    return !controlled.some((candidate) =>
      Array.from(candidate.subtypes ?? []).some((subtype) => landTypes.includes(subtype.toLowerCase())),
    )
  }

  return undefined
}
