export function rollDie(sides: number) {
  return Math.floor(Math.random() * sides) + 1
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

import type { BoardCard, ManaColor, ManaPool } from '../types/card'

export function classifyType(typeLine: string): BoardCard['type'] {
  const tl = typeLine.toLowerCase()
  if (tl.includes('land')) return 'land'
  if (tl.includes('creature')) return 'creature'
  if (tl.includes('instant')) return 'instant'
  if (tl.includes('sorcery')) return 'sorcery'
  if (tl.includes('enchantment')) return 'enchantment'
  if (tl.includes('artifact')) return 'artifact'
  if (tl.includes('planeswalker')) return 'planeswalker'
  if (tl.includes('battle')) return 'battle'
  return 'other'
}

export function isLand(type: string) {
  return type === 'land'
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
    }
  }
  return {
    colored: (Object.entries(colored) as [ManaColor, number][]).filter(([, count]) => count > 0).map(([color, count]) => ({ color, count })),
    generic,
  }
}

export function spendManaForCost(pool: ManaPool, cost: string): ManaPool {
  if (!cost) return pool
  const { colored, generic } = parseManaCost(cost)
  const next = { ...pool }
  for (const { color, count } of colored) {
    next[color] = Math.max(0, next[color] - count)
  }
  let remaining = generic
  const order: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C']
  for (const color of order) {
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
