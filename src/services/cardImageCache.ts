const DB_NAME = 'mtg-board-cache'
const DB_VERSION = 1
const STORE_NAME = 'card-images'

// One shared connection instead of opening+closing per card (a full board
// would otherwise churn dozens of IndexedDB connections on first render).
let dbPromise: Promise<IDBDatabase> | null = null
function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        dbPromise = null
        reject(req.error)
      }
    })
  }
  return dbPromise
}

export async function getCachedCardImage(scryfallId: string): Promise<Blob | null> {
  if (!scryfallId) return null
  try {
    const db = await openDB()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(scryfallId)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

// Cache misses are fetched from Scryfall; cap concurrent fetches so a fresh
// board doesn't fire one network request per card simultaneously.
const MAX_CONCURRENT_FETCHES = 4
let activeFetches = 0
const fetchQueue: (() => void)[] = []

function pumpFetchQueue() {
  activeFetches--
  while (activeFetches < MAX_CONCURRENT_FETCHES && fetchQueue.length > 0) {
    const next = fetchQueue.shift()!
    activeFetches++
    next()
  }
}

function enqueueFetch(task: () => Promise<void>) {
  activeFetches++
  if (activeFetches <= MAX_CONCURRENT_FETCHES) {
    void task().finally(pumpFetchQueue)
  } else {
    fetchQueue.push(() => { void task().finally(pumpFetchQueue) })
  }
}

export function cacheCardImage(scryfallId: string, imageUrl: string): void {
  if (!scryfallId || !imageUrl || !imageUrl.startsWith('http')) return
  enqueueFetch(async () => {
    try {
      const existing = await getCachedCardImage(scryfallId)
      if (existing) return
      const response = await fetch(imageUrl, { mode: 'cors' })
      if (!response.ok) return
      const blob = await response.blob()
      const db = await openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(blob, scryfallId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch { /* background cache failure is non-fatal */ }
  })
}

export function cacheDeckImages(cards: { scryfallId: string; imageUri: string }[]): void {
  for (const c of cards) {
    if (c.scryfallId && c.imageUri && c.imageUri.startsWith('http')) {
      cacheCardImage(c.scryfallId, c.imageUri)
    }
  }
}
