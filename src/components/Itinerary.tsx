import React, { useEffect, useState } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db, ItineraryItem as ItineraryItemType } from '../lib/db'
import { parseMapLink } from '../lib/mapParser'
import styles from '../styles/components.module.css'

type Props = { tripId: number }

export const Itinerary: React.FC<Props> = ({ tripId }) => {
    // Apply the selected date range to the trip
    const applyDateRange = () => {
      setTripStartDate(draftStartDate)
      setTripEndDate(draftEndDate)
    }
  // Track if user manually changed end date
  const [endDateTouched, setEndDateTouched] = useState(false)
  const [items, setItems] = useState<ItineraryItemType[]>([])
  const [selectedDay, setSelectedDay] = useState(0)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [mapLink, setMapLink] = useState('')
  const [url, setUrl] = useState('')
  const [remark, setRemark] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsedData, setParsedData] = useState<{ name?: string; lat?: number; lng?: number } | null>(null)
  const [tripStartDate, setTripStartDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [tripEndDate, setTripEndDate] = useState(() => {
    const future = new Date()
    future.setDate(future.getDate() + 6)
    return future.toISOString().split('T')[0]
  })
  const [draftStartDate, setDraftStartDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [draftEndDate, setDraftEndDate] = useState(() => {
    const future = new Date()
    future.setDate(future.getDate() + 6)
    return future.toISOString().split('T')[0]
  })
  const sensors = useSensors(useSensor(PointerSensor))

  // Helper for array move
  function arrayMoveLocal(arr: ItineraryItemType[], from: number, to: number) {
    const copy = arr.slice()
    const val = copy.splice(from, 1)[0]
    copy.splice(to, 0, val)
    return copy
  }

  // When start date changes, auto-update end date unless user touched it
  useEffect(() => {
    if (!endDateTouched) {
      const start = new Date(draftStartDate)
      const nextDay = new Date(start)
      nextDay.setDate(start.getDate() + 1)
      setDraftEndDate(nextDay.toISOString().split('T')[0])
    }
  }, [draftStartDate, endDateTouched])

  // Generate day tabs based on start/end dates
  const days: string[] = []
  if (tripStartDate && tripEndDate) {
    const start = new Date(tripStartDate)
    const end = new Date(tripEndDate)
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    for (let i = 0; i < Math.max(1, diff); i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      days.push(d.toISOString().split('T')[0])
    }
  }

  useEffect(() => {
    let mounted = true
    const load = async () => {
      let data = await db.itinerary.where('Trip_ID').equals(tripId).toArray()
      // Ensure order property exists and sort by it
      data = data.map((item, idx) => ({ ...item, order: item.order ?? idx }))
      data.sort((a, b) => (a.dayIndex - b.dayIndex) || ((a.order ?? 0) - (b.order ?? 0)))
      if (mounted) setItems(data)
    }
    load()
    return () => { mounted = false }
  }, [tripId])

  // Helper to update order in DB and state
  const updateOrder = async (newDayItems: ItineraryItemType[]) => {
    await Promise.all(newDayItems.map((item, idx) => db.itinerary.update(item.Itinerary_ID!, { order: idx })))
    setItems(prev => {
      const other = prev.filter(i => i.dayIndex !== selectedDay)
      return [...other, ...newDayItems].sort((a, b) => (a.dayIndex - b.dayIndex) || ((a.order ?? 0) - (b.order ?? 0)))
    })
  }

  const parseCurrentMapLink = async () => {
    if (!mapLink.trim()) {
      setParsedData(null)
      return
    }
    setParsing(true)
    const placeData = await parseMapLink(mapLink.trim())
    const cleanName = placeData.name ? placeData.name.replace(/\+/g, ' ') : undefined
    setParsedData({ name: cleanName, lat: placeData.lat, lng: placeData.lng })
    setParsing(false)
  }

  const addItem = async () => {
    if (!title.trim() && !mapLink.trim()) return
    let placeData: { name?: string; lat?: number; lng?: number; iframe?: string } = {}
    if (mapLink.trim() && !parsedData) {
      setParsing(true)
      placeData = await parseMapLink(mapLink.trim())
      setParsing(false)
    } else if (parsedData) {
      placeData = { name: parsedData.name ? parsedData.name.replace(/\+/g, ' ') : undefined, lat: parsedData.lat, lng: parsedData.lng }
    }
    const finalTitle = title.trim() || placeData.name || 'Untitled'
    const id = await db.itinerary.add({
      Trip_ID: tripId,
      dayIndex: selectedDay,
      title: finalTitle,
      time: time || undefined,
      place_ID: undefined,
      url: url.trim() || undefined,
      remark: remark.trim() || undefined,
      mapLink: mapLink.trim() || undefined,
      lat: placeData.lat,
      lng: placeData.lng,
      placeName: placeData.name
    })
    const it = await db.itinerary.get(id)
    setItems(prev => [...prev, it as ItineraryItemType])
    setTitle('')
    setTime('')
    setMapLink('')
    setUrl('')
    setRemark('')
    setParsedData(null)
  }

  const removeItem = async (id: number) => {
    await db.itinerary.delete(id)
    setItems(prev => prev.filter(i => i.Itinerary_ID !== id))
  }

  const dayItems = items.filter(i => i.dayIndex === selectedDay).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  // Generate Google Maps link for all destinations in the current day
  const generateDaySummaryLink = () => {
    if (dayItems.length === 0) return ''
    const locations = dayItems.map(item => {
      if (item.lat && item.lng) {
        return `${item.lat},${item.lng}`
      } else if (item.placeName) {
        return encodeURIComponent(item.placeName)
      } else {
        return encodeURIComponent(item.title)
      }
    })
    return `https://www.google.com/maps/dir/${locations.join('/')}`
  }

  const onDragEnd = async (event: any) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = dayItems.findIndex(i => i.Itinerary_ID === active.id)
    const newIndex = dayItems.findIndex(i => i.Itinerary_ID === over.id)
    const newOrder = arrayMoveLocal(dayItems, oldIndex, newIndex)
    await updateOrder(newOrder)
  }

  return (
    <div className={styles.itineraryContainer}>
      <h2>Itinerary</h2>
      <div className={styles.dateRangeRow}>
        <label>
          Start Date:
          <input
            type="date"
            value={draftStartDate}
            onChange={e => setDraftStartDate(e.target.value)}
          />
        </label>
        <label>
          End Date:
          <input
            type="date"
            value={draftEndDate}
            onChange={e => {
              setDraftEndDate(e.target.value)
              setEndDateTouched(true)
            }}
            min={draftStartDate}
          />
        </label>
        <button onClick={applyDateRange} className={styles.applyDateBtn}>
          Apply Dates
        </button>
      </div>
      <div className={styles.dayTabs}>
        {days.map((date, idx) => (
          <button
            key={idx}
            className={`${styles.dayTab} ${selectedDay === idx ? styles.dayTabActive : ''}`}
            onClick={() => setSelectedDay(idx)}
          >
            Day {idx + 1}<br /><span className={styles.dayTabDate}>{date}</span>
          </button>
        ))}
      </div>
      <div className={styles.addItineraryRow}>
        <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
        <input type="time" step="900" value={time} onChange={e => setTime(e.target.value)} placeholder="Time (optional)" />
        <input
          placeholder="Google Maps Link"
          value={mapLink}
          onChange={e => {
            setMapLink(e.target.value)
            setParsedData(null)
          }}
          onBlur={parseCurrentMapLink}
        />
        <input placeholder="URL (optional)" value={url} onChange={e => setUrl(e.target.value)} />
        <input placeholder="Remark (optional)" value={remark} onChange={e => setRemark(e.target.value)} />
        <button onClick={addItem} disabled={parsing}>
          {parsing ? 'Parsing...' : 'Add'}
        </button>
      </div>
      {parsedData && (
        <div className={styles.parsedDataDisplay}>
          <strong>Parsed Map Data:</strong>
          <div>Name: {parsedData.name || 'N/A'}</div>
          <div>Latitude: {parsedData.lat?.toFixed(6) || 'N/A'}</div>
          <div>Longitude: {parsedData.lng?.toFixed(6) || 'N/A'}</div>
        </div>
      )}
      {dayItems.length > 0 && (
        <div className={styles.daySummary}>
          <strong>📅 Day {selectedDay + 1} Summary ({dayItems.length} destination{dayItems.length > 1 ? 's' : ''})</strong>
          <a href={generateDaySummaryLink()} target="_blank" rel="noopener noreferrer" className={styles.daySummaryLink}>
            🗺️ View All Destinations on Map
          </a>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={dayItems.map(i => i.Itinerary_ID!)} strategy={verticalListSortingStrategy}>
          <ul className={styles.itineraryList}>
            {dayItems.map((item, idx) => (

              <SortableItineraryItem
                key={item.Itinerary_ID}
                item={item}
                idx={idx}
                dayItems={dayItems}
                removeItem={removeItem}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>


    </div>
  )
}

// Sortable item component for dnd-kit
function SortableItineraryItem({ item, idx, dayItems, removeItem }: { item: ItineraryItemType, idx: number, dayItems: ItineraryItemType[], removeItem: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.Itinerary_ID! })
  const style: React.CSSProperties = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
    boxShadow: isDragging ? '0 8px 24px rgba(59,130,246,0.15)' : undefined,
    background: isDragging ? '#f0f6ff' : undefined,
  }
  const prevItem = idx > 0 ? dayItems[idx - 1] : null
  let dirFromCurrent = ''
  let dirFromPrev = ''
  const destinationParam = item.lat && item.lng 
    ? `${item.lat},${item.lng}` 
    : encodeURIComponent(item.placeName || item.title)
  dirFromCurrent = `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${destinationParam}`
  if (prevItem) {
    const originParam = prevItem.lat && prevItem.lng
      ? `${prevItem.lat},${prevItem.lng}`
      : encodeURIComponent(prevItem.placeName || prevItem.title)
    dirFromPrev = `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destinationParam}`
  }
  return (
    <li ref={setNodeRef} style={style} className={styles.itineraryItem} {...attributes} {...listeners}>
      <div className={styles.itineraryInfo}>
        <div className={styles.itineraryTitle}>
          {item.time && <span className={styles.itineraryTime}>{item.time}</span>}
          {item.title}
        </div>
        {(item.placeName || item.lat || item.lng) && (
          <div className={styles.itineraryParsedInfo}>
            {item.placeName && <span>📍 {item.placeName}</span>}
            {item.lat && item.lng && (
              <span className={styles.coords}> ({item.lat.toFixed(4)}, {item.lng.toFixed(4)})</span>
            )}
          </div>
        )}
        {item.remark && (
          <div className={styles.itineraryRemark}>{item.remark}</div>
        )}
        <div className={styles.itineraryLinks}>
          {item.mapLink && (
            <a href={item.mapLink} target="_blank" rel="noopener noreferrer" className={styles.mapLink}>
              📍 Map
            </a>
          )}
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className={styles.urlLink}>
              🔗 Link
            </a>
          )}
          <a href={dirFromCurrent} target="_blank" rel="noopener noreferrer" className={styles.dirLink}>
            🧭 From Here
          </a>
          {dirFromPrev && (
            <a href={dirFromPrev} target="_blank" rel="noopener noreferrer" className={styles.dirLink}>
              ➡️ From Previous
            </a>
          )}
        </div>
      </div>
      <button className={styles.deleteBtn} onClick={() => removeItem(item.Itinerary_ID!)}>Remove</button>
    </li>
  )
}

export default Itinerary
