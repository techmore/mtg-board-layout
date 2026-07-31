import type { Room } from '@colyseus/sdk'
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
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

const PLAYER_ID_KEY = 'mtg-board-player-id'
const RoomSessionContext = createContext<RoomSessionValue | null>(null)

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

function withPlayerId(options: RoomJoinOptions): RoomJoinOptions {
  return { ...options, playerId: options.playerId ?? getStablePlayerId() }
}

export function RoomSessionProvider({ children }: { children: React.ReactNode }) {
  const [room, setRoom] = useState<Room | null>(null)
  const [state, setState] = useState<GameRoomState | null>(null)
  const [privateState, setPrivateState] = useState<PrivateState>({ hand: [], libraryCount: 0 })
  const [lastEvent, setLastEvent] = useState<ServerEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [serverUrl, setServerUrl] = useState(getStoredServerUrl)
  const roomRef = useRef<Room | null>(null)
  const roomServerUrlRef = useRef(serverUrl)
  const connectingRef = useRef<Promise<void> | null>(null)

  const attachRoom = useCallback((joined: Room, connectedServerUrl: string) => {
    roomRef.current = joined
    roomServerUrlRef.current = connectedServerUrl
    setRoom(joined)
    setServerUrl(connectedServerUrl)
    setState(createSnapshot(joined))
    setError(null)
    joined.onStateChange(() => setState(createSnapshot(joined)))
    const eventTypes = ['gameStarted', 'gameEnded', 'error', 'chatMessage', 'turnChanged', 'diceRolled', 'coinFlipped', 'privateState', 'turnAnnouncement']
    for (const eventType of eventTypes) {
      joined.onMessage(eventType, (event: unknown) => {
        if (eventType === 'privateState' && event && typeof event === 'object') {
          setPrivateState(normalizePrivateState(event))
          return
        }
        setLastEvent(event as ServerEvent)
      })
    }
    joined.send('requestPrivateState', { type: 'requestPrivateState' })
  }, [])

  const adopt = useCallback((joined: Room, connectedServerUrl = roomServerUrlRef.current) => {
    if (roomRef.current && roomRef.current !== joined) roomRef.current.leave()
    attachRoom(joined, normalizeServerUrl(connectedServerUrl))
  }, [attachRoom])

  const connect = useCallback(async (roomId: string, options: RoomJoinOptions, requestedServerUrl = getStoredServerUrl()) => {
    if (!roomId) throw new Error('A room code is required.')
    const connectedServerUrl = normalizeServerUrl(requestedServerUrl)
    if (roomRef.current?.roomId === roomId && roomServerUrlRef.current === connectedServerUrl) return
    if (connectingRef.current) return connectingRef.current
    if (roomRef.current) roomRef.current.leave()
    setIsConnecting(true)
    setError(null)
    const promise = joinRoom(roomId, withPlayerId(options), connectedServerUrl)
      .then((joined) => attachRoom(joined, connectedServerUrl))
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : 'Could not connect to the game room.'
        setError(message)
        throw cause
      })
      .finally(() => {
        connectingRef.current = null
        setIsConnecting(false)
      })
    connectingRef.current = promise
    return promise
  }, [attachRoom])

  const sendAction = useCallback((action: PlayerAction) => {
    roomRef.current?.send(action.type, action)
  }, [])

  const leave = useCallback(() => {
    roomRef.current?.leave()
    roomRef.current = null
    setRoom(null)
    setState(null)
    setPrivateState({ hand: [], libraryCount: 0 })
    setLastEvent(null)
  }, [])

  useEffect(() => () => {
    void roomRef.current?.leave()
  }, [])

  const value = useMemo(() => ({ room, state, privateState, lastEvent, error, isConnecting, serverUrl, connect, adopt, sendAction, leave }), [room, state, privateState, lastEvent, error, isConnecting, serverUrl, connect, adopt, sendAction, leave])
  return createElement(RoomSessionContext.Provider, { value }, children)
}

export function useRoomSession(): RoomSessionValue {
  const value = useContext(RoomSessionContext)
  if (!value) throw new Error('useRoomSession must be used inside RoomSessionProvider')
  return value
}

export function createRoom(options: RoomCreateOptions, serverUrl = getStoredServerUrl()): Promise<Room> {
  return createClient(serverUrl).create('game_room', withPlayerId(options))
}

export function joinRoom(roomId: string, options: RoomJoinOptions, serverUrl = getStoredServerUrl()): Promise<Room> {
  return createClient(serverUrl).joinById(roomId, withPlayerId(options))
}
