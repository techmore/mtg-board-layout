import type {
  BackgroundOption,
  BoardCard,
  CardScale,
  EffectHistoryEntry,
  ManaLogEntry,
  ManaPool,
  ManaProduction,
  PotentialManaSource,
  Token,
  TriggerInstance,
  Zone,
} from '../types/card'
import { isIndexedDbBackground } from '../services/backgroundStorage'
import type { OverlayState, TurnAnnouncement } from './gameStore'

const validZones: Zone[] = ['hand', 'battlefield', 'graveyard', 'exile', 'library', 'command']
const validTypes: BoardCard['type'][] = ['land', 'creature', 'instant', 'sorcery', 'enchantment', 'artifact', 'planeswalker', 'battle', 'other']

export function isBoardCard(value: unknown): value is BoardCard {
  if (!value || typeof value !== 'object') return false
  const card = value as Record<string, unknown>
  return typeof card.id === 'string' && typeof card.scryfallId === 'string' &&
    typeof card.name === 'string' && typeof card.imageUri === 'string' &&
    typeof card.zone === 'string' && validZones.includes(card.zone as Zone) &&
    typeof card.tapped === 'boolean' && typeof card.counters === 'number' &&
    Number.isFinite(card.counters) && typeof card.type === 'string' &&
    validTypes.includes(card.type as BoardCard['type']) && typeof card.revealed === 'boolean' &&
    (card.typeLine === undefined || typeof card.typeLine === 'string') &&
    (card.subtypes === undefined || Array.isArray(card.subtypes)) &&
    (card.isBasicLand === undefined || typeof card.isBasicLand === 'boolean') &&
    (card.tokenCount === undefined || (typeof card.tokenCount === 'number' && Number.isInteger(card.tokenCount) && card.tokenCount >= 0)) &&
    (card.manaProduction === undefined || isManaProduction(card.manaProduction)) &&
    (card.commanderTax === undefined || (typeof card.commanderTax === 'number' && Number.isInteger(card.commanderTax) && card.commanderTax >= 0)) &&
    (card.owner === undefined || card.owner === 'player' || card.owner === 'opponent')
}

export function isToken(value: unknown): value is Token {
  if (!value || typeof value !== 'object') return false
  const token = value as Record<string, unknown>
  return typeof token.id === 'string' && typeof token.name === 'string' &&
    typeof token.imageUri === 'string' && typeof token.counters === 'number' &&
    Number.isFinite(token.counters) && typeof token.tapped === 'boolean'
}

export function isManaPool(value: unknown): value is ManaPool {
  if (!value || typeof value !== 'object') return false
  const pool = value as Record<string, unknown>
  return ['W', 'U', 'B', 'R', 'G', 'C'].every((color) =>
    typeof pool[color] === 'number' && Number.isInteger(pool[color]) && pool[color] >= 0,
  )
}

export function isManaProduction(value: unknown): value is ManaProduction {
  if (!value || typeof value !== 'object') return false
  const production = value as Record<string, unknown>
  return Array.isArray(production.colors) && production.colors.length > 0 &&
    production.colors.every((color) => ['W', 'U', 'B', 'R', 'G', 'C'].includes(color as string)) &&
    typeof production.amount === 'number' && Number.isInteger(production.amount) && production.amount > 0
}

export function isPotentialManaSource(value: unknown): value is PotentialManaSource {
  if (!value || typeof value !== 'object') return false
  const source = value as Record<string, unknown>
  return typeof source.id === 'string' && Array.isArray(source.colors) && source.colors.length > 0 &&
    source.colors.every((color) => ['W', 'U', 'B', 'R', 'G', 'C'].includes(color as string)) &&
    (source.sourceCardId === undefined || typeof source.sourceCardId === 'string') &&
    (source.sourceCardName === undefined || typeof source.sourceCardName === 'string')
}

export function isCardScale(value: unknown): value is CardScale {
  return value === 1 || value === 1.25 || value === 1.5 || value === 1.75 || value === 2
}

export function isManaLogEntry(value: unknown): value is ManaLogEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return typeof entry.id === 'string' && typeof entry.turn === 'number' && Number.isFinite(entry.turn) &&
    (entry.direction === 'generated' || entry.direction === 'spent') &&
    ['W', 'U', 'B', 'R', 'G', 'C'].includes(entry.color as string) &&
    typeof entry.amount === 'number' && Number.isInteger(entry.amount) && entry.amount > 0 &&
    (entry.usage === undefined || ['spell', 'creature', 'ability'].includes(entry.usage as string)) &&
    (entry.label === undefined || typeof entry.label === 'string')
}

export function isEffectHistoryEntry(value: unknown): value is EffectHistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return typeof entry.id === 'string' && typeof entry.turn === 'number' && Number.isFinite(entry.turn) &&
    entry.kind === 'token' && entry.action === 'added' &&
    typeof entry.targetCardId === 'string' && typeof entry.targetCardName === 'string' &&
    typeof entry.amount === 'number' && Number.isInteger(entry.amount) && entry.amount > 0
}

export function isBackgroundOption(value: unknown): value is BackgroundOption {
  if (!value || typeof value !== 'object') return false
  const background = value as Record<string, unknown>
  return typeof background.id === 'string' && typeof background.name === 'string' &&
    typeof background.dataUrl === 'string' && (background.dataUrl.startsWith('data:image/') || isIndexedDbBackground(background.dataUrl))
}

export function isOverlayState(value: unknown): value is OverlayState {
  if (!value || typeof value !== 'object') return false
  const overlay = value as Record<string, unknown>
  return overlay.type === null || overlay.type === 'dice' || overlay.type === 'coin' || overlay.type === 'zoom' || overlay.type === 'graveyard'
}

export function isTriggerInstance(value: unknown): value is TriggerInstance {
  if (!value || typeof value !== 'object') return false
  const t = value as Record<string, unknown>
  return typeof t.id === 'string' && typeof t.sourceCardId === 'string' &&
    typeof t.sourceCardName === 'string' && t.ability !== null && typeof t.ability === 'object' &&
    t.event !== null && typeof t.event === 'object' &&
    (t.selectedTargets === undefined || (Array.isArray(t.selectedTargets) && t.selectedTargets.every((id: unknown) => typeof id === 'string')))
}

export function isTurnAnnouncement(value: unknown): value is TurnAnnouncement | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const announcement = value as Record<string, unknown>
  return typeof announcement.id === 'number' && Number.isFinite(announcement.id) &&
    typeof announcement.text === 'string'
}
