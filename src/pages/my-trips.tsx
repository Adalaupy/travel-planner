import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { db, TripItem } from "../lib/db";
import {
  exportTripsData,
  importTripsData,
  downloadBackup,
  readBackupFile,
} from "../lib/dataExport";
import styles from "../styles/trips.module.css";

export default function MyTrips() {
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [newTripTitle, setNewTripTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBackupMenu, setShowBackupMenu] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedTripsForExport, setSelectedTripsForExport] = useState<
    number[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    const allTrips = await db.trips.toArray();
    allTrips.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    setTrips(allTrips);
  };

  const createTrip = async () => {
    if (!newTripTitle.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const id = await db.trips.add({
        title: newTripTitle.trim(),
        updatedAt: Date.now(),
      });
      setNewTripTitle("");
      await loadTrips();
      router.push(`/trip/${id}`);
    } finally {
      setIsCreating(false);
    }
  };

  const deleteTrip = async (id: number) => {
    if (!confirm("Delete this trip? This cannot be undone.")) return;
    await db.trips.delete(id);
    // Also delete related data
    await db.packing.where("Trip_ID").equals(id).delete();
    await db.travelers.where("Trip_ID").equals(id).delete();
    await db.expenses.where("Trip_ID").equals(id).delete();
    await db.itinerary.where("Trip_ID").equals(id).delete();
    await loadTrips();
  };

  const handleExportClick = () => {
    setShowExportDialog(true);
  };

  const handleExport = async () => {
    try {
      if (selectedTripsForExport.length === 0) {
        alert("Please select at least one trip to export");
        return;
      }
      const data = await exportTripsData(selectedTripsForExport);
      
      // Build filename from trip title(s)
      let filename = "travel-planner-export";
      if (selectedTripsForExport.length === 1) {
        const trip = trips.find(t => t.Trip_ID === selectedTripsForExport[0]);
        if (trip && trip.title) {
          filename = trip.title.replace(/\s+/g, "-").toLowerCase();
        }
      } else {
        filename = `travel-planner-export-${selectedTripsForExport.length}-trips`;
      }
      filename += `-${new Date().toISOString().split("T")[0]}.json`;
      
      downloadBackup(data, filename);
      alert("Trips exported successfully!");
      setShowExportDialog(false);
      setSelectedTripsForExport([]);
      setShowBackupMenu(false);
    } catch (error) {
      alert(
        "Failed to export data: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const jsonString = await readBackupFile(file);
      const confirmed = confirm(
        "WARNING: This will replace ALL existing data with the backup. Are you sure you want to continue?",
      );
      if (!confirmed) {
        e.target.value = ""; // Reset file input
        return;
      }

      const result = await importTripsData(jsonString);
      if (result.success) {
        alert("Trips imported successfully!");
        await loadTrips();
        setShowBackupMenu(false);
      } else {
        alert("Failed to import data: " + result.error);
      }
    } catch (error) {
      alert(
        "Failed to import data: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    }
    e.target.value = ""; // Reset file input
  };

  const filteredTrips = trips.filter((trip) =>
    trip.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1>My Trips</h1>
        <div className={styles.createTrip}>
          <input
            type="text"
            placeholder="New trip name..."
            value={newTripTitle}
            onChange={(e) => setNewTripTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createTrip();
              }
            }}
            className={styles.input}
          />
          <button
            type="button"
            onClick={createTrip}
            className={styles.createBtn}
            disabled={isCreating}
          >
            {isCreating ? "Creating..." : "+ Create Trip"}
          </button>
        </div>
      </div>

      <div className={styles.search}>
        <input
          type="text"
          placeholder="🔍 Search trips..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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
              <button onClick={handleExportClick} className={styles.menuItem}>
                📥 Export Trip(s)
              </button>
              <button onClick={handleImportClick} className={styles.menuItem}>
                📤 Import Trip(s)
              </button>
            </div>
          )}
        </div>
      </div>

      {showExportDialog && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowExportDialog(false)}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Select Trips to Export</h3>
            <div className={styles.tripCheckboxList}>
              {trips.map((trip) => (
                <label key={trip.Trip_ID} className={styles.tripCheckbox}>
                  <input
                    type="checkbox"
                    checked={selectedTripsForExport.includes(trip.Trip_ID!)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTripsForExport((prev) => [
                          ...prev,
                          trip.Trip_ID!,
                        ]);
                      } else {
                        setSelectedTripsForExport((prev) =>
                          prev.filter((id) => id !== trip.Trip_ID!),
                        );
                      }
                    }}
                  />
                  <span>{trip.title}</span>
                </label>
              ))}
            </div>
            <div className={styles.modalButtonGroup}>
              <button onClick={handleExport} className={styles.modalPrimaryBtn}>
                Export Selected
              </button>
              <button
                onClick={() => setShowExportDialog(false)}
                className={styles.modalSecondaryBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        style={{ display: "none" }}
      />

      {filteredTrips.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✈️</div>
          <h2>No trips yet</h2>
          <p>Create your first trip to get started!</p>
        </div>
      ) : (
        <div className={styles.tripGrid}>
          {filteredTrips.map((trip) => {
            return (
              <div key={trip.Trip_ID} className={styles.tripCard}>
                <Link
                  href={`/trip/${trip.Trip_ID}`}
                  className={styles.tripLink}
                >
                  <h3>{trip.title}</h3>
                  {trip.startDate && trip.endDate && (
                    <p className={styles.tripDates}>
                      {trip.startDate} to {trip.endDate}
                    </p>
                  )}
                  <p className={styles.tripUpdated}>
                    Updated:{" "}
                    {new Date(trip.updatedAt || 0).toLocaleDateString()}
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
            );
          })}
        </div>
      )}
    </main>
  );
}
