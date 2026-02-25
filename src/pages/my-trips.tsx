import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { TripItem } from "../lib/db";
import { getUserTrips, createTrip, deleteTrip as deleteFromSync } from "../lib/syncService";
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
    Array<string | number>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    const allTrips = await getUserTrips();
    setTrips(allTrips);
  };

  const createTripHandler = async () => {
    if (!newTripTitle.trim()) {
      alert("Please enter a trip title");
      return;
    }
    
    if (isCreating) return;

    setIsCreating(true);
    try {
      const result = await createTrip(newTripTitle.trim());
      if (result) {
        setNewTripTitle("");
        await loadTrips();
        // Use trip_id (sync key) if available, otherwise use __dexieid
        router.push(`/trip/${result.trip_id || result.__dexieid}`);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const deleteTrip = async (trip: any) => {
    if (!confirm("Delete this trip? This cannot be undone.")) return;
    // Use the original ID (UUID or numeric) from Supabase
    const tripId = trip.trip_id || trip.__dexieid;
    const success = await deleteFromSync(tripId);
    if (success) {
      await loadTrips();
    } else {
      alert("Failed to delete trip");
    }
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
        const selectedId = String(selectedTripsForExport[0]);
        const trip = trips.find(
          (t) => String(t.trip_id ?? t.__dexieid) === selectedId,
        );
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

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch("/import-template.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Template not found");
      }
      const text = await response.text();
      downloadBackup(text, "import-template.json");
      setShowBackupMenu(false);
    } catch (error) {
      alert(
        "Failed to download template: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    try {
      const confirmed = confirm(
        "WARNING: This will replace ALL existing data with the backup. Are you sure you want to continue?",
      );
      if (!confirmed) {
        e.target.value = ""; // Reset file input
        return;
      }

      let successCount = 0;
      const errors: string[] = [];

      for (const file of files) {
        try {
          const jsonString = await readBackupFile(file);
          const result = await importTripsData(jsonString);
          if (result.success) {
            successCount += 1;
          } else {
            errors.push(`${file.name}: ${result.error}`);
          }
        } catch (error) {
          errors.push(
            `${file.name}: ` +
              (error instanceof Error ? error.message : "Unknown error"),
          );
        }
      }

      if (successCount > 0) {
        await loadTrips();
        setShowBackupMenu(false);
      }

      if (errors.length > 0) {
        alert("Some files failed to import:\n" + errors.join("\n"));
      } else {
        alert(`Trips imported successfully! (${successCount} file(s))`);
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
    (trip.title || "").toLowerCase().includes(searchQuery.toLowerCase()),
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
                createTripHandler();
              }
            }}
            className={styles.input}
          />
          <button
            type="button"
            onClick={createTripHandler}
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
              <button onClick={handleDownloadTemplate} className={styles.menuItem}>
                📄 Download Import Template
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
              {trips.map((trip) => {
                const exportId = trip.trip_id ?? trip.__dexieid
                if (!exportId) return null
                return (
                <label key={String(exportId)} className={styles.tripCheckbox}>
                  <input
                    type="checkbox"
                    checked={selectedTripsForExport.some(
                      (id) => String(id) === String(exportId),
                    )}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedTripsForExport((prev) => [
                          ...prev,
                          exportId,
                        ]);
                      } else {
                        setSelectedTripsForExport((prev) =>
                          prev.filter((id) => String(id) !== String(exportId)),
                        );
                      }
                    }}
                  />
                  <span>{trip.title}</span>
                </label>
                )
              })}
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
        multiple
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
            const linkId = trip.trip_id || trip.__dexieid
            if (!linkId) {
              console.warn('Trip missing id fields:', trip)
              return null
            }

            return (
              <div key={String(linkId)} className={styles.tripCard}>
                <Link
                  href={`/trip/${linkId}`}
                  className={styles.tripLink}
                >
                  <h3>{trip.title}</h3>
                  {trip.start_date && trip.end_date && (
                    <div className={styles.tripMeta}>
                      {trip.start_date} to {trip.end_date}
                    </div>
                  )}
                  <p className={styles.tripUpdated}>
                    Updated:{" "}
                    {new Date(trip.updated_at || 0).toLocaleDateString()}
                  </p>
                </Link>
                <button
                  onClick={() => deleteTrip(trip)}
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
