import Dexie, { Table } from 'dexie'

/**
 * New Schema Pattern:
 * - Every Dexie table has: __dexieId (auto-increment, internal key), {tableName}Id (primary key, synced from Supabase or null), isSync (boolean)
 * - tableName+Id = 'tripId', 'packingId', 'travelerId', 'expenseId', 'itineraryId', 'placeId'
 * - When offline: {tableName}Id is null, isSync is false
 * - When online: sync to Supabase, get {tableName}Id back, update Dexie with the ID and set isSync to true
 */

export interface UserItem {
  __dexieid?: number;
  user_id?: string | null;
  issync?: boolean;
  username?: string | null;
  birthday?: string | null;
  gender?: string | null;
  short_code?: string | null;
}

export interface TripItem {
  __dexieid?: number;
  trip_id?: string | null;
  issync?: boolean;
  title: string;
  start_date?: string;
  end_date?: string;
  is_public?: boolean;
  created_at?: string;
  updated_at?: number;
  owner_id?: string | null;
}

export interface ItineraryItem {
  __dexieid?: number;
  itinerary_id?: string | null;
  issync?: boolean;
  trip_id?: string | null;
  day_index: number;
  title: string;
  time?: string;
  url?: string;
  remark?: string;
  map_link?: string;
  lat?: number;
  lng?: number;
  place_name?: string;
  order?: number;
}

export interface PackingItem {
  __dexieid?: number;
  packing_id?: string | null;
  issync?: boolean;
  trip_id?: string | null;
  title: string;
  completed: boolean;
  color?: string;
  order: number;
}

export interface TravelerItem {
  __dexieid?: number;
  traveler_id?: string | null;
  issync?: boolean;
  trip_id?: string | null;
  name: string;
  email?: string;
  icon?: string;
}

export interface ExpenseItem {
  __dexieid?: number;
  expense_id?: string | null;
  issync?: boolean;
  trip_id?: string | null;
  title: string;
  amount: number;
  payer_id?: string | number;
  charged_to?: Array<string | number>;
  datetime?: string;
}

class TravelDB extends Dexie {
  users!: Table<UserItem, number>
  trips!: Table<TripItem, number>
  itinerary!: Table<ItineraryItem, number>
  packing!: Table<PackingItem, number>
  travelers!: Table<TravelerItem, number>
  expenses!: Table<ExpenseItem, number>

  constructor() {
    super('TravelPlannerDB')

    // V1-V3: Old schemas (kept for migration compatibility)
    this.version(1).stores({
      users: '++User_ID, clerkId, name',
      trips: '++Trip_ID, User_ID, title, startDate, endDate, updatedAt',
      itinerary: '++Itinerary_ID, Trip_ID, dayIndex, title',
      packing: '++Packing_ID, Trip_ID, order, completed',
      travelers: '++Traveler_ID, Trip_ID, name, email',
      expenses: '++Expense_ID, Trip_ID, title, amount, payer_ID'
    })

    this.version(2).stores({
      users: '++User_ID, clerkId, name',
      trips: '++Trip_ID, User_ID, title, startDate, endDate, updatedAt',
      itinerary: '++Itinerary_ID, Trip_ID, dayIndex, title',
      packing: '++Packing_ID, Trip_ID, order, completed',
      travelers: '++Traveler_ID, Trip_ID, name, email',
      expenses: '++Expense_ID, Trip_ID, title, amount, payer_ID'
    })

    this.version(3).stores({
      users: '++id, username, birthday, gender, short_code',
      trips: '++id, owner_id, title, is_public, updated_at',
      itinerary: '++id, trip_id, day_index, title',
      packing: '++id, trip_id, order, completed',
      travelers: '++id, trip_id, name, email',
      expenses: '++id, trip_id, title, amount, payer_id'
    })

    // V4: Intermediate schema (may have issues)
    this.version(4).stores({
      users: '++__dexieId, userId, isSync',
      trips: '++__dexieId, tripId, isSync, title',
      itinerary: '++__dexieId, itineraryId, tripId, isSync',
      packing: '++__dexieId, packingId, tripId, isSync',
      travelers: '++__dexieId, travelerId, tripId, isSync',
      expenses: '++__dexieId, expenseId, tripId, isSync'
    })

    // V5: Clean schema with proper title index for queries
    this.version(5)
      .stores({
        users: '++__dexieid, user_id, issync, username, birthday, gender, short_code',
        trips: '++__dexieid, title, trip_id, issync, owner_id',
        itinerary: '++__dexieid, trip_id, itinerary_id, issync',
        packing: '++__dexieid, trip_id, packing_id, issync',
        travelers: '++__dexieid, trip_id, traveler_id, issync',
        expenses: '++__dexieid, trip_id, expense_id, issync'
      })
      .upgrade(async (tx) => {
        // Migration from v3/v4 to v5
        const oldTrips = await tx.table('trips').toArray()
        const oldPacking = await tx.table('packing').toArray()
        const oldTravelers = await tx.table('travelers').toArray()
        const oldExpenses = await tx.table('expenses').toArray()
        const oldItinerary = await tx.table('itinerary').toArray()
        const oldPlaces = await tx.table('places').toArray()
        const oldUsers = await tx.table('users').toArray()

        // Clear old data
        await tx.table('trips').clear()
        await tx.table('packing').clear()
        await tx.table('travelers').clear()
        await tx.table('expenses').clear()
        await tx.table('itinerary').clear()
        await tx.table('places').clear()
        await tx.table('users').clear()

        // Migrate trips
        for (const trip of oldTrips) {
          const trip_id = (trip as any).trip_id || (trip as any).tripId || (trip as any).id || null
          await tx.table('trips').add({
            trip_id: trip_id,
            issync: !!trip_id,
            title: trip.title,
            start_date: (trip as any).start_date,
            end_date: (trip as any).end_date,
            is_public: (trip as any).is_public || false,
            created_at: (trip as any).created_at,
            updated_at: (trip as any).updated_at || Date.now(),
            owner_id: (trip as any).owner_id,
          })
        }

        // Migrate packing
        for (const item of oldPacking) {
          await tx.table('packing').add({
            packing_id: (item as any).packing_id || (item as any).packingId || (item as any).id || null,
            issync: !!(item as any).packing_id || !!(item as any).packingId || !!(item as any).id,
            trip_id: (item as any).trip_id || (item as any).tripId || (item as any).trip_id,
            title: item.title,
            completed: item.completed,
            color: (item as any).color,
            order: item.order,
          })
        }

        // Migrate travelers
        for (const traveler of oldTravelers) {
          await tx.table('travelers').add({
            traveler_id: (traveler as any).traveler_id || (traveler as any).travelerId || (traveler as any).id || null,
            issync: !!(traveler as any).traveler_id || !!(traveler as any).travelerId || !!(traveler as any).id,
            trip_id: (traveler as any).trip_id || (traveler as any).tripId || (traveler as any).trip_id,
            name: traveler.name,
            email: (traveler as any).email,
            icon: (traveler as any).icon,
          })
        }

        // Migrate expenses
        for (const expense of oldExpenses) {
          await tx.table('expenses').add({
            expense_id: (expense as any).expense_id || (expense as any).expenseId || (expense as any).id || null,
            issync: !!(expense as any).expense_id || !!(expense as any).expenseId || !!(expense as any).id,
            trip_id: (expense as any).trip_id || (expense as any).tripId || (expense as any).trip_id,
            title: expense.title,
            amount: expense.amount,
            payer_id: (expense as any).payer_id,
            charged_to: (expense as any).charged_to,
            datetime: (expense as any).datetime,
          })
        }

        // Migrate itinerary
        for (const item of oldItinerary) {
          await tx.table('itinerary').add({
            itinerary_id: (item as any).itinerary_id || (item as any).itineraryId || (item as any).id || null,
            issync: !!(item as any).itinerary_id || !!(item as any).itineraryId || !!(item as any).id,
            trip_id: (item as any).trip_id || (item as any).tripId || (item as any).trip_id,
            day_index: (item as any).day_index,
            title: item.title,
            time: (item as any).time,
            place_id: (item as any).place_id,
            url: (item as any).url,
            remark: (item as any).remark,
            map_link: (item as any).map_link,
            lat: (item as any).lat,
            lng: (item as any).lng,
            place_name: (item as any).place_name,
            order: (item as any).order,
          })
        }

        // Migrate places
        for (const place of oldPlaces) {
          await tx.table('places').add({
            place_id: (place as any).place_id || (place as any).placeId || (place as any).id || null,
            issync: !!(place as any).place_id || !!(place as any).placeId || !!(place as any).id,
            trip_id: (place as any).trip_id || (place as any).tripId || (place as any).trip_id,
            title: place.title,
            lat: (place as any).lat,
            lng: (place as any).lng,
            url: (place as any).url,
          })
        }

        // Migrate users
        for (const user of oldUsers) {
          await tx.table('users').add({
            user_id: (user as any).user_id || (user as any).userId || (user as any).id || null,
            issync: !!(user as any).user_id || !!(user as any).userId || !!(user as any).id,
            username: (user as any).username || (user as any).clerk_id,
            birthday: (user as any).birthday,
            gender: (user as any).gender,
            short_code: (user as any).short_code,
          })
        }
      })

    // V6: Bump to ensure indexes (like trip_id) exist in existing databases
    this.version(6).stores({
      users: '++__dexieid, user_id, issync, username, birthday, gender, short_code',
      trips: '++__dexieid, title, trip_id, issync, owner_id',
      places: '++__dexieid, trip_id, place_id, issync',
      itinerary: '++__dexieid, trip_id, itinerary_id, issync',
      packing: '++__dexieid, trip_id, packing_id, issync',
      travelers: '++__dexieid, trip_id, traveler_id, issync',
      expenses: '++__dexieid, trip_id, expense_id, issync'
    })

    // V7: Add user identity fields + owner_id index
    this.version(7).stores({
      users: '++__dexieid, user_id, issync, username, birthday, gender, short_code',
      trips: '++__dexieid, title, trip_id, issync, owner_id',
      places: '++__dexieid, trip_id, place_id, issync',
      itinerary: '++__dexieid, trip_id, itinerary_id, issync',
      packing: '++__dexieid, trip_id, packing_id, issync',
      travelers: '++__dexieid, trip_id, traveler_id, issync',
      expenses: '++__dexieid, trip_id, expense_id, issync'
    })

    // V8: Add short_code index for identity recovery
    this.version(8).stores({
      users: '++__dexieid, user_id, issync, username, birthday, gender, short_code',
      trips: '++__dexieid, title, trip_id, issync, owner_id',
      places: '++__dexieid, trip_id, place_id, issync',
      itinerary: '++__dexieid, trip_id, itinerary_id, issync',
      packing: '++__dexieid, trip_id, packing_id, issync',
      travelers: '++__dexieid, trip_id, traveler_id, issync',
      expenses: '++__dexieid, trip_id, expense_id, issync'
    })
  }
}

export const db = new TravelDB()

export default db
