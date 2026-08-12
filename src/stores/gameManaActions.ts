import type { ManaColor, ManaLogEntry } from '../types/card'
import type { GameState } from './gameStore'
import { canPayManaCost, parseManaCost, spendManaForCost } from '../utils/misc'
import { emptyManaPool, generatedManaState, pushUndo } from './gameRules'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

export function createManaActions(set: SetFn, get: () => GameState): Pick<GameState, 'setLife' | 'addMana' | 'spendMana' | 'spendManaCost' | 'clearManaPool'> {
  return {
    setLife: (n) => {
      const old = get().lifeTotal
      set((state) => ({ ...pushUndo(state), lifeTotal: n }))
      if (n > old) get().emitGameEvent({ type: 'life_gain', amount: n - old })
      if (n < old) get().emitGameEvent({ type: 'life_loss', amount: old - n })
      if (n <= 0) {
        set({ turnAnnouncement: { id: Date.now(), text: 'DEFEATED — Life reached 0' }, turnPrompt: null, gameOver: { winner: 'opponent' } })
      }
    },

    addMana: (color, source) =>
      set((state) => {
        if (source) {
          return { ...pushUndo(state), ...generatedManaState(state, color, 1, source) }
        }
        const potential = state.potentialMana.find((p) => p.colors.includes(color))
        if (potential) {
          const generated = generatedManaState(state, color, 1,
            potential.sourceCardId && potential.sourceCardName
              ? { cardId: potential.sourceCardId, cardName: potential.sourceCardName }
              : undefined)
          return {
            ...pushUndo(state),
            ...generated,
            potentialMana: state.potentialMana.filter((p) => p.id !== potential.id),
          }
        }
        return { ...pushUndo(state), ...generatedManaState(state, color, 1, undefined) }
      }),

    spendMana: (color, usage = 'spell', label) =>
      set((state) => {
        const entry: ManaLogEntry = { id: crypto.randomUUID(), turn: state.turn, direction: 'spent', color, amount: 1, usage, label: label?.trim() || undefined }
        if (state.manaPool[color] > 0) {
          const undo = pushUndo(state)
          return {
            ...undo,
            manaPool: { ...state.manaPool, [color]: state.manaPool[color] - 1 },
            manaLog: [...state.manaLog, entry].slice(-250),
          }
        }
        const source = state.potentialMana.find((candidate) => candidate.colors.includes(color))
        if (!source) return {}
        const undo = pushUndo(state)
        const generated = generatedManaState(state, color, 1, source.sourceCardId && source.sourceCardName
          ? { cardId: source.sourceCardId, cardName: source.sourceCardName }
          : undefined)
        return {
          ...undo,
          potentialMana: state.potentialMana.filter((candidate) => candidate.id !== source.id),
          manaPool: { ...generated.manaPool, [color]: generated.manaPool[color] - 1 },
          manaLog: [...generated.manaLog, entry].slice(-250),
        }
      }),

    spendManaCost: (costSymbols, label) => {
      const state = get()
      if (!costSymbols) return true

      if (!canPayManaCost(state.manaPool, costSymbols)) {
        const potentialByColor: Record<string, { sourceId: string; color: ManaColor; cardId?: string; cardName?: string }[]> = {}
        for (const src of state.potentialMana) {
          for (const c of src.colors) {
            if (!potentialByColor[c]) potentialByColor[c] = []
            potentialByColor[c].push({ sourceId: src.id, color: c, cardId: src.sourceCardId, cardName: src.sourceCardName })
          }
        }
        const simulatedPool = { ...state.manaPool }
        const usedSourceIds = new Set<string>()
        const usedSources: { sourceId: string; color: ManaColor; cardId?: string; cardName?: string }[] = []
        // A single potential source may appear in several color buckets (e.g.
        // Command Tower produces W and U); it must only ever be spent once.
        const takeFresh = (bucket: { sourceId: string; color: ManaColor; cardId?: string; cardName?: string }[] | undefined): { sourceId: string; color: ManaColor; cardId?: string; cardName?: string } | null => {
          while (bucket && bucket.length > 0) {
            const src = bucket.shift()!
            if (usedSourceIds.has(src.sourceId)) continue
            usedSourceIds.add(src.sourceId)
            return src
          }
          return null
        }
        const parsed = parseManaCost(costSymbols)
        for (const { color, count } of parsed.colored) {
          let have = simulatedPool[color] ?? 0
          while (have < count) {
            const src = takeFresh(potentialByColor[color])
            if (!src) return false
            usedSources.push(src)
            simulatedPool[color] = (simulatedPool[color] ?? 0) + 1
            have++
          }
        }
        let generic = parsed.generic
        if (generic > 0) {
          for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
            while ((simulatedPool[color] ?? 0) > 0 && generic > 0) {
              simulatedPool[color]!--
              generic--
            }
          }
          if (generic > 0) {
            for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
              while (generic > 0) {
                const src = takeFresh(potentialByColor[color])
                if (!src) break
                usedSources.push(src)
                generic--
              }
            }
            if (generic > 0) return false
          }
        }
        let newPool = { ...state.manaPool }
        let newPotential = [...state.potentialMana]
        const logEntries: ManaLogEntry[] = []
        for (const src of usedSources) {
          const foundColor = src.color
          newPool[foundColor] = (newPool[foundColor] ?? 0) + 1
          newPotential = newPotential.filter((p) => p.id !== src.sourceId)
          logEntries.push({
            id: crypto.randomUUID(),
            turn: state.turn,
            direction: 'generated',
            color: foundColor,
            amount: 1,
            sourceCardId: src.cardId,
            sourceCardName: src.cardName,
          })
        }
        set((prev) => ({
          manaPool: newPool,
          potentialMana: newPotential,
          manaLog: [...prev.manaLog, ...logEntries].slice(-250),
        }))
      }

      const finalState = get()
      if (!canPayManaCost(finalState.manaPool, costSymbols)) return false

      const before = finalState.manaPool
      const newPool = spendManaForCost(finalState.manaPool, costSymbols)
      const entries: ManaLogEntry[] = []
      for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
        const deducted = (before[color] ?? 0) - (newPool[color] ?? 0)
        if (deducted > 0) {
          entries.push({
            id: crypto.randomUUID(),
            turn: state.turn,
            direction: 'spent',
            color,
            amount: deducted,
            usage: 'spell',
            label: label ?? costSymbols,
          })
        }
      }

      set((prev) => ({
        ...pushUndo(prev),
        manaPool: newPool,
        manaLog: [...prev.manaLog, ...entries].slice(-250),
      }))
      return true
    },

    clearManaPool: () =>
      set((state) => ({
        ...pushUndo(state),
        manaPool: emptyManaPool(),
        potentialMana: [],
      })),
  }
}
