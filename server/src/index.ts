import http from 'http'
import cors from 'cors'
import express from 'express'
import { Server } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { GameRoom } from './rooms/GameRoom.js'

const PORT = Number(process.env.PORT ?? 2567)
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*'

// ─── Per-IP connection rate limiting ──────────────────────────────
// A client can legitimately open a handful of connections (a tab, a reconnect),
// but hundreds from one address indicates code-guessing or a stuck client.
// Cap connection *attempts* per IP per minute; active-connection tracking is
// left to the OS (WebSockets close on disconnect anyway).
const MAX_ATTEMPTS_PER_IP_PER_MINUTE = 30
const ipAttempts = new Map<string, number[]>()
function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (ipAttempts.get(ip) ?? []).filter((t) => now - t < 60_000)
  if (recent.length >= MAX_ATTEMPTS_PER_IP_PER_MINUTE) {
    ipAttempts.set(ip, recent)
    return true
  }
  recent.push(now)
  ipAttempts.set(ip, recent)
  return false
}
// Prune the limiter map so long-lived servers don't accumulate entries.
setInterval(() => {
  const cutoff = Date.now() - 60_000
  for (const [ip, attempts] of ipAttempts) {
    const recent = attempts.filter((t) => t >= cutoff)
    if (recent.length === 0) ipAttempts.delete(ip)
    else ipAttempts.set(ip, recent)
  }
}, 60_000).unref()

function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim()
  return req.socket.remoteAddress ?? 'unknown'
}

// ─── HTTP app ─────────────────────────────────────────────────────
const app = express()
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',') }))
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({ name: 'MTG Board Server', version: '0.0.1', status: 'running' })
})

// ─── Colyseus server ──────────────────────────────────────────────
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: http.createServer(app),
    // Reject WebSocket upgrades from rate-limited addresses before a room is
    // even joined (cheap, no room state touched).
    verifyClient: (info, callback) => {
      if (isRateLimited(getClientIp(info.req))) {
        callback(false, 429, 'Too many connection attempts — try again in a minute.')
        return
      }
      callback(true)
    },
  }),
})

gameServer.define('game_room', GameRoom)

gameServer.listen(PORT)
console.log(`[MTG Server] Listening on ws://localhost:${PORT}`)
