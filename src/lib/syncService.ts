import { supabase } from './supabase'
import { db, TripItem, PackingItem, TravelerItem, ExpenseItem, ItineraryItem } from './db'
import { getLocalUserIdentity, isLocalUserId } from './userIdentity'

/**
 * Sync Service: Hybrid mode with Dexie cache + Supabase
 * - When online: fetch from Supabase, return directly (don't cache UUID-based data)
 * - When offline: use Dexie cache only
 */

export async function isOnline(): Promise<boolean> {
    if (typeof window === 'undefined') return true
    return navigator.onLine
}

// IMPORTANT: Supabase uses UUID (string) primary keys
// Dexie uses integer primary keys. We do NOT try to cache Supabase data 
// in Dexie to avoid parseInt(UUID) = NaN errors.

// ============= TRIPS =============

export async function getTrip(tripId: string | number) {
    const online = await isOnline()

    if (online) {
        try {
            const { data, error } = await supabase
                .from('trips')
                .select('*')
                .eq('trip_id', String(tripId))
                .single()

            if (!error && data) {
                // Return directly from Supabase, don't cache UUID
                return data
            } else {
                console.log('Supabase error:', error)
            }
        } catch (err) {
            console.log('Error fetching from Supabase, using cache:', err)
        }
    }

    // Fallback: load from cache (only if tripId is a number)
    if (typeof tripId === 'number') {
        const cached = await db.trips.get(tripId)
        return cached || null
    }
    return null
}

export async function syncTripFromSupabase(tripId: string): Promise<void> {
    const online = await isOnline()
    if (!online || !tripId) return

    const [itineraryRes, packingRes, travelersRes, expensesRes] = await Promise.all([
        supabase.from('itinerary').select('*').eq('trip_id', String(tripId)),
        supabase.from('packing').select('*').eq('trip_id', String(tripId)),
        supabase.from('travelers').select('*').eq('trip_id', String(tripId)),
        supabase.from('expenses').select('*').eq('trip_id', String(tripId)),
    ])

    if (itineraryRes.error) console.log('Error syncing itinerary:', itineraryRes.error)
    if (packingRes.error) console.log('Error syncing packing:', packingRes.error)
    if (travelersRes.error) console.log('Error syncing travelers:', travelersRes.error)
    if (expensesRes.error) console.log('Error syncing expenses:', expensesRes.error)

    await db.transaction('rw', db.itinerary, db.packing, db.travelers, db.expenses, async () => {
        await db.itinerary.where('trip_id').equals(tripId).delete()
        await db.packing.where('trip_id').equals(tripId).delete()
        await db.travelers.where('trip_id').equals(tripId).delete()
        await db.expenses.where('trip_id').equals(tripId).delete()

        if (itineraryRes.data?.length) {
            await db.itinerary.bulkAdd(
                itineraryRes.data.map((item: any) => ({
                    itinerary_id: item.itinerary_id,
                    trip_id: item.trip_id,
                    issync: true,
                    day_index: item.day_index,
                    title: item.title,
                    time: item.time,
                    url: item.url,
                    remark: item.remark,
                    map_link: item.map_link,
                    lat: item.lat,
                    lng: item.lng,
                    place_name: item.place_name,
                    order: item.order,
                }))
            )
        }

        if (packingRes.data?.length) {
            await db.packing.bulkAdd(
                packingRes.data.map((item: any) => ({
                    packing_id: item.packing_id,
                    trip_id: item.trip_id,
                    issync: true,
                    title: item.title,
                    completed: item.completed,
                    color: item.color,
                    order: item.order,
                }))
            )
        }

        if (travelersRes.data?.length) {
            await db.travelers.bulkAdd(
                travelersRes.data.map((item: any) => ({
                    traveler_id: item.traveler_id,
                    trip_id: item.trip_id,
                    issync: true,
                    name: item.name,
                    email: item.email,
                    icon: item.icon,
                }))
            )
        }

        if (expensesRes.data?.length) {
            await db.expenses.bulkAdd(
                expensesRes.data.map((item: any) => ({
                    expense_id: item.expense_id,
                    trip_id: item.trip_id,
                    issync: true,
                    title: item.title,
                    amount: item.amount,
                    payer_id: item.payer_id ?? undefined,
                    charged_to: typeof item.charged_to === 'string'
                        ? JSON.parse(item.charged_to)
                        : item.charged_to,
                    datetime: item.datetime,
                }))
            )
        }
    })
}

export async function getUserTrips() {
    const online = await isOnline()
    const identity = getLocalUserIdentity()
    const ownerId = identity?.user_id ?? null

    if (online) {
        try {
            if (!ownerId || isLocalUserId(ownerId)) {
                return []
            }

            const { data, error } = await supabase
                .from('trips')
                .select('*')
                .eq('is_public', false)
                .eq('owner_id', ownerId)
                .order('updated_at', { ascending: false })

            if (!error && data) {
                // Normalize ID fields for routing compatibility
                return data.map((item: any) => ({
                    ...item,
                    trip_id: item.trip_id ?? item.id
                }))
            } else {
                console.log('Supabase error:', error)
            }
        } catch (err) {
            console.log('Error fetching trips from Supabase, using cache:', err)
        }
    }

    if (!ownerId) return []

    // Fallback: return local trips for the current user
    return await db.trips.filter((trip) => trip.owner_id === ownerId || trip.owner_id == null).toArray()
}

export async function importTripsToSupabase(
    tripsData: any[],
    options?: { includeRelated?: boolean }
): Promise<Array<{ localTripId?: string; supaTripId?: string }>> {
    const online = await isOnline()
    if (!online) {
        console.log('Offline: skipping Supabase import')
        return []
    }

    const identity = getLocalUserIdentity()
    const ownerId = identity?.user_id ?? null
    const remoteOwnerId = ownerId && !isLocalUserId(ownerId) ? ownerId : null

    const includeRelated = options?.includeRelated ?? false
    const results: Array<{ localTripId?: string; supaTripId?: string }> = []

    try {
        for (const tripData of tripsData) {
            const trip = tripData.trip
            if (!trip) continue

            const { data, error } = await supabase
                .from('trips')
                .insert([{
                    title: trip.title,
                    start_date: trip.start_date ?? trip.startDate,
                    end_date: trip.end_date ?? trip.endDate,
                    is_public: false,
                    owner_id: remoteOwnerId ?? trip.owner_id ?? undefined,
                }])
                .select()
                .single()

            if (!error && data) {
                const supaTripId = data.trip_id ?? data.id
                const localTripId = tripData.local_trip_id ?? trip.trip_id ?? (trip.__dexieid ? String(trip.__dexieid) : undefined)
                results.push({ localTripId, supaTripId })
                console.log('Trip imported to Supabase:', supaTripId)

                if (includeRelated) {
                    const travelerIdMap = new Map<string, string>()

                    if (Array.isArray(tripData.travelers)) {
                        for (const traveler of tripData.travelers) {
                            const { data: travelerRow, error: travelerError } = await supabase
                                .from('travelers')
                                .insert([
                                    {
                                        trip_id: supaTripId,
                                        name: traveler.name,
                                        email: traveler.email,
                                        icon: traveler.icon,
                                    },
                                ])
                                .select()
                                .single()

                            if (travelerError) {
                                console.log('Error importing traveler to Supabase:', travelerError)
                            }
                            if (!travelerError && travelerRow && traveler.traveler_id !== undefined) {
                                travelerIdMap.set(String(traveler.traveler_id), travelerRow.traveler_id)
                            }
                        }
                    }

                    if (Array.isArray(tripData.itinerary) && tripData.itinerary.length > 0) {
                        const rows = tripData.itinerary.map((item: any) => ({
                            trip_id: supaTripId,
                            day_index: item.day_index,
                            title: item.title,
                            time: item.time,
                            url: item.url,
                            remark: item.remark,
                            map_link: item.map_link,
                            lat: item.lat,
                            lng: item.lng,
                            place_name: item.place_name,
                            order: item.order,
                        }))
                        const { error: itineraryError } = await supabase.from('itinerary').insert(rows)
                        if (itineraryError) {
                            console.log('Error importing itinerary to Supabase:', itineraryError)
                        }
                    }

                    if (Array.isArray(tripData.packing) && tripData.packing.length > 0) {
                        const rows = tripData.packing.map((item: any) => ({
                            trip_id: supaTripId,
                            title: item.title,
                            completed: item.completed,
                            color: item.color,
                            order: item.order,
                        }))
                        const { error: packingError } = await supabase.from('packing').insert(rows)
                        if (packingError) {
                            console.log('Error importing packing to Supabase:', packingError)
                        }
                    }

                    if (Array.isArray(tripData.expenses) && tripData.expenses.length > 0) {
                        const rows = tripData.expenses.map((item: any) => {
                            const mappedPayer = item.payer_id !== undefined
                                ? travelerIdMap.get(String(item.payer_id))
                                : undefined
                            const mappedCharged = Array.isArray(item.charged_to)
                                ? item.charged_to
                                    .map((id: number) => travelerIdMap.get(String(id)))
                                    .filter((id: string | undefined): id is string => !!id)
                                : undefined

                            return {
                                trip_id: supaTripId,
                                title: item.title,
                                amount: item.amount,
                                payer_id: mappedPayer,
                                charged_to: mappedCharged ? JSON.stringify(mappedCharged) : undefined,
                                datetime: item.datetime,
                            }
                        })
                        const { error: expensesError } = await supabase.from('expenses').insert(rows)
                        if (expensesError) {
                            console.log('Error importing expenses to Supabase:', expensesError)
                        }
                    }
                }
            } else {
                console.log('Error importing trip to Supabase:', error)
            }
        }
    } catch (err) {
        console.log('Error in importTripsToSupabase:', err)
    }

    return results
}

export async function createTrip(title: string) {
    const online = await isOnline()
    const identity = getLocalUserIdentity()
    const ownerId = identity?.user_id ?? null
    const remoteOwnerId = ownerId && !isLocalUserId(ownerId) ? ownerId : null

    if (!online) {
        // Offline: save to local with tripId = numeric __dexieId
        const numericId = await db.trips.add({
            title,
            is_public: false,
            updated_at: Date.now(),
            owner_id: ownerId ?? undefined,
        })
        // Set trip_id to the numeric ID string after creation
        await db.trips.update(numericId, { trip_id: String(numericId) })
        const trip = await db.trips.get(numericId)
        return trip || null
    }

    try {
        const { data, error } = await supabase
            .from('trips')
            .insert([{ title, is_public: false, owner_id: remoteOwnerId ?? undefined }])
            .select()
            .single()

        if (!error && data) {
            const tripId = data.trip_id ?? data.id
            // Store to Dexie with Supabase UUID and mark as synced
            const numericId = await db.trips.add({
                title: data.title,
                is_public: data.is_public,
                trip_id: tripId, // Supabase UUID
                issync: true,
                owner_id: data.owner_id ?? ownerId ?? undefined,
                created_at: data.created_at,
                updated_at: data.updated_at,
            })
            const trip = await db.trips.get(numericId)
            return trip || null
        }
    } catch (err) {
        console.log('Error creating trip on Supabase, saving locally:', err)
        // Fallback: save locally with numeric trip_id
        const numericId = await db.trips.add({
            title,
            is_public: false,
            updated_at: Date.now(),
            owner_id: ownerId ?? undefined,
        })
        await db.trips.update(numericId, { trip_id: String(numericId) })
        const trip = await db.trips.get(numericId)
        return trip || null
    }

    return null
}

export async function updateTrip(
    tripId: string | number | null,
    updates: { title?: string; startDate?: string; endDate?: string }
) {
    const online = await isOnline()

    if (!online) {
        // Offline: update local only (only if numeric ID)
        if (typeof tripId === 'number') {
            await db.trips.update(tripId, {
                title: updates.title,
                start_date: updates.startDate,
                end_date: updates.endDate,
                updated_at: Date.now(),
            })
            return await db.trips.get(tripId)
        }
        return null
    }

    try {
        const { data, error } = await supabase
            .from('trips')
            .update({
                title: updates.title,
                start_date: updates.startDate,
                end_date: updates.endDate,
            })
            .eq('trip_id', String(tripId))
            .select()
            .single()

        if (!error && data) {
            // Update cache if numeric ID
            if (typeof tripId === 'number') {
                await db.trips.update(tripId, {
                    title: data.title,
                    start_date: data.start_date,
                    end_date: data.end_date,
                    updated_at: new Date(data.updated_at).getTime(),
                })
                return await db.trips.get(tripId)
            }
            // Return Supabase data directly for UUID
            return data
        }
    } catch (err) {
        console.log('Error updating trip on Supabase:', err)
        // Fallback: update local only
        if (typeof tripId === 'number') {
            await db.trips.update(tripId, {
                title: updates.title,
                start_date: updates.startDate,
                end_date: updates.endDate,
                updated_at: Date.now(),
            })
            return await db.trips.get(tripId)
        }
    }

    return null
}

export async function deleteTrip(tripId: string | number): Promise<boolean> {
    const online = await isOnline()

    if (!online) {
        if (typeof tripId === 'number') {
            await db.trips.delete(tripId)
        }
        return true
    }

    try {
        const { error } = await supabase.from('trips').delete().eq('trip_id', String(tripId))

        if (!error) {
            if (typeof tripId === 'number') {
                await db.trips.delete(tripId)
            }
            return true
        }
    } catch (err) {
        console.log('Error deleting trip:', err)
        if (typeof tripId === 'number') {
            await db.trips.delete(tripId)
        }
    }

    return false
}

// ============= PACKING =============

export async function getPackingItems(tripId: string | null): Promise<PackingItem[]> {
    const online = await isOnline()

    if (online) {
        try {
            const { data, error } = await supabase
                .from('packing')
                .select('*')
                .eq('trip_id', String(tripId))
                .order('order', { ascending: true })

            if (!error && data) {
                // Return directly, don't cache UUID-based data
                return data.map((item: any) => ({
                    packing_id: item.packing_id,
                    trip_id: item.trip_id,
                    issync: true,
                    title: item.title,
                    completed: item.completed,
                    color: item.color,
                    order: item.order,
                }))
            }
        } catch (err) {
            console.log('Error fetching packing items, using cache:', err)
        }
    }

    // Fallback
    if (!tripId) return [];
    return await db.packing.where('trip_id').equals(tripId).sortBy('order')
}

export async function addPackingItem(
    tripId: string | null,
    item: { title: string; color?: string; order: number }
): Promise<PackingItem | null> {
    const online = await isOnline()

    if (!online) {
        const id = await db.packing.add({
            trip_id: tripId,
            title: item.title,
            completed: false,
            color: item.color,
            order: item.order,
            issync: false,
        })
        return (await db.packing.get(id)) ?? null
    }

    try {
        const { data, error } = await supabase
            .from('packing')
            .insert([
                {
                    trip_id: String(tripId),
                    title: item.title,
                    completed: false,
                    color: item.color,
                    order: item.order,
                },
            ])
            .select()
            .single()

        if (!error && data) {
            const packingItem: PackingItem = {
                packing_id: data.packing_id,
                trip_id: tripId,
                issync: true,
                title: data.title,
                completed: data.completed,
                color: data.color,
                order: data.order,
            }
            return packingItem
        }
    } catch (err) {
        console.log('Error adding packing item to Supabase, saving locally:', err)
        const id = await db.packing.add({
            trip_id: tripId,
            title: item.title,
            completed: false,
            color: item.color,
            order: item.order,
            issync: false,
        })
        return (await db.packing.get(id)) ?? null
    }

    return null
}

export async function updatePackingItem(
    tripId: string | null | number | undefined,
    itemId: number | string | undefined,
    updates: { completed?: boolean; color?: string; order?: number }
): Promise<PackingItem | null> {
    if (!itemId) return null

    const online = await isOnline()

    // If itemId is a number, it's a Dexie ID
    if (typeof itemId === 'number') {
        if (!online) {
            await db.packing.update(itemId, updates)
            return (await db.packing.get(itemId)) ?? null
        }

        try {
            // Get item from Dexie to find packing_id
            const item = await db.packing.get(itemId)
            if (!item || !item.packing_id) {
                // If no packing_id, can't sync to Supabase, just update locally
                await db.packing.update(itemId, updates)
                return (await db.packing.get(itemId)) ?? null
            }

            const { data, error } = await supabase
                .from('packing')
                .update({
                    completed: updates.completed,
                    color: updates.color,
                    order: updates.order,
                })
                .eq('packing_id', item.packing_id)
                .select()
                .single()

            if (!error && data) {
                await db.packing.update(itemId, {
                    completed: data.completed,
                    color: data.color,
                    order: data.order,
                })
                return (await db.packing.get(itemId)) ?? null
            }
        } catch (err) {
            console.log('Error updating packing item:', err)
            await db.packing.update(itemId, updates)
            return (await db.packing.get(itemId)) ?? null
        }
    } else {
        // itemId is a string (packing_id from Supabase)
        try {
            const { data, error } = await supabase
                .from('packing')
                .update({
                    completed: updates.completed,
                    color: updates.color,
                    order: updates.order,
                })
                .eq('packing_id', itemId)
                .select()
                .single()

            if (!error && data) {
                return data as PackingItem
            }
        } catch (err) {
            console.log('Error updating packing item:', err)
        }
    }

    return null
}

export async function deletePackingItem(tripId: string | null | number | undefined, itemId: number | string | undefined): Promise<boolean> {
    if (!itemId) return false

    const online = await isOnline()

    if (!online) {
        if (typeof itemId === 'number') {
            await db.packing.delete(itemId)
        }
        return true
    }

    try {
        let packingId: string | null = null

        // If itemId is a number, it's a Dexie ID - fetch packing_id from item
        if (typeof itemId === 'number') {
            const item = await db.packing.get(itemId)
            packingId = item?.packing_id || null
        } else {
            // itemId is already a string (packing_id from Supabase)
            packingId = itemId
        }

        if (!packingId) {
            // Can't delete from Supabase without packing_id, just delete from Dexie
            if (typeof itemId === 'number') {
                await db.packing.delete(itemId)
            }
            return true
        }

        const { error } = await supabase.from('packing').delete().eq('packing_id', packingId)

        if (!error) {
            if (typeof itemId === 'number') {
                await db.packing.delete(itemId)
            }
            return true
        }
    } catch (err) {
        console.log('Error deleting packing item:', err)
        if (typeof itemId === 'number') {
            await db.packing.delete(itemId)
        }
    }

    return false
}

// ============= TRAVELERS =============

export async function getTravelers(tripId: string | null): Promise<TravelerItem[]> {
    const online = await isOnline()

    if (online) {
        try {
            const { data, error } = await supabase
                .from('travelers')
                .select('*')
                .eq('trip_id', String(tripId))

            if (!error && data) {
                // Return directly, don't cache UUID-based data
                return data.map((item: any) => ({
                    traveler_id: item.traveler_id,
                    trip_id: item.trip_id,
                    issync: true,
                    name: item.name,
                    email: item.email,
                    icon: item.icon,
                }))
            }
        } catch (err) {
            console.log('Error fetching travelers, using cache:', err)
        }
    }

    return !tripId ? [] : await db.travelers.where('trip_id').equals(tripId).toArray()
}

export async function addTraveler(
    tripId: string | null,
    traveler: { name: string; email?: string; icon?: string }
): Promise<TravelerItem | null> {
    const online = await isOnline()

    if (!online) {
        const id = await db.travelers.add({
            trip_id: tripId,
            issync: false,
            ...traveler,
        })
        return (await db.travelers.get(id)) ?? null
    }

    try {
        const { data, error } = await supabase
            .from('travelers')
            .insert([{ trip_id: String(tripId), ...traveler }])
            .select()
            .single()

        if (!error && data) {
            const item: TravelerItem = {
                traveler_id: data.traveler_id,
                trip_id: tripId,
                issync: true,
                name: data.name,
                email: data.email,
                icon: data.icon,
            }
            return item
        }
    } catch (err) {
        console.log('Error adding traveler:', err)
        const id = await db.travelers.add({ trip_id: tripId, issync: false, ...traveler })
        return (await db.travelers.get(id)) ?? null
    }

    return null
}

export async function deleteTraveler(tripId: string | null, travelerId: number): Promise<boolean> {
    const online = await isOnline()

    if (!online) {
        if (typeof travelerId === 'number') {
            await db.travelers.delete(travelerId)
        }
        return true
    }

    try {
        const { error } = await supabase.from('travelers').delete().eq('traveler_id', String(travelerId))

        if (!error) {
            if (typeof travelerId === 'number') {
                await db.travelers.delete(travelerId)
            }
            return true
        }
    } catch (err) {
        console.log('Error deleting traveler:', err)
        if (typeof travelerId === 'number') {
            await db.travelers.delete(travelerId)
        }
    }

    return false
}

// ============= EXPENSES =============

export async function getExpenses(tripId: string | null): Promise<ExpenseItem[]> {
    const online = await isOnline()

    if (online) {
        try {
            if (!tripId) return []
            const { data, error } = await supabase
                .from('expenses')
                .select('*')
                .eq('trip_id', String(tripId))

            if (!error && data) {
                return data.map((item: any) => ({
                    expense_id: item.expense_id,
                    trip_id: item.trip_id,
                    issync: true,
                    title: item.title,
                    amount: item.amount,
                    payer_id: item.payer_id ?? undefined,
                    charged_to: item.charged_to ? JSON.parse(item.charged_to) : undefined,
                    datetime: item.datetime,
                }))
            }
        } catch (err) {
            console.log('Error fetching expenses, using cache:', err)
        }
    }

    return !tripId ? [] : await db.expenses.where('trip_id').equals(tripId).toArray()
}

export async function addExpense(
    tripId: string | null,
    expense: { title: string; amount: number; payer_id: string | number; charged_to: Array<string | number>; datetime: string }
): Promise<ExpenseItem | null> {
    const online = await isOnline()

    if (!online) {
        const id = await db.expenses.add({
            trip_id: tripId,
            issync: false,
            ...expense,
        })
        return (await db.expenses.get(id)) ?? null
    }

    try {
        const { data, error } = await supabase
            .from('expenses')
            .insert([
                {
                    trip_id: String(tripId),
                    title: expense.title,
                    amount: expense.amount,
                    payer_id: String(expense.payer_id),
                    charged_to: JSON.stringify(expense.charged_to),
                    datetime: expense.datetime,
                },
            ])
            .select()
            .single()

        if (!error && data) {
            const item: ExpenseItem = {
                expense_id: data.expense_id,
                trip_id: tripId,
                issync: true,
                title: data.title,
                amount: data.amount,
                payer_id: data.payer_id ? parseInt(data.payer_id) : undefined,
                charged_to: data.charged_to ? JSON.parse(data.charged_to) : undefined,
                datetime: data.datetime,
            }
            return item
        }
    } catch (err) {
        console.log('Error adding expense:', err)
        const id = await db.expenses.add({
            trip_id: tripId,
            issync: false,
            ...expense,
        })
        return (await db.expenses.get(id)) ?? null
    }

    return null
}

export async function deleteExpense(tripId: string | null, expenseId: number): Promise<boolean> {
    const online = await isOnline()

    if (!online) {
        if (typeof expenseId === 'number') {
            await db.expenses.delete(expenseId)
        }
        return true
    }

    try {
        const { error } = await supabase.from('expenses').delete().eq('expense_id', String(expenseId))

        if (!error) {
            if (typeof expenseId === 'number') {
                await db.expenses.delete(expenseId)
            }
            return true
        }
    } catch (err) {
        console.log('Error deleting expense:', err)
        if (typeof expenseId === 'number') {
            await db.expenses.delete(expenseId)
        }
    }

    return false
}

// ============= ITINERARY =============

export async function getItineraryItems(tripId: string | null): Promise<ItineraryItem[]> {
    const online = await isOnline()

    if (online) {
        try {
            const { data, error } = await supabase
                .from('itinerary')
                .select('*')
                .eq('trip_id', String(tripId))
                .order('day_index', { ascending: true })
                .order('order', { ascending: true })

            if (!error && data) {
                // Return directly, don't cache UUID-based data
                return data.map((item: any) => ({
                    itinerary_id: item.itinerary_id,
                    trip_id: item.trip_id,
                    day_index: item.day_index,
                    title: item.title,
                    time: item.time,
                    url: item.url,
                    remark: item.remark,
                    map_link: item.map_link,
                    lat: item.lat,
                    lng: item.lng,
                    place_name: item.place_name,
                    order: item.order,
                    issync: true,
                }))
            }
        } catch (err) {
            console.log('Error fetching itinerary, using cache:', err)
        }
    }

    return !tripId ? [] : await db.itinerary.where('trip_id').equals(tripId).sortBy('day_index')
}

export async function addItineraryItem(
    tripId: string | null,
    item: {
        dayIndex: number
        title: string
        time?: string
        url?: string
        remark?: string
        mapLink?: string
        lat?: number
        lng?: number
        placeName?: string
        order: number
    }
): Promise<ItineraryItem | null> {
    const online = await isOnline()

    if (!online) {
        const id = await db.itinerary.add({
            trip_id: tripId ?? undefined,
            day_index: item.dayIndex,
            title: item.title,
            time: item.time,
            url: item.url,
            remark: item.remark,
            map_link: item.mapLink,
            lat: item.lat,
            lng: item.lng,
            place_name: item.placeName,
            order: item.order,
        })
        return (await db.itinerary.get(id)) ?? null
    }

    try {
        const { data, error } = await supabase
            .from('itinerary')
            .insert([
                {
                    trip_id: String(tripId),
                    day_index: item.dayIndex,
                    title: item.title,
                    time: item.time,
                    url: item.url,
                    remark: item.remark,
                    map_link: item.mapLink,
                    lat: item.lat,
                    lng: item.lng,
                    place_name: item.placeName,
                    order: item.order,
                },
            ])
            .select()
            .single()

        if (!error && data) {
            return {
                __dexieid: undefined,
                itinerary_id: data.itinerary_id,
                trip_id: data.trip_id,
                day_index: data.day_index,
                title: data.title,
                time: data.time,
                url: data.url,
                remark: data.remark,
                map_link: data.map_link,
                lat: data.lat,
                lng: data.lng,
                place_name: data.place_name,
                order: data.order,
                issync: true,
            }
        }
    } catch (err) {
        console.log('Error adding itinerary item:', err)
        const id = await db.itinerary.add({
            trip_id: tripId ?? undefined,
            day_index: item.dayIndex,
            title: item.title,
            time: item.time,
            url: item.url,
            remark: item.remark,
            map_link: item.mapLink,
            lat: item.lat,
            lng: item.lng,
            place_name: item.placeName,
            order: item.order,
        })
        return (await db.itinerary.get(id)) ?? null
    }

    return null
}

export async function deleteItineraryItem(tripId: string | null | number | undefined, itemId: number): Promise<boolean> {
    const online = await isOnline()

    if (!online) {
        if (typeof itemId === 'number') {
            await db.itinerary.delete(itemId)
        }
        return true
    }

    try {
        const { error } = await supabase.from('itinerary').delete().eq('itinerary_id', String(itemId))

        if (!error) {
            if (typeof itemId === 'number') {
                await db.itinerary.delete(itemId)
            }
            return true
        }
    } catch (err) {
        console.log('Error deleting itinerary item:', err)
        if (typeof itemId === 'number') {
            await db.itinerary.delete(itemId)
        }
    }

    return false
}

// ============= USERS & AUTHENTICATION =============

const USERNAME_REGEX = /^[A-Za-z0-9]+$/
const SHORT_CODE_REGEX = /^[A-Z0-9]{4,6}$/

/**
 * Check if a username is available (not already taken)
 */
export async function checkUsernameAvailable(
    username: string,
    birthday: string,
    gender: string,
    shortCode?: string
): Promise<boolean> {
    if (!username || username.length < 3) {
        return false
    }

    if (!USERNAME_REGEX.test(username)) {
        return false
    }

    const normalizedShortCode = shortCode?.trim().toUpperCase() ?? ''
    if (normalizedShortCode) {
        if (!SHORT_CODE_REGEX.test(normalizedShortCode)) {
            return false
        }
    } else if (!birthday || !gender) {
        return false
    }

    try {
        const query = supabase
            .from('users')
            .select('username')
            .eq('username', username)

        const { data, error } = normalizedShortCode
            ? await query.eq('short_code', normalizedShortCode).maybeSingle()
            : await query.eq('birthday', birthday).eq('gender', gender).maybeSingle()

        if (error) {
            console.error('Error checking username availability:', error)
            return false
        }

        // If data exists, username is taken
        return !data
    } catch (err) {
        console.error('Error checking username:', err)
        return false
    }
}

/**
 * Get or create a user by username
 */
export async function getOrCreateUser(
    username: string,
    birthday: string,
    gender: string,
    shortCode?: string
) {
    if (!username || username.length < 3) {
        throw new Error('Username must be at least 3 characters')
    }

    if (!USERNAME_REGEX.test(username)) {
        throw new Error('Username must contain only letters and numbers')
    }

    const normalizedShortCode = shortCode?.trim().toUpperCase() ?? ''
    if (normalizedShortCode && !SHORT_CODE_REGEX.test(normalizedShortCode)) {
        throw new Error('Short code must be 4-6 letters or numbers')
    }

    if (!normalizedShortCode && (!birthday || !gender)) {
        throw new Error('Birthday and gender are required')
    }

    try {
        // Check if user already exists
        const query = supabase
            .from('users')
            .select('*')
            .eq('username', username)

        const { data: existingUser, error: fetchError } = normalizedShortCode
            ? await query.eq('short_code', normalizedShortCode).maybeSingle()
            : await query.eq('birthday', birthday).eq('gender', gender).maybeSingle()

        if (existingUser) {
            return existingUser
        }

        if (!birthday || !gender) {
            throw new Error('Birthday and gender are required to create a new user')
        }

        // Create new user
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{ username, birthday, gender, short_code: normalizedShortCode || null }])
            .select()
            .single()

        if (insertError) {
            throw insertError
        }

        return newUser
    } catch (err) {
        console.error('Error getting or creating user:', err)
        throw err
    }
}

/**
 * Get current user by username
 */
export async function getUserByUsername(username: string, birthday: string, gender: string, shortCode?: string) {
    try {
        const normalizedShortCode = shortCode?.trim().toUpperCase() ?? ''
        const query = supabase
            .from('users')
            .select('*')
            .eq('username', username)

        const { data, error } = normalizedShortCode
            ? await query.eq('short_code', normalizedShortCode).maybeSingle()
            : await query.eq('birthday', birthday).eq('gender', gender).maybeSingle()

        if (error) {
            throw error
        }

        return data
    } catch (err) {
        console.error('Error fetching user:', err)
        return null
    }
}

