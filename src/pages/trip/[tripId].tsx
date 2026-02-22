import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import TripDetailTabs from './TripDetailTabs'
import { TripProvider } from '../../context/TripContext'
import { getOrCreateTripBySlug } from '../../lib/tripService'
import PackingChecklist from '../../components/PackingChecklist'
import TravelersList from '../../components/TravelersList'
import ExpensesManager from '../../components/ExpensesManager'
import Itinerary from '../../components/Itinerary'
import styles from '../../styles/tripDetail.module.css'

export default function TripDetailPage() {
  const router = useRouter()
  const { tripId } = router.query
  const slug = Array.isArray(tripId) ? tripId[0] : tripId || 'untitled'
  const [numericId, setNumericId] = useState<number | null>(null)
  const [tripTitle, setTripTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  // TripContext sync will be handled inside TripProvider

  useEffect(() => {
    const ensure = async () => {
      const t = await getOrCreateTripBySlug(String(slug))
      setNumericId(t.Trip_ID ?? null)
      setTripTitle(t.title || slug)
      setNewTitle(t.title || slug)
    }
    ensure()
  }, [slug])

  const [activeTab, setActiveTab] = useState<'itinerary' | 'packing' | 'travelers' | 'expenses'>('itinerary');

  const tabList = [
    { key: 'itinerary', label: 'Itinerary' },
    { key: 'packing', label: 'Packing Checklist' },
    { key: 'travelers', label: 'Travelers' },
    { key: 'expenses', label: 'Expenses' },
  ];

  return (
    <main className={styles.main}>
      <div className={styles.breadcrumb}>
        <Link href="/my-trips">← Back to My Trips</Link>
      </div>
      <div className={styles.header}>
        {editingTitle ? (
          <form
            onSubmit={async e => {
              e.preventDefault()
              if (!newTitle.trim() || !numericId) return
              if (tripCtx.updateTripTitle) {
                await tripCtx.updateTripTitle(numericId, newTitle.trim())
                setTripTitle(newTitle.trim())
              } else {
                await (await import('../../lib/db')).db.trips.update(numericId, { title: newTitle.trim(), updatedAt: Date.now() })
                setTripTitle(newTitle.trim())
              }
              setEditingTitle(false)
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className={styles.titleInput}
              style={{ fontSize: '2rem', fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', width: '100%' }}
              autoFocus
            />
            <button type="submit" style={{ padding: '8px 16px' }}>Save</button>
            <button type="button" style={{ padding: '8px 16px', background: '#eee', color: '#333' }} onClick={() => { setEditingTitle(false); setNewTitle(tripTitle) }}>Cancel</button>
          </form>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ margin: 0 }}>{tripTitle}</h1>
            <button type="button" style={{ padding: '8px 16px' }} onClick={() => setEditingTitle(true)}>Rename</button>
          </div>
        )}
      </div>
      {numericId ? (
        <TripProvider slug={String(slug)}>
          <TripDetailTabs
            numericId={numericId}
            tripTitle={tripTitle}
            setTripTitle={setTripTitle}
            editingTitle={editingTitle}
            setEditingTitle={setEditingTitle}
            newTitle={newTitle}
            setNewTitle={setNewTitle}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            tabList={tabList}
            styles={styles}
          />
        </TripProvider>
      ) : (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Loading trip...</p>
        </div>
      )}
    </main>
  )
}
