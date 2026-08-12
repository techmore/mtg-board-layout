# Playability Audit & Roadmap

Audit date: 2026-08-01. Priority is **functionality** — security is explicitly out of scope for now.

Sections: **A** human playability · **B** computer (AI) playability · **C** multiplayer · **D** codebase manageability. Every item has a concrete success criterion so completion is verifiable.

Status legend: [x] done · [~] partial · [ ] not started

## Status update (2026-08-11)

Three deep audit passes fixed **25+ verified bugs** and closed the remaining roadmap gaps; see `AUDIT_LOG` at the bottom. Verified live: 4-player + 1v1 WebSocket smokes, 8-turn AI simulations with real rules and real card data. **453 client tests + 78 server tests**, builds + lint clean.

---

## A. Human playability (solo vs AI)

### A1. Casting and resolving spells — [x] done
Cards cast from hand or the command zone, mana paid, spell abilities (damage, exile, destroy, draw, pump, tokens, life) resolve via the trigger stack with targeting, ward, and hexproof handled.

**Success:** Cast Lightning Bolt → choose a target → it deals damage and kills a 1/1. Cast a modal spell → resolve one mode, skip the rest.

### A2. Combat — [x] done
Declare attackers, assign blockers, damage steps (first strike / double strike), trample, lifelink, deathtouch, vigilance, indestructible, flying/reach blocking, static anthems, pumps, SBA deaths. **Commander damage: 21+ combat damage from a single commander wins the game (incl. trample overflow), tracked per commander and shown in the inspector.**

**Success:** A 2/2 with lifelink attacks, heals 2, kills a blocker, survives; the AI can't cheat past a flying blocker; a commander hitting for 21 wins regardless of life.

### A3. Permanents that do things — [x] done
ETB/death/attack triggers fire, auras attach with **player-chosen targets** (`AuraTargetPrompt`), planeswalker loyalty abilities activate via right-click, static effects apply.

**Success:** Cast an aura → pick the creature it enchants → only that creature gets the boost.

### A4. Turn structure — [x] done
Phases, untap + damage/pump cleanup at beginning, one land per turn (with override), discard-to-7 on any turn end, deck-out loss, turn timer.

**Success:** Ending a turn with 8 cards always prompts a discard; emptying your library makes you lose.

### A5. Game flow — [x] done
Named AI opponent, fixed simple deck by default (switchable), game-over overlay + replay, per-player turn totals, broadcast window with both boards.

**Success:** Load a game → play to a win or loss → Play Again resets cleanly (life, hands, timers, opponent).

### A6. Feedback & discovery — [x] done
Toasts for errors (mana, land limit, import, copy), turn announcements, DEFEND/attack banners, card inspector with Oracle text and live state badges, undo/redo shortcuts.

**Success:** A player who has never seen the app can play a full game without asking how to do anything.

### A7. Card data coverage — [~] partial
1,149 cards parsed with rules; keywords, entry-tap, mana production, triggers, spells, pumps, auras, landfall, static-anthem scopes, menace, X-costs.

**Missing:** ~370 "other"-kind abilities (complex multi-clause triggers, equip, storm, annihilator) are extracted but unresolvable. Resolving one now toasts an honest "not implemented yet" notice; tooltips show keywords.
**Success:** Every card in the 16 starter decks shows resolvable behavior or an honest "not yet implemented" state rather than silently doing nothing.
**Candidate next:** equip ("attach to target creature you control") — the attach machinery (`enchantsCardId`) already exists for auras; needs parser + effect kind + UI activation.

---

## B. Computer (AI) playability

### B1. Full AI turn — [x] done
Untap, draw, play land, cast spells (with mana tapping), cast commander with tax, ETB/attack/death triggers, combat tricks, smart attack/block decisions, discard to 7, deck-out loss.

**Success:** The AI wins games on its own against a passive opponent — it can race, trade, and win by damage or deck-out.

### B2. AI combat decision-making — [x] done
Holds back from bad trades, sends unblockable fliers, blocks with flying/reach awareness and deathtouch trades, taps attackers (vigilance exempt).

**Success:** Against a 6/6 wall, a 2/2 AI attacker doesn't suicide; a flier still gets through.

### B3. AI instant responses — [x] done
Casts instants before its own attack, in response to the player declaring attackers, and **in response to the player casting a spell**.

**Success:** When the player casts a kill spell on an AI creature, the AI sometimes saves it with a pump or counters with removal.

### B4. AI activated abilities — [x] done
The AI activates `{T}:` abilities (mana dorks feed its pool), planeswalker loyalty abilities, and other utility taps.

**Success:** An AI mana dork taps for mana; an AI planeswalker uses a loyalty ability.
**Effort:** medium — `aiActivatePlaneswalkers` + utility-ability activation in `gameOpponentAI`.

### B5. AI mana & sequencing — [~] partial
Greedy land tapping improved with color-fixing: generic costs prefer colorless lands, then lands whose colors aren't still needed for the colored portion. Dual lands produce exactly one mana ("{B} or {G}"); enters-tapped lands enter tapped; summoning-sickness blocks dork taps; AI auto-targeting prefers player cards for removal and its own for buffs.

**Missing:** no "leave up mana for instants" hold logic.
**Success:** The AI doesn't tap a red source for a generic cost when it needs red next.

---

## C. Multiplayer

### C1. Room lifecycle, chat, tokens, combat — [x] done
Create/join rooms, ready/start, reconnect, chat, tokens (create/tap/counters), server-authoritative combat with win condition, game-over banner.

**Success:** Two players can play a full game to completion over the network.

### C2. Commander from the command zone — [x] done
The multiplayer board casts from the command zone with commander tax increments server-side.

**Success:** The multiplayer board shows the commander in a command slot; clicking it plays it with tax increments.

### C3. Hand-size and deck-out rules — [x] done
Server mirrors solo rules: discard-to-7 on turn end, deck-out loss.

**Success:** Drawing with an empty library loses the game; ending a turn with 8+ cards forces a discard server-side.

### C4. Card inspector & turn timer in the multiplayer board — [x] done
Multiplayer board reuses the card inspector and per-player turn clocks.

**Success:** Clicking any card in multiplayer opens the inspector; each player's turn time accumulates like solo.

### C5. Dice, coin, mana log in multiplayer — [x] done
Solo has dice/coin (with server-random in MP) and a mana log. The MP board gained dice/coin controls with an event feed (2026-08-11); mana log remains solo-only by design (MP mana is server-authoritative with no per-play log).

**Success:** The MP board can roll dice/flip coins (server-random) and shows the last result.

### C6. Trigger stack & SBA parity — [x] done
Multiplayer combat v2: **damage accumulation, SBA deaths, keywords** (first strike, trample, lifelink, deathtouch, indestructible, flying/reach) in `server/src/rooms/combat.ts`, with expanded server combat tests.

**Success:** A 3/3 with 2 damage marked survives; first-strike blockers hit first in multiplayer.

---

## D. Codebase manageability

### D1. Size and structure — [x] done
Client: 103 source files, largest are BoardPage (447), gameStore (435), TriggerItem (406) — all reasonable. Deck data in single-source JSON; parser shares the same source. No TODO/FIXME markers.

**Done:** `server/src/rooms/combat.ts` extracted — pure combat resolution, unit-testable in isolation; `GameRoom.ts` slimmed.

### D2. Tests — [x] done
453 client tests (19 files) cover rules, combat, triggers, SBA, AI, persistence, deck smoke (all 16 decks vs AI). **Server has a test suite**: 78 tests in `server/src` (combat, room utils) runnable via `npm --prefix server test` (script added 2026-08-11) or the root suite.

**Success:** `npm --prefix server test` runs; combat edge cases (blocked trades, unblocked damage incl. 1v1/4ffa empty-teamId, team damage, trample, menace, deathtouch, multi-blocking) covered.

### D3. Single sources of truth — [x] done
Deck lists: `src/data/decklists/*.json` (app + parser). Protocol: `mtg-protocol` (client + server). Card rules: parser output → `public/all-decks-rules.json`.

**Success:** Adding a deck = one JSON file; changing the wire format = one package.

### D4. Known duplication — [x] done
Entry-tap logic deduped into the shared `mtg-protocol` package (`entryTap.ts`) — client `cardFeatures` and server `roomUtils` both delegate to it, removing drift. Solo vs MP combat remain separate by design but are verified in sync via matching test suites.

**Success:** Entry-tap logic lives once (shared package); combat logic shares a documented core.

---

## Recommended order

1. ✅ C2 + C3 + C4 + C5 (multiplayer rules/UX parity — done)
2. ✅ B4 (AI activated abilities — done)
3. ✅ D2 server tests + D1 combat split (done)
4. ✅ A3 aura target choice (done)
5. ✅ B3 (AI response depth — done) / B5 (color-fixing done, hold-mana pending)
6. ✅ C6 (engine parity — done: MP combat v2 with damage accumulation, SBA, keywords)
7. ✅ D4 (de-duplication — done: entry-tap shared in `mtg-protocol`)
8. ✅ Audit passes (2026-08-11): 25+ bugs fixed — see AUDIT LOG below

## Next candidates (not yet started)

- **A7 equip support** — parser + `equip` effect kind + UI activation (attach machinery exists).
- **B5 AI hold-mana** — reserve untapped sources for a held instant when casting greedily.
- **MP reconnect auth** — playerId takeover is currently unauthenticated (security is out of scope, but this is the cheapest high-value hardening).
- **Trigger-condition depth** — "whenever you cast your first spell each turn" style stateful conditions.
- **More A7 effect kinds** — turn the top remaining "other" patterns (storm, annihilator, proliferate AI picks) into resolvable effects.

---

## AUDIT LOG (2026-08-11)

Verified fixes, all with regression tests where applicable:

### Combat / rules engine
- MP unblocked attackers dealt **zero** damage in 1v1/4ffa (empty teamId matched every player in the skip condition; tests only used explicit teamIds). Fixed + empty-teamId regression tests.
- Solo multi-blocking: all blockers deal; attacker damage allocates across blockers; trample spills leftover. Deathtouch lethal tracked via `deathtouchDamage` flag.
- Menace: single-blocker assignments are illegal (both engines) + tests.
- Landfall triggers mis-parsed as ETB (Lotus Cobra fired on every creature); parser regex + engine emits `landfall` on land plays.
- Static anthems: parser required "until end of turn" so anthems parsed as unresolvable `other`; now emit P/T + owner scope; `computeStaticPump` honors scopes ("you control" / "opponents control" / "each other creature").
- X-costs ignored (`{X}{B}` cast for `{B}`); hybrid symbols now payable with generic.
- Commander-tax conventions unified (both cast paths store 2× prior casts, charge `{tax}`).

### Trigger engine
- Conditions enforced: "another creature you control dies" no longer fires for the source or enemies; "this creature enters" only for the source; type filters; "your upkeep/end step" owner-aware (AI turn now emits its own upkeep + end-of-turn events).
- AI scry/search/proliferate instances auto-confirm instead of sticking on the player's stack.

### AI
- AI-cast instants/sorceries stayed on the battlefield forever (now move to graveyard).
- Planeswalker `−2` loyalty (U+2212) was treated as a GAIN; now correctly subtracts.
- Dual lands produced 2 mana ("{B} or {G}"); enters-tapped lands entered untapped; summoning sickness ignored for dork taps.
- Auto-targeting prefers player cards for removal (weakest first), own cards for buffs (strongest first); blocking accounts for static pumps.
- Full game resets on loadDeck/reshuffle/loadOpponentDeck (gameOver, opponent state, commander damage, prompts, triggers).

### Multiplayer server
- Card ids re-keyed per player (identical decks collided: damage/death hit both players' same-id cards).
- Disconnected active player auto-skips (no soft-lock); mid-game joins rejected; redeal/reshuffle lobby-only; land-rule bypasses closed; discard hand-only; endTurn guarded mid-combat; vigilance attackers can attack tapped; blockers restricted to opponents; token cap; stale client-map pruning.
- Commander damage tracking (21+) and correct deck-out winner selection in 2v2/4ffa.
- P/T now flows explicitly deck → wire → server combat (some reprint type lines omit P/T, e.g. Kulrath Knight "Creature — Elemental Knight").

### Data pipeline
- Parser resolves DFCs via first-segment alias and prunes stale entries (stale copies overrode fresh ones at merge time). All 16 decks: zero rules-coverage gaps.

