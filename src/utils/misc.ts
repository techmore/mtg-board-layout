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

import type { BoardCard, ManaPool } from '../types/card'
import { canPayManaCost, emptyManaPool, parseManaCost, spendManaForCost } from 'mtg-protocol/mana'

export { canPayManaCost, parseManaCost, spendManaForCost, emptyManaPool }
export type { ManaPool }

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

export function getCreaturePower(typeLine: string | undefined): number {
  return parseInt(typeLine?.match(/(\d+)\//)?.[1] ?? '0', 10)
}

export function getCreatureToughness(typeLine: string | undefined): number {
  return parseInt(typeLine?.match(/\/(\d+)/)?.[1] ?? '0', 10)
}

export function getCardPower(card: { typeLine: string | undefined; powerBoost?: number; counters?: number; minusCounters?: number }): number {
  return getCreaturePower(card.typeLine) + (card.powerBoost ?? 0) + (card.counters ?? 0) - (card.minusCounters ?? 0)
}

export function getCardToughness(card: { typeLine: string | undefined; toughnessBoost?: number; counters?: number; minusCounters?: number }): number {
  return getCreatureToughness(card.typeLine) + (card.toughnessBoost ?? 0) + (card.counters ?? 0) - (card.minusCounters ?? 0)
}
