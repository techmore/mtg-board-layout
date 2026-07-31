const DB_NAME = 'mtg-board-cache'
const DB_VERSION = 1
const STORE_NAME = 'card-images'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getCachedCardImage(scryfallId: string): Promise<Blob | null> {
  if (!scryfallId) return null
  try {
    const db = await openDB()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(scryfallId)
      req.onsuccess = () => { db.close(); resolve(req.result ?? null) }
      req.onerror = () => { db.close(); resolve(null) }
    })
  } catch {
    return null
  }
}

export async function cacheCardImage(scryfallId: string, imageUrl: string): Promise<void> {
  if (!scryfallId || !imageUrl || !imageUrl.startsWith('http')) return
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
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  } catch { /* background cache failure is non-fatal */ }
}

export function cacheDeckImages(cards: { scryfallId: string; imageUri: string }[]): void {
  for (const c of cards) {
    if (c.scryfallId && c.imageUri && c.imageUri.startsWith('http')) {
      cacheCardImage(c.scryfallId, c.imageUri)
    }
  }
}
