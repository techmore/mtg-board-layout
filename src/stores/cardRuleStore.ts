import { create } from 'zustand'
import type { EntryTapMode } from '../types/card'
import { idbGet, idbSet } from '../services/idb'

const STORAGE_KEY = 'mtg-card-rules'
const IDB_KEY = 'card-rules'

interface CardRuleStore {
  rules: Record<string, EntryTapMode>
  setEntryTapMode: (scryfallId: string, mode: EntryTapMode) => void
}

const VALID_MODES = new Set(['automatic', 'always', 'never', 'conditional'])

function sanitize(raw: unknown): Record<string, EntryTapMode> {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(([, mode]) => VALID_MODES.has(mode as string)),
  ) as Record<string, EntryTapMode>
}

function loadLegacy(): Record<string, EntryTapMode> {
  try {
    if (typeof localStorage === 'undefined') return {}
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'))
  } catch {
    return {}
  }
}

function saveLegacy(rules: Record<string, EntryTapMode>) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  } catch { /* ignore storage quota and privacy-mode failures */ }
}

export const useCardRuleStore = create<CardRuleStore>((set) => {
  const legacy = loadLegacy()
  let writtenSinceLoad = false
  idbGet<Record<string, EntryTapMode>>(IDB_KEY).then((stored) => {
    if (stored && !writtenSinceLoad) {
      useCardRuleStore.setState({ rules: stored })
    } else if (Object.keys(legacy).length > 0) {
      idbSet(IDB_KEY, legacy)
    }
  })
  return {
    rules: legacy,
    setEntryTapMode: (scryfallId, mode) =>
      set((state) => {
        writtenSinceLoad = true
        const rules = { ...state.rules }
        if (mode === 'automatic') delete rules[scryfallId]
        else rules[scryfallId] = mode
        idbSet(IDB_KEY, rules)
        saveLegacy(rules)
        return { rules }
      }),
  }
})
