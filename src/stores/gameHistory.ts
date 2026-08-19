import type { GameState, GameSnapshot } from './gameStore'
import { beginUndoTransaction, endUndoTransaction, isAITurnActive, pushUndoSnapshot, takeSnapshot } from './gameRules'

function snapshotsEqual(left: GameSnapshot, right: GameSnapshot) {
  // Fast path: the fields most undoable actions touch. If any differ, the
  // action changed state. Only when these all match do we pay for the exact
  // comparison (rare no-op actions).
  if (left.lifeTotal !== right.lifeTotal || left.opponentLifeTotal !== right.opponentLifeTotal) return false
  if (left.turn !== right.turn || left.activePlayer !== right.activePlayer || left.currentPhase !== right.currentPhase) return false
  if (left.landPlaysThisTurn !== right.landPlaysThisTurn || left.opponentLandPlaysThisTurn !== right.opponentLandPlaysThisTurn) return false
  if (left.playerSpellsCastThisTurn !== right.playerSpellsCastThisTurn || left.opponentSpellsCastThisTurn !== right.opponentSpellsCastThisTurn) return false
  if (left.cards.length !== right.cards.length) return false
  if ((left.gameOver?.winner ?? null) !== (right.gameOver?.winner ?? null)) return false
  return JSON.stringify(left) === JSON.stringify(right)
}

export interface UndoContext {
  undoActionDepth: number
}

export function createUndoContext(): UndoContext {
  return { undoActionDepth: 0 }
}

export function runUndoableAction<T>(
  context: UndoContext,
  set: (fn: (state: GameState) => Partial<GameState>) => void,
  get: () => GameState,
  action: () => T,
): T {
  const isOuterAction = context.undoActionDepth === 0
  const before = isOuterAction ? takeSnapshot(get()) : null
  if (isOuterAction) beginUndoTransaction()
  context.undoActionDepth++
  let completed = false
  try {
    const result = action()
    completed = true
    return result
  } finally {
    context.undoActionDepth--
    if (isOuterAction) {
      endUndoTransaction()
      const after = takeSnapshot(get())
      // The AI's turn runs asynchronously; capturing it in the player's undo
      // stack lets Ctrl+Z restore the opponent turn with no AI timers running
      // (a soft-lock). The AI turn is not undoable.
      const inAITurn = isAITurnActive()
      if (completed && before && !inAITurn && !snapshotsEqual(before, after)) {
        set((state) => pushUndoSnapshot(state, before))
      }
    }
  }
}

export function createUndoActions(
  set: (fn: (state: GameState) => Partial<GameState> | Partial<GameState>) => void,
): Pick<GameState, 'undo' | 'redo'> {
  return {
    undo: () =>
      set((state) => {
        if (state.undoStack.length === 0) return {}
        const snapshot = state.undoStack[state.undoStack.length - 1]
        return {
          ...snapshot,
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [...state.redoStack, takeSnapshot(state)],
        }
      }),

    redo: () =>
      set((state) => {
        if (state.redoStack.length === 0) return {}
        const snapshot = state.redoStack[state.redoStack.length - 1]
        return {
          ...snapshot,
          redoStack: state.redoStack.slice(0, -1),
          undoStack: [...state.undoStack, takeSnapshot(state)],
        }
      }),
  }
}
