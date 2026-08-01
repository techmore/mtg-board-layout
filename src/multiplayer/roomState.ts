import type { Room } from '@colyseus/sdk'
import type {
  CardData,
  GameMode,
  GameStatus,
  RoomPlayerInfo,
  ServerEvent,
  TokenData,
} from 'mtg-protocol'
import { getCardTypeFeatures } from '../data/cardFeatures'

export interface GameRoomState {
  roomId: string
  gameMode: GameMode
  status: GameStatus
  hostId: string
  players: RoomPlayerInfo[]
  myPlayerId: string | null
  turn: number
  activePlayerId: string
  combatActive: boolean
  attackers: string[]
  blockers: string[]
}

export interface PrivateState {
  hand: CardData[]
  libraryCount: number
}

function iterableEntries(value: unknown): Array<[string, unknown]> {
  if (!value || typeof value !== 'object') return []
  const candidate = value as { entries?: () => IterableIterator<[unknown, unknown]> }
  if (typeof candidate.entries === 'function') {
    return Array.from(candidate.entries(), ([key, item]) => [String(key), item])
  }
  if (value instanceof Map) return Array.from(value.entries()) as Array<[string, unknown]>
  return Object.entries(value as Record<string, unknown>)
}

function arrayValues(value: unknown): unknown[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value
  const iterable = value as { [Symbol.iterator]?: () => Iterator<unknown> }
  return typeof iterable[Symbol.iterator] === 'function' ? Array.from(value as Iterable<unknown>) : []
}

export function cardFromState(value: unknown): CardData | null {
  if (!value || typeof value !== 'object') return null
  const card = value as Partial<CardData>
  if (typeof card.id !== 'string' || typeof card.name !== 'string') return null
  const features = getCardTypeFeatures(
    typeof card.typeLine === 'string' ? card.typeLine : '',
    card.name,
  )
  return {
    id: card.id,
    scryfallId: typeof card.scryfallId === 'string' ? card.scryfallId : '',
    name: card.name,
    imageUri: typeof card.imageUri === 'string' ? card.imageUri : '',
    oracleText: typeof card.oracleText === 'string' ? card.oracleText : '',
    zone: card.zone ?? 'battlefield',
    tapped: card.tapped === true,
    counters: typeof card.counters === 'number' ? card.counters : 0,
    type: typeof card.type === 'string' ? card.type : 'other',
    ...features,
    subtypes: Array.isArray(card.subtypes) && card.subtypes.length > 0 ? card.subtypes : features.subtypes,
    isBasicLand: typeof card.isBasicLand === 'boolean' ? card.isBasicLand || features.isBasicLand : features.isBasicLand,
    commanderTax: typeof card.commanderTax === 'number' ? card.commanderTax : 0,
    revealed: card.revealed !== false,
  }
}

function cardsFromState(value: unknown): CardData[] {
  return arrayValues(value).map(cardFromState).filter((card): card is CardData => card !== null)
}

function tokensFromState(value: unknown): TokenData[] {
  return arrayValues(value).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const token = item as Partial<TokenData>
    if (typeof token.id !== 'string' || typeof token.name !== 'string' || typeof token.imageUri !== 'string') return []
    return [{
      id: token.id,
      name: token.name,
      imageUri: token.imageUri,
      counters: typeof token.counters === 'number' ? token.counters : 0,
      tapped: token.tapped === true,
    }]
  })
}

export function extractPlayers(map: unknown): RoomPlayerInfo[] {
  return iterableEntries(map).flatMap(([id, value]) => {
    if (!value || typeof value !== 'object') return []
    const player = value as Record<string, unknown>
    const mana = {
      W: typeof player.manaW === 'number' ? player.manaW : 0,
      U: typeof player.manaU === 'number' ? player.manaU : 0,
      B: typeof player.manaB === 'number' ? player.manaB : 0,
      R: typeof player.manaR === 'number' ? player.manaR : 0,
      G: typeof player.manaG === 'number' ? player.manaG : 0,
      C: typeof player.manaC === 'number' ? player.manaC : 0,
    }
    return [{
      id,
      sessionId: typeof player.sessionId === 'string' ? player.sessionId : id,
      playerId: typeof player.playerId === 'string' ? player.playerId : id,
      name: typeof player.name === 'string' ? player.name : 'Anonymous',
      teamId: typeof player.teamId === 'string' ? player.teamId : undefined,
      turnOrder: typeof player.turnOrder === 'number' ? player.turnOrder : 0,
      ready: player.ready === true,
      connected: player.connected !== false,
      deckId: typeof player.deckId === 'string' ? player.deckId : undefined,
      lifeTotal: typeof player.lifeTotal === 'number' ? player.lifeTotal : 40,
      landPlaysThisTurn: typeof player.landPlaysThisTurn === 'number' ? player.landPlaysThisTurn : 0,
      mana,
      battlefield: cardsFromState(player.battlefield),
      graveyard: cardsFromState(player.graveyard),
      exile: cardsFromState(player.exile),
      command: cardsFromState(player.command),
      tokens: tokensFromState(player.tokens),
      handCount: typeof player.handCount === 'number' ? player.handCount : 0,
      libraryCount: typeof player.libraryCount === 'number' ? player.libraryCount : 0,
      positionX: typeof player.positionX === 'number' ? player.positionX : 0,
      positionY: typeof player.positionY === 'number' ? player.positionY : 0,
    }]
  })
}

export function createSnapshot(room: Room): GameRoomState {
  const state = room.state as Record<string, unknown>
  return {
    roomId: room.roomId,
    gameMode: state.gameMode as GameMode,
    status: state.status as GameStatus,
    hostId: typeof state.hostId === 'string' ? state.hostId : '',
    players: extractPlayers(state.players),
    myPlayerId: room.sessionId,
    turn: typeof state.turn === 'number' ? state.turn : 1,
    activePlayerId: typeof state.activePlayerId === 'string' ? state.activePlayerId : '',
    combatActive: state.combatActive === true,
    attackers: arrayValues(state.attackers).filter((id): id is string => typeof id === 'string'),
    blockers: arrayValues(state.blockers).filter((id): id is string => typeof id === 'string'),
  }
}

export function normalizePrivateState(value: unknown): PrivateState {
  if (!value || typeof value !== 'object') return { hand: [], libraryCount: 0 }
  const message = value as Partial<PrivateState>
  return {
    hand: Array.isArray(message.hand)
      ? message.hand.map(cardFromState).filter((card): card is CardData => card !== null)
      : [],
    libraryCount: typeof message.libraryCount === 'number' ? message.libraryCount : 0,
  }
}

export type RoomEvent = ServerEvent
