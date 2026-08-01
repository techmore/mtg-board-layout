# MTG Board

A local-first Magic: The Gathering Commander board built with React 19, TypeScript 6, Vite 8, and Zustand 5. Solo play remains local-first; multiplayer uses the included Colyseus room server.

## Development

```sh
npm install
npm run dev
```

The app opens at the local Vite URL. It imports the bundled Blight Curse deck on a fresh install when Scryfall is reachable.

### Multiplayer

Run the room server in a second terminal:

```sh
npm --prefix server install
npm run server:build
npm run server:start
```

The client defaults to `ws://localhost:2567`. Set `VITE_COLYSEUS_URL` in a local `.env` file for a build-time default, or enter a hostname/IP/URL in the multiplayer screen for a runtime server. The server address is included in room invite links. See [docs/API.md](docs/API.md) for the room lifecycle, state visibility, actions, and events.

## Checks

```sh
npm run build
npm run lint
npm test          # vitest — 166 tests (rules, SBA, combat, triggers, undo, per-deck smoke tests)
npm audit --omit=dev
```

## Features

- **Board zones**: Battlefield (sectioned by card type — Creatures, Artifacts, Enchantments, etc.), Command, Hand, Library, Graveyard, Exile — with card movement between zones
- **Tap/untap**: Double-click, right-click menu, or inline ↻ badge; all battlefield cards untap on turn advance
- **Counters**: +1/+1 and −1/−1 via right-click context menu
- **Hand management**: Private by default, hold <kbd>⌥</kbd> Alt to enlarge, double-tap Alt to lock expanded, ▲ toggle button
- **Mana pool**: Manual mana add/spend, multi-color land tapping with potential mana tracking, usage log
- **Life tracker**: ± buttons with color-coded danger thresholds (≤5 yellow, ≤0 red)
- **Turn management**: Advance turn (untap + draw), discard-to-7 prompt, second-land override, conditional enters-tapped resolution
- **Dice & coin**: d4–d100 roller, coin flip, roll history
- **Camera widget**: Draggable, resizable, croppable video preview — persisted position/size in localStorage
- **Broadcast window**: OBS-ready public board popup (hand omitted, 16:9)
- **Multiplayer rooms**: Colyseus-backed 1v1, 2v2, and four-player free-for-all rooms with server-authoritative turns and private hands
- **Custom backgrounds**: Upload, select, delete — stored as data URLs in localStorage
- **Card rule database**: Per-card enters-tapped override with search/filter
- **Local card catalog**: Checked-in card metadata for special lands, images, Oracle snippets, and gameplay features; Scryfall refreshes generic card data
- **Persistent state**: All game state and decks saved to localStorage, cross-tab sync
- **16 complete prebuilt Commander decks**: Official 100-card lists (Commander Masters, Tales of Middle-earth, MH3, Bloomburrow, Duskmourn, Fallout, and more) sourced from `src/data/decklists/*.json`, shared with the trigger-engine rules feed
- **Deck builder**: Scryfall search, add/remove cards, commander selection, save/delete/rename imported decks
- **AI opponent**: Plays a real deck (any prebuilt or imported) with automated turns — casts spells, plays lands, attacks, blocks, uses its commander, tracks commander tax
- **Combat keywords**: Flying (blocking validity), trample (damage overflow), lifelink (healing), deathtouch (lethal mark), indestructible (survives SBA), haste (attacks the turn it enters), reach (blocks fliers); first strike/double strike and hexproof/ward pending
- **State-based actions**: Lethal damage destroys creatures, 0-loyalty planeswalkers die, counters and damage are cleaned up at the start of each turn
- **Card image caching**: Scryfall-resolved images are downloaded once into an IndexedDB cache and served locally on every subsequent load; 143 pre-bundled card images ship in `public/cards/`
- **Game over flow**: Life reaching zero ends the game with a winner banner and replay option

## Deck import

Supports:
- **Prebuilt decks** from the bundled library
- **Moxfield / Archidekt URLs** — fetches raw deck list
- **Plain text** with quantities (`4 Lightning Bolt`, `4x Sol Ring`)
- `Commander:` and `Sideboard:` sections (sideboard cards ignored)
- Bracket `[quantity]` notation and decoration headers

Solo card state and camera streams stay in the browser. Multiplayer sends the minimal card metadata needed to render a room board; hand and library contents are sent only to their owner. Scryfall is contacted directly by the browser for card imports and images.

## SpellTable workflow

SpellTable expects a video input device. Click **Open MTG Stream**; the app opens a fixed-size public window titled **MTG Stream — Public Board** with the hand omitted. Add that window to OBS Studio as a Window Capture source, start **OBS Virtual Camera**, and select OBS Virtual Camera as SpellTable's video input. OBS is only acting as the camera bridge; it no longer needs to crop the board.

The browser button controls the public-output window and shows when it is active; it does not create a system webcam by itself.

## Known Issues

- Backgrounds stored as data URLs in localStorage (~5MB limit)
- No toast/notification system; errors are inline or in console
- Multiplayer room access is code-based and does not provide authentication; add auth/rate limiting before public deployment
- First-strike/double-strike damage priority and hexproof/ward targeting not yet modeled
