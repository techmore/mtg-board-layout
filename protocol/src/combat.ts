// ═══════════════════════════════════════════════════════════════
// Shared combat resolution helpers. Both the solo engine and the
// multiplayer server resolve keywords and P/T from Oracle text through
// this module so they cannot drift apart (the solo engine reads the
// parser-produced rules cache; the server re-parses the same text).
// ═══════════════════════════════════════════════════════════════

/** Full keyword set — kept in sync with the card-rule parser's KEYWORDS so the
 *  server detects everything the client's rules cache knows. */
export const COMBAT_KEYWORDS = [
  'deathtouch', 'first strike', 'double strike', 'flying', 'haste', 'hexproof',
  'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance',
  'ward', 'flash', 'defender', 'exalted', 'persist', 'undying', 'infect',
  'wither', 'prowess', 'fear', 'intimidate', 'shadow', 'banding', 'totem armor',
  'skulk',
] as const

/** Keywords are scanned across the whole Oracle text (not just the first line):
 *  "When ~ enters, ... Flying" must still be caught. Mirrors the parser. */
export function parseKeywords(oracleText: string): Set<string> {
  const text = oracleText.toLowerCase()
  const found = new Set<string>()
  for (const keyword of COMBAT_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(text)) {
      found.add(keyword === 'hexproof' && text.includes('hexproof from') ? 'hexproof from' : keyword)
    }
  }
  return found
}

/** P/T from the explicit field first; the type line is a fallback for callers
 *  that never sent it. Accepts a bare type line for compatibility. */
export function parsePower(combatant: { typeLine: string; power?: string } | string): number {
  const source = typeof combatant === 'string' ? { typeLine: combatant } : combatant
  if (source.power) {
    const n = parseInt(source.power, 10)
    if (!Number.isNaN(n)) return n
  }
  return parseInt(source.typeLine.match(/(\d+)\//)?.[1] ?? '0', 10)
}

export function parseToughness(combatant: { typeLine: string; toughness?: string } | string): number {
  const source = typeof combatant === 'string' ? { typeLine: combatant } : combatant
  if (source.toughness) {
    const n = parseInt(source.toughness, 10)
    if (!Number.isNaN(n)) return n
  }
  return parseInt(source.typeLine.match(/\/(\d+)/)?.[1] ?? '0', 10)
}

/** A battlefield permanent that may contribute a static P/T anthem. */
export interface StaticPumpSource {
  id: string
  name: string
  typeLine: string
  oracleText: string
  ownerId: string
  type: string
  /** Auras/equipment: the creature they are attached to. */
  enchantsCardId?: string
}

function hasConditionAfter(text: string, matchIndex: number): boolean {
  const rest = text.slice(matchIndex)
  return /\b(unless|as long as|if|whenever|when)\b/i.test(rest)
}

/**
 * Whether a creature can attack. Handles plain self-restrictions ("This
 * creature can't attack", "can't attack or block") and attached permanents
 * ("Enchanted creature can't attack"). Conditional restrictions ("unless you
 * have seven cards in hand", "as long as ...") are NOT evaluated here and are
 * treated as allowing.
 */
export function canAttack(
  card: { id: string; oracleText?: string },
  battlefield: Iterable<{ id: string; oracleText?: string; enchantsCardId?: string }> = [],
  context: { handSize?: number } = {},
): boolean {
  const text = card.oracleText ?? ''
  const m = text.match(/can't\s+attack(?:\s+or\s+block)?/i)
  if (m && !hasConditionAfter(text, (m.index ?? 0) + m[0].length)) return false
  // Hand-size gate ("Kefnet can't attack or block unless you have seven or
  // more cards in hand").
  const handGate = text.match(/can't (?:attack|block|attack or block) unless you have (?:(\d+)|(one|two|three|four|five|six|seven|eight|nine|ten)) or more cards in hand/i)
  if (handGate && context.handSize !== undefined) {
    const needed = handGate[1] ? parseInt(handGate[1], 10) : ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[handGate[2].toLowerCase()] ?? 7
    if (context.handSize < needed) return false
  }
  for (const source of battlefield) {
    if (source.enchantsCardId === card.id) {
      if (/(?:enchanted (?:creature|permanent)|equipped creature)\s+can't\s+attack(?:\s+or\s+block)?/i.test(source.oracleText ?? '')) return false
    }
  }
  return true
}

/** Whether a creature can block (see {@link canAttack}). */
export function canBlock(
  card: { id: string; oracleText?: string; ownerId?: string; owner?: string },
  battlefield: Iterable<{ id: string; oracleText?: string; enchantsCardId?: string; ownerId?: string; owner?: string; typeLine?: string }> = [],
  context: { defenderRadCounters?: number; handSize?: number } = {},
): boolean {
  const text = card.oracleText ?? ''
  const m = text.match(/can't\s+(?:be\s+)?blocked|can't\s+(?:attack\s+or\s+)?block/i)
  if (m && !hasConditionAfter(text, (m.index ?? 0) + m[0].length)) return false
  // Hand-size gate ("can't attack or block unless you have N or more cards in
  // hand") — see {@link canAttack}.
  const handGate = text.match(/can't (?:attack|block|attack or block) unless you have (?:(\d+)|(one|two|three|four|five|six|seven|eight|nine|ten)) or more cards in hand/i)
  if (handGate && context.handSize !== undefined) {
    const needed = handGate[1] ? parseInt(handGate[1], 10) : ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[handGate[2].toLowerCase()] ?? 7
    if (context.handSize < needed) return false
  }
  // Landwalk ("Forestwalk (This creature can't be blocked as long as defending
  // player controls a Forest)"): the blocker's controller is the defending side.
  const walk = text.match(/can't be blocked as long as defending player controls an? ([A-Za-z]+)/i)
  if (walk) {
    const myOwner = card.ownerId ?? card.owner
    if (myOwner !== undefined) {
      const landRe = new RegExp(`\\b${walk[1]}\\b`, 'i')
      for (const perm of battlefield) {
        if ((perm.ownerId ?? perm.owner) === myOwner && landRe.test(perm.typeLine ?? '')) return false
      }
    }
  }
  // "…as long as defending player has a rad counter" (Nightkin Ambusher).
  if ((context.defenderRadCounters ?? 0) > 0 && /can't be blocked as long as defending player has a rad counter/i.test(text)) return false
  for (const source of battlefield) {
    if (source.enchantsCardId === card.id) {
      if (/(?:enchanted (?:creature|permanent)|equipped creature)\s+can't\s+(?:be\s+)?blocked|(?:enchanted (?:creature|permanent)|equipped creature)\s+can't\s+(?:attack\s+or\s+)?block/i.test(source.oracleText ?? '')) return false
    }
  }
  return true
}

const STATIC_KEYWORD_NAMES = ['deathtouch', 'flying', 'first strike', 'double strike', 'haste', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance', 'ward', 'skulk']

/**
 * Attack tax (Ghostly Prison / Propaganda / Archangel of Tithes): "Creatures
 * can't attack you unless their controller pays {N} for each creature they
 * control that's attacking you." Returns N (per attacker) from the defending
 * side's battlefield. Archangel only applies while it is untapped.
 */
export function attackTax(
  defenderBattlefield: Iterable<{ id: string; oracleText?: string; ownerId?: string; owner?: string; tapped?: boolean }>,
): number {
  let tax = 0
  for (const source of defenderBattlefield) {
    const text = source.oracleText ?? ''
    const m = text.match(/creatures?\s+can't attack you(?:\s+or\s+planeswalkers\s+you\s+control)?\s+unless their controller pays \{(\d+)\}/i)
    if (!m) continue
    // Archangel of Tithes: only applies while untapped.
    if (/\bas long as this creature is untapped\b/i.test(text) && source.tapped === true) continue
    tax = Math.max(tax, parseInt(m[1], 10))
  }
  return tax
}

/**
 * Block tax (Archangel of Tithes, attacking side): "As long as this creature is
 * attacking, creatures can't block unless their controller pays {1} for each of
 * those creatures." Returns the per-blocker cost demanded by the ATTACKING
 * side's battlefield. Callers pass only permanents that are actually attacking.
 */
export function blockTax(attackerBattlefield: Iterable<{ id: string; oracleText?: string; tapped?: boolean }>): number {
  let tax = 0
  for (const source of attackerBattlefield) {
    const text = source.oracleText ?? ''
    const m = text.match(/creatures?\s+can't block unless their controller pays \{(\d+)\}/i)
    if (!m) continue
    tax = Math.max(tax, parseInt(m[1], 10))
  }
  return tax
}

/**
 * Static keyword grants from other battlefield permanents ("creatures you
 * control have haste", "equipped creature has deathtouch", tribal "rats you
 * control have deathtouch"). "Until end of turn" grants are temporary (handled
 * separately) and excluded. Mirrors the client's rules-cache keyword anthems.
 */
export function getStaticKeywords(
  card: { id: string; typeLine: string; ownerId: string; type: string; oracleText?: string },
  battlefield: StaticPumpSource[],
): Set<string> {
  const granted = new Set<string>()
  if (card.type !== 'creature') return granted
  for (const source of battlefield) {
    if (source.id === card.id) continue
    if (source.enchantsCardId && source.enchantsCardId !== card.id) continue
    const text = source.oracleText
    if (/\buntil end of turn\b/i.test(text)) continue
    // "X have/has <keywords>" — split the subject from the keyword list.
    const m = text.match(/(?:^|[.;\n])\s*([^.;\n]*?)\s+(?:have|has)\s+([a-z, ]+?)(?:\.|$)/i)
    if (!m) continue
    const subject = m[1].toLowerCase()
    const keywordPart = m[2].toLowerCase()
    // Scope: "your opponents control" affects the other side; "you control"
    // affects the source's side; "each/all" affects everyone.
    const scopeOpponents = /\byour opponents control\b/.test(subject)
    const scopeOwn = /\byou control\b|\byour control\b/.test(subject)
    if (scopeOpponents && source.ownerId === card.ownerId) continue
    if (scopeOwn && source.ownerId !== card.ownerId) continue
    // Tribal subjects ("rats you control", "pegasus creatures you control",
    // "other orcs and goblins you control"): the card must match the subtype.
    if (!/creature|creatures|other|equipped|enchanted/.test(subject)) {
      const tribe = subject.replace(/\b(?:other\s+|creatures?\s+|you control|you\s+control)\b/g, '').trim()
      if (tribe && !new RegExp(`\\b${tribe}\\b`, 'i').test(card.typeLine)) continue
    }
    // Attached grants ("equipped creature has ...") apply only to the attached
    // creature; for everyone else they are skipped.
    if (!(source.enchantsCardId === card.id) && /equipped creature|enchanted creature/.test(subject)) continue
    for (const keyword of STATIC_KEYWORD_NAMES) {
      if (new RegExp(`\\b${keyword}\\b`, 'i').test(keywordPart)) granted.add(keyword)
    }
  }
  return granted
}

/**
 * Static P/T anthems ("creatures you control get +1/+1") contributed by other
 * same-owner battlefield permanents, plus single-target auras/equipment
 * ("enchanted creature gets +1/+1"). The client resolves the same effects from
 * its parsed rules cache; this regex path gives the multiplayer server a shared,
 * drift-checked equivalent. "Until end of turn" pumps are NOT static and are
 * excluded.
 */
export function computeStaticPump(
  battlefield: StaticPumpSource[],
  card: { id: string; typeLine: string; ownerId: string; type: string },
): { power: number; toughness: number } {
  if (card.type !== 'creature') return { power: 0, toughness: 0 }
  let power = 0
  let toughness = 0
  for (const source of battlefield) {
    if (source.id === card.id) continue
    // Attached auras/equipment pump only their creature.
    if (source.enchantsCardId === card.id) {
      const attached = source.oracleText.match(/(?:equipped creature|enchanted creature)\s+gets?\s+([+-−]?\d+)\s*\/\s*([+-−]?\d+)/i)
      if (attached) {
        power += parseInt(attached[1].replace(/[−]/g, '-'), 10)
        toughness += parseInt(attached[2].replace(/[−]/g, '-'), 10)
      }
      continue
    }
    if (source.enchantsCardId) continue
    const match = source.oracleText.match(/(?:^|[.;\n])\s*(?:creatures?\b[^.;\n]*?)\bget\s+([+-−]?\d+)\s*\/\s*([+-−]?\d+)(?!.*until end of turn)/i)
    if (!match) continue
    const p = parseInt(match[1].replace(/[−]/g, '-'), 10)
    const t = parseInt(match[2].replace(/[−]/g, '-'), 10)
    if (Number.isNaN(p) || Number.isNaN(t)) continue
    const text = source.oracleText
    // Scope: "your opponents control" affects the other side only; "you control"
    // (or a bare "creatures you control" implying the source's side) affects the
    // source's owner; "each creature"/"all creatures" affects everyone.
    if (/\byour opponents control\b/i.test(text)) {
      if (source.ownerId === card.ownerId) continue
    } else if (/you control|your control/i.test(text)) {
      if (source.ownerId !== card.ownerId) continue
    }
    power += p
    toughness += t
  }
  return { power, toughness }
}
