import { db, TripItem } from './db'
import { getLocalUserIdentity } from './userIdentity'

export async function getOrCreateTripBySlug(slug: string): Promise<TripItem> {
  let trip = await db.trips.where('title').equals(slug).first()
  if (!trip) {
    const identity = getLocalUserIdentity()
    const ownerId = identity?.user_id ?? undefined
    const id = await db.trips.add({ title: slug, updated_at: Date.now(), owner_id: ownerId })
    trip = await db.trips.get(id)
  }
  return trip as TripItem
}

export default getOrCreateTripBySlug
