const SCRYFALL_API = 'https://api.scryfall.com'

export async function searchCards(query: string) {
  const res = await fetch(`${SCRYFALL_API}/cards/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('Card search failed')
  const data = await res.json()
  return data.data as import('../types/card').ScryfallCard[]
}

export async function getCardByName(name: string) {
  const res = await fetch(`${SCRYFALL_API}/cards/named?exact=${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error('Card not found')
  return res.json() as Promise<import('../types/card').ScryfallCard>
}

export async function getCardImageUri(scryfallId: string): Promise<string> {
  const res = await fetch(`${SCRYFALL_API}/cards/${scryfallId}`)
  if (!res.ok) throw new Error('Card not found')
  const card = await res.json()
  return card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? ''
}
