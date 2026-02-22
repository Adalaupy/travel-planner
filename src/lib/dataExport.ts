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
