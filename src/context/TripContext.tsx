import React, { createContext, useContext, useEffect, useState } from 'react'
import { db, TripItem } from '../lib/db'

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
      const existing = await db.trips.where('title').equals(slug).first()
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
      const id = await db.trips.add({ title: s, startDate: undefined, endDate: undefined, User_ID: undefined, updatedAt: Date.now() })
      t = await db.trips.get(id)
    }
    setTrip(t || null)
    return t as TripItem
  }

  const updateTripTitle = async (id: number, newTitle: string) => {
    await db.trips.update(id, { title: newTitle, updatedAt: Date.now() })
    const updated = await db.trips.get(id)
    setTrip(updated || null)
  }

  return (
    <TripContext.Provider value={{ trip, tripId: trip?.Trip_ID, ensureTrip, updateTripTitle }}>
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
