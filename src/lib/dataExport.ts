import { db, TripItem, PlaceItem, ItineraryItem, PackingItem, TravelerItem, ExpenseItem } from './db'
import { importTripsToSupabase } from './syncService'
import { getLocalUserIdentity } from './userIdentity'

function stripDexieId<T extends Record<string, any>>(item: T): Omit<T, '__dexieid' | '__dexieId'> {
  const { __dexieid, __dexieId, ...rest } = item
  return rest
}

export async function exportAllData(): Promise<string> {
  const data = {
    version: 2, // DB schema version
    exportDate: new Date().toISOString(),
    users: (await db.users.toArray()).map(stripDexieId),
    trips: (await db.trips.toArray()).map(stripDexieId),
    places: (await db.places.toArray()).map(stripDexieId),
    itinerary: (await db.itinerary.toArray()).map(stripDexieId),
    packing: (await db.packing.toArray()).map(stripDexieId),
    travelers: (await db.travelers.toArray()).map(stripDexieId),
    expenses: (await db.expenses.toArray()).map(stripDexieId)
  }
  return JSON.stringify(data, null, 2)
}

export async function exportTripsData(tripIds: Array<string | number>): Promise<string> {
  const numericIds = tripIds
    .map((id) => (typeof id === 'number' ? id : Number(id)))
    .filter((id) => !Number.isNaN(id))

  const stringIds = tripIds
    .map((id) => String(id))
    .filter((id) => id && Number.isNaN(Number(id)))

  const numericTrips = numericIds.length ? await db.trips.bulkGet(numericIds) : []
  const stringTrips = stringIds.length
    ? await db.trips.where('trip_id').anyOf(stringIds).toArray()
    : []

  const tripsData = [...numericTrips, ...stringTrips].filter(
    (t): t is typeof t & {} => t !== undefined
  )

  const tripsExport = await Promise.all(
    tripsData.map(async (trip) => {
      const tripKey = trip.trip_id ?? (trip.__dexieid ? String(trip.__dexieid) : undefined)
      const legacyKey = trip.__dexieid ? String(trip.__dexieid) : undefined
      const keys = [tripKey, legacyKey].filter((v): v is string => !!v)
      const uniqueKeys = Array.from(new Set(keys))

      // Query for related items - try index first, then manual filtering for items with old trip_id formats
      const queryByTripId = async (table: any, searchKeys: string[]): Promise<any[]> => {
        if (!searchKeys.length) return []
        const indexed = await table.where('trip_id').anyOf(searchKeys).toArray()
        if (indexed.length > 0) return indexed
        // Fallback: filter all items to handle cases where trip_id wasn't updated after sync
        const all = await table.toArray()
        return all.filter(item =>
          searchKeys.includes(String(item.trip_id)) || searchKeys.includes(item.trip_id)
        )
      }

      const [places, itinerary, packing, travelers, expenses] = await Promise.all([
        uniqueKeys.length ? queryByTripId(db.places, uniqueKeys) : [],
        uniqueKeys.length ? queryByTripId(db.itinerary, uniqueKeys) : [],
        uniqueKeys.length ? queryByTripId(db.packing, uniqueKeys) : [],
        uniqueKeys.length ? queryByTripId(db.travelers, uniqueKeys) : [],
        uniqueKeys.length ? queryByTripId(db.expenses, uniqueKeys) : [],
      ])
      return {
        trip: stripDexieId(trip),
        places: places.map(stripDexieId),
        itinerary: itinerary.map(stripDexieId),
        packing: packing.map(stripDexieId),
        travelers: travelers.map(stripDexieId),
        expenses: expenses.map(stripDexieId)
      }
    })
  )

  return JSON.stringify(tripsExport, null, 2)
}

export async function importAllData(jsonString: string): Promise<{ success: boolean; error?: string }> {
  try {
    const data = JSON.parse(jsonString)

    if (!data.version || typeof data.version !== 'number') {
      return { success: false, error: 'Invalid backup file: missing version' }
    }

    // Clear existing data
    await db.users.clear()
    await db.trips.clear()
    await db.places.clear()
    await db.itinerary.clear()
    await db.packing.clear()
    await db.travelers.clear()
    await db.expenses.clear()

    // Import data
    if (data.users && Array.isArray(data.users)) await db.users.bulkAdd(data.users.map(stripDexieId))
    if (data.trips && Array.isArray(data.trips)) await db.trips.bulkAdd(data.trips.map(stripDexieId))
    if (data.places && Array.isArray(data.places)) await db.places.bulkAdd(data.places.map(stripDexieId))
    if (data.itinerary && Array.isArray(data.itinerary)) await db.itinerary.bulkAdd(data.itinerary.map(stripDexieId))
    if (data.packing && Array.isArray(data.packing)) await db.packing.bulkAdd(data.packing.map(stripDexieId))
    if (data.travelers && Array.isArray(data.travelers)) await db.travelers.bulkAdd(data.travelers.map(stripDexieId))
    if (data.expenses && Array.isArray(data.expenses)) await db.expenses.bulkAdd(data.expenses.map(stripDexieId))

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

export async function importTripsData(jsonString: string): Promise<{ success: boolean; error?: string }> {
  try {
    let tripsData = JSON.parse(jsonString)

    // Handle both array format and single object
    if (!Array.isArray(tripsData)) {
      tripsData = [tripsData]
    }

    if (!Array.isArray(tripsData) || tripsData.length === 0) {
      return { success: false, error: 'Invalid backup file: expected array of trip data' }
    }

    // Get next available user ID or create a default user
    const identity = getLocalUserIdentity()
    let defaultUserId: string | null | undefined = identity?.user_id ?? undefined
    if (!defaultUserId) {
      const users = await db.users.toArray()
      if (users.length > 0) {
        defaultUserId = users[0].user_id ?? undefined
      }
    }

    const supabasePayloads: any[] = []

    // Import each trip with its related data
    for (const tripData of tripsData) {
      const trip = tripData.trip
      if (!trip) {
        return { success: false, error: 'Invalid trip data: missing trip object' }
      }

      // Remove old IDs to let database auto-generate new ones
      const newTrip: TripItem = {
        ...stripDexieId(trip),
        trip_id: undefined,
        owner_id: (trip as any).owner_id ?? (trip as any).user_id ?? defaultUserId ?? null,
        title: trip.title ?? "Untitled Trip",
      }
      const newTripDexieId = await db.trips.add(newTrip)
      const newTripId = String(newTripDexieId)
      await db.trips.update(newTripDexieId, { trip_id: newTripId })
      supabasePayloads.push({ ...tripData, local_trip_id: newTripId })

      // Create ID mapping maps
      const placeIdMap = new Map<string, string>()
      const travelerIdMap = new Map<string, number>()

      // Import places and build ID map
      if (tripData.places && Array.isArray(tripData.places)) {
        for (const p of tripData.places) {
          const oldId = p.place_id
          const newPlace: PlaceItem = {
            ...stripDexieId(p),
            place_id: undefined,
            trip_id: newTripId,
            title: p.title ?? "Untitled Place",
          }
          const newDexieId = await db.places.add(newPlace)
          await db.places.update(newDexieId, { place_id: String(newDexieId) })
          if (oldId !== undefined) {
            placeIdMap.set(String(oldId), String(newDexieId))
          }
        }
      }

      // Import travelers and build ID map
      if (tripData.travelers && Array.isArray(tripData.travelers)) {
        for (const t of tripData.travelers) {
          const oldId = t.traveler_id
          const newTraveler: TravelerItem = {
            ...stripDexieId(t),
            traveler_id: undefined,
            trip_id: newTripId,
            name: t.name ?? "Traveler",
          }
          const newDexieId = await db.travelers.add(newTraveler)
          await db.travelers.update(newDexieId, { traveler_id: String(newDexieId) })
          if (oldId !== undefined) {
            travelerIdMap.set(String(oldId), newDexieId)
          }
        }
      }

      // Import itinerary with remapped place IDs
      if (tripData.itinerary && Array.isArray(tripData.itinerary)) {
        const newItinerary: ItineraryItem[] = tripData.itinerary.map((i: any, idx: number) => {
          const newItem: ItineraryItem = {
            ...stripDexieId(i),
            itinerary_id: undefined,
            trip_id: newTripId,
            day_index: i.day_index ?? idx,
            title: i.title ?? "Untitled",
          }
          const oldPlaceId = i.place_id
          if (oldPlaceId !== undefined && placeIdMap.has(String(oldPlaceId))) {
            newItem.place_id = placeIdMap.get(String(oldPlaceId))
          }
          return newItem
        })
        await db.itinerary.bulkAdd(newItinerary)
      }

      if (tripData.packing && Array.isArray(tripData.packing)) {
        const newPacking: PackingItem[] = tripData.packing.map((p: any, idx: number) => ({
          ...stripDexieId(p),
          packing_id: undefined,
          trip_id: newTripId,
          title: p.title ?? "Item",
          completed: !!p.completed,
          order: typeof p.order === "number" ? p.order : idx + 1,
        }))
        await db.packing.bulkAdd(newPacking)
      }

      // Import expenses with remapped traveler IDs
      if (tripData.expenses && Array.isArray(tripData.expenses)) {
        const newExpenses: ExpenseItem[] = tripData.expenses.map((e: any) => {
          const newExpense: ExpenseItem = {
            ...stripDexieId(e),
            expense_id: undefined,
            trip_id: newTripId,
            title: e.title ?? "Expense",
            amount: typeof e.amount === "number" ? e.amount : Number(e.amount) || 0,
          }
          const oldPayerId = e.payer_id
          if (oldPayerId !== undefined && travelerIdMap.has(String(oldPayerId))) {
            newExpense.payer_id = travelerIdMap.get(String(oldPayerId))
          }
          if (Array.isArray(e.charged_to)) {
            newExpense.charged_to = e.charged_to
              .map((oldTravelerId: number) => travelerIdMap.get(String(oldTravelerId)))
              .filter((id: number | undefined): id is number => id !== undefined)
          }
          return newExpense
        })
        await db.expenses.bulkAdd(newExpenses)
      }
    }

    // Sync imported trips to Supabase (including related items)
    const syncResults = await importTripsToSupabase(supabasePayloads, { includeRelated: true })
    for (const result of syncResults) {
      if (!result.localTripId || !result.supaTripId) continue
      await db.trips.where('trip_id').equals(result.localTripId).modify({
        trip_id: result.supaTripId,
        issync: true,
      })
      await db.places.where('trip_id').equals(result.localTripId).modify({ trip_id: result.supaTripId })
      await db.itinerary.where('trip_id').equals(result.localTripId).modify({ trip_id: result.supaTripId })
      await db.packing.where('trip_id').equals(result.localTripId).modify({ trip_id: result.supaTripId })
      await db.travelers.where('trip_id').equals(result.localTripId).modify({ trip_id: result.supaTripId })
      await db.expenses.where('trip_id').equals(result.localTripId).modify({ trip_id: result.supaTripId })
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

export function downloadBackup(jsonString: string, filename?: string) {
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `travel-planner-backup-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function readBackupFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result
      if (typeof result === 'string') {
        resolve(result)
      } else {
        reject(new Error('Failed to read file'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
