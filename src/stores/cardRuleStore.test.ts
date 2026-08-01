import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { idbGet } from '../services/idb'

const STORAGE_KEY = 'mtg-card-rules'
const IDB_KEY = 'card-rules'

function makeLocalStorage(raw: unknown): Storage {
  return {
    getItem: (key: string) => (key === STORAGE_KEY ? JSON.stringify(raw) : null),
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as unknown as Storage
}

async function clearIndexedDB() {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('mtg-board-kv')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

async function freshStore() {
  vi.resetModules()
  const mod = await import('./cardRuleStore')
  return mod.useCardRuleStore
}

beforeEach(async () => {
  await clearIndexedDB()
  globalThis.localStorage = makeLocalStorage(null)
})

describe('cardRuleStore — IndexedDB persistence', () => {
  it('seeds from legacy localStorage and migrates it to IndexedDB', async () => {
    globalThis.localStorage = makeLocalStorage({ 'sf-1': 'always', 'sf-2': 'never' })
    const store = await freshStore()
    expect(store.getState().rules['sf-1']).toBe('always')

    await new Promise((r) => setTimeout(r, 20))
    const stored = await idbGet<Record<string, string>>(IDB_KEY)
    expect(stored).toEqual({ 'sf-1': 'always', 'sf-2': 'never' })
  })

  it('persists setEntryTapMode writes to IndexedDB', async () => {
    const store = await freshStore()
    store.getState().setEntryTapMode('sf-3', 'conditional')
    await new Promise((r) => setTimeout(r, 20))
    const stored = await idbGet<Record<string, string>>(IDB_KEY)
    expect(stored).toEqual({ 'sf-3': 'conditional' })
  })

  it('removes the entry when the mode is reset to automatic', async () => {
    const store = await freshStore()
    store.getState().setEntryTapMode('sf-4', 'always')
    store.getState().setEntryTapMode('sf-4', 'automatic')
    expect(store.getState().rules['sf-4']).toBeUndefined()
    await new Promise((r) => setTimeout(r, 20))
    const stored = await idbGet<Record<string, string>>(IDB_KEY)
    expect(stored?.['sf-4']).toBeUndefined()
  })

  it('drops invalid modes when loading legacy data', async () => {
    globalThis.localStorage = makeLocalStorage({ 'sf-5': 'always', 'sf-6': 'bogus' })
    const store = await freshStore()
    expect(store.getState().rules['sf-5']).toBe('always')
    expect(store.getState().rules['sf-6']).toBeUndefined()
  })

  it('hydrates over the legacy seed when IndexedDB holds newer data', async () => {
    await idbSetRaw({ 'sf-7': 'never' })
    globalThis.localStorage = makeLocalStorage({ 'sf-7': 'always' })
    const store = await freshStore()
    await new Promise((r) => setTimeout(r, 20))
    expect(store.getState().rules['sf-7']).toBe('never')
  })
})

async function idbSetRaw(value: unknown) {
  const mod = await import('../services/idb')
  await mod.idbSet(IDB_KEY, value)
}
