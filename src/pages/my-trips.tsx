import Link from "next/link";
import { ChangeEvent, useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import { db, TripItem } from "../lib/db";
import {
    addItineraryItem,
    createTrip,
    deleteItineraryItem,
    deleteTrip as deleteFromSync,
    getUserTrips,
    updateTrip,
} from "../lib/syncService";
import { getLocalUserIdentity } from "../lib/userIdentity";
import { parseAiItineraryImport, ParsedAiItinerary } from "../lib/aiItineraryParser";
import {
    exportTripsData,
    importTripsData,
    downloadBackup,
    readBackupFile,
} from "../lib/dataExport";
import styles from "../styles/trips.module.css";

const AI_PROMPT_TEMPLATE = `You are helping me plan a trip.

Return ONLY plain text using this exact format:

TRIP_TITLE: <trip title>
DESTINATION: <city/country>
START_DATE: YYYY-MM-DD
END_DATE: YYYY-MM-DD

ITINERARY:
DAY <number> | <time HH:MM optional> | <activity title required> | <google_maps_url optional> | <url optional> | <remark optional>

Field rules for each itinerary line:
- DAY: required
- date: derived from START_DATE and END_DATE, do not provide it in each line
- time: optional, but if provided it must be exactly HH:MM (24-hour), e.g. 09:30
- activity title: required
- google_maps_url: always leave blank
- url: optional
- remark: optional
- You can include multiple DAY lines.
- Add one line for each day in the trip, in ascending order starting from DAY 1.
- Continue until the last travel day.

Rules:
- Do not use markdown.
- Do not use JSON.
- Do not add extra headings.
- Do not explain the answer.
- Keep the itinerary section only.
- Use one line per itinerary item.
- Always keep google_maps_url blank (do not provide any map link).
- Follow the field rules exactly and do not add extra fields.
- The app will derive the itinerary date from DAY number plus START_DATE and END_DATE.
- Generate all trip days, not just the first day.`;

export default function MyTrips() {
    const [trips, setTrips] = useState<TripItem[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [newTripTitle, setNewTripTitle] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [showExportDialog, setShowExportDialog] = useState(false);
    const [selectedTripsForExport, setSelectedTripsForExport] = useState<
        Array<string | number>
    >([]);
    const [aiImportText, setAiImportText] = useState("");
    const [parsedAiImport, setParsedAiImport] = useState<ParsedAiItinerary | null>(null);
    const [aiImportStatus, setAiImportStatus] = useState<{
        kind: "success" | "error";
        message: string;
    } | null>(null);
    const [isSubmittingAiImport, setIsSubmittingAiImport] = useState(false);
    const [promptCopied, setPromptCopied] = useState(false);
    const [showAiReplaceDialog, setShowAiReplaceDialog] = useState(false);
    const [pendingAiReplace, setPendingAiReplace] = useState<{
        parsed: ParsedAiItinerary;
        matchedTrip: TripItem;
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const aiTxtInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    useEffect(() => {
        const identity = getLocalUserIdentity();
        setCurrentUserId(identity?.user_id ?? null);
        loadTrips();
    }, []);

    const loadTrips = async () => {
        const allTrips = await getUserTrips();
        setTrips(allTrips);
    };

    const formatDisplayDate = (value?: string | null) => {
        if (!value) return "";
        const parsed = new Date(`${value}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return value;
        return parsed.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
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
            const response = await fetch(`${router.basePath}/import-template.json`, { cache: "no-store" });
            if (!response.ok) {
                throw new Error("Template not found");
            }
            const text = await response.text();
            downloadBackup(text, "import-template.json");

        } catch (error) {
            alert(
                "Failed to download template: " +
                    (error instanceof Error ? error.message : "Unknown error"),
            );
        }
    };

    const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
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

    const handleAiTxtImport = async (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        try {
            const text = await selectedFile.text();
            setAiImportText(text);
            setAiImportStatus({
                kind: "success",
                message: `Uploaded ${selectedFile.name}. Click \"Submit\" to update itinerary.`,
            });
        } catch (error) {
            setParsedAiImport(null);
            setAiImportStatus({
                kind: "error",
                message:
                    error instanceof Error
                        ? `Upload failed validation: ${error.message}`
                        : "Upload failed: unable to parse AI itinerary text.",
            });
        }

        e.target.value = "";
    };

    const applyParsedAiToTrip = async (
        parsed: ParsedAiItinerary,
        matchedTrip: TripItem,
        autoCreated = false,
    ) => {
        const targetTripId = matchedTrip.trip_id || String(matchedTrip.__dexieid || "");
        if (!targetTripId) {
            setAiImportStatus({
                kind: "error",
                message: "Matched trip has no valid ID.",
            });
            return;
        }

        await updateTrip(targetTripId, {
            title: parsed.tripTitle,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
        });

        const existingItems = await db.itinerary
            .where("trip_id")
            .equals(String(targetTripId))
            .toArray();

        for (const item of existingItems) {
            const deleteId = item.itinerary_id || item.__dexieid;
            if (!deleteId) continue;
            await deleteItineraryItem(targetTripId, deleteId);
        }

        const dayOrderCounter = new Map<number, number>();
        for (const row of parsed.itinerary) {
            const dayIndex = Math.max(0, row.day - 1);
            const currentOrder = dayOrderCounter.get(dayIndex) ?? 0;

            await addItineraryItem(targetTripId, {
                dayIndex,
                title: row.activityTitle,
                time: row.time,
                url: row.url,
                remark: row.remark,
                mapLink: row.googleMapsUrl,
                order: currentOrder,
            });

            dayOrderCounter.set(dayIndex, currentOrder + 1);
        }

        await loadTrips();
        setAiImportStatus({
            kind: "success",
            message: autoCreated
                ? `Created trip \"${matchedTrip.title}\" and submitted ${parsed.itinerary.length} itinerary row(s).`
                : `Parsed and submitted ${parsed.itinerary.length} row(s) to \"${matchedTrip.title}\" itinerary.`,
        });
    };

    const parseAndSubmitAiImport = async () => {
        if (!aiImportText.trim()) {
            setAiImportStatus({
                kind: "error",
                message: "Please upload or paste AI text first.",
            });
            return;
        }

        setIsSubmittingAiImport(true);
        try {
            const parsed = await parseAiItineraryImport(aiImportText);
            setParsedAiImport(parsed);

            let matchedTrip = trips.find(
                (trip) =>
                    (trip.title || "").trim().toLowerCase() ===
                    parsed.tripTitle.trim().toLowerCase(),
            );
            let autoCreated = false;

            if (matchedTrip) {
                const isOwner =
                    !matchedTrip.owner_id || matchedTrip.owner_id === currentUserId;
                const isSharedOnly =
                    !!currentUserId &&
                    !isOwner &&
                    ((matchedTrip.share_with as string[]) || []).includes(currentUserId);

                if (isSharedOnly) {
                    setAiImportStatus({
                        kind: "error",
                        message:
                            "A shared trip with the same title already exists. Please rename TRIP_TITLE and import again.",
                    });
                    return;
                }

                setPendingAiReplace({ parsed, matchedTrip });
                setShowAiReplaceDialog(true);
                return;
            } else {
                const createdTrip = await createTrip(parsed.tripTitle.trim());
                if (!createdTrip) {
                    setAiImportStatus({
                        kind: "error",
                        message: `Unable to auto-create trip \"${parsed.tripTitle}\".`,
                    });
                    return;
                }
                matchedTrip = createdTrip;
                autoCreated = true;
            }
            await applyParsedAiToTrip(parsed, matchedTrip, autoCreated);
        } catch (error) {
            setParsedAiImport(null);
            setAiImportStatus({
                kind: "error",
                message:
                    error instanceof Error
                        ? error.message
                        : "Failed to parse and submit AI itinerary.",
            });
        } finally {
            setIsSubmittingAiImport(false);
        }
    };

    const confirmAiReplaceImport = async () => {
        if (!pendingAiReplace) return;

        setIsSubmittingAiImport(true);
        try {
            const { parsed, matchedTrip } = pendingAiReplace;
            await applyParsedAiToTrip(parsed, matchedTrip);
        } catch (error) {
            setParsedAiImport(null);
            setAiImportStatus({
                kind: "error",
                message:
                    error instanceof Error
                        ? error.message
                        : "Failed to parse and submit AI itinerary.",
            });
        } finally {
            setIsSubmittingAiImport(false);
            setShowAiReplaceDialog(false);
            setPendingAiReplace(null);
        }
    };

    const cancelAiReplaceImport = () => {
        setShowAiReplaceDialog(false);
        setPendingAiReplace(null);
        setAiImportStatus({
            kind: "success",
            message: "Import canceled. No changes were made.",
        });
    };

    useEffect(() => {
        if (!showAiReplaceDialog) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (isSubmittingAiImport) return;

            if (event.key === "Escape") {
                event.preventDefault();
                cancelAiReplaceImport();
                return;
            }

            if (event.key === "Enter") {
                const target = event.target as HTMLElement | null;
                if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
                    return;
                }

                event.preventDefault();
                void confirmAiReplaceImport();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [showAiReplaceDialog, isSubmittingAiImport, pendingAiReplace]);

    const copyPromptTemplate = async () => {
        try {
            await navigator.clipboard.writeText(AI_PROMPT_TEMPLATE);
            setPromptCopied(true);
            setTimeout(() => setPromptCopied(false), 1800);
        } catch {
            setAiImportStatus({
                kind: "error",
                message: "Unable to copy prompt automatically. Please copy it manually.",
            });
        }
    };

    const filteredTrips = trips.filter((trip) =>
        (trip.title || "").toLowerCase().includes(searchQuery.toLowerCase()),
    );

    return (
        <main className={styles.main}>
            <div className={styles.header}>
                <h1>My Trips</h1>
                <div className={styles.createTrip}>
                    
                    <div className={styles.createNewTrip}>
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
                    <div className={styles.MenuBtns}>
                        <button onClick={handleImportClick} className={styles.menuItem}>
                            📤 Import Trip(s)
                        </button>
                        <button onClick={handleDownloadTemplate} className={styles.menuItem}>
                            📄 Download Import Template          
                        </button>
                    </div>

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
                    <button onClick={handleExportClick} className={styles.backupBtn}>
                        📥 Export Trip(s)
                    </button>
                </div>
            </div>

            <section className={styles.aiImportCard}>
                <div className={styles.aiPromptHeader}>
                    <h2>AI Itinerary Import</h2>
                    <button
                        type="button"
                        className={styles.aiActionBtn}
                        onClick={copyPromptTemplate}
                    >
                        {promptCopied ? "Prompt Copied" : "Copy Prompt"}
                    </button>
                </div>
                <p className={styles.aiHintText}>
                    Use this on My Plan first: copy prompt, upload/paste AI text, then click Submit.
                </p>

                <textarea
                    className={styles.aiPromptBox}
                    readOnly
                    value={AI_PROMPT_TEMPLATE}
                />

                <div className={styles.aiInputArea}>
                    <textarea
                        className={styles.aiImportInput}
                        value={aiImportText}
                        onChange={(e) => setAiImportText(e.target.value)}
                        placeholder="Uploaded AI output will appear here."
                    />
                    <div className={styles.aiImportActions}>
                        <button
                            type="button"
                            className={styles.aiActionBtn}
                            onClick={() => aiTxtInputRef.current?.click()}
                        >
                            Upload .txt
                        </button>
                        <button
                            type="button"
                            className={styles.aiActionBtn}
                            onClick={parseAndSubmitAiImport}
                            disabled={isSubmittingAiImport}
                        >
                            {isSubmittingAiImport ? "Submitting..." : "Submit"}
                        </button>
                    </div>
                </div>

                <input
                    ref={aiTxtInputRef}
                    type="file"
                    accept=".txt,text/plain"
                    onChange={handleAiTxtImport}
                    style={{ display: "none" }}
                />

                {aiImportStatus && (
                    <div
                        className={
                            aiImportStatus.kind === "error"
                                ? styles.importStatusError
                                : styles.importStatusSuccess
                        }
                    >
                        {aiImportStatus.message}
                    </div>
                )}

                {parsedAiImport && (
                    <div className={styles.aiParsedSummary}>
                        <h3>Parsed Preview</h3>
                        <p>Trip: {parsedAiImport.tripTitle}</p>
                        <p>Destination: {parsedAiImport.destination}</p>
                        <p>
                            Date Range: {formatDisplayDate(parsedAiImport.startDate)} to {formatDisplayDate(parsedAiImport.endDate)}
                        </p>
                        <p>Rows: {parsedAiImport.itinerary.length}</p>
                    </div>
                )}
            </section>

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

            {showAiReplaceDialog && pendingAiReplace && (
                <div
                    className={styles.modalOverlay}
                    onClick={cancelAiReplaceImport}
                >
                    <div
                        className={styles.modalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3>This trip already exists</h3>
                        <p>
                            Replace current work in "{pendingAiReplace.matchedTrip.title}" itinerary?
                        </p>
                        <div className={styles.modalButtonGroup}>
                            <button
                                onClick={confirmAiReplaceImport}
                                className={styles.modalPrimaryBtn}
                                disabled={isSubmittingAiImport}
                            >
                                {isSubmittingAiImport ? "Replacing..." : "Yes, Replace"}
                            </button>
                            <button
                                onClick={cancelAiReplaceImport}
                                className={styles.modalSecondaryBtn}
                                disabled={isSubmittingAiImport}
                            >
                                No
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
                        
                        const isOwner = trip.owner_id === currentUserId
                        const isShared = currentUserId && !isOwner && (trip.share_with as string[])?.includes(currentUserId)
                        return (
                            <div
                                key={String(linkId)}
                                className={`${styles.tripCard} ${isShared ? styles.tripCardShared : ''}`}
                            >
                                <Link
                                    href={`/trip/${linkId}`}
                                    className={styles.tripLink}
                                >
                                    <h3>{trip.title}</h3>
                                                    {isShared && (
                                                        <span className={styles.sharedTag}>📤 Shared with you</span>
                                                    )}
                                    {trip.start_date && trip.end_date && (
                                        <div className={styles.tripMeta}>
                                            {formatDisplayDate(trip.start_date)} to {formatDisplayDate(trip.end_date)}
                                        </div>
                                    )}
                                    <p className={styles.tripUpdated}>
                                        Updated:{" "}
                                        {new Date(trip.updated_at || 0).toLocaleDateString("en-GB", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            year: "numeric",
                                        })}
                                    </p>
                                </Link>
                                {isOwner && (
                                    <button
                                        onClick={() => deleteTrip(trip)}
                                        className={styles.deleteBtn}
                                        title="Delete trip"
                                    >
                                        🗑️
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
