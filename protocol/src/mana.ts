// ═══════════════════════════════════════════════════════════════
// Shared mana helpers. The client engine and the multiplayer server
// parse costs and pay them through this module so they cannot drift.
// ═══════════════════════════════════════════════════════════════

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C'

export type ManaPool = Record<ManaColor, number>

export const MANA_COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C']

export function emptyManaPool(): ManaPool {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
}

export function parseManaCost(cost: string) {
  const symbols = cost.match(/\{[^}]+\}/g) ?? []
  const colored: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
  let generic = 0
  for (const symbol of symbols) {
    const inner = symbol.slice(1, -1)
    if (['W', 'U', 'B', 'R', 'G', 'C'].includes(inner)) {
      colored[inner]++
    } else if (/^\d+$/.test(inner)) {
      generic += parseInt(inner, 10)
    } else if (/^X$/i.test(inner)) {
      // {X} spells still cost at least one generic mana here; charging nothing
      // would let X-spells resolve for free. (Hybrid symbols like {2/B} are
      // counted as generic too — they can always be paid with generic mana.)
      generic += 1
    } else if (/^[0-9]+\/[WUBRGC]$/i.test(inner)) {
      generic += parseInt(inner.split('/')[0], 10)
    } else if (/^[WUBRGC]\/[WUBRGC]$/i.test(inner)) {
      colored[inner.split('/')[0] as ManaColor]++
    }
  }
  return {
    colored: (Object.entries(colored) as [ManaColor, number][]).filter(([, count]) => count > 0).map(([color, count]) => ({ color, count })),
    generic,
  }
}

/** Pay a cost from the pool (deducting colored then generic mana). */
export function spendManaForCost(pool: ManaPool, cost: string): ManaPool {
  if (!cost) return pool
  const { colored, generic } = parseManaCost(cost)
  const next = { ...pool }
  for (const { color, count } of colored) {
    next[color] = Math.max(0, next[color] - count)
  }
  let remaining = generic
  for (const color of MANA_COLORS) {
    if (remaining <= 0) break
    const spend = Math.min(remaining, next[color])
    next[color] -= spend
    remaining -= spend
  }
  return next
}

export function canPayManaCost(pool: ManaPool, cost: string): boolean {
  if (!cost) return true
  const { colored, generic } = parseManaCost(cost)
  const remaining = { ...pool }
  for (const { color, count } of colored) {
    if (remaining[color] < count) return false
    remaining[color] -= count
  }
  const availableGeneric = Object.values(remaining).reduce((total, amount) => total + amount, 0)
  return availableGeneric >= generic
}
