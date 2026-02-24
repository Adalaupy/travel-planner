import { db, TripItem } from './db'

export async function getOrCreateTripBySlug(slug: string): Promise<TripItem> {
  let trip = await db.trips.where('title').equals(slug).first()
  if (!trip) {
    const id = await db.trips.add({ title: slug, updated_at: Date.now() })
    trip = await db.trips.get(id)
  }
  return trip as TripItem
}

export default getOrCreateTripBySlug
