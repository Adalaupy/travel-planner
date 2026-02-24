import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import TripDetailTabs from "../../components/TripDetailTabs";
import { TripProvider } from "../../context/TripContext";
import { getTrip, syncTripFromSupabase, updateTrip } from "../../lib/syncService";
import { db } from "../../lib/db";
import styles from "../../styles/tripDetail.module.css";

export default function TripDetailPage() {
  const router = useRouter();
  const { tripId } = router.query;
  const tripIdParam = Array.isArray(tripId) ? tripId[0] : tripId;
  const [numericId, setNumericId] = useState<number | null>(null);
  const [tripTitle, setTripTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  // TripContext sync will be handled inside TripProvider

  useEffect(() => {
    if (!tripIdParam) return;

    const ensure = async () => {
      let trip = null;
      
      // Try to find by trip_id first (could be UUID or numeric string)
      trip = await db.trips.where('trip_id').equals(tripIdParam).first();
      
      // If not found and looks like a number, try as __dexieid
      if (!trip) {
        const numId = parseInt(tripIdParam as string, 10);
        if (!isNaN(numId)) {
          trip = await db.trips.get(numId);
        }
      }
      
      if (!trip) {
        const remote = await getTrip(tripIdParam as string)
        if (remote) {
          const remoteTripId = remote.trip_id ?? remote.id ?? String(tripIdParam)
          const existing = await db.trips.where('trip_id').equals(remoteTripId).first()
          if (existing?.__dexieid) {
            await db.trips.update(existing.__dexieid, {
              title: remote.title || "Untitled",
              trip_id: remoteTripId,
              is_public: remote.is_public,
              start_date: remote.start_date,
              end_date: remote.end_date,
              owner_id: remote.owner_id,
              created_at: remote.created_at,
              updated_at: remote.updated_at,
              issync: true,
            })
            trip = await db.trips.get(existing.__dexieid)
          } else {
            const numericId = await db.trips.add({
              title: remote.title || "Untitled",
              trip_id: remoteTripId,
              is_public: remote.is_public,
              start_date: remote.start_date,
              end_date: remote.end_date,
              owner_id: remote.owner_id,
              created_at: remote.created_at,
              updated_at: remote.updated_at,
              issync: true,
            })
            trip = await db.trips.get(numericId)
          }
          await syncTripFromSupabase(remoteTripId)
        }
      }

      if (trip?.trip_id) {
        await syncTripFromSupabase(trip.trip_id)
      }

      if (trip) {
        setNumericId(trip.__dexieid || null);
        setTripTitle(trip.title || "Untitled");
        setNewTitle(trip.title || "Untitled");
      }
    }
    ensure();
  }, [tripIdParam])

  const [activeTab, setActiveTab] = useState<
    "itinerary" | "packing" | "travelers" | "expenses"
  >("itinerary");

  const tabList = [
    { key: "itinerary" as const, label: "Itinerary" },
    { key: "packing" as const, label: "Packing Checklist" },
    { key: "travelers" as const, label: "Travelers" },
    { key: "expenses" as const, label: "Expenses" },
  ];

  return (
    <main className={styles.main}>
      <div className={styles.breadcrumb}>
        <Link href="/my-trips">← Back to My Trips</Link>
      </div>
      <div className={styles.header}>
        {editingTitle ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newTitle.trim() || !numericId || !tripIdParam) return;
              
              // Update via syncService (handles both Dexie and Supabase)
              // Pass tripIdParam which can be UUID or numeric
              await updateTrip(tripIdParam, {
                title: newTitle.trim(),
              })
              
              setTripTitle(newTitle.trim());
              setEditingTitle(false);
            }}
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className={styles.titleInput}
              style={{
                fontSize: "2rem",
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                width: "100%",
              }}
              autoFocus
            />
            <button type="submit" style={{ padding: "8px 16px" }}>
              Save
            </button>
            <button
              type="button"
              style={{ padding: "8px 16px", background: "#eee", color: "#333" }}
              onClick={() => {
                setEditingTitle(false);
                setNewTitle(tripTitle);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0 }}>{tripTitle}</h1>
            <button
              type="button"
              style={{ padding: "8px 16px" }}
              onClick={() => setEditingTitle(true)}
            >
              Rename
            </button>
          </div>
        )}
      </div>
      {numericId ? (
        <TripProvider slug={String(tripIdParam)}>
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
  );
}
