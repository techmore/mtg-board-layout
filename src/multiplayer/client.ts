import { Client } from '@colyseus/sdk'
import { DEFAULT_SERVER_URL, normalizeServerUrl } from './serverUrl'

export function createClient(serverUrl: string = DEFAULT_SERVER_URL): Client {
  return new Client(normalizeServerUrl(serverUrl))
}
