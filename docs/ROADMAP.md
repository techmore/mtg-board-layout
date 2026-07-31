# Roadmap: Any Card / Feature Functional

Goal: Any Magic card loaded into the app behaves correctly — enters-tapped rules, mana abilities, triggers, and state-based actions — without hardcoding per-card exceptions.

Status legend: [ ] not started · [~] in progress · [x] done

## Phase 1: Card Rules Engine (solo board)

| Step | What | Why | Status |
|------|------|-----|--------|
| 1.1 | Populate `CARD_RULE_OVERRIDES` in `src/data/cardRules.ts` (currently an empty placeholder) | Mechanism exists, no entries — every card falls back to regex inference | [ ] |
| 1.2 | Extend `CARD_DATABASE` in `cardDatabase.ts` beyond the 19 lands (fetch lands, DFCs, stun-counter cards) | Fallback when Scryfall is unreachable | [ ] |
| 1.3 | Wire `stores/cardRulesLoader.ts` + `stores/triggerEngine.ts` into the game store (they exist but nothing consumes them) | The types `CardAbilityDef`/`TriggerInstance`/`GameEvent` in `types/card.ts` imply a parser that is unused | [ ] |
| 1.4 | Add trigger resolution UI (trigger stack, "whenever" prompt) once the engine is wired | Core MTG mechanic missing entirely | [ ] |
| 1.5 | Expand `parseManaCost` (utils/misc) for hybrid/phyrexian/`{X}` costs | Only `{W}`-style and `{N}` supported today | [ ] |
| 1.6 | Show full Oracle text + parsed rules in card tooltip / rule panel | `cardRuleSummary` is minimal | [ ] |

## Phase 2: Multiplayer parity with solo

| Step | What | Why | Status |
|------|------|-----|--------|
| 2.1 | Implement `overrideLandPlay` server handler in `GameRoom.ts` | Action exists in protocol + docs but is silently dropped | [ ] |
| 2.2 | Emit `gameEnded` + win condition (life ≤ 0), set `status: 'finished'` | `GameEndedEvent` exists in protocol, never emitted | [ ] |
| 2.3 | Enforce land-drop limit + commander tax in `playCard` | Server ignores both; `landPlaysThisTurn` field is only reset | [ ] |
| 2.4 | Honor `usage`/`label` in server `spendMana` | Client sends them, server discards | [ ] |
| 2.5 | De-duplicate `evaluateConditionalEntryTap` (client) vs `entersTappedOnBattlefield` (server) | Identical regexes in two codebases — will drift | [ ] |
| 2.6 | Replace hardcoded `'Player'` name and `decks[0]` pick in `MultiplayerBoardPage` with real deck/name selection | Currently unplayable with a specific deck | [ ] |
| 2.7 | Add chat UI (event already wired in `useRoom`) | Feature exists server-side, invisible client-side | [ ] |

## Phase 3: Card / deck completeness

| Step | What | Why | Status |
|------|------|-----|--------|
| 3.1 | Complete the 15 placeholder prebuilt decks (only Blight Curse has 100 cards) | README known issue | [ ] |
| 3.2 | Build the deck builder UI (`src/components/DeckBuilder/` exists but is empty) | No way to construct decks in-app | [ ] |
| 3.3 | Cache Scryfall data in IndexedDB so offline play works | localStorage ~5 MB limit; backgrounds already migrated | [ ] |

## Phase 4: Hygiene (quick wins)

| Step | What | Why | Status |
|------|------|-----|--------|
| 4.1 | Extract duplicated `handlePlay` flow from `DecksPage` + `DeckDetailPage` | Rule-hydration → loadDeck → drawCards(7) → navigate duplicated | [ ] |
| 4.2 | Delete dead code: `services/scryfall.ts`, `THEME` constant, server `booleanField` | Verified unused by grep | [ ] |
| 4.3 | Add test suite (README: "No test suite yet") | No regression protection | [ ] |
| 4.4 | Remove redundant `turnOrder` loop in `GameRoom.startGame` (lines 68-70) | Set twice, second overwrites first | [ ] |
