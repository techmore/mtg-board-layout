import { create } from 'zustand'
import type { EntryTapMode } from '../types/card'

const STORAGE_KEY = 'mtg-card-rules'

interface CardRuleStore {
  rules: Record<string, EntryTapMode>
  setEntryTapMode: (scryfallId: string, mode: EntryTapMode) => void
}

function loadRules(): Record<string, EntryTapMode> {
  try {
    if (typeof localStorage === 'undefined') return {}
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(([, mode]) => ['automatic', 'always', 'never', 'conditional'].includes(mode as string)),
    ) as Record<string, EntryTapMode>
  } catch {
    return {}
  }
}

function persistRules(rules: Record<string, EntryTapMode>) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  } catch { /* ignore storage quota and privacy-mode failures */ }
}

export const useCardRuleStore = create<CardRuleStore>((set) => ({
  rules: loadRules(),
  setEntryTapMode: (scryfallId, mode) =>
    set((state) => {
      const rules = { ...state.rules }
      if (mode === 'automatic') delete rules[scryfallId]
      else rules[scryfallId] = mode
      persistRules(rules)
      return { rules }
    }),
}))
