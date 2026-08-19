import type { Room } from '@colyseus/sdk'
import { useSyncExternalStore } from 'react'
import { createClient } from './client'
import { getStoredServerUrl, normalizeServerUrl } from './serverUrl'
import { createSnapshot, normalizePrivateState } from './roomState'
import type { GameRoomState, PrivateState } from './roomState'
import type {
  PlayerAction,
  RoomCreateOptions,
  RoomJoinOptions,
  ServerEvent,
} from 'mtg-protocol'

interface RoomSessionValue {
  room: Room | null
  state: GameRoomState | null
  privateState: PrivateState
  lastEvent: ServerEvent | null
  error: string | null
  isConnecting: boolean
  serverUrl: string
  connect: (roomId: string, options: RoomJoinOptions, serverUrl?: string) => Promise<void>
  adopt: (room: Room, serverUrl?: string) => void
  sendAction: (action: PlayerAction) => void
  leave: () => void
}

/**
 * The room session is a module-level singleton rather than a React context so
 * the multiplayer connection survives route transitions (lobby -> game room ->
 * board) without a provider wrapper. It also keeps the Colyseus SDK out of the
 * main bundle: useRoom is only imported by the lazy multiplayer pages.
 */

const PLAYER_ID_KEY = 'mtg-board-player-id'
const PLAYER_AUTH_KEY = 'mtg-board-player-auth'

function getStablePlayerId(): string {
  if (typeof window === 'undefined') return 'server-player'
  try {
    const existing = window.sessionStorage.getItem(PLAYER_ID_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    window.sessionStorage.setItem(PLAYER_ID_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

/** The reconnect auth token issued by the server on first join. */
function getStoredAuthToken(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.sessionStorage.getItem(PLAYER_AUTH_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function withPlayerId(options: RoomJoinOptions): RoomJoinOptions {
  const authToken = getStoredAuthToken()
  return {
    ...options,
    playerId: options.playerId ?? getStablePlayerId(),
    ...(authToken ? { authToken } : {}),
  }
}

let sessionState: RoomSessionValue = {
  room: null,
  state: null,
  privateState: { hand: [], libraryCount: 0 },
  lastEvent: null,
  error: null,
  isConnecting: false,
  serverUrl: getStoredServerUrl(),
  connect: () => Promise.resolve(),
  adopt: () => {},
  sendAction: () => {},
  leave: () => {},
}

const listeners = new Set<() => void>()
function setSession(partial: Partial<RoomSessionValue>) {
  sessionState = { ...sessionState, ...partial }
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
function getSession(): RoomSessionValue {
  return sessionState
}

let roomRef: Room | null = null
let roomServerUrlRef = sessionState.serverUrl
let connectingRef: Promise<void> | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

function attachRoom(joined: Room, connectedServerUrl: string) {
  roomRef = joined
  roomServerUrlRef = connectedServerUrl
  setSession({
    room: joined,
    serverUrl: connectedServerUrl,
    state: createSnapshot(joined),
    error: null,
  })
  // Coalesce burst patches (e.g. a combat resolution mutates many cards in a
  // row) into a single snapshot instead of cloning every player's zones per
  // patch.
  joined.onStateChange(() => {
    if (snapshotTimer) clearTimeout(snapshotTimer)
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null
      if (roomRef === joined) setSession({ state: createSnapshot(joined) })
    }, 50)
  })
  const eventTypes = ['gameStarted', 'gameEnded', 'error', 'chatMessage', 'turnChanged', 'diceRolled', 'coinFlipped', 'privateState', 'turnAnnouncement', 'authToken']
  for (const eventType of eventTypes) {
    joined.onMessage(eventType, (event: unknown) => {
      if (eventType === 'privateState' && event && typeof event === 'object') {
        setSession({ privateState: normalizePrivateState(event) })
        return
      }
      // Persist the reconnect token issued for this player.
      if (eventType === 'authToken' && event && typeof event === 'object') {
        const token = (event as { token?: unknown }).token
        if (typeof token === 'string') {
          try { window.sessionStorage.setItem(PLAYER_AUTH_KEY, token) } catch { /* non-fatal */ }
        }
        return
      }
      setSession({ lastEvent: event as ServerEvent })
    })
  }
  joined.send('requestPrivateState', { type: 'requestPrivateState' })
}

export function adopt(joined: Room, connectedServerUrl = roomServerUrlRef) {
  if (roomRef && roomRef !== joined) roomRef.leave()
  attachRoom(joined, normalizeServerUrl(connectedServerUrl))
}

export async function connect(roomId: string, options: RoomJoinOptions, requestedServerUrl = getStoredServerUrl()): Promise<void> {
  if (!roomId) throw new Error('A room code is required.')
  const connectedServerUrl = normalizeServerUrl(requestedServerUrl)
  if (roomRef?.roomId === roomId && roomServerUrlRef === connectedServerUrl) return
  if (connectingRef) return connectingRef
  if (roomRef) roomRef.leave()
  setSession({ isConnecting: true, error: null })
  const promise = joinRoom(roomId, withPlayerId(options), connectedServerUrl)
    .then((joined) => attachRoom(joined, connectedServerUrl))
    .catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : 'Could not connect to the game room.'
      setSession({ error: message })
      throw cause
    })
    .finally(() => {
      connectingRef = null
      setSession({ isConnecting: false })
    })
  connectingRef = promise
  return promise
}

export function sendAction(action: PlayerAction) {
  roomRef?.send(action.type, action)
}

export function leave() {
  roomRef?.leave()
  roomRef = null
  if (snapshotTimer) {
    clearTimeout(snapshotTimer)
    snapshotTimer = null
  }
  setSession({
    room: null,
    state: null,
    privateState: { hand: [], libraryCount: 0 },
    lastEvent: null,
  })
}

export function useRoomSession(): RoomSessionValue {
  return useSyncExternalStore(subscribe, getSession)
}

/**
 * Slice subscriptions: components re-render only when the subscribed slice
 * changes. A chat message or dice roll updates `lastEvent` without re-rendering
 * the whole board (the state object reference is unchanged).
 */
export function useRoomState(): GameRoomState | null {
  return useSyncExternalStore(subscribe, () => sessionState.state)
}

export function useRoomPrivateState(): PrivateState {
  return useSyncExternalStore(subscribe, () => sessionState.privateState)
}

export function useRoomLastEvent(): ServerEvent | null {
  return useSyncExternalStore(subscribe, () => sessionState.lastEvent)
}

/** Primitive slices stay stable across unrelated session changes. */
export function useRoomError(): string | null {
  return useSyncExternalStore(subscribe, () => sessionState.error)
}

export function useRoomConnecting(): boolean {
  return useSyncExternalStore(subscribe, () => sessionState.isConnecting)
}

export function useRoomServerUrl(): string {
  return useSyncExternalStore(subscribe, () => sessionState.serverUrl)
}

export function useRoomInstance(): Room | null {
  return useSyncExternalStore(subscribe, () => sessionState.room)
}

export function createRoom(options: RoomCreateOptions, serverUrl = getStoredServerUrl()): Promise<Room> {
  return createClient(serverUrl).create('game_room', withPlayerId(options))
}

export function joinRoom(roomId: string, options: RoomJoinOptions, serverUrl = getStoredServerUrl()): Promise<Room> {
  return createClient(serverUrl).joinById(roomId, withPlayerId(options))
}
