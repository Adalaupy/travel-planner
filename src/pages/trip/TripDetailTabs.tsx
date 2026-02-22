import React from 'react';
import { useTrip } from '../../context/TripContext';
import PackingChecklist from '../../components/PackingChecklist';
import TravelersList from '../../components/TravelersList';
import ExpensesManager from '../../components/ExpensesManager';
import Itinerary from '../../components/Itinerary';

const TripDetailTabs = ({
  numericId,
  tripTitle,
  setTripTitle,
  editingTitle,
  setEditingTitle,
  newTitle,
  setNewTitle,
  activeTab,
  setActiveTab,
  tabList,
  styles,
}) => {
  const tripCtx = useTrip();
  React.useEffect(() => {
    if (tripCtx.trip && tripCtx.trip.title && tripCtx.trip.title !== tripTitle) {
      setTripTitle(tripCtx.trip.title);
      setNewTitle(tripCtx.trip.title);
    }
  }, [tripCtx.trip, tripTitle, setTripTitle, setNewTitle]);

  return (
    <>
      <div className={styles.tabsRow}>
        {tabList.map(tab => (
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
        {activeTab === 'itinerary' && <Itinerary tripId={numericId} />}
        {activeTab === 'packing' && <PackingChecklist tripId={numericId} />}
        {activeTab === 'travelers' && <TravelersList tripId={numericId} />}
        {activeTab === 'expenses' && <ExpensesManager tripId={numericId} />}
      </div>
    </>
  );
};

export default TripDetailTabs;