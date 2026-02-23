import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import TripDetailTabs from "../../components/TripDetailTabs";
import { TripProvider } from "../../context/TripContext";
import { getOrCreateTripBySlug } from "../../lib/tripService";
import PackingChecklist from "../../components/PackingChecklist";
import TravelersList from "../../components/TravelersList";
import ExpensesManager from "../../components/ExpensesManager";
import Itinerary from "../../components/Itinerary";
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
      // Check if tripIdParam is a numeric ID
      const numericIdValue = Number(tripIdParam);
      if (
        !isNaN(numericIdValue) &&
        String(numericIdValue) === String(tripIdParam)
      ) {
        // It's a numeric ID, look up directly
        const trip = await (
          await import("../../lib/db")
        ).db.trips.get(numericIdValue);
        if (trip) {
          setNumericId(trip.Trip_ID ?? null);
          setTripTitle(trip.title || "Untitled");
          setNewTitle(trip.title || "Untitled");
          return;
        }
      }
      // Otherwise, treat as slug and use getOrCreateTripBySlug
      const t = await getOrCreateTripBySlug(String(tripIdParam));
      setNumericId(t.Trip_ID ?? null);
      setTripTitle(t.title || String(tripIdParam));
      setNewTitle(t.title || String(tripIdParam));
    };
    ensure();
  }, [tripIdParam]);

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
              if (!newTitle.trim() || !numericId) return;
              await (
                await import("../../lib/db")
              ).db.trips.update(numericId, {
                title: newTitle.trim(),
                updatedAt: Date.now(),
              });
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
