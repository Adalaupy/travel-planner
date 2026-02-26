import { useEffect, useState } from "react";
import { useTrip } from "../context/TripContext";
import { TravelerItem } from "../lib/db";
import { addTraveler, deleteTraveler } from "../lib/syncService";
import { useTripData } from "../hooks/useTripData";
import styles from "../styles/components.module.css";
import {
    FaUser,
    FaUserTie,
    FaUsers,
    FaFemale,
    FaMale,
    FaChild,
    FaUserCircle,
    FaRegGrinBeam,
    FaRegGrinAlt,
    FaRegGrinSquint,
    FaRegLaughWink,
    FaRegKiss,
    FaSmileWink,
    FaRegGrinTongueSquint,
    FaRegDizzy,
    FaRegGrinTears ,
    FaRegGrin,
    FaRegGrimace,

} from "react-icons/fa";

type Props = { tripId?: number };

const REUSABLE_ICON_ID = "FaUserCircle";

const ICONS = [
    {
        id: "FaUserCircle",
        Comp: FaUserCircle,
        label: "Default (Reusable)",
        reusable: true,
    },
    { id: "FaUser", Comp: FaUser,  reusable: false },
    { id: "FaUserTie", Comp: FaUserTie,  reusable: false },
    { id: "FaUsers", Comp: FaUsers, reusable: false },
    { id: "FaFemale", Comp: FaFemale, reusable: false },
    { id: "FaMale", Comp: FaMale,  reusable: false },
    { id: "FaChild", Comp: FaChild,reusable: false },
    { id: "FaRegGrinBeam", Comp: FaRegGrinBeam,  reusable: false},
    { id: "FaRegGrinAlt", Comp: FaRegGrinAlt,reusable: false},
    { id: "FaRegGrinSquint", Comp:  FaRegGrinSquint,reusable: false},
    { id: "FaRegLaughWink" , Comp: FaRegLaughWink,reusable: false},
    { id: "FaRegKiss" , Comp: FaRegKiss,reusable: false},
    { id: "FaSmileWink", Comp: FaSmileWink,reusable: false},
    { id: "FaRegGrinTongueSquint", Comp:   FaRegGrinTongueSquint,reusable: false},
    { id: "FaRegDizzy", Comp: FaRegDizzy,reusable: false},
    { id: "FaRegGrinTears " , Comp:   FaRegGrinTears ,reusable: false},
    { id: "FaRegGrin", Comp: FaRegGrin,reusable: false},
    { id: "FaRegGrimace", Comp: FaRegGrimace,reusable: false},

];

export const TravelersList = ({ tripId }: Props = {}) => {
    const { trip } = useTrip();
    const actualTripId = trip?.trip_id;
    const { data: travelers, loading, error, isOnline } = useTripData<TravelerItem>('travelers', actualTripId);
    const [items, setItems] = useState<TravelerItem[]>([]);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [icon, setIcon] = useState(REUSABLE_ICON_ID);
    const [showIconPicker, setShowIconPicker] = useState(false);

    // Update items when travelers data changes from hook
    useEffect(() => {
        setItems(travelers);
    }, [travelers]);

    useEffect(() => {
        try {
            const saved =
                typeof window !== "undefined"
                    ? localStorage.getItem("travelers:lastIcon")
                    : null;
            if (saved) setIcon(saved);
        } catch (e) {}
    }, []);

    // Auto-select first available icon when travelers change
    useEffect(() => {
        const used = new Set(items.map((t) => t.icon));
        // If current icon is used and not reusable, switch to available one
        if (used.has(icon) && icon !== REUSABLE_ICON_ID) {
            const available = ICONS.find((ic) => !used.has(ic.id) || ic.reusable);
            if (available) {
                setIcon(available.id);
            }
        }
    }, [items, icon]);

    const addTravelerHandler = async () => {
        if (!name.trim()) return;
        // prevent adding if icon is already used (except for reusable icon)
        if (icon !== REUSABLE_ICON_ID && items.some((t) => t.icon === icon)) {
            alert("Icon already used by another traveler. Choose a different icon.");
            return;
        }
        const t = await addTraveler(actualTripId || null, {
            name: name.trim(),
            email: email.trim(),
            icon,
        });
        if (t) {
            setItems((prev) => [...prev, t]);
            setName("");
            setEmail("");
            try {
                localStorage.setItem("travelers:lastIcon", icon);
            } catch (e) {}
            // Auto-select next available icon (or default to reusable if all taken)
            const usedAfterAdd = new Set([...items.map((i) => i.icon), icon]);
            const next = ICONS.find((ic) => !usedAfterAdd.has(ic.id) || ic.reusable);
            if (next) setIcon(next.id);
        }
    };

    const removeTravelerHandler = async (id: number) => {
        const success = await deleteTraveler(actualTripId || null, id);
        if (success) {
            setItems((prev) => prev.filter((p) => p.__dexieid !== id));
        }
    };

    return (
        <div className={styles.travelersContainer}>
            <h2>
                Travelers {!isOnline && <span title="Using cached data">📡 (Offline)</span>} {loading && <span>⏳</span>}
            </h2>
            <div className={styles.addTravelerRow}>
                <input
                    placeholder="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <input
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <button
                    type="button"
                    className={styles.iconTrigger}
                    onClick={() => setShowIconPicker(true)}
                    title="Choose icon"
                >
                    {(() => {
                        const Comp = ICONS.find((ic) => ic.id === icon)?.Comp || FaUser;
                        return <Comp size={20} color="#4d00f4" />;
                    })()}
                </button>
                <button onClick={addTravelerHandler}>Add</button>
            </div>

            {showIconPicker && (
                <div
                    className={styles.modalOverlay}
                    onClick={() => setShowIconPicker(false)}
                >
                    <div
                        className={styles.modalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3>Choose Icon</h3>
                        <div className={styles.iconGrid}>
                            {ICONS.map((ic) => {
                                const used = items.some((t) => t.icon === ic.id);
                                const selected = icon === ic.id;
                                const isReusable = ic.reusable;
                                const disabled = used && !isReusable;
                                return (
                                    <button
                                        key={ic.id}
                                        type="button"
                                        className={`${styles.iconButton} ${selected ? styles.iconSelected : ""} ${disabled ? styles.iconDisabled : ""} ${isReusable ? styles.iconReusable : ""}`}
                                        onClick={() => {
                                            if (!disabled) {
                                                setIcon(ic.id);
                                                setShowIconPicker(false);
                                            }
                                        }}
                                        aria-pressed={selected}
                                        title={ic.id}
                                        disabled={disabled}
                                    >
                                        <ic.Comp size={24} color="#4d00f4" />
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            className={styles.closeBtn}
                            onClick={() => setShowIconPicker(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            <ul className={styles.travelersList}>
                {items.map((t) => (
                    <li key={t.__dexieid} className={styles.travelerItem}>
                        <div className={styles.travelerIcon}>
                            {(() => {
                                const Comp = ICONS.find((i) => i.id === t.icon)?.Comp || FaUser;
                                return <Comp size={20} color="#4d00f4"/>;
                            })()}
                        </div>
                        <div className={styles.travelerInfo}>
                            <div className={styles.travelerName}>{t.name}</div>
                            <div className={styles.travelerEmail}>{t.email}</div>
                        </div>
                        <button
                            className={styles.deleteBtn}
                            onClick={() => removeTravelerHandler(t.__dexieid!)}
                        >
                            Remove
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default TravelersList;
