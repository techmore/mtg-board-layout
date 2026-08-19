import type { CardData, GameMode, Zone } from 'mtg-protocol'
import { evaluateConditionalEntryTap } from 'mtg-protocol/entryTap'
import { CardState } from './schema/GameState.js'

export const MAX_DECK_SIZE = 250
export const OPENING_HAND_SIZE = 7
export const MAX_CHAT_LENGTH = 500
export const VALID_MANA = new Set(['W', 'U', 'B', 'R', 'G', 'C'])

export interface PrivateZones {
  hand: CardData[]
  library: CardData[]
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export type Message = Record<string, unknown>

export function generateRoomIdSingle(): string {
  // 5 letters = ~11.9M combinations — too many to brute-force room join codes.
  let result = ''
  for (let i = 0; i < 5; i++) result += LETTERS.charAt(Math.floor(Math.random() * LETTERS.length))
  return result
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function isRecord(value: unknown): value is Message {
  return typeof value === 'object' && value !== null
}

export function stringField(message: unknown, field: string): string | undefined {
  if (!isRecord(message) || typeof message[field] !== 'string') return undefined
  return message[field] as string
}

export function numberField(message: unknown, field: string): number | undefined {
  if (!isRecord(message) || typeof message[field] !== 'number' || !Number.isFinite(message[field])) return undefined
  return message[field] as number
}

export function booleanField(message: unknown, field: string): boolean | undefined {
  if (!isRecord(message) || typeof message[field] !== 'boolean') return undefined
  return message[field] as boolean
}

export function validMode(value: unknown): value is GameMode {
  return value === '1v1' || value === '2v2' || value === '4ffa'
}

export function validZone(value: unknown): value is Zone {
  return value === 'hand' || value === 'battlefield' || value === 'graveyard' || value === 'exile' || value === 'library' || value === 'command'
}

export function sanitizeText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback
}

export function isCardData(value: unknown): value is CardData {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' && value.id.length <= 120 &&
    typeof value.scryfallId === 'string' && value.scryfallId.length <= 120 &&
    typeof value.name === 'string' && value.name.length <= 200 &&
    typeof value.imageUri === 'string' && value.imageUri.length <= 2_000 &&
    typeof value.oracleText === 'string' && value.oracleText.length <= 4_000 &&
    validZone(value.zone) && typeof value.tapped === 'boolean' &&
    typeof value.counters === 'number' && Number.isInteger(value.counters) && value.counters >= 0 && value.counters <= 999 &&
    typeof value.type === 'string' && value.type.length <= 40 &&
    typeof value.typeLine === 'string' && value.typeLine.length <= 200 &&
    Array.isArray(value.subtypes) && value.subtypes.length <= 8 && value.subtypes.every((subtype) => typeof subtype === 'string' && subtype.length <= 40) &&
    typeof value.isBasicLand === 'boolean' &&
    typeof value.commanderTax === 'number' && Number.isInteger(value.commanderTax) && value.commanderTax >= 0 &&
    typeof value.revealed === 'boolean'
}

export function normalizeCards(value: unknown): CardData[] {
  if (!Array.isArray(value)) return []
  return value.filter(isCardData).slice(0, MAX_DECK_SIZE).map((card) => ({ ...card }))
}

export function isLandCard(card: { type: string; typeLine: string }): boolean {
  return card.type === 'land' || /\bLand\b/.test(card.typeLine)
}

export function isAura(card: { type: string; typeLine: string }): boolean {
  return card.type === 'enchantment' && /\baura\b/i.test(card.typeLine)
}

export function isEquipment(card: { type: string; typeLine: string }): boolean {
  return card.type === 'artifact' && /\bequipment\b/i.test(card.typeLine)
}

export function modeToStartingLife(mode: GameMode): number {
  return mode === '1v1' ? 20 : mode === '2v2' ? 30 : 40
}

export function modeToMaxPlayers(mode: GameMode): number {
  return mode === '1v1' ? 2 : 4
}

export function cardToState(card: CardData, zone: Zone): CardState {
  return new CardState({ ...card, zone })
}

export function stateToCard(card: CardState, zone: Zone = card.zone as Zone): CardData {
  return {
    id: card.id,
    scryfallId: card.scryfallId,
    name: card.name,
    imageUri: card.imageUri,
    oracleText: card.oracleText,
    zone,
    tapped: card.tapped,
    counters: card.counters,
    damage: card.damage,
    type: card.type,
    typeLine: card.typeLine,
    subtypes: [...card.subtypes],
    isBasicLand: card.isBasicLand,
    commanderTax: card.commanderTax,
    revealed: card.revealed,
    isCommander: card.isCommander,
    manaCost: card.manaCost,
    enchantsCardId: card.enchantsCardId,
    cantBeBlockedThisTurn: card.cantBeBlockedThisTurn,
  }
}

type BattlefieldCardFeatures = {
  zone: string
  type: string
  subtypes: Iterable<string>
  isBasicLand: boolean
}

/** Server-side counterpart to the client's conditional land-entry evaluator. */
export function entersTappedOnBattlefield(
  card: BattlefieldCardFeatures & { oracleText: string },
  battlefield: Iterable<BattlefieldCardFeatures>,
): boolean {
  if (card.type !== 'land') return false
  const text = card.oracleText ?? ''
  const conditional = evaluateConditionalEntryTap(card, battlefield)
  if (conditional !== undefined) return conditional
  return /\b(?:enters|comes into play)(?: the battlefield)?\s+tapped\b/i.test(text)
}
