import { getCardDatabaseEntry } from './cardDatabase'
import { evaluateConditionalEntryTap as sharedEvaluateEntryTap } from 'mtg-protocol/entryTap'
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

/** Returns whether a conditional land enters tapped; undefined means unsupported text. */
export function evaluateConditionalEntryTap(card: Pick<BoardCard, 'name' | 'type' | 'oracleText'>, battlefield: BattlefieldCard[]): boolean | undefined {
  const text = card.oracleText ?? getCardDatabaseEntry(card.name)?.oracleText ?? ''
  return sharedEvaluateEntryTap({ type: card.type, oracleText: text }, battlefield)
}
