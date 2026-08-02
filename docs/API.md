# Multiplayer API

The multiplayer implementation uses Colyseus over WebSocket. The browser connects to `VITE_COLYSEUS_URL` (default `ws://localhost:2567`) and joins the `game_room` room by its four-letter room code.

The client also accepts a runtime server address. Enter a hostname, IP address, http(s) URL, or ws(s) URL in the multiplayer screen. The value is saved in local storage and included in the room invite URL, so players following the invite use the same room server. A bare host defaults to port 2567.

## Running locally

```sh
npm install
npm --prefix server install
npm run server:build
npm run server:start
npm run dev
```

The client and server must use the same `protocol/` package. The client sends a small card representation in its join options; card images are URLs and are not uploaded to the server.

## Card database

`src/data/cardDatabase.ts` is the checked-in feature catalog for cards whose gameplay behavior needs to survive saved-deck migrations. It currently covers the bundled deck's special lands, including image URL, type line, Oracle snippet, always/conditional enters-tapped behavior, and fetch-land behavior. Scryfall remains the refresh source for general card metadata, while the local catalog is used as a fallback for missing cards and rule hydration.

## Room lifecycle

1. The lobby creates `game_room` with `gameMode`, player identity, deck ID, and optional cards.
2. The first connected player becomes the host and is initially ready.
3. Other players join using the room code and toggle Ready.
4. The host can start once the room is full and every connected player is ready.
5. The server shuffles turn order, deals opening hands, and becomes authoritative for turn/action state.
6. Leaving players are removed while waiting; during play they remain disconnected so their turn order can be preserved. A new connection with the same `playerId` can reclaim that player.

## Public state

The synchronized `GameState` contains room metadata and public player state:

- player identity, team, readiness, connection, life, mana, and turn order;
- battlefield, command, graveyard, and exile cards;
- tokens;
- hand and library counts.

Hand and library card objects are deliberately not part of the schema. The server stores those zones privately and sends the owner a `privateState` message only.

## Client actions

Clients send an action using its `type` as the Colyseus message name and the complete action object as the payload.

| Action | Purpose |
| --- | --- |
| `ready`, `startGame` | Lobby readiness and host start |
| `drawCards`, `playCard`, `moveCard`, `discardCard` | Private/public zone movement |
| `declareAttackers`, `declareBlockers`, `resolveCombat` | Combat: the active player declares its own untapped creatures as attackers; each other player declares blockers (stored flat, assigned round-robin); resolution is server-authoritative (blocked trades via power vs toughness, unblocked damage to non-team opponents with win checks) |
| `setPosition` | Updates the sender's bounded x/y seat position; Colyseus state re-broadcasts it to every room client |
| `tapCard`, `addCounter`, `removeCounter`, `revealCard` | Card state changes |
| `addMana`, `spendMana`, `clearManaPool`, `setLife` | Player resources |
| `endTurn`, `announceEndTurn` | Turn progression and announcement |
| `addToken`, `removeToken`, `toggleTokenTap`, `addTokenCounter`, `removeTokenCounter` | Token state |
| `reshuffle`, `redeal` | Private library operations |
| `rollDice`, `flipCoin` | Server-generated random results |
| `reorderBattlefield`, `overrideLandPlay`, `resolveConditionalEntry` | Board controls |
| `chatMessage` | Bounded room chat |
| `requestPrivateState` | Re-fetch the caller's hand/library state after connection or reconnect |

The server validates action fields, zones, mana colors, text length, numeric ranges, and card payload size. Invalid actions are ignored rather than mutating state.

## Game rules enforced server-side

- **Win condition**: `setLife` at or below 0 sets the room to `finished` and broadcasts `gameEnded` with the winning player and reason `life`.
- **Land-drop limit**: `playCard` rejects a land from hand when the player has already played one this turn (an `error` event is sent to that client only).
- **Commander tax**: playing from the command zone increments the card's `commanderTax` each time.
- **Land override**: `overrideLandPlay` lets a player play a second land (moving it from hand to battlefield, incrementing the counter) and announces the turn end.

## Server events

The server broadcasts `gameStarted`, `gameEnded` (when a player's life reaches 0), `chatMessage`, `turnChanged`, `turnAnnouncement`, `diceRolled`, and `coinFlipped`. `privateState` is sent only to the requesting player's connection.

## Stability and security boundaries

- A `playerId` is a browser-tab identity, not authentication. A public deployment still needs authentication, rate limiting, and room access controls.
- The room code is not a secret suitable for sensitive data.
- The server remains authoritative; clients should treat synchronized state as the source of truth and never infer successful actions from local optimistic state.
