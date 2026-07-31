export const DEFAULT_SERVER_URL = import.meta.env.VITE_COLYSEUS_URL ?? 'ws://localhost:2567'
export const SERVER_URL_STORAGE_KEY = 'mtg-board-server-url'

/** Accepts a hostname, IP address, HTTP(S) URL, or WebSocket URL. */
export function normalizeServerUrl(value: string): string {
  const input = value.trim()
  if (!input) throw new Error('Enter a server hostname, IP address, or URL.')

  const isBareHost = !/^[a-z][a-z\d+.-]*:\/\//i.test(input)
  const candidate = isBareHost ? `ws://${input}` : input
  const parsed = new URL(candidate)

  if (parsed.protocol === 'http:') parsed.protocol = 'ws:'
  if (parsed.protocol === 'https:') parsed.protocol = 'wss:'
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('Use a hostname, IP address, http(s) URL, or ws(s) URL.')
  }
  if (!parsed.hostname) throw new Error('Enter a valid server hostname or IP address.')
  if (isBareHost && !parsed.port) parsed.port = '2567'

  return parsed.toString().replace(/\/$/, '')
}

export function getStoredServerUrl(): string {
  if (typeof window === 'undefined') return normalizeServerUrl(DEFAULT_SERVER_URL)
  try {
    const saved = window.localStorage.getItem(SERVER_URL_STORAGE_KEY)
    return saved ? normalizeServerUrl(saved) : normalizeServerUrl(DEFAULT_SERVER_URL)
  } catch {
    return normalizeServerUrl(DEFAULT_SERVER_URL)
  }
}

export function saveServerUrl(value: string): string {
  const normalized = normalizeServerUrl(value)
  if (typeof window !== 'undefined') window.localStorage.setItem(SERVER_URL_STORAGE_KEY, normalized)
  return normalized
}

export function getServerUrlFromSearchParams(searchParams: URLSearchParams): string {
  const requested = searchParams.get('server')
  if (requested) {
    try {
      return normalizeServerUrl(requested)
    } catch {
      // A malformed invite should not prevent the player from using their saved server.
    }
  }
  return getStoredServerUrl()
}
