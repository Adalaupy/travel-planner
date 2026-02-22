import React, { useEffect, useState } from 'react'
import { db, TravelerItem } from '../lib/db'
import styles from '../styles/components.module.css'
import { FaUser, FaUserTie, FaUsers, FaFemale, FaMale, FaChild, FaUserCircle } from 'react-icons/fa'

type Props = { tripId: number }

const REUSABLE_ICON_ID = 'FaUserCircle'

const ICONS = [
  { id: 'FaUserCircle', Comp: FaUserCircle, label: 'Default (Reusable)', reusable: true },
  { id: 'FaUser', Comp: FaUser, label: 'User', reusable: false },
  { id: 'FaUserTie', Comp: FaUserTie, label: 'Tie', reusable: false },
  { id: 'FaUsers', Comp: FaUsers, label: 'Group', reusable: false },
  { id: 'FaFemale', Comp: FaFemale, label: 'Female', reusable: false },
  { id: 'FaMale', Comp: FaMale, label: 'Male', reusable: false },
  { id: 'FaChild', Comp: FaChild, label: 'Child', reusable: false }
]

export const TravelersList: React.FC<Props> = ({ tripId }) => {
  const [items, setItems] = useState<TravelerItem[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [icon, setIcon] = useState(REUSABLE_ICON_ID)
  const [showIconPicker, setShowIconPicker] = useState(false)
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('travelers:lastIcon') : null
      if (saved) setIcon(saved)
    } catch (e) {}
  }, [])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const data = await db.travelers.where('Trip_ID').equals(tripId).toArray()
      if (mounted) setItems(data)
    }
    load()
    return () => { mounted = false }
  }, [tripId])

  // Auto-select first available icon when travelers change
  useEffect(() => {
    const used = new Set(items.map(t => t.icon))
    // If current icon is used and not reusable, switch to available one
    if (used.has(icon) && icon !== REUSABLE_ICON_ID) {
      const available = ICONS.find(ic => !used.has(ic.id) || ic.reusable)
      if (available) {
        setIcon(available.id)
      }
    }
  }, [items, icon])

  const addTraveler = async () => {
    if (!name.trim()) return
    // prevent adding if icon is already used (except for reusable icon)
    if (icon !== REUSABLE_ICON_ID && items.some(t => t.icon === icon)) {
      alert('Icon already used by another traveler. Choose a different icon.')
      return
    }
    const id = await db.travelers.add({ Trip_ID: tripId, name: name.trim(), email: email.trim(), icon })
    const t = await db.travelers.get(id)
    setItems(prev => [...prev, t as TravelerItem])
    setName('')
    setEmail('')
    try { localStorage.setItem('travelers:lastIcon', icon) } catch (e) {}
    // Auto-select next available icon (or default to reusable if all taken)
    const usedAfterAdd = new Set([...items.map(i => i.icon), icon])
    const next = ICONS.find(ic => !usedAfterAdd.has(ic.id) || ic.reusable)
    if (next) setIcon(next.id)
  }

  const removeTraveler = async (id: number) => {
    await db.travelers.delete(id)
    setItems(prev => prev.filter(p => p.Traveler_ID !== id))
  }

  return (
    <div className={styles.travelersContainer}>
      <h2>Travelers</h2>
      <div className={styles.addTravelerRow}>
        <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <button
          type="button"
          className={styles.iconTrigger}
          onClick={() => setShowIconPicker(true)}
          title="Choose icon"
        >
          {(() => {
            const Comp = ICONS.find(ic => ic.id === icon)?.Comp || FaUser
            return <Comp size={20} />
          })()}
        </button>
        <button onClick={addTraveler}>Add</button>
      </div>

      {showIconPicker && (
        <div className={styles.modalOverlay} onClick={() => setShowIconPicker(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Choose Icon</h3>
            <div className={styles.iconGrid}>
              {ICONS.map(ic => {
                const used = items.some(t => t.icon === ic.id)
                const selected = icon === ic.id
                const isReusable = ic.reusable
                const disabled = used && !isReusable
                return (
                  <button
                    key={ic.id}
                    type="button"
                    className={`${styles.iconButton} ${selected ? styles.iconSelected : ''} ${disabled ? styles.iconDisabled : ''} ${isReusable ? styles.iconReusable : ''}`}
                    onClick={() => {
                      if (!disabled) {
                        setIcon(ic.id)
                        setShowIconPicker(false)
                      }
                    }}
                    aria-pressed={selected}
                    title={ic.label}
                    disabled={disabled}
                  >
                    <ic.Comp size={24} />
                  </button>
                )
              })}
            </div>
            <button className={styles.closeBtn} onClick={() => setShowIconPicker(false)}>Close</button>
          </div>
        </div>
      )}

      <ul className={styles.travelersList}>
        {items.map(t => (
          <li key={t.Traveler_ID} className={styles.travelerItem}>
            <div className={styles.travelerIcon}>
              {(() => {
                const Comp = ICONS.find(i => i.id === t.icon)?.Comp || FaUser
                return <Comp size={20} />
              })()}
            </div>
            <div className={styles.travelerInfo}>
              <div className={styles.travelerName}>{t.name}</div>
              <div className={styles.travelerEmail}>{t.email}</div>
            </div>
            <button className={styles.deleteBtn} onClick={() => removeTraveler(t.Traveler_ID!)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default TravelersList
