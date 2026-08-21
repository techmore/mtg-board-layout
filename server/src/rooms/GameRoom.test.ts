import { describe, expect, it, vi } from 'vitest'
import type { Client } from '@colyseus/core'
import type { CardData } from 'mtg-protocol'
import { GameRoom } from './GameRoom.js'
import { cardToState } from './roomUtils.js'

/** Minimal Client mock: the room only reads sessionId and calls client.send. */
function makeClient(id: string) {
  return { sessionId: id, send: vi.fn() } as unknown as Client
}

function makeCards(opts: { library?: number; commanderPower?: string; allLands?: boolean; manaCost?: string } = {}): CardData[] {
  const { library = 20, commanderPower = '1/1', allLands = false, manaCost } = opts
  const [p, t] = commanderPower.split('/')
  const cards: CardData[] = [{
    id: 'cmd', scryfallId: 'cmd-id', name: 'Commander', imageUri: '', oracleText: '', zone: 'command',
    tapped: false, counters: 0, power: p, toughness: t, manaCost, type: 'creature', typeLine: `Creature ${commanderPower}`,
    subtypes: [], isBasicLand: false, commanderTax: 0, revealed: true, isCommander: true,
  }]
  for (let i = 0; i < library; i++) {
    const land = allLands
    cards.push({
      id: `c${i}`, scryfallId: `s${i}`, name: land ? 'Forest' : `Card ${i}`, imageUri: '', oracleText: '',
      zone: 'library', tapped: false, counters: 0, power: land ? '' : '1', toughness: land ? '' : '1',
      manaCost: land ? undefined : manaCost,
      type: land ? 'land' : 'creature', typeLine: land ? 'Basic Land — Forest' : 'Creature 1/1',
      subtypes: [], isBasicLand: land, commanderTax: 0, revealed: false,
    })
  }
  return cards
}

interface RoomHarness {
  room: GameRoom
  alice: Client
  bob: Client
  aliceId: string
  bobId: string
}

/** Create a room, join two players, and start the game (alice hosts). */
async function makeGame(opts: { cards?: CardData[]; mode?: '1v1' | '2v2' | '4ffa' } = {}): Promise<RoomHarness> {
  const room = new GameRoom()
  room.presence = {
    smembers: vi.fn().mockResolvedValue([] as string[]),
    sadd: vi.fn().mockResolvedValue(1),
  } as unknown as GameRoom['presence']
  await room.onCreate({ gameMode: opts.mode ?? '1v1' })

  const alice = makeClient('alice-session')
  const bob = makeClient('bob-session')
  const cards = opts.cards ?? makeCards()
  room.onJoin(alice, { playerId: 'alice', playerName: 'Alice', deckId: 'a-deck', cards })
  room.onJoin(bob, { playerId: 'bob', playerName: 'Bob', deckId: 'b-deck', cards })
  return { room, alice, bob, aliceId: 'alice-session', bobId: 'bob-session' }
}

/** Dispatch a registered room message as if it arrived from the network. */
function dispatch(room: GameRoom, type: string, client: Client, message?: unknown) {
  const emitter = (room as unknown as { onMessageEvents: { emit: (t: string, c: unknown, m?: unknown) => void } }).onMessageEvents
  emitter.emit(type, client, message)
}

/** Latest privateState hand captured for a client's `send` calls. */
function capturedHand(client: Client): CardData[] {
  const sends = (client.send as ReturnType<typeof vi.fn>).mock.calls
  for (let i = sends.length - 1; i >= 0; i--) {
    const [type, message] = sends[i] as [string, { type: string; hand?: CardData[] }]
    if (type === 'privateState' && message?.hand) return message.hand
  }
  return []
}

/** The last payload sent for a message type (e.g. the issued auth token). */
function capturedSend(client: Client, type: string): unknown {
  const sends = (client.send as ReturnType<typeof vi.fn>).mock.calls
  for (let i = sends.length - 1; i >= 0; i--) {
    if (sends[i][0] === type) return (sends[i] as unknown[])[1]
  }
  return undefined
}

/** Start the game and force the given client to be the active player. */
function startAndActivate(room: GameRoom, host: Client, other: Client, active: Client) {
  dispatch(room, 'ready', other, {})
  dispatch(room, 'startGame', host, {})
  expect(room.state.status).toBe('playing')
  room.state.activePlayerId = active.sessionId
}

describe('GameRoom (integration)', () => {
  it('starts only for the host with a full table of ready players', async () => {
    const { room, alice, bob } = await makeGame()

    // Non-host cannot start.
    dispatch(room, 'startGame', bob, {})
    expect(room.state.status).toBe('waiting')

    // Host cannot start with an unready table (bob has not marked ready).
    dispatch(room, 'startGame', alice, {})
    expect(room.state.status).toBe('waiting')

    // With everyone ready the game starts.
    dispatch(room, 'ready', bob, {})
    dispatch(room, 'startGame', alice, {})
    expect(room.state.status).toBe('playing')
    expect(room.state.players.size).toBe(2)
  })

  it('deals a 7-card opening hand and never leaks hand contents into the synced state', async () => {
    const { room, alice, bob, aliceId, bobId } = await makeGame()
    dispatch(room, 'ready', bob, {})
    dispatch(room, 'startGame', alice, {})

    const aliceHand = capturedHand(alice)
    const bobHand = capturedHand(bob)
    expect(aliceHand).toHaveLength(7)
    expect(bobHand).toHaveLength(7)
    // Hand contents are owner-scoped: Alice's privateState never contains Bob's cards.
    expect(aliceHand.every((card) => card.id.startsWith('alice:'))).toBe(true)
    expect(bobHand.every((card) => card.id.startsWith('bob:'))).toBe(true)

    // The synced Schema state exposes only counts, never the hand/library cards.
    const alicePlayer = room.state.players.get(aliceId)!
    const bobPlayer = room.state.players.get(bobId)!
    expect(alicePlayer.handCount).toBe(7)
    expect(bobPlayer.handCount).toBe(7)
    expect(JSON.stringify(room.state.toJSON()).includes('"zone":"hand"')).toBe(false)
  })

  it('rotates turns via endTurn and ignores non-active players', async () => {
    const { room, alice, bob } = await makeGame()
    dispatch(room, 'ready', bob, {})
    dispatch(room, 'startGame', alice, {})

    const first = room.state.activePlayerId
    const other = first === alice.sessionId ? bob.sessionId : alice.sessionId

    // A non-active player cannot end the turn.
    const nonActive = first === alice.sessionId ? bob : alice
    dispatch(room, 'endTurn', nonActive, {})
    expect(room.state.activePlayerId).toBe(first)

    // The active player ends the turn; the other player becomes active.
    const active = first === alice.sessionId ? alice : bob
    dispatch(room, 'endTurn', active, {})
    expect(room.state.activePlayerId).toBe(other)
    expect(room.state.turn).toBe(2)

    dispatch(room, 'endTurn', other === alice.sessionId ? alice : bob, {})
    expect(room.state.activePlayerId).toBe(first)
    expect(room.state.turn).toBe(3)
  })

  it('rejects library cards in playCard and moveCard (no tutoring)', async () => {
    const { room, alice, bob } = await makeGame()
    startAndActivate(room, alice, bob, alice)
    const player = room.state.players.get(alice.sessionId)!

    // The re-keyed card ids are alice:<scryfallId>:<deckIndex>. Pick one that is
    // NOT in the opening hand, so it is guaranteed to still be in the library.
    const handIds = new Set(capturedHand(alice).map((card) => card.id))
    const allDeckIds = Array.from({ length: 20 }, (_, i) => `alice:s${i}:${i + 1}`)
    const libraryCardId = allDeckIds.find((id) => !handIds.has(id))!
    expect(libraryCardId).toBeDefined()

    dispatch(room, 'playCard', alice, { cardId: libraryCardId })
    dispatch(room, 'moveCard', alice, { cardId: libraryCardId, zone: 'battlefield' })
    expect(player.battlefield.length).toBe(0)
    expect(player.handCount).toBe(7)

    dispatch(room, 'moveCard', alice, { cardId: libraryCardId, zone: 'hand' })
    expect(player.handCount).toBe(7)
  })

  it('enforces the one-land-per-turn rule through playCard', async () => {
    const { room, alice, bob } = await makeGame({ cards: makeCards({ allLands: true }) })
    startAndActivate(room, alice, bob, alice)
    const player = room.state.players.get(alice.sessionId)!

    // First land plays; the second is rejected with an error message.
    const hand = capturedHand(alice)
    expect(hand.length).toBeGreaterThan(0)
    dispatch(room, 'playCard', alice, { cardId: hand[0].id })
    expect(player.battlefield.length).toBe(1)
    expect(player.landPlaysThisTurn).toBe(1)

    dispatch(room, 'playCard', alice, { cardId: hand[1].id })
    expect(player.battlefield.length).toBe(1)
    expect(alice.send).toHaveBeenCalledWith('error', { type: 'error', message: 'You can only play one land per turn.' })
  })

  it('ends the game by deck-out when drawing from an empty library', async () => {
    const { room, alice, bob } = await makeGame({ cards: makeCards({ library: 8 }) })
    startAndActivate(room, alice, bob, alice)
    const player = room.state.players.get(alice.sessionId)!

    // Opening hand leaves 1 card; the next draw empties the library.
    expect(player.libraryCount).toBe(1)
    dispatch(room, 'drawCards', alice, { count: 1 })
    expect(room.state.status).toBe('finished')
  })

  it('wins via 21 commander damage even while the defender has life left', async () => {
    const { room, alice, bob, bobId } = await makeGame({ cards: makeCards({ commanderPower: '21/21' }) })
    dispatch(room, 'ready', bob, {})
    dispatch(room, 'startGame', alice, {})
    room.state.activePlayerId = alice.sessionId
    const alicePlayer = room.state.players.get(alice.sessionId)!

    // Cast the commander from the command zone, then attack unblocked.
    const commanderId = alicePlayer.command[0]!.id
    dispatch(room, 'playCard', alice, { cardId: commanderId })
    expect(alicePlayer.command.length).toBe(0)
    expect(alicePlayer.battlefield.some((c) => c.id === commanderId)).toBe(true)

    dispatch(room, 'declareAttackers', alice, { attackerIds: [commanderId] })
    expect(room.state.combatActive).toBe(true)
    dispatch(room, 'resolveCombat', alice, {})

    expect(room.state.status).toBe('finished')
    const defender = room.state.players.get(bobId)!
    expect(defender.commanderDamage.get(commanderId)).toBeGreaterThanOrEqual(21)
  })

  it('keeps the player and private zones across an authenticated reconnect', async () => {
    const { room, alice, bob } = await makeGame()
    dispatch(room, 'ready', bob, {})
    dispatch(room, 'startGame', alice, {})
    room.state.activePlayerId = alice.sessionId

    const original = room.state.players.get(alice.sessionId)!
    const handBefore = capturedHand(alice).length
    // The server issued Alice a reconnect token on her first join.
    const authToken = (capturedSend(alice, 'authToken') as { token?: string } | undefined)?.token
    expect(authToken).toBeTypeOf('string')

    room.onLeave(alice)
    expect(original.connected).toBe(false)

    // Reconnect without the token is rejected (a hijack attempt).
    const hijacker = makeClient('alice-session-2')
    expect(() => room.onJoin(hijacker, { playerId: 'alice', playerName: 'Alice', deckId: 'a-deck', cards: makeCards() })).toThrow()

    const newSession = 'alice-session-3'
    const alice2 = makeClient(newSession)
    room.onJoin(alice2, { playerId: 'alice', playerName: 'Alice', deckId: 'a-deck', cards: makeCards(), authToken })

    const rejoined = room.state.players.get(newSession)!
    expect(rejoined).toBe(original)
    expect(rejoined.connected).toBe(true)
    expect(rejoined.handCount).toBe(handBefore)
  })

  it('promotes the host when the host leaves the lobby', async () => {
    const room = new GameRoom()
    room.presence = { smembers: vi.fn().mockResolvedValue([] as string[]), sadd: vi.fn().mockResolvedValue(1) } as unknown as GameRoom['presence']
    await room.onCreate({ gameMode: '1v1' })
    const alice = makeClient('alice-session')
    const bob = makeClient('bob-session')
    room.onJoin(alice, { playerId: 'alice', playerName: 'Alice', deckId: 'a', cards: makeCards() })
    room.onJoin(bob, { playerId: 'bob', playerName: 'Bob', deckId: 'b', cards: makeCards() })
    expect(room.state.hostId).toBe('alice-session')

    room.onLeave(alice)
    expect(room.state.hostId).toBe('bob-session')
    expect(room.state.players.has('alice-session')).toBe(false)
  })

  it('requires mana to cast non-land spells and deducts it', async () => {
    const { room, alice, bob } = await makeGame({ cards: makeCards({ manaCost: '{1}{R}' }) })
    startAndActivate(room, alice, bob, alice)
    const player = room.state.players.get(alice.sessionId)!
    const creature = capturedHand(alice).find((card) => card.type === 'creature')!
    expect(creature.manaCost).toBe('{1}{R}')

    // Empty pool: the cast is rejected and nothing moves to the battlefield.
    dispatch(room, 'playCard', alice, { cardId: creature.id })
    expect(player.battlefield.length).toBe(0)
    expect(alice.send).toHaveBeenCalledWith('error', { type: 'error', message: `Not enough mana to cast ${creature.name}.` })

    // Enough mana: the cast resolves and the server deducts the cost.
    dispatch(room, 'addMana', alice, { color: 'R' })
    dispatch(room, 'addMana', alice, { color: 'R' })
    dispatch(room, 'playCard', alice, { cardId: creature.id })
    expect(player.battlefield.some((card) => card.id === creature.id)).toBe(true)
    expect(player.manaR).toBe(0)
  })

  it('caps tokens at 100 per player', async () => {
    const { room, alice } = await makeGame()
    for (let i = 0; i < 105; i++) {
      dispatch(room, 'addToken', alice, { token: { id: `t${i}`, name: 'Goat', imageUri: '' } })
    }
    const player = room.state.players.get(alice.sessionId)!
    expect(player.tokens.length).toBe(100)
  })

  it('auras/equipment auto-attach to the strongest friendly creature on entry', async () => {
    const { room, alice, bob } = await makeGame()
    startAndActivate(room, alice, bob, alice)
    const player = room.state.players.get(alice.sessionId)!
    // Setup: a 2/2 on the battlefield and an equipment in hand.
    player.battlefield.push(cardToState({
      id: 'alice:bear', scryfallId: 'bear', name: 'Bear', imageUri: '', oracleText: '', zone: 'battlefield',
      tapped: false, counters: 0, power: '2', toughness: '2', type: 'creature', typeLine: 'Creature 2/2',
      subtypes: [], isBasicLand: false, commanderTax: 0, revealed: true,
    }, 'battlefield'))
    const sword: CardData = {
      id: 'alice:sword', scryfallId: 'sword', name: 'Sword', imageUri: '', oracleText: 'Equipped creature gets +2/+2.', zone: 'hand',
      tapped: false, counters: 0, power: '', toughness: '', type: 'artifact', typeLine: 'Artifact — Equipment',
      subtypes: [], isBasicLand: false, commanderTax: 0, revealed: false,
    }
    const zones = (room as unknown as { privateZones: Map<string, { hand: CardData[]; library: CardData[] }> }).privateZones
    zones.get('alice')!.hand.push(sword)

    dispatch(room, 'playCard', alice, { cardId: sword.id })

    const equipped = player.battlefield.find((c) => c.id === sword.id)!
    expect(equipped.enchantsCardId).toBe('alice:bear')
  })

  it('ends the game when a player drops to zero life', async () => {
    const { room, alice, bob, bobId } = await makeGame()
    dispatch(room, 'ready', bob, {})
    dispatch(room, 'startGame', alice, {})
    dispatch(room, 'setLife', bob, { value: 0 })
    expect(room.state.status).toBe('finished')
    // The eliminated player's life stays at zero.
    expect(room.state.players.get(bobId)!.lifeTotal).toBe(0)
  })

})

describe('solo-mechanic parity (ring / poison / force attack)', () => {
  function giveCreature(room: GameRoom, playerId: string, id: string, power: string) {
    const [p, t] = power.split('/')
    room.state.players.get(playerId)!.battlefield.push(cardToState({
      id, scryfallId: id, name: id, imageUri: '', oracleText: '', zone: 'battlefield',
      tapped: false, counters: 0, power: p, toughness: t, type: 'creature', typeLine: `Creature ${power}`,
      subtypes: [], isBasicLand: false, commanderTax: 0, revealed: true,
    }, 'battlefield'))
  }

  it('ringTempt increments the ladder and picks the strongest bearer', async () => {
    const { room, alice, bob, aliceId } = await makeGame()
    startAndActivate(room, alice, bob, alice)
    giveCreature(room, aliceId, 'small', '1/1')
    giveCreature(room, aliceId, 'big', '3/3')

    dispatch(room, 'ringTempt', alice, {})
    dispatch(room, 'ringTempt', alice, {})

    const player = room.state.players.get(aliceId)!
    expect(player.ringTemptations).toBe(2)
    expect(player.ringBearerCardId).toBe('big')
  })

  it('Ring L2: the attacking Ring-bearer draws then discards (hand count unchanged)', async () => {
    const { room, alice, bob, aliceId } = await makeGame()
    startAndActivate(room, alice, bob, alice)
    giveCreature(room, aliceId, 'bear3', '3/3')
    dispatch(room, 'ringTempt', alice, {})
    dispatch(room, 'ringTempt', alice, {})

    const player = room.state.players.get(aliceId)!
    const handBefore = player.handCount
    const gyBefore = player.graveyard.length
    dispatch(room, 'declareAttackers', alice, { attackerIds: ['bear3'] })

    expect(room.state.combatActive).toBe(true)
    expect(player.handCount).toBe(handBefore)
    expect(player.graveyard.length).toBe(gyBefore + 1)
  })

  it('poison: ten counters lose the game, nine do not', async () => {
    const { room, alice, bob, bobId } = await makeGame()
    startAndActivate(room, alice, bob, alice)

    dispatch(room, 'addPoison', alice, { playerId: bobId, amount: 9 })
    expect(room.state.status).toBe('playing')
    expect(room.state.players.get(bobId)!.poisonCounters).toBe(9)

    dispatch(room, 'addPoison', alice, { playerId: bobId, amount: 1 })
    expect(room.state.status).toBe('finished')
  })

  it('force attack: a compelled player with able creatures must declare at least one', async () => {
    const { room, alice, bob, aliceId } = await makeGame()
    startAndActivate(room, alice, bob, alice)
    giveCreature(room, aliceId, 'bear3', '3/3')

    // Compel the active player through their next turn.
    dispatch(room, 'setForceAttack', bob, { victimPlayerId: aliceId, untilTurn: room.state.turn + 1 })
    expect(room.state.forceAttackVictimId).toBe(aliceId)

    // Declaring nobody is rejected while able creatures sit untapped.
    dispatch(room, 'declareAttackers', alice, { attackerIds: [] })
    expect(room.state.combatActive).toBe(false)

    // Declaring a real attacker passes and clears the way for combat.
    dispatch(room, 'declareAttackers', alice, { attackerIds: ['bear3'] })
    expect(room.state.combatActive).toBe(true)
  })

  it('parity ban state syncs and is gated by turn', async () => {
    const { room, alice, bob } = await makeGame()
    startAndActivate(room, alice, bob, alice)

    dispatch(room, 'setParityBan', alice, { parity: 'odd', untilTurn: room.state.turn })
    expect(room.state.parityBanParity).toBe('odd')
    expect(room.state.parityBanUntilTurn).toBe(room.state.turn)

    // Invalid payloads are ignored.
    dispatch(room, 'setParityBan', alice, { parity: 'both', untilTurn: room.state.turn })
    expect(room.state.parityBanParity).toBe('odd')
  })
})
