const DB_NAME = 'mtg-board-kv'
const DB_VERSION = 1
const STORE_NAME = 'kv'

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

export async function idbGet<T>(key: string): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDB()
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(key)
      req.onsuccess = () => { db.close(); resolve(req.result ?? null) }
      req.onerror = () => { db.close(); resolve(null) }
    })
  } catch {
    return null
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(value, key)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    })
  } catch { /* storage failure is non-fatal */ }
}
