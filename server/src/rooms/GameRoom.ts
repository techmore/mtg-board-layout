import { Room, type Client } from '@colyseus/core'
import type { CardData, GameMode, ServerEvent, Zone } from 'mtg-protocol'
import { GameState, PlayerState, CardState, TokenState } from './schema/GameState.js'
import { registerGameRoomUtilityMessages, type GameRoomUtilityMessageContext } from './gameRoomMessages.js'
import {
  OPENING_HAND_SIZE,
  VALID_MANA,
  type PrivateZones,
  cardToState,
  generateRoomIdSingle,
  isRecord,
  modeToMaxPlayers,
  modeToStartingLife,
  normalizeCards,
  numberField,
  sanitizeText,
  shuffleArray,
  stateToCard,
  stringField,
  validMode,
  validZone,
  entersTappedOnBattlefield,
  isLandCard,
} from './roomUtils.js'

const LOBBY_CHANNEL = '$game-rooms'

/** Authoritative room implementation. Private zones never enter the public Schema state. */
export class GameRoom extends Room<{ state: GameState }> {
  private readonly privateZones = new Map<string, PrivateZones>()
  private readonly playerClients = new Map<string, Client>()

  async generateRoomId(): Promise<string> {
    const currentIds = await this.presence.smembers(LOBBY_CHANNEL)
    let id: string
    do id = generateRoomIdSingle()
    while (currentIds.includes(id))
    await this.presence.sadd(LOBBY_CHANNEL, id)
    return id
  }

  async onCreate(options: unknown) {
    const gameMode = isRecord(options) && validMode(options.gameMode) ? options.gameMode : null
    if (!gameMode) throw new Error('A valid game mode is required.')

    this.roomId = await this.generateRoomId()
    this.maxClients = modeToMaxPlayers(gameMode)
    this.setState(new GameState(this.roomId, gameMode, ''))
    registerGameRoomUtilityMessages(this.createUtilityMessageContext())

    this.onMessage('ready', (client: Client) => {
      const player = this.getPlayer(client)
      if (player && this.state.status === 'waiting') player.ready = !player.ready
    })

    this.onMessage('requestPrivateState', (client: Client) => {
      const player = this.getPlayer(client)
      if (player) this.sendPrivateState(player)
    })

    this.onMessage('startGame', (client: Client) => {
      const player = this.getPlayer(client)
      if (!player || this.state.hostId !== player.id || this.state.status !== 'waiting') return
      const players = this.connectedPlayers()
      if (players.length !== this.maxClients || !players.every((candidate) => candidate.ready)) return

      this.state.status = 'playing'
      this.state.turn = 1
      players.forEach((candidate, index) => { candidate.turnOrder = index })
      const shuffled = shuffleArray(players)
      shuffled.forEach((candidate, index) => { candidate.turnOrder = index })
      this.state.activePlayerId = shuffled[0]?.id ?? ''
      for (const candidate of players) {
        this.prepareOpeningHand(candidate)
        this.sendPrivateState(candidate)
      }
      this.emitEvent({ type: 'gameStarted' })
    })

    this.onMessage('playCard', (client, message) => {
      const player = this.requireTurnPlayer(client)
      const cardId = stringField(message, 'cardId')
      if (!player || !cardId) return
      const card = this.findAnyCard(player, cardId)
      if (!card) return
      if (isLandCard(card)) {
        if (card.zone === 'battlefield') return
        if (card.zone === 'hand' && player.landPlaysThisTurn >= 1) {
          client.send('error', { type: 'error', message: 'You can only play one land per turn.' })
          return
        }
        player.landPlaysThisTurn++
      }
      this.moveCardToZone(player, cardId, 'battlefield')
    })

    this.onMessage('overrideLandPlay', (client, message) => {
      const player = this.requireTurnPlayer(client)
      const cardId = stringField(message, 'cardId')
      if (!player || !cardId) return
      const card = this.findPrivateCard(player, cardId)
      if (!card || card.zone !== 'hand' || !isLandCard(card)) {
        client.send('error', { type: 'error', message: 'No land in hand available to play as an override.' })
        return
      }
      player.landPlaysThisTurn++
      this.moveCardToZone(player, cardId, 'battlefield')
      this.emitEvent({ type: 'turnAnnouncement', playerId: player.id, playerName: player.name, text: `${player.name} played a land override and ends the turn` })
    })

    this.onMessage('tapCard', (client, message) => {
      const player = this.requireTurnPlayer(client)
      const cardId = stringField(message, 'cardId')
      const card = player && cardId ? this.findPublicCard(player, cardId) : undefined
      if (card) card.tapped = !card.tapped
    })

    this.onMessage('moveCard', (client, message) => {
      const player = this.requireTurnPlayer(client)
      const cardId = stringField(message, 'cardId')
      const zone = isRecord(message) && validZone(message.zone) ? message.zone : undefined
      if (player && cardId && zone) this.moveCardToZone(player, cardId, zone)
    })

    this.onMessage('addCounter', (client, message) => this.changeCounter(client, message, 1))
    this.onMessage('removeCounter', (client, message) => this.changeCounter(client, message, -1))

    this.onMessage('revealCard', (client, message) => {
      const player = this.getPlayer(client)
      const cardId = stringField(message, 'cardId')
      const card = player && cardId ? this.findAnyCard(player, cardId) : undefined
      if (card && player) {
        card.revealed = !card.revealed
        this.sendPrivateState(player)
      }
    })

    this.onMessage('drawCards', (client, message) => {
      const player = this.requireTurnPlayer(client)
      const count = Math.min(20, Math.max(1, Math.floor(numberField(message, 'count') ?? 1)))
      if (player) this.drawCards(player, count)
    })

    this.onMessage('addMana', (client, message) => {
      const player = this.getPlayer(client)
      const color = stringField(message, 'color')?.toUpperCase()
      if (player && color && VALID_MANA.has(color)) this.addMana(player, color as keyof Pick<PlayerState, 'manaW' | 'manaU' | 'manaB' | 'manaR' | 'manaG' | 'manaC'>, 1)
    })

    this.onMessage('spendMana', (client, message) => {
      const player = this.getPlayer(client)
      const color = stringField(message, 'color')?.toUpperCase()
      if (player && color && VALID_MANA.has(color)) this.spendMana(player, color as keyof Pick<PlayerState, 'manaW' | 'manaU' | 'manaB' | 'manaR' | 'manaG' | 'manaC'>, 1)
    })

    this.onMessage('clearManaPool', (client) => {
      const player = this.getPlayer(client)
      if (player) this.clearMana(player)
    })

    this.onMessage('setLife', (client, message) => {
      const player = this.getPlayer(client)
      const value = numberField(message, 'value')
      if (player && value !== undefined) {
        player.lifeTotal = Math.max(-999, Math.min(999, Math.round(value)))
        this.checkForGameEnd(player)
      }
    })

    this.onMessage('endTurn', (client) => this.endTurn(client))

    this.onMessage('setPosition', (client, message) => {
      const player = this.getPlayer(client)
      const x = numberField(message, 'x')
      const y = numberField(message, 'y')
      if (!player || x === undefined || y === undefined) return
      player.positionX = Math.max(-10_000, Math.min(10_000, Math.round(x)))
      player.positionY = Math.max(-10_000, Math.min(10_000, Math.round(y)))
    })

    this.onMessage('announceEndTurn', (client) => {
      const player = this.getPlayer(client)
      if (player) this.emitEvent({ type: 'turnAnnouncement', playerId: player.id, playerName: player.name, text: `${player.name} announced end of turn` })
    })

    this.onMessage('addToken', (client, message) => {
      const player = this.getPlayer(client)
      const token = isRecord(message) && isRecord(message.token) ? message.token : undefined
      if (!player || !token || typeof token.id !== 'string' || typeof token.name !== 'string' || typeof token.imageUri !== 'string') return
      player.tokens.push(new TokenState({ id: token.id.slice(0, 120), name: token.name.slice(0, 200), imageUri: token.imageUri.slice(0, 2_000), counters: 0, tapped: false }))
    })

    this.onMessage('removeToken', (client, message) => {
      const player = this.getPlayer(client)
      const tokenId = stringField(message, 'tokenId')
      if (player && tokenId) this.removeToken(player, tokenId)
    })

    this.onMessage('toggleTokenTap', (client, message) => {
      const player = this.getPlayer(client)
      const tokenId = stringField(message, 'tokenId')
      const token = player && tokenId ? this.findToken(player, tokenId) : undefined
      if (token) token.tapped = !token.tapped
    })

    this.onMessage('addTokenCounter', (client, message) => this.changeTokenCounter(client, message, 1))
    this.onMessage('removeTokenCounter', (client, message) => this.changeTokenCounter(client, message, -1))

  }

  private createUtilityMessageContext(): GameRoomUtilityMessageContext {
    return {
      privateZones: this.privateZones,
      onMessage: (type, handler) => this.onMessage(type, handler),
      getPlayer: (client) => this.getPlayer(client),
      sendPrivateState: (player) => this.sendPrivateState(player),
      drawCards: (player, count) => this.drawCards(player, count),
      updateCounts: (player) => this.updateCounts(player),
      emitEvent: (event) => this.emitEvent(event),
      reorderBattlefield: (player, cardId, direction) => this.reorderBattlefield(player, cardId, direction),
      resolveConditionalEntry: (player, cardId, tapped) => this.resolveConditionalEntry(player, cardId, tapped),
      discardCard: (player, cardId) => this.moveCardToZone(player, cardId, 'graveyard'),
    }
  }

  onJoin(client: Client, options?: unknown) {
    const input = isRecord(options) ? options : {}
    const playerId = sanitizeText(input.playerId, client.sessionId, 120)
    const playerName = sanitizeText(input.playerName, 'Player', 24)
    const deckId = sanitizeText(input.deckId, '', 120)
    const cards = normalizeCards(input.cards)
    const reconnecting = this.findPlayerByPlayerId(playerId)

    if (reconnecting?.connected) throw new Error('That player is already connected to this room.')

    let player: PlayerState
    if (reconnecting) {
      this.state.players.delete(reconnecting.sessionId)
      reconnecting.id = client.sessionId
      reconnecting.sessionId = client.sessionId
      reconnecting.connected = true
      player = reconnecting
      this.state.players.set(client.sessionId, player)
    } else {
      const existing = this.connectedPlayers()
      player = new PlayerState({
        id: client.sessionId,
        sessionId: client.sessionId,
        playerId,
        name: playerName,
        teamId: this.assignTeam(existing.length),
        turnOrder: existing.length,
        connected: true,
        ready: existing.length === 0,
        lifeTotal: modeToStartingLife(this.state.gameMode as GameMode),
        deckId,
      })
      this.state.players.set(client.sessionId, player)
    }

    player.name = playerName
    player.deckId = deckId
    if (!this.state.hostId) this.state.hostId = player.id
    this.playerClients.set(player.id, client)
    const privateState = this.privateZones.get(player.playerId) ?? { hand: [], library: [] }
    this.privateZones.set(player.playerId, privateState)
    if (privateState.hand.length === 0 && privateState.library.length === 0 && cards.length > 0) {
      const commanders = cards.filter((card) => card.zone === 'command')
      commanders.forEach((card) => player.command.push(cardToState(card, 'command')))
      privateState.library = shuffleArray(cards.filter((card) => card.zone !== 'command').map((card) => ({ ...card, zone: 'library' as const, revealed: false })))
      this.updateCounts(player)
    }
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId)
    this.playerClients.delete(client.sessionId)
    if (!player) return
    player.connected = false
    player.ready = false
    if (this.state.status === 'waiting') {
      this.state.players.delete(client.sessionId)
      this.privateZones.delete(player.playerId)
      if (this.state.hostId === player.id) this.promoteHost()
    } else if (this.state.hostId === player.id) {
      this.promoteHost()
    }
  }

  onDispose() {
    void this.presence.srem(LOBBY_CHANNEL, this.roomId)
    this.privateZones.clear()
    this.playerClients.clear()
  }

  private getPlayer(client: Client): PlayerState | undefined {
    return this.state.players.get(client.sessionId)
  }

  private requireTurnPlayer(client: Client): PlayerState | undefined {
    const player = this.getPlayer(client)
    return player && this.state.status === 'playing' && this.state.activePlayerId === player.id ? player : undefined
  }

  private connectedPlayers(): PlayerState[] {
    const players: PlayerState[] = []
    this.state.players.forEach((player) => { if (player.connected) players.push(player) })
    return players
  }

  private findPlayerByPlayerId(playerId: string): PlayerState | undefined {
    let result: PlayerState | undefined
    this.state.players.forEach((player) => { if (player.playerId === playerId) result = player })
    return result
  }

  private promoteHost() {
    const next = this.connectedPlayers().sort((a, b) => a.turnOrder - b.turnOrder)[0]
    this.state.hostId = next?.id ?? ''
    if (next && this.state.status === 'waiting') next.ready = true
  }

  private findPublicCard(player: PlayerState, cardId: string): CardState | undefined {
    for (const zone of [player.battlefield, player.graveyard, player.exile, player.command]) {
      const card = zone.find((candidate) => candidate.id === cardId)
      if (card) return card
    }
    return undefined
  }

  private findPublicZone(player: PlayerState, cardId: string): Zone | undefined {
    for (const [name, zone] of [
      ['battlefield', player.battlefield],
      ['graveyard', player.graveyard],
      ['exile', player.exile],
      ['command', player.command],
    ] as const) {
      if (zone.find((candidate) => candidate.id === cardId)) return name
    }
    return undefined
  }

  private findPrivateCard(player: PlayerState, cardId: string): CardData | undefined {
    const privateState = this.privateZones.get(player.playerId)
    return privateState?.hand.find((card) => card.id === cardId) ?? privateState?.library.find((card) => card.id === cardId)
  }

  private findAnyCard(player: PlayerState, cardId: string): CardState | CardData | undefined {
    return this.findPublicCard(player, cardId) ?? this.findPrivateCard(player, cardId)
  }

  private removePrivateCard(player: PlayerState, cardId: string, source: 'hand' | 'library' = 'hand'): CardData | undefined {
    const privateState = this.privateZones.get(player.playerId)
    if (!privateState) return undefined
    const cards = privateState[source]
    const index = cards.findIndex((card) => card.id === cardId)
    if (index >= 0) return cards.splice(index, 1)[0]
    return undefined
  }

  private removePublicCard(player: PlayerState, cardId: string): CardState | undefined {
    for (const zone of [player.battlefield, player.graveyard, player.exile, player.command]) {
      const index = zone.findIndex((card) => card.id === cardId)
      if (index >= 0) return zone.splice(index, 1)[0]
    }
    return undefined
  }

  private moveCardToZone(player: PlayerState, cardId: string, destination: Zone) {
    const privateState = this.privateZones.get(player.playerId)
    if (!privateState) return
    if (destination === 'hand' || destination === 'library') {
      const card = this.removePublicCard(player, cardId)
      if (card) privateState[destination].push({ ...stateToCard(card, destination), revealed: destination === 'library' ? false : card.revealed })
      this.updateCounts(player)
      this.sendPrivateState(player)
      return
    }

    const privateCard = this.removePrivateCard(player, cardId)
    const sourceZone = privateCard ? privateCard.zone : this.findPublicZone(player, cardId)
    const publicCard = privateCard ? cardToState(privateCard, destination) : this.removePublicCard(player, cardId)
    if (!publicCard) return
    publicCard.zone = destination
    publicCard.revealed = true
    if (destination === 'battlefield') {
      publicCard.tapped = entersTappedOnBattlefield(publicCard, player.battlefield)
      if (sourceZone === 'command') publicCard.commanderTax = publicCard.commanderTax + 1
    }
    this.publicZone(player, destination)?.push(publicCard)
    this.updateCounts(player)
    this.sendPrivateState(player)
  }

  private publicZone(player: PlayerState, zone: Zone) {
    switch (zone) {
      case 'battlefield': return player.battlefield
      case 'graveyard': return player.graveyard
      case 'exile': return player.exile
      case 'command': return player.command
      default: return undefined
    }
  }

  private drawCards(player: PlayerState, count: number) {
    const privateState = this.privateZones.get(player.playerId)
    if (!privateState) return
    for (let i = 0; i < count && privateState.library.length > 0; i++) {
      privateState.hand.push({ ...privateState.library.pop()!, zone: 'hand', revealed: false })
    }
    this.updateCounts(player)
    this.sendPrivateState(player)
  }

  private prepareOpeningHand(player: PlayerState) {
    const privateState = this.privateZones.get(player.playerId)
    if (!privateState) return
    privateState.library = shuffleArray([...privateState.library, ...privateState.hand])
    privateState.hand = []
    this.drawCards(player, OPENING_HAND_SIZE)
  }

  private updateCounts(player: PlayerState) {
    const privateState = this.privateZones.get(player.playerId)
    player.handCount = privateState?.hand.length ?? 0
    player.libraryCount = privateState?.library.length ?? 0
  }

  private reorderBattlefield(player: PlayerState, cardId: string, direction: 'closer' | 'farther') {
    const index = player.battlefield.findIndex((card) => card.id === cardId)
    const nextIndex = direction === 'closer' ? index - 1 : index + 1
    if (index < 0 || nextIndex < 0 || nextIndex >= player.battlefield.length) return
    const current = player.battlefield[index]
    const next = player.battlefield[nextIndex]
    player.battlefield[index] = next
    player.battlefield[nextIndex] = current
  }

  private resolveConditionalEntry(player: PlayerState, cardId: string, tapped: boolean) {
    const card = this.findPublicCard(player, cardId)
    if (card) card.tapped = tapped
  }

  private sendPrivateState(player: PlayerState) {
    const client = this.playerClients.get(player.id)
    const privateState = this.privateZones.get(player.playerId)
    if (client && privateState) client.send('privateState', { type: 'privateState', hand: privateState.hand, libraryCount: privateState.library.length })
  }

  private changeCounter(client: Client, message: unknown, amount: number) {
    const player = this.getPlayer(client)
    const cardId = stringField(message, 'cardId')
    const card = player && cardId ? this.findPublicCard(player, cardId) : undefined
    if (card) card.counters = Math.max(0, Math.min(999, card.counters + amount))
  }

  private addMana(player: PlayerState, color: keyof Pick<PlayerState, 'manaW' | 'manaU' | 'manaB' | 'manaR' | 'manaG' | 'manaC'>, amount: number) {
    player[color] = Math.min(999, player[color] + amount)
  }

  private spendMana(player: PlayerState, color: keyof Pick<PlayerState, 'manaW' | 'manaU' | 'manaB' | 'manaR' | 'manaG' | 'manaC'>, amount: number) {
    player[color] = Math.max(0, player[color] - amount)
  }

  private clearMana(player: PlayerState) {
    player.manaW = 0; player.manaU = 0; player.manaB = 0
    player.manaR = 0; player.manaG = 0; player.manaC = 0
  }

  private checkForGameEnd(eliminated: PlayerState) {
    if (this.state.status !== 'playing' || eliminated.lifeTotal > 0) return
    this.state.status = 'finished'
    const winners = this.connectedPlayers()
      .filter((candidate) => candidate.id !== eliminated.id && candidate.teamId !== eliminated.teamId)
      .sort((a, b) => a.turnOrder - b.turnOrder)
    this.emitEvent({ type: 'gameEnded', winnerId: winners[0]?.id, reason: 'life' })
  }

  private endTurn(client: Client) {
    const player = this.requireTurnPlayer(client)
    if (!player) return
    player.battlefield.forEach((card) => { card.tapped = false })
    player.landPlaysThisTurn = 0
    this.clearMana(player)
    this.drawCards(player, 1)
    const players = this.connectedPlayers().sort((a, b) => a.turnOrder - b.turnOrder)
    const index = players.findIndex((candidate) => candidate.id === player.id)
    const next = players[(index + 1) % players.length]
    if (!next) return
    this.state.activePlayerId = next.id
    this.state.turn++
    this.emitEvent({ type: 'turnChanged', playerId: next.id, turnNumber: this.state.turn })
  }

  private findToken(player: PlayerState, tokenId: string) {
    return player.tokens.find((token) => token.id === tokenId)
  }

  private removeToken(player: PlayerState, tokenId: string) {
    const index = player.tokens.findIndex((token) => token.id === tokenId)
    if (index >= 0) player.tokens.splice(index, 1)
  }

  private changeTokenCounter(client: Client, message: unknown, amount: number) {
    const player = this.getPlayer(client)
    const tokenId = stringField(message, 'tokenId')
    const token = player && tokenId ? this.findToken(player, tokenId) : undefined
    if (token) token.counters = Math.max(0, Math.min(999, token.counters + amount))
  }

  private emitEvent(event: ServerEvent) {
    this.broadcast(event.type, event)
  }

  private assignTeam(index: number): string {
    return this.state.gameMode === '2v2' ? (index < 2 ? 'team1' : 'team2') : ''
  }
}
