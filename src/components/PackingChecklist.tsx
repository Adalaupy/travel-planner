import { useEffect, useState } from "react";
import { useTrip } from "../context/TripContext";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { db, PackingItem } from "../lib/db";
import { getPackingItems, addPackingItem, updatePackingItem, deletePackingItem } from "../lib/syncService";
import styles from "../styles/components.module.css";

type Props = { tripId?: number };

export const PackingChecklist = ({ tripId: _ }: Props = {}) => {
  const { trip } = useTrip();
  const tripId = trip?.trip_id;
  const [items, setItems] = useState<PackingItem[]>([]);
  const [text, setText] = useState("");
  const [lastColor, setLastColor] = useState("#ffffff");
  const sensors = useSensors(useSensor(PointerSensor));

  function SortableItem({
    item,
    onToggle,
    onDelete,
    onColorChange,
  }: {
    item: PackingItem;
    onToggle: (id: number) => void;
    onDelete: (id: number) => void;
    onColorChange: (id: number, color: string) => void;
  }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: item.__dexieid || 0 });

    // Convert hex color to rgba with transparency
    const hexToRgba = (hex: string, alpha: number = 0.2) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const style = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition,
      zIndex: isDragging ? 10 : undefined,
      boxShadow: isDragging ? "0 8px 24px rgba(59,130,246,0.15)" : undefined,
      backgroundColor: hexToRgba(item.color || "#ffffff", 0.2),
    };

    const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onToggle(item.__dexieid || 0);
    };

    const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onColorChange(item.__dexieid || 0, e.target.value);
    };

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDelete(item.__dexieid || 0);
    };

    const handlePointerDown = (e: React.PointerEvent) => {
      e.stopPropagation();
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={styles.packingItem}
        {...attributes}
        {...listeners}
      >
        <input
          type="checkbox"
          checked={item.completed}
          onChange={handleToggle}
          onPointerDown={handlePointerDown}
        />
        <span className={styles.packingTitle}>{item.title}</span>
        <input
          className={styles.colorInput}
          type="color"
          value={item.color || "#ffffff"}
          onChange={handleColorChange}
          onPointerDown={handlePointerDown}
        />
        <button
          className={styles.deleteBtn}
          onClick={handleDelete}
          onPointerDown={handlePointerDown}
          type="button"
        >
          Delete
        </button>
      </div>
    );
  }

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const data = await getPackingItems(tripId || null);
      if (mounted) setItems(data);
    };
    load();
    // load last picked color from localStorage
    try {
      const saved =
        typeof window !== "undefined"
          ? localStorage.getItem("packing:lastColor")
          : null;
      if (saved) setLastColor(saved);
    } catch (e) {
      // ignore
    }
    return () => {
      mounted = false;
    };
  }, [tripId]);

  const addItem = async () => {
    if (!text.trim()) return;
    const order = items.length ? Math.max(...items.map((i) => i.order)) + 1 : 1;
    const it = await addPackingItem(tripId || null, {
      title: text.trim(),
      color: lastColor || "#ffffff",
      order,
    });
    if (it) {
      setItems((prev) => [...prev, it]);
      setText("");
    }
  };

  const toggle = async (id: number) => {
    const it = items.find((p) => p.__dexieid === id);
    if (!it) return;
    await updatePackingItem(tripId, id, { completed: !it.completed });
    setItems((prev) =>
      prev.map((p) =>
        p.__dexieid === id ? { ...p, completed: !p.completed } : p,
      ),
    );
  };

  const del = async (id: number) => {
    const success = await deletePackingItem(tripId, id);
    if (success) {
      setItems((prev) => prev.filter((p) => p.__dexieid !== id));
    }
  };

  const changeColor = async (id: number, color: string) => {
    await updatePackingItem(tripId, id, { color });
    setItems((prev) =>
      prev.map((p) => (p.__dexieid === id ? { ...p, color } : p)),
    );
  };

  const arrayMoveLocal = (arr: PackingItem[], from: number, to: number) => {
    const copy = arr.slice();
    const val = copy.splice(from, 1)[0];
    copy.splice(to, 0, val);
    return copy;
  };

  const onDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.__dexieid === active.id);
    const newIndex = items.findIndex((i) => i.__dexieid === over.id);
    const newOrder = arrayMoveLocal(items, oldIndex, newIndex);
    // update orders in DB
    for (let i = 0; i < newOrder.length; i++) {
      const item = newOrder[i];
      await db.packing.update(item.__dexieid!, { order: i + 1 });
    }
    setItems(newOrder);
  };

  return (
    <div className={styles.packingContainer}>
      <h2>Packing Checklist</h2>
      <div className={styles.addRow}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add item"
        />
        <input
          className={styles.defaultColorInput}
          type="color"
          value={lastColor}
          onChange={(e) => {
            setLastColor(e.target.value);
            try {
              localStorage.setItem("packing:lastColor", e.target.value);
            } catch (_) {}
          }}
          title="Default color for new items"
        />
        <button onClick={addItem}>Add</button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.__dexieid!)}
          strategy={verticalListSortingStrategy}
        >
          <div className={styles.packingList}>
            {items.map((item) => (
              <SortableItem
                key={item.__dexieid}
                item={item}
                onToggle={toggle}
                onDelete={del}
                onColorChange={changeColor}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default PackingChecklist;
