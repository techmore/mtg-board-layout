import http from 'http'
import cors from 'cors'
import express from 'express'
import { Server } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { GameRoom } from './rooms/GameRoom.js'

const PORT = Number(process.env.PORT ?? 2567)

const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({ name: 'MTG Board Server', version: '0.0.1', status: 'running' })
})

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: http.createServer(app),
  }),
})

gameServer.define('game_room', GameRoom)

gameServer.listen(PORT)
console.log(`[MTG Server] Listening on ws://localhost:${PORT}`)
