import type { BackgroundOption } from '../types/card'

const DATABASE_NAME = 'mtg-board-storage'
const STORE_NAME = 'backgrounds'
const DATABASE_VERSION = 1
const INDEXED_DB_PREFIX = 'indexeddb:'

interface StoredBackground {
  id: string
  dataUrl: string
}

export function isIndexedDbBackground(value: string): boolean {
  return value.startsWith(INDEXED_DB_PREFIX)
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

export async function saveBackgroundsToStorage(backgrounds: BackgroundOption[]): Promise<void> {
  const database = await openDatabase()
  if (!database) return
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    backgrounds.forEach((background) => store.put({ id: background.id, dataUrl: background.dataUrl } satisfies StoredBackground))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
  })
  database.close()
}

export async function hydrateBackgrounds(backgrounds: BackgroundOption[], backgroundImage: string | null): Promise<{ backgrounds: BackgroundOption[]; backgroundImage: string | null }> {
  const indexedBackgrounds = backgrounds.filter((background) => isIndexedDbBackground(background.dataUrl))
  const indexedImage = isIndexedDbBackground(backgroundImage ?? '')
  if (indexedBackgrounds.length === 0 && !indexedImage) return { backgrounds, backgroundImage }

  const database = await openDatabase()
  if (!database) {
    return {
      backgrounds: backgrounds.filter((background) => !isIndexedDbBackground(background.dataUrl)),
      backgroundImage: indexedImage ? null : backgroundImage,
    }
  }
  const values = await new Promise<Map<string, string>>((resolve) => {
    const result = new Map<string, string>()
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      for (const item of request.result as StoredBackground[]) result.set(item.id, item.dataUrl)
      resolve(result)
    }
    request.onerror = () => resolve(result)
  })
  database.close()

  const hydrated = backgrounds.flatMap((background) => {
    if (!isIndexedDbBackground(background.dataUrl)) return [background]
    const dataUrl = values.get(background.id)
    return dataUrl ? [{ ...background, dataUrl }] : []
  })
  const activeId = isIndexedDbBackground(backgroundImage ?? '') ? backgroundImage!.slice(INDEXED_DB_PREFIX.length) : null
  return {
    backgrounds: hydrated,
    backgroundImage: activeId ? values.get(activeId) ?? null : backgroundImage,
  }
}

export function indexedDbReference(id: string): string {
  return `${INDEXED_DB_PREFIX}${id}`
}
