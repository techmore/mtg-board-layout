import { getCardDatabaseEntry } from './cardDatabase'
import type { BoardCard } from '../types/card'

const BASIC_LAND_NAMES: Record<string, string> = {
  plains: 'Plains',
  island: 'Island',
  swamp: 'Swamp',
  mountain: 'Mountain',
  forest: 'Forest',
}

export interface CardTypeFeatures {
  typeLine: string
  subtypes: string[]
  isBasicLand: boolean
}

export function getCardTypeFeatures(typeLine = '', name = ''): CardTypeFeatures {
  let effectiveTypeLine = typeLine.trim() || getCardDatabaseEntry(name)?.typeLine?.trim() || ''
  if (!effectiveTypeLine) {
    const basicLandType = BASIC_LAND_NAMES[name.trim().toLowerCase()]
    if (basicLandType) effectiveTypeLine = `Basic Land — ${basicLandType}`
  }

  const normalizedTypeLine = effectiveTypeLine.replace(/[–−]/g, '—')
  const [typePart, subtypePart] = normalizedTypeLine.split('—', 2)
  const subtypes = subtypePart?.trim().split(/\s+/).filter(Boolean) ?? []

  return {
    typeLine: effectiveTypeLine,
    subtypes,
    isBasicLand: /\bBasic\b/i.test(typePart) && /\bLand\b/i.test(typePart),
  }
}

type BattlefieldCard = Pick<BoardCard, 'zone' | 'type' | 'subtypes' | 'isBasicLand'>

export function controlsLandType(cards: BattlefieldCard[], landType: string): boolean {
  const normalizedLandType = landType.trim().toLowerCase()
  return cards.some((card) => card.zone === 'battlefield' && card.type === 'land' &&
    card.subtypes.some((subtype) => subtype.toLowerCase() === normalizedLandType))
}

export function controlsBasicLandCount(cards: BattlefieldCard[], count: number): boolean {
  return cards.filter((card) => card.zone === 'battlefield' && card.type === 'land' && card.isBasicLand).length >= count
}

/** Returns whether a conditional land enters tapped; undefined means unsupported text. */
export function evaluateConditionalEntryTap(card: Pick<BoardCard, 'name' | 'type' | 'oracleText'>, battlefield: BattlefieldCard[]): boolean | undefined {
  if (card.type !== 'land') return undefined
  const text = card.oracleText ?? getCardDatabaseEntry(card.name)?.oracleText ?? ''
  if (!/\bunless you control\b/i.test(text)) return undefined

  if (/(?:two or more|at least two) basic lands/i.test(text)) {
    return !controlsBasicLandCount(battlefield, 2)
  }

  const landTypes = [...text.matchAll(/\b(?:a|an)\s+(Plains|Island|Swamp|Mountain|Forest)\b/gi)]
    .map((match) => match[1])
  if (landTypes.length > 0) {
    return !landTypes.some((landType) => controlsLandType(battlefield, landType))
  }

  return undefined
}
