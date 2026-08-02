// ═══════════════════════════════════════════════════════════════
// mtg-protocol — shared types for client↔server communication
// ═══════════════════════════════════════════════════════════════

// ─── Mana ────────────────────────────────────────────────────

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C'

// ─── Game Modes ─────────────────────────────────────────────

export type GameMode = '1v1' | '2v2' | '4ffa'
export type GameStatus = 'waiting' | 'playing' | 'finished'

// ─── Zones ──────────────────────────────────────────────────

export type Zone = 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'library' | 'command'

// ─── Card type (minimal, synced via Colyseus schema) ────────

export interface CardData {
  id: string
  scryfallId: string
  name: string
  imageUri: string
  oracleText: string
  zone: Zone
  tapped: boolean
  counters: number
  damage?: number
  type: string
  typeLine: string
  subtypes: string[]
  isBasicLand: boolean
  commanderTax: number
  revealed: boolean
}

// ─── Token data ─────────────────────────────────────────────

export interface TokenData {
  id: string
  name: string
  imageUri: string
  counters: number
  tapped: boolean
}

// ═══════════════════════════════════════════════════════════════
// Client → Server: Actions
// ═══════════════════════════════════════════════════════════════

export interface ReadyAction {
  type: 'ready'
}

export interface RequestPrivateStateAction {
  type: 'requestPrivateState'
}

export interface StartGameAction {
  type: 'startGame'
}

export interface PlayCardAction {
  type: 'playCard'
  cardId: string
}

export interface TapCardAction {
  type: 'tapCard'
  cardId: string
}

export interface MoveCardAction {
  type: 'moveCard'
  cardId: string
  zone: Zone
}

export interface AddCounterAction {
  type: 'addCounter'
  cardId: string
}

export interface RemoveCounterAction {
  type: 'removeCounter'
  cardId: string
}

export interface RevealCardAction {
  type: 'revealCard'
  cardId: string
}

export interface DrawCardsAction {
  type: 'drawCards'
  count?: number
}

export interface AddManaAction {
  type: 'addMana'
  color: ManaColor
}

export interface SpendManaAction {
  type: 'spendMana'
  color: ManaColor
  usage?: 'spell' | 'creature' | 'ability'
  label?: string
}

export interface ClearManaPoolAction {
  type: 'clearManaPool'
}

export interface EndTurnAction {
  type: 'endTurn'
}

export interface DeclareAttackersAction {
  type: 'declareAttackers'
  attackerIds: string[]
}

export interface DeclareBlockersAction {
  type: 'declareBlockers'
  blockerIds: string[]
}

export interface ResolveCombatAction {
  type: 'resolveCombat'
}

export interface SetPositionAction {
  type: 'setPosition'
  x: number
  y: number
}

export interface AnnounceEndTurnAction {
  type: 'announceEndTurn'
}

export interface AddTokenAction {
  type: 'addToken'
  token: TokenData
}

export interface RemoveTokenAction {
  type: 'removeToken'
  tokenId: string
}

export interface ToggleTokenTapAction {
  type: 'toggleTokenTap'
  tokenId: string
}

export interface AddTokenCounterAction {
  type: 'addTokenCounter'
  tokenId: string
}

export interface RemoveTokenCounterAction {
  type: 'removeTokenCounter'
  tokenId: string
}

export interface SetLifeAction {
  type: 'setLife'
  value: number
}

export interface ChatMessageAction {
  type: 'chatMessage'
  text: string
}

export interface ReshuffleAction {
  type: 'reshuffle'
}

export interface RedealAction {
  type: 'redeal'
  openingHandSize?: number
}

export interface RollDiceAction {
  type: 'rollDice'
}

export interface FlipCoinAction {
  type: 'flipCoin'
}

export interface ReorderBattlefieldAction {
  type: 'reorderBattlefield'
  cardId: string
  direction: 'closer' | 'farther'
}

export interface OverrideLandPlayAction {
  type: 'overrideLandPlay'
  cardId: string
}

export interface ResolveConditionalEntryAction {
  type: 'resolveConditionalEntry'
  cardId: string
  tapped: boolean
}

export interface DiscardCardAction {
  type: 'discardCard'
  cardId: string
}

/**
 * Every action a client can send to the server.
 */
export type PlayerAction =
  | ReadyAction
  | RequestPrivateStateAction
  | StartGameAction
  | PlayCardAction
  | TapCardAction
  | MoveCardAction
  | AddCounterAction
  | RemoveCounterAction
  | RevealCardAction
  | DrawCardsAction
  | AddManaAction
  | SpendManaAction
  | ClearManaPoolAction
  | EndTurnAction
  | DeclareAttackersAction
  | DeclareBlockersAction
  | ResolveCombatAction
  | SetPositionAction
  | AnnounceEndTurnAction
  | AddTokenAction
  | RemoveTokenAction
  | ToggleTokenTapAction
  | AddTokenCounterAction
  | RemoveTokenCounterAction
  | SetLifeAction
  | ChatMessageAction
  | ReshuffleAction
  | RedealAction
  | RollDiceAction
  | FlipCoinAction
  | ReorderBattlefieldAction
  | OverrideLandPlayAction
  | ResolveConditionalEntryAction
  | DiscardCardAction

// ═══════════════════════════════════════════════════════════════
// Server → Client: Events
// ═══════════════════════════════════════════════════════════════

export interface GameStartedEvent {
  type: 'gameStarted'
}

export interface GameEndedEvent {
  type: 'gameEnded'
  winnerId?: string
  reason?: string
}

export interface ErrorEvent {
  type: 'error'
  message: string
}

export interface ChatMessageEvent {
  type: 'chatMessage'
  playerId: string
  playerName: string
  text: string
}

export interface TurnChangedEvent {
  type: 'turnChanged'
  playerId: string
  turnNumber: number
}

export interface DiceRolledEvent {
  type: 'diceRolled'
  playerId: string
  result: number
}

export interface CoinFlippedEvent {
  type: 'coinFlipped'
  playerId: string
  result: 'heads' | 'tails'
}

export interface PrivateStateEvent {
  type: 'privateState'
  hand: CardData[]
  libraryCount: number
}

export interface TurnAnnouncementEvent {
  type: 'turnAnnouncement'
  playerId: string
  playerName: string
  text: string
}

/**
 * Every event the server can broadcast to clients.
 */
export type ServerEvent =
  | GameStartedEvent
  | GameEndedEvent
  | ErrorEvent
  | ChatMessageEvent
  | TurnChangedEvent
  | DiceRolledEvent
  | CoinFlippedEvent
  | PrivateStateEvent
  | TurnAnnouncementEvent

// ═══════════════════════════════════════════════════════════════
// Shared data structures (used by both server schema & client UI)
// ═══════════════════════════════════════════════════════════════

export interface RoomPlayerInfo {
  id: string
  sessionId: string
  playerId: string
  name: string
  teamId?: string
  turnOrder: number
  ready: boolean
  connected: boolean
  deckId?: string
  lifeTotal: number
  landPlaysThisTurn: number
  mana: Record<ManaColor, number>
  battlefield: CardData[]
  graveyard: CardData[]
  exile: CardData[]
  command: CardData[]
  tokens: TokenData[]
  handCount: number
  libraryCount: number
  positionX: number
  positionY: number
}

// ═══════════════════════════════════════════════════════════════
// Room creation / join options
// ═══════════════════════════════════════════════════════════════

export interface RoomCreateOptions {
  gameMode: GameMode
  playerName: string
  deckId: string
  playerId?: string
  cards?: CardData[]
}

export interface RoomJoinOptions {
  playerName: string
  deckId: string
  playerId?: string
  cards?: CardData[]
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

export function modeToMaxPlayers(mode: GameMode): number {
  switch (mode) {
    case '1v1': return 2
    case '2v2': return 4
    case '4ffa': return 4
  }
}

export function modeToStartingLife(mode: GameMode): number {
  switch (mode) {
    case '1v1': return 20
    case '2v2': return 30
    case '4ffa': return 40
  }
}

export function modeToLabel(mode: GameMode): string {
  switch (mode) {
    case '1v1': return '1 vs 1'
    case '2v2': return '2 vs 2 (Two-Headed Giant)'
    case '4ffa': return '4-Player Free for All'
  }
}

export { evaluateConditionalEntryTap } from './entryTap.js'
export type { EntryTapCard, EntryTapBattlefieldCard } from './entryTap.js'
