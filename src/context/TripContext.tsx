import React, { createContext, useContext, useEffect, useState } from 'react'
import { db, TripItem } from '../lib/db'
import { getLocalUserIdentity } from '../lib/userIdentity'

type TripContextValue = {
  trip?: TripItem | null
  tripId?: number | undefined
  ensureTrip: (slug: string) => Promise<TripItem>
  updateTripTitle: (id: number, newTitle: string) => Promise<void>
}

const TripContext = createContext<TripContextValue | undefined>(undefined)

export const TripProvider = ({ slug, children }: { slug: string; children: React.ReactNode }) => {
  const [trip, setTrip] = useState<TripItem | null | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const existing =
        (await db.trips.where('trip_id').equals(slug).first()) ||
        (await db.trips.where('title').equals(slug).first())
      if (mounted) setTrip(existing || null)
    }
    load()
    return () => {
      mounted = false
    }
  }, [slug])

  const ensureTrip = async (s: string) => {
    let t = await db.trips.where('title').equals(s).first()
    if (!t) {
      const identity = getLocalUserIdentity()
      const ownerId = identity?.user_id ?? undefined
      const id = await db.trips.add({ title: s, start_date: undefined, end_date: undefined, owner_id: ownerId, updated_at: Date.now() })
      // For offline trips, use __dexieId as the trip_id string
      await db.trips.update(id, { trip_id: String(id) })
      t = await db.trips.get(id)
    }
    setTrip(t || null)
    return t as TripItem
  }

  const updateTripTitle = async (id: number, newTitle: string) => {
    await db.trips.update(id, { title: newTitle, updated_at: Date.now() })
    const updated = await db.trips.get(id)
    setTrip(updated || null)
  }

  return (
    <TripContext.Provider value={{ trip, tripId: trip?.__dexieid, ensureTrip, updateTripTitle }}>
      {children}
    </TripContext.Provider>
  )
}

export function useTrip() {
  const ctx = useContext(TripContext)
  if (!ctx) throw new Error('useTrip must be used within TripProvider')
  return ctx
}

export default TripContext
