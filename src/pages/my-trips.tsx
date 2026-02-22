import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { db, TripItem } from '../lib/db'
import { exportAllData, importAllData, downloadBackup, readBackupFile } from '../lib/dataExport'
import styles from '../styles/trips.module.css'

export default function MyTrips() {
  const [trips, setTrips] = useState<TripItem[]>([])
  const [newTripTitle, setNewTripTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showBackupMenu, setShowBackupMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    loadTrips()
  }, [])

  const loadTrips = async () => {
    const allTrips = await db.trips.toArray()
    allTrips.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    setTrips(allTrips)
  }

  const createTrip = async () => {
    if (!newTripTitle.trim()) return
    const slug = newTripTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const id = await db.trips.add({
      title: newTripTitle.trim(),
      updatedAt: Date.now()
    })
    setNewTripTitle('')
    await loadTrips()
    router.push(`/trip/${slug}`)
  }

  const deleteTrip = async (id: number) => {
    if (!confirm('Delete this trip? This cannot be undone.')) return
    await db.trips.delete(id)
    // Also delete related data
    await db.packing.where('Trip_ID').equals(id).delete()
    await db.travelers.where('Trip_ID').equals(id).delete()
    await db.expenses.where('Trip_ID').equals(id).delete()
    await db.itinerary.where('Trip_ID').equals(id).delete()
    await loadTrips()
  }

  const handleExport = async () => {
    try {
      const data = await exportAllData()
      downloadBackup(data)
      alert('Backup downloaded successfully!')
      setShowBackupMenu(false)
    } catch (error) {
      alert('Failed to export data: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const jsonString = await readBackupFile(file)
      const confirmed = confirm(
        'WARNING: This will replace ALL existing data with the backup. Are you sure you want to continue?'
      )
      if (!confirmed) {
        e.target.value = '' // Reset file input
        return
      }

      const result = await importAllData(jsonString)
      if (result.success) {
        alert('Data imported successfully!')
        await loadTrips()
        setShowBackupMenu(false)
      } else {
        alert('Failed to import data: ' + result.error)
      }
    } catch (error) {
      alert('Failed to import data: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
    e.target.value = '' // Reset file input
  }

  const filteredTrips = trips.filter(trip => 
    trip.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1>My Trips</h1>
        <div className={styles.createTrip}>
          <input
            type="text"
            placeholder="New trip name..."
            value={newTripTitle}
            onChange={e => setNewTripTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createTrip()}
            className={styles.input}
          />
          <button onClick={createTrip} className={styles.createBtn}>
            + Create Trip
          </button>
        </div>
      </div>

      <div className={styles.search}>
        <input
          type="text"
          placeholder="🔍 Search trips..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
        <div className={styles.backupSection}>
          <button 
            onClick={() => setShowBackupMenu(!showBackupMenu)} 
            className={styles.backupBtn}
          >
            💾 Backup
          </button>
          {showBackupMenu && (
            <div className={styles.backupMenu}>
              <button onClick={handleExport} className={styles.menuItem}>
                📥 Export Data
              </button>
              <button onClick={handleImportClick} className={styles.menuItem}>
                📤 Import Data
              </button>
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        style={{ display: 'none' }}
      />

      {filteredTrips.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✈️</div>
          <h2>No trips yet</h2>
          <p>Create your first trip to get started!</p>
        </div>
      ) : (
        <div className={styles.tripGrid}>
          {filteredTrips.map(trip => {
            const slug = trip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
            return (
              <div key={trip.Trip_ID} className={styles.tripCard}>
                <Link href={`/trip/${slug}`} className={styles.tripLink}>
                  <h3>{trip.title}</h3>
                  {trip.startDate && trip.endDate && (
                    <p className={styles.tripDates}>
                      {trip.startDate} to {trip.endDate}
                    </p>
                  )}
                  <p className={styles.tripUpdated}>
                    Updated: {new Date(trip.updatedAt || 0).toLocaleDateString()}
                  </p>
                </Link>
                <button
                  onClick={() => deleteTrip(trip.Trip_ID!)}
                  className={styles.deleteBtn}
                  title="Delete trip"
                >
                  🗑️
                </button>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
