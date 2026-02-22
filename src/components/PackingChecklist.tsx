import React, { useEffect, useState } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db, PackingItem } from '../lib/db'
import styles from '../styles/components.module.css'

type Props = { tripId: number }

export const PackingChecklist: React.FC<Props> = ({ tripId }) => {
  const [items, setItems] = useState<PackingItem[]>([])
  const [text, setText] = useState('')
  const [lastColor, setLastColor] = useState('#ffffff')
  const sensors = useSensors(useSensor(PointerSensor))

  function SortableItem({ item, onToggle, onDelete, onColorChange }: { item: PackingItem; onToggle: (id: number) => void; onDelete: (id: number) => void; onColorChange: (id: number, color: string) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.Packing_ID! })
    const style: React.CSSProperties = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition,
      zIndex: isDragging ? 10 : undefined,
      boxShadow: isDragging ? '0 8px 24px rgba(59,130,246,0.15)' : undefined,
    }
    return (
      <div ref={setNodeRef} style={style} className={styles.packingItem} {...attributes} {...listeners}>
        <input type="checkbox" checked={item.completed} onChange={() => onToggle(item.Packing_ID!)} />
        <span className={styles.packingTitle}>{item.title}</span>
        <input className={styles.colorInput} type="color" value={item.color || '#ffffff'} onChange={(e) => onColorChange(item.Packing_ID!, e.target.value)} />
        <button className={styles.deleteBtn} onClick={() => onDelete(item.Packing_ID!)}>Delete</button>
      </div>
    )
  }

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const data = await db.packing.where('Trip_ID').equals(tripId).sortBy('order')
      if (mounted) setItems(data)
    }
    load()
    // load last picked color from localStorage
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('packing:lastColor') : null
      if (saved) setLastColor(saved)
    } catch (e) {
      // ignore
    }
    return () => { mounted = false }
  }, [tripId])

  const addItem = async () => {
    if (!text.trim()) return
    const order = items.length ? Math.max(...items.map(i => i.order)) + 1 : 1
    const id = await db.packing.add({ Trip_ID: tripId, title: text.trim(), completed: false, color: lastColor || '#ffffff', order })
    const it = await db.packing.get(id)
    setItems(prev => [...prev, it as PackingItem])
    setText('')
  }

  const toggle = async (id: number) => {
    const it = await db.packing.get(id)
    if (!it) return
    await db.packing.update(id, { completed: !it.completed })
    setItems(prev => prev.map(p => p.Packing_ID === id ? { ...p, completed: !p.completed } : p))
  }

  const del = async (id: number) => {
    await db.packing.delete(id)
    setItems(prev => prev.filter(p => p.Packing_ID !== id))
  }

  const changeColor = async (id: number, color: string) => {
    await db.packing.update(id, { color })
    setItems(prev => prev.map(p => p.Packing_ID === id ? { ...p, color } : p))
    // optionally remember last color in localStorage
    try {
      localStorage.setItem('packing:lastColor', color)
      setLastColor(color)
    } catch (e) {
      // ignore
    }
  }

  const arrayMoveLocal = (arr: PackingItem[], from: number, to: number) => {
    const copy = arr.slice()
    const val = copy.splice(from, 1)[0]
    copy.splice(to, 0, val)
    return copy
  }

  const onDragEnd = async (event: any) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(i => i.Packing_ID === active.id)
    const newIndex = items.findIndex(i => i.Packing_ID === over.id)
    const newOrder = arrayMoveLocal(items, oldIndex, newIndex)
    // update orders in DB
    for (let i = 0; i < newOrder.length; i++) {
      const item = newOrder[i]
      await db.packing.update(item.Packing_ID!, { order: i + 1 })
    }
    setItems(newOrder)
  }

  return (
    <div className={styles.packingContainer}>
      <h2>Packing Checklist</h2>
      <div className={styles.addRow}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add item" />
        <input className={styles.defaultColorInput} type="color" value={lastColor} onChange={(e) => { setLastColor(e.target.value); try { localStorage.setItem('packing:lastColor', e.target.value) } catch(_){} }} title="Default color for new items" />
        <button onClick={addItem}>Add</button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map(i => i.Packing_ID!)} strategy={verticalListSortingStrategy}>
          <div className={styles.packingList}>
            {items.map(item => (
              <SortableItem key={item.Packing_ID} item={item} onToggle={toggle} onDelete={del} onColorChange={changeColor} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

export default PackingChecklist
