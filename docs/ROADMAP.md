# Playability Audit & Roadmap

Audit date: 2026-08-01. Priority is **functionality** — security is explicitly out of scope for now.

Sections: **A** human playability · **B** computer (AI) playability · **C** multiplayer · **D** codebase manageability. Every item has a concrete success criterion so completion is verifiable.

Status legend: [x] done · [~] partial · [ ] not started

---

## A. Human playability (solo vs AI)

### A1. Casting and resolving spells — [x] done
Cards cast from hand or the command zone, mana paid, spell abilities (damage, exile, destroy, draw, pump, tokens, life) resolve via the trigger stack with targeting, ward, and hexproof handled.

**Success:** Cast Lightning Bolt → choose a target → it deals damage and kills a 1/1. Cast a modal spell → resolve one mode, skip the rest.

### A2. Combat — [x] done
Declare attackers, assign blockers, damage steps (first strike / double strike), trample, lifelink, deathtouch, vigilance, indestructible, flying/reach blocking, static anthems, pumps, SBA deaths.

**Success:** A 2/2 with lifelink attacks, heals 2, kills a blocker, survives; the AI can't cheat past a flying blocker.

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
1,149 cards parsed with rules; keywords, entry-tap, mana production, triggers, spells, pumps, auras.

**Missing:** ~430 "other"-kind abilities (complex multi-clause triggers) are extracted but unresolvable. Resolving one now toasts an honest "not implemented yet" notice; tooltips show keywords (first strike, ward, hexproof).
**Success:** Every card in the 16 starter decks shows resolvable behavior or an honest "not yet implemented" state rather than silently doing nothing.

---

## B. Computer (AI) playability

### B1. Full AI turn — [x] done
Untap, draw, play land, cast spells (with mana tapping), cast commander with tax, ETB/attack/death triggers, combat tricks, smart attack/block decisions, discard to 7, deck-out loss.

**Success:** The AI wins games on its own against a passive opponent — it can race, trade, and win by damage or deck-out.

### B2. AI combat decision-making — [x] done
Holds back from bad trades, sends unblockable fliers, blocks with flying/reach awareness and deathtouch trades, taps attackers (vigilance exempt).

**Success:** Against a 6/6 wall, a 2/2 AI attacker doesn't suicide; a flier still gets through.

### B3. AI instant responses — [~] partial
Casts instants before its own attack and in response to the player declaring attackers.

**Missing:** no response to the player *casting a spell*; no saving its creatures with pumps in response to removal.
**Success:** When the player casts a kill spell on an AI creature, the AI sometimes saves it with a pump or counters with removal.

### B4. AI activated abilities — [x] done
The AI activates `{T}:` abilities (mana dorks feed its pool), planeswalker loyalty abilities, and other utility taps.

**Success:** An AI mana dork taps for mana; an AI planeswalker uses a loyalty ability.
**Effort:** medium — `aiActivatePlaneswalkers` + utility-ability activation in `gameOpponentAI`.

### B5. AI mana & sequencing — [ ] not started
Greedy land tapping, no color-fixing preference, no "leave up mana for instants" logic.

**Success:** The AI doesn't tap a red source for a generic cost when it needs red next; it holds a counter-spell's mana when the player is threatening.
**Effort:** medium.

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
Solo has dice/coin (with server-random in MP) and a mana log; the MP board has neither UI.

**Success:** The MP board can roll dice/flip coins and shows a mana activity log.
**Effort:** small — UI-only (actions already exist server-side).

### C6. Trigger stack & SBA parity — [ ] not started (largest MP item)
Multiplayer combat is one-shot (power vs toughness, no damage accumulation, no keywords, no triggers). The server has no state-based actions or trigger engine.

**Success:** A 3/3 with 2 damage marked survives; first-strike blockers hit first in multiplayer. Full parity would mean sharing the solo engine server-side.
**Effort:** large — port `gameRules`/`triggerEngine` logic into the server (shared `protocol` package is the natural home).

---

## D. Codebase manageability

### D1. Size and structure — [x] done
Client: 103 source files, largest are BoardPage (447), gameStore (435), TriggerItem (406) — all reasonable. Deck data in single-source JSON; parser shares the same source. No TODO/FIXME markers.

**Done:** `server/src/rooms/combat.ts` extracted — pure combat resolution, unit-testable in isolation; `GameRoom.ts` slimmed.

### D2. Tests — [x] done
356 client tests (19 files) cover rules, combat, triggers, SBA, AI, persistence, deck smoke (all 16 decks vs AI). **Server has a test suite**: `server/src/rooms/combat.test.ts` (7 tests) covers blocked trades, unblocked damage, team damage.

**Success:** `npm --prefix server test` runs; combat edge cases (blocked trades, unblocked damage, team damage) covered.

### D3. Single sources of truth — [x] done
Deck lists: `src/data/decklists/*.json` (app + parser). Protocol: `mtg-protocol` (client + server). Card rules: parser output → `public/all-decks-rules.json`.

**Success:** Adding a deck = one JSON file; changing the wire format = one package.

### D4. Known duplication — [~] partial
Client `evaluateConditionalEntryTap` vs server `entersTappedOnBattlefield` (identical regexes); solo combat vs multiplayer combat are separate implementations (by design, but drifting).

**Success:** Entry-tap logic lives once (shared package); combat logic shares a documented core.
**Effort:** medium.

---

## Recommended order

1. ✅ C2 + C3 + C4 + C5 (multiplayer rules/UX parity — done)
2. ✅ B4 (AI activated abilities — done)
3. ✅ D2 server tests + D1 combat split (done)
4. ✅ A3 aura target choice (done)
5. **B3/B5** (AI response depth + mana) — next
6. **C6** (engine parity — the big one, only if MP becomes a priority)
7. **D4** (de-duplication as part of C6)
