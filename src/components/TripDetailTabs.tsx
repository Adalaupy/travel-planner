import { useEffect } from "react";
import { useTrip } from "../context/TripContext";
import PackingChecklist from "./PackingChecklist";
import TravelersList from "./TravelersList";
import ExpensesManager from "./ExpensesManager";
import Itinerary from "./Itinerary";

interface TripDetailTabsProps {
    numericId: number;
    tripTitle: string;
    setTripTitle: (title: string) => void;
    newTitle: string;
    setNewTitle: (title: string) => void;
    activeTab: "itinerary" | "packing" | "travelers" | "expenses";
    setActiveTab: (
        tab: "itinerary" | "packing" | "travelers" | "expenses",
    ) => void;
    tabList: {
        key: "itinerary" | "packing" | "travelers" | "expenses";
        label: string;
    }[];
    styles: Record<string, string>;
}

const TripDetailTabs = ({
    numericId,
    tripTitle,
    setTripTitle,
    newTitle,
    setNewTitle,
    activeTab,
    setActiveTab,
    tabList,
    styles,
}: TripDetailTabsProps) => {
    const tripCtx = useTrip();
    useEffect(() => {
        if (
            tripCtx.trip &&
            tripCtx.trip.title &&
            tripCtx.trip.title !== tripTitle
        ) {
            setTripTitle(tripCtx.trip.title);
            setNewTitle(tripCtx.trip.title);
        }
    }, [tripCtx.trip, tripTitle, setTripTitle, setNewTitle]);

    return (
        <>
            <div className={styles.tabsRow}>
                {tabList.map((tab) => (
                    <button
                        key={tab.key}
                        className={activeTab === tab.key ? styles.tabActive : styles.tab}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className={styles.tabContent}>
                {activeTab === "itinerary" && <Itinerary tripId={numericId} />}
                {activeTab === "packing" && <PackingChecklist tripId={numericId} />}
                {activeTab === "travelers" && <TravelersList tripId={numericId} />}
                {activeTab === "expenses" && <ExpensesManager tripId={numericId} />}
            </div>
        </>
    );
};

export default TripDetailTabs;
