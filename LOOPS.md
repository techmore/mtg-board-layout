# Project Loops

## Deterministic Card Rule Parser

Saved: 2026-07-24

Run `node scripts/parse-card-rules.mjs --deck <name>` to extract structured rules from every card in a prebuilt deck. Fetches Oracle text from Scryfall (bulk), then parses abilities via pattern matching — keyword extraction, entry-tap rules, mana production, triggered/activated/static/spell abilities with targets and effects. Writes JSON to `scripts/rules-output/<deck>.json`. Verif: load the output and confirm every non-basic card has `cardName`, `abilities[]`, `keywords[]`, `manaProduction`, and valid `oracleText`. Stop when all cards have non-empty rules. Repeatable for any deck — just update `prebuiltDecks` in the script. Manual repairs for unusual patterns go directly into the output JSON.

## Universal Card Rules Roadmap

Saved: 2026-07-24

Goal: Any Magic card loaded into the app behaves correctly — enters-tapped rules, mana abilities, triggered abilities, combat, state-based actions, and priority — without hardcoding per-card exceptions.

### Phase 1: Universal Card Data Resolution

| # | Step | Why |
|---|------|-----|
| 1.1 | Fetch Oracle text on deck import via Scryfall `/cards/collection` bulk endpoint | Currently only 18 cards in `CARD_DATABASE`; everything else gets empty/inferred rules |
| 1.2 | Expand `inferEntryTapRule` for all "enters tapped" variants: `~ enters tapped`, `CARDNAME enters tapped`, `~ enters the battlefield tapped`, `you may have ~ enter tapped`, `with a stun counter` | Regex currently misses many cards |
| 1.3 | Expand `evaluateConditionalEntryTap` beyond 2 patterns — handle "unless you control a [basic land type]", "unless you control a Gate/Desert", "unless {E}", "unless you paid {E}" | ~40% of ETB lands use conditional clauses not covered |
| 1.4 | Build `inferManaAbility` — parse `{T}: Add {C}` / `{1}, {T}: Add any color` patterns beyond current simple `{T}: Add {W}` regex | Many mana rocks, dorks, and filter lands produce conditionally |
| 1.5 | Build rule override UI in Deck Detail page (per-card ETB mode, mana override) backed by `cardRuleStore` | Store exists but has no UI; manual correction needs a surface |
| 1.6 | Migrate rule cache from localStorage to IndexedDB | 5 MB limit will be hit with full rules engine |

### Phase 2: Game Engine — Stack, Triggers, State-Based Actions

| # | Step | Why |
|---|------|-----|
| 2.1 | Model `TriggeredAbility` type — trigger event kinds (ETB, upkeep, death, cast), source card, condition, effect | Core MTG mechanic entirely absent |
| 2.2 | Build a trigger stack — collect triggers on events, let user order them, resolve one at a time | Foundation for all triggered cards |
| 2.3 | Implement state-based actions loop: check SBA after every action (lethal damage, 0-toughness, legend rule, etc.) | Without this, creatures don't die from damage |
| 2.4 | Add `Effect` model to `EffectHistoryEntry` — track continuous effects, temporary effects, "until end of turn" | Needed for pump spells, auras, temporary control changes |

### Phase 3: Combat

| # | Step | Why |
|---|------|-----|
| 3.1 | Add combat phase to turn model — beginning of combat, declare attackers, declare blockers, combat damage, end of combat | Turn model currently skips directly from main to end |
| 3.2 | Build attack/block declaration UI — tap attackers, assign blockers, trample/indestructible tracking | No combat exists at all |
| 3.3 | Implement combat damage assignment + SBA cleanup | Creature death via combat |

### Phase 4: Advanced Abilities

| # | Step | Why |
|---|------|-----|
| 4.1 | Add targeting model — spells/abilities that target need a target selection step before resolution | Counterspells, removal, pump targets require this |
| 4.2 | Implement keyword resolution: haste, flying, deathtouch, lifelink, trample, ward, flash | Card display is done but abilities have no mechanical effect |
| 4.3 | Add token generation from abilities (not just manual) | Many cards create tokens programmatically |
| 4.4 | Implement modal/cost choices — kicker, additional costs, choose one | Required for modal spells to work |

### Phase 5: Priority & Turn Structure

| # | Step | Why |
|---|------|-----|
| 5.1 | Add priority system — who has priority, pass priority in rounds | Currently everything is sorcery-speed manual actions |
| 5.2 | Allow instant-speed card play during any phase | Instants need priority windows |
| 5.3 | Build full turn structure — untap, upkeep, draw, main, combat (3 steps), main, end | Drives trigger timing |

### Phase 6: Broadcaster & Multiplayer Rules Sync

| # | Step | Why |
|---|------|-----|
| 6.1 | Move rules engine to shared `protocol/` package | Currently duplicated inference logic, no server-side validation |
| 6.2 | Server-authoritative card resolution in `GameRoom.ts` | Multiplayer players can currently cheat card state |

---

## Boilerplate Extraction Loop

Saved: 2026-07-24

Eliminate the `pushUndo(state)` + `state.cards.map(c => c.id === id ? {...c, ...} : c)` boilerplate pattern repeated ~45 times across `gameStore.ts`.

Prompt:
> Replace the manual `pushUndo(state)` call at the start of every gameStore action with Zustand middleware that auto-pushes undo before each `set()`. Then introduce an `updateCard(state, id, patch)` helper to replace the map+spread pattern. For each action handler converted, verify that undo/redo still produces the correct snapshot before and after the action, that multi-card mutations are captured in a single undo entry, and that no unrelated store subscribers fire incorrectly. Stop when every action uses the middleware path or a documented exception exists.