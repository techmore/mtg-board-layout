import type { Client } from '@colyseus/core'
import { OPENING_HAND_SIZE, type PrivateZones, isRecord, numberField, shuffleArray, stringField, sanitizeText, MAX_CHAT_LENGTH } from './roomUtils.js'
import type { PlayerState } from './schema/GameState.js'
import type { ServerEvent } from 'mtg-protocol'

type MessageHandler = (client: Client, message?: unknown) => void

export interface GameRoomUtilityMessageContext {
  privateZones: Map<string, PrivateZones>
  onMessage: (type: string, handler: MessageHandler) => void
  getPlayer: (client: Client) => PlayerState | undefined
  sendPrivateState: (player: PlayerState) => void
  drawCards: (player: PlayerState, count: number) => void
  updateCounts: (player: PlayerState) => void
  emitEvent: (event: ServerEvent) => void
  reorderBattlefield: (player: PlayerState, cardId: string, direction: 'closer' | 'farther') => void
  resolveConditionalEntry: (player: PlayerState, cardId: string, tapped: boolean) => void
  discardCard: (player: PlayerState, cardId: string) => void
}

/** Registers utility messages that do not participate in turn ownership. */
export function registerGameRoomUtilityMessages(context: GameRoomUtilityMessageContext) {
  const {
    privateZones,
    onMessage,
    getPlayer,
    sendPrivateState,
    drawCards,
    updateCounts,
    emitEvent,
    reorderBattlefield,
    resolveConditionalEntry,
    discardCard,
  } = context

  onMessage('reshuffle', (client) => {
    const player = getPlayer(client)
    const privateState = player && privateZones.get(player.playerId)
    if (player && privateState) {
      privateState.library = shuffleArray([...privateState.library, ...privateState.hand])
      privateState.hand = []
      updateCounts(player)
      sendPrivateState(player)
    }
  })

  onMessage('redeal', (client, message) => {
    const player = getPlayer(client)
    const privateState = player && privateZones.get(player.playerId)
    if (player && privateState) {
      privateState.library = shuffleArray([...privateState.library, ...privateState.hand])
      privateState.hand = []
      drawCards(player, Math.min(14, Math.max(0, Math.floor(numberField(message, 'openingHandSize') ?? OPENING_HAND_SIZE))))
    }
  })

  onMessage('rollDice', (client) => {
    const player = getPlayer(client)
    if (player) emitEvent({ type: 'diceRolled', playerId: player.id, result: Math.floor(Math.random() * 20) + 1 })
  })

  onMessage('flipCoin', (client) => {
    const player = getPlayer(client)
    if (player) emitEvent({ type: 'coinFlipped', playerId: player.id, result: Math.random() < 0.5 ? 'heads' : 'tails' })
  })

  onMessage('chatMessage', (client, message) => {
    const player = getPlayer(client)
    const text = sanitizeText(stringField(message, 'text'), '', MAX_CHAT_LENGTH)
    if (player && text) emitEvent({ type: 'chatMessage', playerId: player.id, playerName: player.name, text })
  })

  onMessage('reorderBattlefield', (client, message) => {
    const player = getPlayer(client)
    const cardId = stringField(message, 'cardId')
    const direction = stringField(message, 'direction')
    if (player && cardId && (direction === 'closer' || direction === 'farther')) reorderBattlefield(player, cardId, direction)
  })

  onMessage('resolveConditionalEntry', (client, message) => {
    const player = getPlayer(client)
    const cardId = stringField(message, 'cardId')
    const tapped = isRecord(message) && typeof message.tapped === 'boolean' ? message.tapped : undefined
    if (player && cardId && tapped !== undefined) resolveConditionalEntry(player, cardId, tapped)
  })

  onMessage('discardCard', (client, message) => {
    const player = getPlayer(client)
    const cardId = stringField(message, 'cardId')
    if (player && cardId) discardCard(player, cardId)
  })
}
