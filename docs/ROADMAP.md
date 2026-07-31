# Roadmap: Any Card / Feature Functional

Execution tracker for the saved roadmap in `LOOPS.md` ("Universal Card Rules Roadmap", saved 2026-07-24). The saved loop is the canonical source of truth; this file tracks execution status and evidence.

Status legend: [x] done · [~] partial · [ ] not started

## Phase 1: Universal Card Data Resolution

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 1.1 | Oracle text via Scryfall collection endpoint | [x] | `scripts/parse-card-rules.mjs`, outputs for all 16 decks in `scripts/rules-output/` |
| 1.2 | Expand `inferEntryTapRule` for all "enters tapped" variants | [~] | `src/data/cardRules.ts` covers common variants; parser adds ETB rules per card |
| 1.3 | Expand `evaluateConditionalEntryTap` beyond 2 patterns | [~] | `src/data/cardFeatures.ts`; conditional ETB prompt exists in `BoardTurnPrompt` |
| 1.4 | `inferManaAbility` beyond simple `{T}: Add {W}` | [~] | Parser extracts manaProduction per card into deck JSON |
| 1.5 | Rule override UI backed by `cardRuleStore` | [x] | SettingsPage "Card Rule Database" editor |
| 1.6 | Migrate rule cache to IndexedDB | [~] | Backgrounds migrated; card images via `cardImageCache.ts` (IndexedDB) |

## Phase 2: Game Engine — Stack, Triggers, State-Based Actions

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 2.1 | `TriggeredAbility` model | [x] | `TriggerInstance`/`CardAbilityDef` in `src/types/card.ts` |
| 2.2 | Trigger stack UI | [x] | `TriggerStack.tsx`/`TriggerItem.tsx`, wired via `gameStore` |
| 2.3 | State-based actions loop | [ ] | No SBA loop found (lethal damage / 0-toughness deaths) |
| 2.4 | Continuous/temporary effects | [~] | `EffectHistoryEntry` exists; temporary effects not modeled |

## Phase 3: Combat

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 3.1 | Combat phase in turn model | [~] | `gameTurnPhases.ts` exists; verify combat steps present |
| 3.2 | Attack/block declaration UI | [ ] | Not found |
| 3.3 | Combat damage + SBA cleanup | [ ] | Not found |

## Phase 4: Advanced Abilities

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 4.1 | Targeting model | [ ] | `TargetCard.tsx` exists — verify wiring |
| 4.2 | Keyword resolution (flying, trample, etc.) | [ ] | Display only |
| 4.3 | Token generation from abilities | [ ] | Manual tokens only |
| 4.4 | Modal/cost choices (kicker, choose one) | [ ] | Not found |

## Phase 5: Priority & Turn Structure

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 5.1 | Priority system | [ ] | Not found |
| 5.2 | Instant-speed play | [ ] | Not found |
| 5.3 | Full turn structure | [~] | `gameTurnPhases.ts` + `PhaseBar.tsx`/`PhaseSidebar.tsx` |

## Phase 6: Broadcaster & Multiplayer Rules Sync

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 6.1 | Rules engine to shared protocol package | [ ] | Still duplicated client/server |
| 6.2 | Server-authoritative resolution | [ ] | `GameRoom.ts` lacks `overrideLandPlay` handler, `gameEnded` emission, land-limit enforcement, commander tax |

## Additional hygiene (from refactor loop)

- [x] Split BoardPage.tsx (1231 -> 446 lines) — components extracted, committed
- [x] Test suite started (`vitest`, `src/stores/gameStore.test.ts`, 5 tests, green)
- [ ] Code-split >500 KB production bundle (dynamic import pages)
- [ ] Complete 15 placeholder prebuilt decks
- [ ] Deck builder UI (`src/components/DeckBuilder/` empty)
- [ ] Multiplayer name/deck selection (hardcoded `'Player'`/`decks[0]`)
- [ ] Chat UI (server event wired, no client UI)
