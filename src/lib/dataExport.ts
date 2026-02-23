import { db } from './db'

export async function exportAllData(): Promise<string> {
  const data = {
    version: 2, // DB schema version
    exportDate: new Date().toISOString(),
    users: await db.users.toArray(),
    trips: await db.trips.toArray(),
    places: await db.places.toArray(),
    itinerary: await db.itinerary.toArray(),
    packing: await db.packing.toArray(),
    travelers: await db.travelers.toArray(),
    expenses: await db.expenses.toArray()
  }
  return JSON.stringify(data, null, 2)
}

export async function exportTripsData(tripIds: number[]): Promise<string> {
  const trips = await db.trips.bulkGet(tripIds)
  const tripsData = trips.filter((t): t is typeof t & {} => t !== undefined)
  
  const tripsExport = await Promise.all(
    tripsData.map(async (trip) => ({
      trip,
      places: await db.places.where('Trip_ID').equals(trip.Trip_ID!).toArray(),
      itinerary: await db.itinerary.where('Trip_ID').equals(trip.Trip_ID!).toArray(),
      packing: await db.packing.where('Trip_ID').equals(trip.Trip_ID!).toArray(),
      travelers: await db.travelers.where('Trip_ID').equals(trip.Trip_ID!).toArray(),
      expenses: await db.expenses.where('Trip_ID').equals(trip.Trip_ID!).toArray()
    }))
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
    if (data.users && Array.isArray(data.users)) await db.users.bulkAdd(data.users)
    if (data.trips && Array.isArray(data.trips)) await db.trips.bulkAdd(data.trips)
    if (data.places && Array.isArray(data.places)) await db.places.bulkAdd(data.places)
    if (data.itinerary && Array.isArray(data.itinerary)) await db.itinerary.bulkAdd(data.itinerary)
    if (data.packing && Array.isArray(data.packing)) await db.packing.bulkAdd(data.packing)
    if (data.travelers && Array.isArray(data.travelers)) await db.travelers.bulkAdd(data.travelers)
    if (data.expenses && Array.isArray(data.expenses)) await db.expenses.bulkAdd(data.expenses)
    
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
    let defaultUserId = 1
    const users = await db.users.toArray()
    if (users.length > 0) {
      defaultUserId = Math.max(...users.map(u => u.User_ID || 0)) + 1
    }
    
    // Import each trip with its related data
    for (const tripData of tripsData) {
      const trip = tripData.trip
      if (!trip) {
        return { success: false, error: 'Invalid trip data: missing trip object' }
      }
      
      // Remove old IDs to let database auto-generate new ones
      const newTrip = { ...trip, Trip_ID: undefined, User_ID: defaultUserId }
      const newTripId = await db.trips.add(newTrip)
      
      // Create ID mapping maps
      const placeIdMap = new Map<number, number>()
      const travelerIdMap = new Map<number, number>()

      // Import places and build ID map
      if (tripData.places && Array.isArray(tripData.places)) {
        for (const p of tripData.places) {
          const oldId = p.Place_ID
          const newPlace = { ...p, Place_ID: undefined, Trip_ID: newTripId }
          const newId = await db.places.add(newPlace)
          if (oldId !== undefined) {
            placeIdMap.set(oldId, newId)
          }
        }
      }
      
      // Import travelers and build ID map
      if (tripData.travelers && Array.isArray(tripData.travelers)) {
        for (const t of tripData.travelers) {
          const oldId = t.Traveler_ID
          const newTraveler = { ...t, Traveler_ID: undefined, Trip_ID: newTripId }
          const newId = await db.travelers.add(newTraveler)
          if (oldId !== undefined) {
            travelerIdMap.set(oldId, newId)
          }
        }
      }
      
      // Import itinerary with remapped place IDs
      if (tripData.itinerary && Array.isArray(tripData.itinerary)) {
        const newItinerary = tripData.itinerary.map((i: any) => {
          const newItem = { ...i, Itinerary_ID: undefined, Trip_ID: newTripId }
          // Remap place_ID if it exists
          if (i.place_ID !== undefined && placeIdMap.has(i.place_ID)) {
            newItem.place_ID = placeIdMap.get(i.place_ID)
          }
          return newItem
        })
        await db.itinerary.bulkAdd(newItinerary)
      }
      
      if (tripData.packing && Array.isArray(tripData.packing)) {
        const newPacking = tripData.packing.map((p: any) => ({ ...p, Packing_ID: undefined, Trip_ID: newTripId }))
        await db.packing.bulkAdd(newPacking)
      }
      
      // Import expenses with remapped traveler IDs
      if (tripData.expenses && Array.isArray(tripData.expenses)) {
        const newExpenses = tripData.expenses.map((e: any) => {
          const newExpense = { ...e, Expense_ID: undefined, Trip_ID: newTripId }
          // Remap payer_ID
          if (e.payer_ID !== undefined && travelerIdMap.has(e.payer_ID)) {
            newExpense.payer_ID = travelerIdMap.get(e.payer_ID)
          }
          // Remap chargedTo array
          if (Array.isArray(e.chargedTo)) {
            newExpense.chargedTo = e.chargedTo
              .map((oldTravelerId: number) => travelerIdMap.get(oldTravelerId))
              .filter((id: number | undefined): id is number => id !== undefined)
          }
          return newExpense
        })
        await db.expenses.bulkAdd(newExpenses)
      }
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
