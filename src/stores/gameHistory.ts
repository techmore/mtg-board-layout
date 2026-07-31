import type { GameState, GameSnapshot } from './gameStore'
import { beginUndoTransaction, endUndoTransaction, pushUndoSnapshot, takeSnapshot } from './gameRules'

function snapshotsEqual(left: GameSnapshot, right: GameSnapshot) {
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
      if (completed && before && !snapshotsEqual(before, after)) {
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
