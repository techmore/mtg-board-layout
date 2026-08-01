# Roadmap: Remaining Features & Abilities

Goal: Every card and feature in the app is playable — abilities resolve mechanically,
all 16 starter decks are complete and functional, and the game loop works end to end.

Status legend: [x] done · [~] partial · [ ] not started

## Phase A: Starter Deck Completion (highest priority)

All 16 prebuilt decks are complete, official, playable 100-card lists. Decklists live in
`src/data/decklists/*.json` (single source for app + parser script).

| Deck | Status |
|------|--------|
| Blight Curse | [x] complete |
| Draconic Destruction (AI) | [x] complete |
| Dance of the Elements | [x] official list (playgroup.gg, cross-checked) |
| Cairo's Monument | [x] theme-built (fictional product; commander Cairo not in Scryfall) |
| Enduring Enchantments | [x] official (Commander Masters 2023) |
| Sauron, the Dark Lord | [x] official (Tales of Middle-earth) |
| Food & Fellowship | [x] official (Tales of Middle-earth) |
| Creative Energy | [x] official (MH3 WotC page) |
| Eldrazi Incursion | [x] official (MH3 WotC page) |
| Squirreled Away | [x] official (Bloomburrow WotC page) |
| Jump Scare | [x] official (Duskmourn WotC page) |
| Endless Punishment | [x] official (Duskmourn WotC page) |
| Eldrazi Unbound | [x] official (WotC article) |
| Grave Danger | [x] official (Fallout) |
| Mutant Menace | [x] official (Fallout "Hail, Caesar") |
| Glory Dog | [x] official (Fallout "Scrappy Survivors") |
| Necron Dynasties | [x] official (WotC article) |

All 16 decks: rules parsed and verified (1,495 cards), combined into
`public/all-decks-rules.json` feeding the trigger engine for every deck.
DFC names normalized to front faces; arena-only printings excluded.

## Phase B: Ability Engine

| # | Ability | Mechanic needed | Status |
|---|---------|-----------------|--------|
| B1 | Keywords (flying, trample, lifelink, deathtouch, haste, vigilance, reach, first strike, ward, indestructible, hexproof) | Parse keywords from rules JSON; combat modifiers (flying/reach blocking, trample overflow, lifelink heal, deathtouch lethal, indestructible survival, haste/vigilance attack rules) | [ ] |
| B2 | Targeting | `TargetCard.tsx` exists — wire target-selection step into cast/resolve flow for spells and abilities that target | [~] |
| B3 | Continuous / temporary effects | `EffectHistoryEntry` exists — model "until end of turn", pump spells, auras | [~] |
| B4 | Modal spells & kicker | Cost-choice UI before resolution | [ ] |
| B5 | Token generation from abilities | Trigger effects already produce tokens via `triggerActions` — audit coverage | [~] |
| B6 | Combat steps | Formalize declare-attackers/blockers/damage steps with pass-priority gaps; auto-enter combat from main phase | [~] |
| B7 | Priority system | Who-has-priority model + instant-speed windows | [ ] |

## Phase C: Opponent & Multiplayer Playability

| # | Item | Status |
|---|------|--------|
| C1 | AI opponent deck selection (choose any imported/prebuilt deck for the AI) | [ ] |
| C2 | AI improvement: cast instants during combat, use commander more, keep 2+ land types for color fixing | [~] |
| C3 | AI opponent in multiplayer? (solo AI only today) | [ ] |
| C4 | Multiplayer rules parity: trigger engine + SBA server-side (protocol Phase 6) | [ ] |
| C5 | Deck import polish: Moxfield/Archidekt raw list handling, import validation errors surfaced | [~] |

## Phase D: Data & Content Infrastructure

| # | Item | Status |
|---|------|--------|
| D1 | Move decklists to `src/data/decklists/*.json` (single source for app + parser script) | [ ] |
| D2 | Local card images for all deck cards (extend `public/cards/` catalog + `localCardImages.ts`) | [ ] |
| D3 | Card rules cache migration localStorage → IndexedDB | [~] |
| D4 | Scryfall bulk-data offline mirror (optional) | [ ] |

## Phase E: Verification

| # | Item | Status |
|---|------|--------|
| E1 | Per-deck playability test (import → board → draw 7 → advance turns) | [ ] |
| E2 | Deck-vs-AI smoke test (load deck, play 3 turns each side) | [ ] |
| E3 | Regression suite: SBA, combat, triggers, mana, rules parser (grow beyond 138 tests) | [~] |
| E4 | README + docs/API.md update (overrideLandPlay now implemented, deck builder, AI opponent) | [ ] |
