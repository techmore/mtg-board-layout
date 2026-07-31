# DeepSeek follow-up queue

Use this queue after the current `gameStore.ts` / `BoardPage.tsx` refactor is complete. Preserve the public `useGameStore` API and avoid unrelated rewrites.

## 0. Fix the reported compile claim first

The current workspace does not compile yet. `npm run build` reports:

- `src/stores/gameStore.ts:162`: the composed object is typed as `GameState`, but the action factories return `Partial<GameState>`, so required methods such as `setLife` are considered optional.
- `src/stores/gameTurnActions.ts:1`: `ActivePlayer` and `Phase` are imported from `types/card`, where they are not exported.
- `src/components/Board/HoverZoomCard.tsx:53`: `src` passes `null` where the image prop accepts `string | undefined`.
- Unused imports remain in `gameStore.ts`, `gameTurnActions.ts`, and `gameCardActions.ts`.

Fix these without using broad `as GameState` casts unless the factory return types make the composition genuinely type-safe. Re-run `npm run build` and require exit code 0 before proceeding.

## 1. Verify and stabilize the refactor

- Run `npm run build`, `npm run lint`, and `git diff --check`.
- Confirm the board still loads a deck, draws cards, plays cards, advances phases, and renders the opponent zone.
- Confirm undo/redo restores cards, mana, life, phase, combat state, and opponent state.
- Stop and report any behavior regression before starting the next item.

## 2. Add focused regression coverage

Cover the smallest high-risk scenarios:

- add mana → undo → redo;
- cast a spell that spends mana → one undo restores both mana and card zone;
- advance phase → undo restores the prior phase;
- combat damage → undo restores life, counters, and combat state;
- conditional ETB prompt → resolve choice → undo restores the prompt and card location.

Use the project’s existing test setup if present; otherwise add the smallest test runner needed and document the command.

## 3. Finish the maintainability split

- Keep `gameStore.ts` as composition/wiring only.
- Keep turn/phase, card movement, mana, combat, triggers, opponent AI, and undo/history in separate modules.
- Keep `BoardPage.tsx` as a shell; move hand, opponent zone, turn prompt, drag/drop handlers, and board overlays into focused components/hooks.
- Preserve behavior and selector names while moving code.

## 4. Close known cleanup items

- Resolve remaining lint warnings without changing generated card data semantics.
- Keep the card-rule parser’s timeout, completeness validation, and 85-entry output check.
- Record any intentionally unsupported asynchronous undo behavior in the code comments.

## Definition of done

The app builds cleanly, the focused regression scenarios pass, no unrelated files are rewritten, and the final diff clearly separates structural refactoring from behavior changes.
