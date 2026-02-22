import Dexie, { Table } from 'dexie'

export interface UserItem { User_ID?: number; clerkId?: string | null; name?: string }
export interface TripItem { Trip_ID?: number; User_ID?: number; title: string; startDate?: string; endDate?: string; updatedAt?: number }
export interface PlaceItem { Place_ID?: number; Trip_ID?: number; title: string; lat?: number; lng?: number; url?: string }
export interface ItineraryItem { Itinerary_ID?: number; Trip_ID?: number; dayIndex: number; title: string; time?: string; place_ID?: number; url?: string; remark?: string; mapLink?: string; lat?: number; lng?: number; placeName?: string; order?: number }
export interface PackingItem { Packing_ID?: number; Trip_ID?: number; title: string; completed: boolean; color?: string; order: number }
export interface TravelerItem { Traveler_ID?: number; Trip_ID?: number; name: string; email?: string; icon?: string }
export interface ExpenseItem { Expense_ID?: number; Trip_ID?: number; title: string; amount: number; payer_ID?: number; chargedTo?: number[]; datetime?: string }

class TravelDB extends Dexie {
  users!: Table<UserItem, number>
  trips!: Table<TripItem, number>
  places!: Table<PlaceItem, number>
  itinerary!: Table<ItineraryItem, number>
  packing!: Table<PackingItem, number>
  travelers!: Table<TravelerItem, number>
  expenses!: Table<ExpenseItem, number>

  constructor() {
    super('TravelPlannerDB')
    this.version(1).stores({
      users: '++User_ID, clerkId, name',
      trips: '++Trip_ID, User_ID, title, startDate, endDate, updatedAt',
      places: '++Place_ID, Trip_ID, title, lat, lng',
      itinerary: '++Itinerary_ID, Trip_ID, dayIndex, title',
      packing: '++Packing_ID, Trip_ID, order, completed',
      travelers: '++Traveler_ID, Trip_ID, name, email',
      expenses: '++Expense_ID, Trip_ID, title, amount, payer_ID'
    })
    // Version 2: Add url, remark, mapLink, lat, lng to itinerary items
    this.version(2).stores({
      users: '++User_ID, clerkId, name',
      trips: '++Trip_ID, User_ID, title, startDate, endDate, updatedAt',
      places: '++Place_ID, Trip_ID, title, lat, lng',
      itinerary: '++Itinerary_ID, Trip_ID, dayIndex, title',
      packing: '++Packing_ID, Trip_ID, order, completed',
      travelers: '++Traveler_ID, Trip_ID, name, email',
      expenses: '++Expense_ID, Trip_ID, title, amount, payer_ID'
    })
  }
}

export const db = new TravelDB()

export default db
