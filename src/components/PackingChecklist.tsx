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
import { addPackingItem, updatePackingItem, deletePackingItem } from "../lib/syncService";
import { useTripData } from "../hooks/useTripData";
import styles from "../styles/components.module.css";

type Props = { tripId?: number };

export const PackingChecklist = ({ tripId: _ }: Props = {}) => {
    const { trip } = useTrip();
    const tripId = trip?.trip_id;
    const { data: packingData } = useTripData<PackingItem>('packing', tripId);
    const [items, setItems] = useState<PackingItem[]>([]);
    const [text, setText] = useState("");
    const [lastColor, setLastColor] = useState("#ffffff");
    const sensors = useSensors(useSensor(PointerSensor));

    // Update items when data from hook changes
    useEffect(() => {
        setItems(packingData);
    }, [packingData]);

    // Helper to get unique ID: use packing_id if available (Supabase), fallback to __dexieid (offline)
    const getItemId = (item: PackingItem): string | number => item.packing_id || item.__dexieid || 0;

    function SortableItem({
        item,
        onToggle,
        onDelete,
        onColorChange,
    }: {
        item: PackingItem;
        onToggle: (id: string | number) => void;
        onDelete: (id: string | number) => void;
        onColorChange: (id: string | number, color: string) => void;
    }) {
        const itemId = getItemId(item);
        const {
            attributes,
            listeners,
            setNodeRef,
            transform,
            transition,
            isDragging,
        } = useSortable({ id: itemId });

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
            backgroundColor: hexToRgba(item.color || "#ffffff", 0.3),
        };

        const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
            e.stopPropagation();
            onToggle(itemId);
        };

        const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            e.stopPropagation();
            onColorChange(itemId, e.target.value);
        };

        const handleDelete = (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete(itemId);
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
    }, []);

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

    const toggle = async (id: string | number) => {
        const it = items.find((p) => getItemId(p) === id);
        if (!it) return;
        const itemId = it.__dexieid || it.packing_id || undefined;
        if (!itemId) return;
        await updatePackingItem(tripId, itemId, { completed: !it.completed });
        setItems((prev) =>
            prev.map((p) =>
                getItemId(p) === id ? { ...p, completed: !p.completed } : p,
            ),
        );
    };

    const del = async (id: string | number) => {
        const it = items.find((p) => getItemId(p) === id);
        if (!it) return;
        const itemId = it.__dexieid || it.packing_id || undefined;
        if (!itemId) return;
        const success = await deletePackingItem(tripId, itemId);
        if (success) {
            setItems((prev) => prev.filter((p) => getItemId(p) !== id));
        }
    };

    const changeColor = async (id: string | number, color: string) => {
        const it = items.find((p) => getItemId(p) === id);
        if (!it) return;
        const itemId = it.__dexieid || it.packing_id || undefined;
        if (!itemId) return;
        await updatePackingItem(tripId, itemId, { color });
        setItems((prev) =>
            prev.map((p) => (getItemId(p) === id ? { ...p, color } : p)),
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
        const oldIndex = items.findIndex((i) => getItemId(i) === active.id);
        const newIndex = items.findIndex((i) => getItemId(i) === over.id);
        const newOrder = arrayMoveLocal(items, oldIndex, newIndex);
        // update orders in DB
        for (let i = 0; i < newOrder.length; i++) {
            const item = newOrder[i];
            const dexieId = item.__dexieid;
            if (dexieId) {
                await db.packing.update(dexieId, { order: i + 1 });
            }
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
                    items={items.map((i) => getItemId(i))}
                    strategy={verticalListSortingStrategy}
                >
                    <div className={styles.packingList}>
                        {items.map((item) => {
                            const itemId = getItemId(item);
                            return (
                                <SortableItem
                                    key={itemId}
                                    item={item}
                                    onToggle={toggle}
                                    onDelete={del}
                                    onColorChange={changeColor}
                                />
                            );
                        })}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
};

export default PackingChecklist;
