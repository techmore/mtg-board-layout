import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  isIndexedDbBackground,
  saveBackgroundsToStorage,
  hydrateBackgrounds,
  indexedDbReference,
} from './backgroundStorage'
import type { BackgroundOption } from '../types/card'

const background = (overrides: Partial<BackgroundOption> = {}): BackgroundOption => ({
  id: 'bg-1',
  name: 'Test Background',
  dataUrl: 'data:image/png;base64,abc',
  ...overrides,
})

describe('isIndexedDbBackground', () => {
  it('recognizes indexeddb-prefixed data URLs', () => {
    expect(isIndexedDbBackground('indexeddb:bg-1')).toBe(true)
    expect(isIndexedDbBackground('data:image/png;base64,abc')).toBe(false)
    expect(isIndexedDbBackground('')).toBe(false)
  })
})

describe('indexedDbReference', () => {
  it('wraps an id in the indexeddb prefix', () => {
    expect(indexedDbReference('bg-2')).toBe('indexeddb:bg-2')
  })
})

describe('saveBackgroundsToStorage / hydrateBackgrounds', () => {
  it('round-trips indexeddb-referenced backgrounds through storage', async () => {
    const stored = background({ id: 'bg-a', dataUrl: 'data:image/png;base64,AAA' })
    const ref = indexedDbReference('bg-a')
    const referenced = background({ id: 'bg-a', dataUrl: ref })

    await saveBackgroundsToStorage([stored])
    const { backgrounds } = await hydrateBackgrounds([referenced], null)

    expect(backgrounds).toEqual([stored])
  })

  it('restores the active indexeddb background image', async () => {
    const stored = background({ id: 'bg-b', dataUrl: 'data:image/png;base64,BBB' })
    await saveBackgroundsToStorage([stored])

    const { backgroundImage } = await hydrateBackgrounds([], indexedDbReference('bg-b'))
    expect(backgroundImage).toBe(stored.dataUrl)
  })

  it('drops indexeddb references with no stored data instead of leaking them', async () => {
    const orphan = background({ id: 'missing', dataUrl: indexedDbReference('missing') })
    const { backgrounds } = await hydrateBackgrounds([orphan], null)
    expect(backgrounds).toEqual([])
  })

  it('passes through plain data-URL backgrounds untouched', async () => {
    const plain = background({ id: 'bg-c', dataUrl: 'data:image/png;base64,CCC' })
    const { backgrounds, backgroundImage } = await hydrateBackgrounds([plain], plain.dataUrl)
    expect(backgrounds).toEqual([plain])
    expect(backgroundImage).toBe(plain.dataUrl)
  })

  it('falls back to dropping indexeddb refs when IndexedDB is unavailable', async () => {
    const original = globalThis.indexedDB
    globalThis.indexedDB = undefined as unknown as IDBFactory
    try {
      const ref = background({ id: 'bg-d', dataUrl: indexedDbReference('bg-d') })
      const { backgrounds, backgroundImage } = await hydrateBackgrounds([ref], indexedDbReference('bg-d'))
      expect(backgrounds).toEqual([])
      expect(backgroundImage).toBeNull()
    } finally {
      globalThis.indexedDB = original
    }
  })
})
