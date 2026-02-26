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
import { db, ItineraryItem as ItineraryItemType } from "../lib/db";
import { getItineraryItems, addItineraryItem, deleteItineraryItem, updateTrip, updateItineraryItem } from "../lib/syncService";
import { useTripData } from "../hooks/useTripData";
import { parseMapLink } from "../lib/mapParser";
import styles from "../styles/components.module.css";

type Props = { tripId?: number };

export const Itinerary = ({ tripId: _ }: Props = {}) => {
  const { trip } = useTrip();
  const tripId = trip?.trip_id;
  // Apply the selected date range to the trip
  const applyDateRange = async () => {
    // Check if dates actually changed
    const datesChanged = 
      draftStartDate !== tripStartDate || draftEndDate !== tripEndDate;
    
    if (!datesChanged) return;
    
    setTripStartDate(draftStartDate);
    setTripEndDate(draftEndDate);
    // Update via syncService (handles both Dexie and Supabase)
    await updateTrip(tripId || null, {
      startDate: draftStartDate,
      endDate: draftEndDate,
    });
  };
  // Track if user manually changed end date
  const [endDateTouched, setEndDateTouched] = useState(false);
  const [items, setItems] = useState<ItineraryItemType[]>([]);
  const [selectedDay, setSelectedDay] = useState(0);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [mapLink, setMapLink] = useState("");
  const [url, setUrl] = useState("");
  const [remark, setRemark] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<{
    name?: string;
    lat?: number;
    lng?: number;
  } | null>(null);
  const [tripStartDate, setTripStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [tripEndDate, setTripEndDate] = useState(() => {
    const future = new Date();
    future.setDate(future.getDate() + 6);
    return future.toISOString().split("T")[0];
  });
  const [draftStartDate, setDraftStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [draftEndDate, setDraftEndDate] = useState(() => {
    const future = new Date();
    future.setDate(future.getDate() + 6);
    return future.toISOString().split("T")[0];
  });
  const sensors = useSensors(useSensor(PointerSensor));

  const getItemId = (item: ItineraryItemType, idx: number): string | number =>
    item.__dexieid ?? item.itinerary_id ?? `temp-${idx}`;

  // Helper for array move
  function arrayMoveLocal(arr: ItineraryItemType[], from: number, to: number) {
    const copy = arr.slice();
    const val = copy.splice(from, 1)[0];
    copy.splice(to, 0, val);
    return copy;
  }

  // When start date changes, auto-update end date unless user touched it
  useEffect(() => {
    if (!endDateTouched) {
      const start = new Date(draftStartDate);
      const nextDay = new Date(start);
      nextDay.setDate(start.getDate() + 1);
      setDraftEndDate(nextDay.toISOString().split("T")[0]);
    }
  }, [draftStartDate, endDateTouched]);

  // Generate day tabs based on start/end dates
  const days: string[] = [];
  if (tripStartDate && tripEndDate) {
    const start = new Date(tripStartDate);
    const end = new Date(tripEndDate);
    const diff =
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    for (let i = 0; i < Math.max(1, diff); i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d.toISOString().split("T")[0]);
    }
  }

  // Load itinerary items with online-first strategy
  const { data: itineraryData, loading, isOnline } = useTripData<ItineraryItemType>('itinerary', tripId);

  useEffect(() => {
    // Ensure order property exists and sort by it
    let data = itineraryData.map((item, idx) => ({ ...item, order: item.order ?? idx }));
    data.sort(
      (a, b) => a.day_index - b.day_index || (a.order ?? 0) - (b.order ?? 0),
    );
    setItems(data);
  }, [itineraryData]);

  // Load trip dates from database
  useEffect(() => {
    const loadTripDates = async () => {
      if (!trip) return;
      const itineraryItems = await getItineraryItems(tripId || null);

      // Get max dayIndex from itinerary if items exist
      let maxDayIndex = -1;
      if (itineraryItems.length > 0) {
        maxDayIndex = Math.max(...itineraryItems.map((item) => item.day_index));
      }

      if (trip && trip.start_date) {
        const startDate = trip.start_date;
        let endDate = trip.end_date;

        // If no endDate in trip but have itinerary items, calculate from max dayIndex
        if (!endDate && maxDayIndex >= 0) {
          const start = new Date(startDate);
          const end = new Date(start);
          end.setDate(start.getDate() + maxDayIndex);
          endDate = end.toISOString().split("T")[0];
        }

        // If still no endDate, default to 1 day after start
        if (!endDate) {
          const start = new Date(startDate);
          const nextDay = new Date(start);
          nextDay.setDate(start.getDate() + 1);
          endDate = nextDay.toISOString().split("T")[0];
        }

        setTripStartDate(startDate);
        setDraftStartDate(startDate);
        setTripEndDate(endDate);
        setDraftEndDate(endDate);
      } else if (maxDayIndex >= 0) {
        // No trip, but have itinerary items - derive dates from them
        const today = new Date();
        const startDate = today.toISOString().split("T")[0];
        const end = new Date(today);
        end.setDate(today.getDate() + maxDayIndex);
        const endDate = end.toISOString().split("T")[0];

        setTripStartDate(startDate);
        setDraftStartDate(startDate);
        setTripEndDate(endDate);
        setDraftEndDate(endDate);
      }
    };
    loadTripDates();
  }, [tripId]);

  // Helper to update order in DB and state
  const updateOrder = async (newDayItems: ItineraryItemType[]) => {
    // Track old orders for comparison
    const oldOrdersMap = new Map(
      dayItems.map((item) => [item.__dexieid ?? item.itinerary_id, item.order ?? 0])
    );

    // Assign new sequential orders
    const reordered = newDayItems.map((item, idx) => ({
      ...item,
      order: idx,
    }));

    // Only update items whose order actually changed
    const itemsToUpdate = reordered.filter((item, newIdx) => {
      const itemId = item.__dexieid ?? item.itinerary_id;
      const oldOrder = oldOrdersMap.get(itemId) ?? 0;
      return oldOrder !== newIdx; // Only update if order changed
    });

    await Promise.all(
      itemsToUpdate.map((item) => {
        const itemId = item.__dexieid ?? item.itinerary_id;
        if (!itemId) return Promise.resolve();
        return updateItineraryItem(tripId, itemId, { order: item.order });
      }),
    );

    setItems((prev) => {
      const other = prev.filter((i) => i.day_index !== selectedDay);
      return [...other, ...reordered].sort(
        (a, b) => a.day_index - b.day_index || (a.order ?? 0) - (b.order ?? 0),
      );
    });
  };

  const parseCurrentMapLink = async () => {
    if (!mapLink.trim()) {
      setParsedData(null);
      return;
    }
    setParsing(true);
    const placeData = await parseMapLink(mapLink.trim());
    const cleanName = placeData.name
      ? placeData.name.replace(/\+/g, " ")
      : undefined;
    setParsedData({ name: cleanName, lat: placeData.lat, lng: placeData.lng });
    setParsing(false);
  };

  const addItem = async () => {
    if (!title.trim() && !mapLink.trim()) return;
    let placeData: {
      name?: string;
      lat?: number;
      lng?: number;
      iframe?: string;
    } = {};
    if (mapLink.trim() && !parsedData) {
      setParsing(true);
      placeData = await parseMapLink(mapLink.trim());
      setParsing(false);
    } else if (parsedData) {
      placeData = {
        name: parsedData.name ? parsedData.name.replace(/\+/g, " ") : undefined,
        lat: parsedData.lat,
        lng: parsedData.lng,
      };
    }
    const finalTitle = title.trim() || placeData.name || "Untitled";
    const it = await addItineraryItem(tripId || null, {
      dayIndex: selectedDay,
      title: finalTitle,
      time: time || undefined,
      url: url.trim() || undefined,
      remark: remark.trim() || undefined,
      mapLink: mapLink.trim() || undefined,
      lat: placeData.lat,
      lng: placeData.lng,
      placeName: placeData.name,
      order: items.filter((i) => i.day_index === selectedDay).length,
    });
    if (it) {
      setItems((prev) => [...prev, it]);
      setTitle("");
      setTime("");
      setMapLink("");
      setUrl("");
      setRemark("");
      setParsedData(null);
    }
  };

  const removeItem = async (id: number) => {
    const success = await deleteItineraryItem(tripId, id);
    if (success) {
      setItems((prev) => prev.filter((i) => i.__dexieid !== id));
    }
  };

  const dayItems = items
    .filter((i) => i.day_index === selectedDay)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Generate Google Maps link for all destinations in the current day
  const generateDaySummaryLink = () => {
    if (dayItems.length === 0) return "";
    const locations = dayItems.map((item) => {
      if (item.lat && item.lng) {
        return `${item.lat},${item.lng}`;
      } else if (item.place_name) {
        return encodeURIComponent(item.place_name);
      } else {
        return encodeURIComponent(item.title);
      }
    });
    return `https://www.google.com/maps/dir/${locations.join("/")}`;
  };

  const onDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const oldIndex = dayItems.findIndex((i, idx) => String(getItemId(i, idx)) === activeId);
    const newIndex = dayItems.findIndex((i, idx) => String(getItemId(i, idx)) === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMoveLocal(dayItems, oldIndex, newIndex);
    await updateOrder(newOrder);
  };

  return (
    <div className={styles.itineraryContainer}>
      <h2>Itinerary</h2>
      <div className={styles.dateRangeRow}>
        <label>
          Start Date:
          <input
            type="date"
            value={draftStartDate}
            onChange={(e) => setDraftStartDate(e.target.value)}
          />
        </label>
        <label>
          End Date:
          <input
            type="date"
            value={draftEndDate}
            onChange={(e) => {
              setDraftEndDate(e.target.value);
              setEndDateTouched(true);
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
            className={`${styles.dayTab} ${selectedDay === idx ? styles.dayTabActive : ""}`}
            onClick={() => setSelectedDay(idx)}
          >
            Day {idx + 1}
            <br />
            <span className={styles.dayTabDate}>{date}</span>
          </button>
        ))}
      </div>
      <div className={styles.addItineraryRow}>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="time"
          step="900"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="Time (optional)"
          title="Time is for display only and does not affect the order of items. Drag and drop to reorder."
        />
        <input
          placeholder="Google Maps Link"
          value={mapLink}
          onChange={(e) => {
            setMapLink(e.target.value);
            setParsedData(null);
          }}
          onBlur={parseCurrentMapLink}
        />
        <input
          placeholder="URL (optional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          placeholder="Remark (optional)"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
        <button onClick={addItem} disabled={parsing}>
          {parsing ? "Parsing..." : "Add"}
        </button>
      </div>
      <p style={{ fontSize: "12px", color: "#666", marginTop: "8px" }}>
        💡 <strong>Note:</strong> Time input is optional and for display only—it does not affect ordering. Use drag and drop to reorder items.
      </p>
      {parsedData && (
        <div className={styles.parsedDataDisplay}>
          <strong>Parsed Map Data:</strong>
          <div>Name: {parsedData.name || "N/A"}</div>
          <div>Latitude: {parsedData.lat?.toFixed(6) || "N/A"}</div>
          <div>Longitude: {parsedData.lng?.toFixed(6) || "N/A"}</div>
        </div>
      )}
      {dayItems.length > 0 && (
        <div className={styles.daySummary}>
          <strong>
            📅 Day {selectedDay + 1} Summary ({dayItems.length} destination
            {dayItems.length > 1 ? "s" : ""})
          </strong>
          <a
            href={generateDaySummaryLink()}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.daySummaryLink}
          >
            🗺️ View All Destinations on Map
          </a>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={dayItems.map((i, idx) => getItemId(i, idx))}
          strategy={verticalListSortingStrategy}
        >
          <ul className={styles.itineraryList}>
            {dayItems.map((item, idx) => (
              <SortableItineraryItem
                key={getItemId(item, idx)}
                item={item}
                idx={idx}
                dayItems={dayItems}
                removeItem={removeItem}
                itemId={getItemId(item, idx)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
};

// Sortable item component for dnd-kit
function SortableItineraryItem({
  item,
  idx,
  dayItems,
  removeItem,
  itemId,
}: {
  item: ItineraryItemType;
  idx: number;
  dayItems: ItineraryItemType[];
  removeItem: (id: number) => void;
  itemId: string | number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId });
  const style = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
    zIndex: isDragging ? 10 : undefined,
    boxShadow: isDragging ? "0 8px 24px rgba(59,130,246,0.15)" : undefined,
    background: isDragging ? "var(--panel-2)" : undefined,
  };
  const prevItem = idx > 0 ? dayItems[idx - 1] : null;
  let dirFromCurrent = "";
  let dirFromPrev = "";
  const destinationParam =
    item.lat && item.lng
      ? `${item.lat},${item.lng}`
      : encodeURIComponent(item.place_name || item.title);
  dirFromCurrent = `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${destinationParam}`;
  if (prevItem) {
    const originParam =
      prevItem.lat && prevItem.lng
        ? `${prevItem.lat},${prevItem.lng}`
        : encodeURIComponent(prevItem.place_name || prevItem.title);
    dirFromPrev = `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destinationParam}`;
  }
  return (
    <li
      ref={setNodeRef}
      style={{
        ...style,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      className={styles.itineraryItem}
      {...attributes}
      {...listeners}
    >
      <div className={styles.itineraryInfo}>
        <div className={styles.itineraryTitle}>
          {item.time && (
            <span className={styles.itineraryTime}>{item.time}</span>
          )}
          {item.title}
        </div>
        {(item.place_name || item.lat || item.lng) && (
          <div className={styles.itineraryParsedInfo}>
            {item.place_name && <span>📍 {item.place_name}</span>}
            {item.lat && item.lng && (
              <span className={styles.coords}>
                {" "}
                ({item.lat.toFixed(4)}, {item.lng.toFixed(4)})
              </span>
            )}
          </div>
        )}
        {item.remark && (
          <div className={styles.itineraryRemark}>{item.remark}</div>
        )}
        <div className={styles.itineraryLinks}>
          {item.map_link && (
            <a
              href={item.map_link}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.mapLink}
            >
              📍 Map
            </a>
          )}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.urlLink}
            >
              🔗 Link
            </a>
          )}
          <a
            href={dirFromCurrent}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.dirLink}
          >
            🧭 From Here
          </a>
          {dirFromPrev && (
            <a
              href={dirFromPrev}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.dirLink}
            >
              ➡️ From Previous
            </a>
          )}
        </div>
      </div>
      <button
        className={styles.deleteBtn}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          removeItem(item.__dexieid!);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        type="button"
      >
        Remove
      </button>
    </li>
  );
}

export default Itinerary;
