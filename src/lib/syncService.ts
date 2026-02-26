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

    try {
        const [itineraryRes, packingRes, travelersRes, expensesRes] = await Promise.all([
            supabase.from('itinerary').select('*').eq('trip_id', String(tripId)),
            supabase.from('packing').select('*').eq('trip_id', String(tripId)),
            supabase.from('travelers').select('*').eq('trip_id', String(tripId)),
            supabase.from('expenses').select('*').eq('trip_id', String(tripId)),
        ])

        // Check for Supabase query errors and return early
        if (itineraryRes.error || packingRes.error || travelersRes.error || expensesRes.error) {
            console.error('Supabase sync errors:', {
                itinerary: itineraryRes.error,
                packing: packingRes.error,
                travelers: travelersRes.error,
                expenses: expensesRes.error,
            })
            throw new Error('Failed to fetch data from Supabase')
        }

        // Validate data before transaction
        const itineraryData = (itineraryRes.data || []).map((item: any) => ({
            itinerary_id: item.itinerary_id,
            trip_id: item.trip_id,
            issync: true,
            day_index: item.day_index ?? 0,
            title: item.title ?? '',
            time: item.time,
            url: item.url,
            remark: item.remark,
            map_link: item.map_link,
            lat: item.lat,
            lng: item.lng,
            place_name: item.place_name,
            order: item.order ?? 0,
        }))

        const packingData = (packingRes.data || []).map((item: any) => ({
            packing_id: item.packing_id,
            trip_id: item.trip_id,
            issync: true,
            title: item.title ?? '',
            completed: item.completed ?? false,
            color: item.color,
            order: item.order ?? 0,
        }))

        const travelersData = (travelersRes.data || []).map((item: any) => ({
            traveler_id: item.traveler_id,
            trip_id: item.trip_id,
            issync: true,
            name: item.name ?? '',
            email: item.email,
            icon: item.icon,
        }))

        const expensesData = (expensesRes.data || []).map((item: any) => {
            let chargedTo: any = undefined
            try {
                chargedTo = typeof item.charged_to === 'string'
                    ? JSON.parse(item.charged_to)
                    : item.charged_to
            } catch (parseError) {
                console.warn('Failed to parse charged_to for expense:', item.expense_id, parseError)
                chargedTo = undefined
            }
            return {
                expense_id: item.expense_id,
                trip_id: item.trip_id,
                issync: true,
                title: item.title ?? '',
                amount: item.amount ?? 0,
                payer_id: item.payer_id ?? undefined,
                charged_to: chargedTo,
                datetime: item.datetime,
            }
        })

        // Execute transaction with error handling
        await db.transaction('rw', db.itinerary, db.packing, db.travelers, db.expenses, async () => {
            // Clear old data for this trip
            await db.itinerary.where('trip_id').equals(tripId).delete()
            await db.packing.where('trip_id').equals(tripId).delete()
            await db.travelers.where('trip_id').equals(tripId).delete()
            await db.expenses.where('trip_id').equals(tripId).delete()

            // Add new data
            if (itineraryData.length > 0) {
                await db.itinerary.bulkAdd(itineraryData)
            }
            if (packingData.length > 0) {
                await db.packing.bulkAdd(packingData)
            }
            if (travelersData.length > 0) {
                await db.travelers.bulkAdd(travelersData)
            }
            if (expensesData.length > 0) {
                await db.expenses.bulkAdd(expensesData)
            }
        })

        // Sync trip metadata (share_with, owner_id, is_public, timestamps)
        // This ensures Dexie stays current with shared trip changes
        const { data: tripData, error: tripError } = await supabase
            .from('trips')
            .select('*')
            .eq('trip_id', String(tripId))
            .single()

        if (!tripError && tripData) {
            // Update the corresponding trip record in Dexie with fresh metadata
            const dexieTrip = await db.trips.where('trip_id').equals(tripId).first()
            if (dexieTrip?.__dexieid) {
                await db.trips.update(dexieTrip.__dexieid, {
                    title: tripData.title ?? dexieTrip.title,
                    trip_id: tripData.trip_id,
                    is_public: tripData.is_public,
                    start_date: tripData.start_date,
                    end_date: tripData.end_date,
                    owner_id: tripData.owner_id,
                    share_with: tripData.share_with ?? [],
                    created_at: tripData.created_at,
                    updated_at: tripData.updated_at,
                    issync: true,
                })
                console.log('✓ Updated trip metadata in Dexie:', tripId)
            }
        } else if (tripError) {
            console.warn('Could not fetch trip metadata from Supabase:', tripError)
        }

        console.log('✓ Successfully synced trip and related data from Supabase:', tripId)
    } catch (err) {
        console.error('Error in syncTripFromSupabase:', err)
        throw err
    }
}

/**
 * Sync only trip metadata (share_with, owner_id, is_public, timestamps) from Supabase
 * Lightweight function for quick permission/access checks without syncing all child data
 * Useful for validating shared trip access before full data sync
 */
export async function syncTripMetadataFromSupabase(tripId: string): Promise<TripItem | null> {
    const online = await isOnline()
    if (!online || !tripId) return null

    try {
        // Fetch trip metadata from Supabase
        const { data: tripData, error } = await supabase
            .from('trips')
            .select('*')
            .eq('trip_id', String(tripId))
            .single()

        if (error || !tripData) {
            console.warn('Could not fetch trip metadata from Supabase:', error)
            return null
        }

        // Find corresponding Dexie record
        let dexieTrip = await db.trips.where('trip_id').equals(tripId).first()

        if (dexieTrip?.__dexieid) {
            // Update existing record with fresh metadata
            await db.trips.update(dexieTrip.__dexieid, {
                title: tripData.title ?? dexieTrip.title,
                is_public: tripData.is_public,
                start_date: tripData.start_date,
                end_date: tripData.end_date,
                owner_id: tripData.owner_id,
                share_with: tripData.share_with ?? [],
                created_at: tripData.created_at,
                updated_at: tripData.updated_at,
                issync: true,
            })
            dexieTrip = await db.trips.get(dexieTrip.__dexieid)
            console.log('✓ Updated trip metadata:', tripId, { owner_id: tripData.owner_id, share_count: tripData.share_with?.length ?? 0 })
        } else {
            // Create new record if doesn't exist
            const numericId = await db.trips.add({
                title: tripData.title || "Untitled",
                trip_id: tripId,
                is_public: tripData.is_public,
                start_date: tripData.start_date,
                end_date: tripData.end_date,
                owner_id: tripData.owner_id,
                share_with: tripData.share_with ?? [],
                created_at: tripData.created_at,
                updated_at: tripData.updated_at,
                issync: true,
            })
            dexieTrip = await db.trips.get(numericId)
            console.log('✓ Created new trip metadata record:', tripId)
        }

        return dexieTrip || null
    } catch (err) {
        console.error('Error in syncTripMetadataFromSupabase:', err)
        return null
    }
}

/**
 * Validate and recover sync data consistency for a trip
 * This function checks if data has been properly synced and recovers from partial syncs
 */
export async function validateAndRecoverTripSync(tripId: string): Promise<{ valid: boolean; recovered: boolean; details: string }> {
    try {
        const online = await isOnline()
        if (!online) {
            return { valid: true, recovered: false, details: 'Offline mode - validation skipped' }
        }

        // Check local Dexie data
        const localTrip = await db.trips.where('trip_id').equals(tripId).first()
        if (!localTrip) {
            // Try to fetch from Supabase and restore locally
            const { data: remoteTrip, error } = await supabase
                .from('trips')
                .select('*')
                .eq('trip_id', String(tripId))
                .single()

            if (error || !remoteTrip) {
                throw new Error('Trip not found in local or remote storage')
            }

            // Restore trip locally
            await db.trips.add({
                title: remoteTrip.title || "Untitled",
                trip_id: tripId,
                is_public: remoteTrip.is_public,
                start_date: remoteTrip.start_date,
                end_date: remoteTrip.end_date,
                owner_id: remoteTrip.owner_id,
                created_at: remoteTrip.created_at,
                updated_at: remoteTrip.updated_at,
                issync: true,
            })

            return { valid: true, recovered: true, details: 'Trip restored from Supabase' }
        }

        // Check related data consistency
        const [localItinerary, localPacking, localTravelers, localExpenses] = await Promise.all([
            db.itinerary.where('trip_id').equals(tripId).toArray(),
            db.packing.where('trip_id').equals(tripId).toArray(),
            db.travelers.where('trip_id').equals(tripId).toArray(),
            db.expenses.where('trip_id').equals(tripId).toArray(),
        ])

        const localDataCount = localItinerary.length + localPacking.length + localTravelers.length + localExpenses.length

        // If local trip is synced but no related data exists, try to sync
        if (localTrip.issync && localDataCount === 0) {
            console.log('Local trip has no related data - attempting to sync from Supabase')
            try {
                await syncTripFromSupabase(tripId)
                return { valid: true, recovered: true, details: 'Related data recovered from Supabase' }
            } catch (syncErr) {
                console.warn('Could not recover related data:', syncErr)
                return { valid: false, recovered: false, details: 'Trip exists but related data could not be recovered' }
            }
        }

        // Check if all synced items have valid IDs
        const itemsWithoutIds = [
            ...localItinerary.filter(i => i.issync && !i.itinerary_id),
            ...localPacking.filter(i => i.issync && !i.packing_id),
            ...localTravelers.filter(i => i.issync && !i.traveler_id),
            ...localExpenses.filter(i => i.issync && !i.expense_id),
        ]

        if (itemsWithoutIds.length > 0) {
            console.warn('Found synced items without IDs:', itemsWithoutIds)
            // Mark them as not synced for recovery
            await db.transaction('rw', db.itinerary, db.packing, db.travelers, db.expenses, async () => {
                for (const item of itemsWithoutIds) {
                    if ('itinerary_id' in item && item.__dexieid) {
                        await db.itinerary.update(item.__dexieid, { issync: false })
                    } else if ('packing_id' in item && item.__dexieid) {
                        await db.packing.update(item.__dexieid, { issync: false })
                    } else if ('traveler_id' in item && item.__dexieid) {
                        await db.travelers.update(item.__dexieid, { issync: false })
                    } else if ('expense_id' in item && item.__dexieid) {
                        await db.expenses.update(item.__dexieid, { issync: false })
                    }
                }
            })
            return { valid: false, recovered: true, details: `Fixed ${itemsWithoutIds.length} items with missing IDs` }
        }

        return { valid: true, recovered: false, details: 'All data consistent and valid' }
    } catch (err) {
        console.error('Error validating trip sync:', err)
        return { valid: false, recovered: false, details: `Validation error: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
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

            // Get owned trips
            const { data: ownedData, error: ownedError } = await supabase
                .from('trips')
                .select('*')
                .eq('is_public', false)
                .eq('owner_id', ownerId)
                .order('updated_at', { ascending: false })

            // Get shared trips (where share_with contains current user)
            const { data: sharedData, error: sharedError } = await supabase
                .from('trips')
                .select('*')
                .eq('is_public', false)
                .filter('share_with', 'cs', `["${ownerId}"]`)
                .order('updated_at', { ascending: false })

            if ((ownedError && sharedError) || (!ownedData && !sharedData)) {
                console.log('Supabase error:', ownedError || sharedError)
            }

            // Combine and deduplicate
            const allTrips = [
                ...(ownedData || []),
                ...(sharedData || [])
            ].filter(
                (trip, index, self) =>
                    self.findIndex((t) => t.trip_id === trip.trip_id) === index
            )

            // Normalize ID fields for routing compatibility
            return allTrips.map((item: any) => ({
                ...item,
                trip_id: item.trip_id ?? item.id
            }))
        } catch (err) {
            console.log('Error fetching trips from Supabase, using cache:', err)
        }
    }

    if (!ownerId) return []

    // Fallback: return local trips (owned or shared with current user)
    const allTrips = await db.trips.toArray()
    return allTrips.filter(
        (trip) =>
            trip.owner_id === ownerId ||
            trip.owner_id == null ||
            trip.share_with?.includes(ownerId)
    )
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
        // Offline: update local only
        if (typeof tripId === 'number') {
            await db.trips.update(tripId, {
                title: updates.title,
                start_date: updates.startDate,
                end_date: updates.endDate,
                updated_at: Date.now(),
            })
            return await db.trips.get(tripId)
        } else {
            // For UUID: find Dexie record by trip_id and update it
            const dexieTrip = await db.trips.where('trip_id').equals(String(tripId)).first()
            if (dexieTrip?.__dexieid) {
                await db.trips.update(dexieTrip.__dexieid, {
                    title: updates.title,
                    start_date: updates.startDate,
                    end_date: updates.endDate,
                    updated_at: Date.now(),
                })
                return await db.trips.get(dexieTrip.__dexieid)
            }
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
            // Update cache - handle both numeric ID and UUID
            if (typeof tripId === 'number') {
                await db.trips.update(tripId, {
                    title: data.title,
                    start_date: data.start_date,
                    end_date: data.end_date,
                    updated_at: new Date(data.updated_at).getTime(),
                })
                return await db.trips.get(tripId)
            } else {
                // For UUID: find Dexie record by trip_id and update it
                const dexieTrip = await db.trips.where('trip_id').equals(String(tripId)).first()
                if (dexieTrip?.__dexieid) {
                    await db.trips.update(dexieTrip.__dexieid, {
                        title: data.title,
                        start_date: data.start_date,
                        end_date: data.end_date,
                        updated_at: new Date(data.updated_at).getTime(),
                    })
                    return await db.trips.get(dexieTrip.__dexieid)
                }
            }
            // Return Supabase data directly if no Dexie update
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
        } else {
            // For UUID: find Dexie record by trip_id and update it
            const dexieTrip = await db.trips.where('trip_id').equals(String(tripId)).first()
            if (dexieTrip?.__dexieid) {
                await db.trips.update(dexieTrip.__dexieid, {
                    title: updates.title,
                    start_date: updates.startDate,
                    end_date: updates.endDate,
                    updated_at: Date.now(),
                })
                return await db.trips.get(dexieTrip.__dexieid)
            }
        }
    }

    return null
}

export async function shareTrip(
    tripId: string | number | null,
    username: string
): Promise<{ success: boolean; error?: string; userId?: string }> {
    if (!username.trim()) {
        return { success: false, error: 'Username cannot be empty' }
    }

    try {
        // Find user by username in local cache first
        let user = await db.users.where('username').equals(username).first()

        // If not found locally and online, query Supabase
        if (!user) {
            const online = await isOnline()
            if (online) {
                const { data, error } = await supabase
                    .from('users')
                    .select('user_id, username')
                    .ilike('username', username) // Case-insensitive search
                    .single()

                if (data) {
                    user = data as any
                    // Cache the user locally for future use
                    await db.users.put({
                        user_id: data.user_id,
                        username: data.username
                    })
                }
            }
        }

        if (!user || !user.user_id) {
            return { success: false, error: 'User not found' }
        }

        const userId = user.user_id

        // Get trip
        let trip: TripItem | undefined
        if (typeof tripId === 'number') {
            trip = await db.trips.get(tripId)
        } else {
            trip = await db.trips.where('trip_id').equals(String(tripId)).first()
        }

        if (!trip?.__dexieid) {
            return { success: false, error: 'Trip not found' }
        }

        // Check if already shared
        if (trip.share_with?.includes(userId)) {
            return { success: false, error: 'Already shared with this user' }
        }

        // Update share_with array
        const updatedShareWith = [...(trip.share_with || []), userId]
        await db.trips.update(trip.__dexieid, { share_with: updatedShareWith })

        // Sync to Supabase if online
        const online = await isOnline()
        if (online && trip.trip_id) {
            const { error } = await supabase
                .from('trips')
                .update({ share_with: updatedShareWith })
                .eq('trip_id', String(trip.trip_id))
                .select()

            if (error) {
                console.error('Error sharing trip to Supabase:', error)
                return { success: false, error: 'Failed to sync share to Supabase' }
            } else {
                console.log('✓ Trip shared and synced to Supabase:', { trip_id: trip.trip_id, shared_with: userId })
            }
        }

        return { success: true, userId }
    } catch (err) {
        console.error('Error sharing trip:', err)
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
}

export async function unshareTrip(
    tripId: string | number | null,
    userId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // Get trip
        let trip: TripItem | undefined
        if (typeof tripId === 'number') {
            trip = await db.trips.get(tripId)
        } else {
            trip = await db.trips.where('trip_id').equals(String(tripId)).first()
        }

        if (!trip?.__dexieid) {
            return { success: false, error: 'Trip not found' }
        }

        // Remove user from share_with array
        const updatedShareWith = (trip.share_with || []).filter((id) => id !== userId)
        await db.trips.update(trip.__dexieid, { share_with: updatedShareWith })

        // Sync to Supabase if online
        const online = await isOnline()
        if (online && trip.trip_id) {
            const { error } = await supabase
                .from('trips')
                .update({ share_with: updatedShareWith })
                .eq('trip_id', String(trip.trip_id))
                .select()

            if (error) {
                console.error('Error unsharing trip on Supabase:', error)
                return { success: false, error: 'Failed to sync unshare to Supabase' }
            } else {
                console.log('✓ Trip unshared and synced to Supabase:', { trip_id: trip.trip_id, removed_from: userId })
            }
        }

        return { success: true }
    } catch (err) {
        console.error('Error unsharing trip:', err)
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
}

export async function getSharedUsers(tripId: string | number | null): Promise<Array<{ user_id: string; username?: string }>> {
    try {
        // Get trip
        let trip: TripItem | undefined
        if (typeof tripId === 'number') {
            trip = await db.trips.get(tripId)
        } else {
            trip = await db.trips.where('trip_id').equals(String(tripId)).first()
        }

        if (!trip?.share_with) return []

        // Get user details for each shared user
        const sharedUsers = await Promise.all(
            trip.share_with.map(async (userId) => {
                const user = await db.users.where('user_id').equals(userId).first()
                return { user_id: userId, username: user?.username ?? undefined }
            })
        )

        return sharedUsers
    } catch (err) {
        console.error('Error getting shared users:', err)
        return []
    }
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

export async function updateItineraryItem(
    tripId: string | null | number | undefined,
    itemId: number | string | undefined,
    updates: { order?: number }
): Promise<ItineraryItem | null> {
    if (!itemId) return null

    const online = await isOnline()

    if (typeof itemId === 'number') {
        if (!online) {
            await db.itinerary.update(itemId, updates)
            return (await db.itinerary.get(itemId)) ?? null
        }

        try {
            const item = await db.itinerary.get(itemId)
            if (!item || !item.itinerary_id) {
                await db.itinerary.update(itemId, updates)
                return (await db.itinerary.get(itemId)) ?? null
            }

            const { data, error } = await supabase
                .from('itinerary')
                .update({ order: updates.order })
                .eq('itinerary_id', item.itinerary_id)
                .select()
                .single()

            if (!error && data) {
                await db.itinerary.update(itemId, { order: data.order })
                return (await db.itinerary.get(itemId)) ?? null
            }
        } catch (err) {
            console.log('Error updating itinerary item:', err)
            await db.itinerary.update(itemId, updates)
            return (await db.itinerary.get(itemId)) ?? null
        }
    } else {
        try {
            const { data, error } = await supabase
                .from('itinerary')
                .update({ order: updates.order })
                .eq('itinerary_id', String(itemId))
                .select()
                .single()

            if (!error && data) {
                await db.itinerary.where('itinerary_id').equals(String(itemId)).modify({ order: data.order })
                return {
                    __dexieid: undefined,
                    itinerary_id: data.itinerary_id,
                    trip_id: data.trip_id ?? (tripId ? String(tripId) : undefined),
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
            console.log('Error updating itinerary item:', err)
            await db.itinerary.where('itinerary_id').equals(String(itemId)).modify({ order: updates.order })
            const local = await db.itinerary.where('itinerary_id').equals(String(itemId)).first()
            return local ?? null
        }
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

// ============= ONLINE-FIRST DATA QUERIES (Supabase > Dexie) =============

/**
 * Get travelers for a trip - queries Supabase when online
 * When online: Always returns fresh data from Supabase
 * When offline: Falls back to Dexie cache
 * Caches data to Dexie after fetching for offline access
 */
export async function getTripTravelersOnline(tripId: string | null): Promise<TravelerItem[]> {
    if (!tripId) return []

    const online = await isOnline()

    if (online) {
        try {
            const { data, error } = await supabase
                .from('travelers')
                .select('*')
                .eq('trip_id', String(tripId))

            if (!error && data && data.length > 0) {
                // Cache to Dexie for offline access
                await db.travelers.where('trip_id').equals(tripId).delete()
                const transformedData = data.map((item: any) => ({
                    traveler_id: item.traveler_id,
                    trip_id: item.trip_id,
                    issync: true,
                    name: item.name ?? '',
                    email: item.email,
                    icon: item.icon,
                }))
                await db.travelers.bulkAdd(transformedData)
                console.log('✓ Cached travelers from Supabase:', tripId, data.length)
                return transformedData
            } else if (error) {
                console.warn('Error fetching travelers from Supabase:', error)
            }
        } catch (err) {
            console.warn('Exception fetching travelers from Supabase:', err)
        }
    }

    // Fall back to Dexie cache
    return await db.travelers.where('trip_id').equals(tripId).toArray()
}

/**
 * Get itinerary for a trip - queries Supabase when online
 * When online: Always returns fresh data from Supabase
 * When offline: Falls back to Dexie cache
 */
export async function getTripItineraryOnline(tripId: string | null): Promise<ItineraryItem[]> {
    if (!tripId) return []

    const online = await isOnline()

    if (online) {
        try {
            const { data, error } = await supabase
                .from('itinerary')
                .select('*')
                .eq('trip_id', String(tripId))
                .order('day_index', { ascending: true })

            if (!error && data && data.length > 0) {
                // Cache to Dexie for offline access
                await db.itinerary.where('trip_id').equals(tripId).delete()
                const transformedData = data.map((item: any) => ({
                    itinerary_id: item.itinerary_id,
                    trip_id: item.trip_id,
                    issync: true,
                    day_index: item.day_index ?? 0,
                    title: item.title ?? '',
                    time: item.time,
                    url: item.url,
                    remark: item.remark,
                    map_link: item.map_link,
                    lat: item.lat,
                    lng: item.lng,
                    place_name: item.place_name,
                    order: item.order ?? 0,
                }))
                await db.itinerary.bulkAdd(transformedData)
                console.log('✓ Cached itinerary from Supabase:', tripId, data.length)
                return transformedData
            } else if (error) {
                console.warn('Error fetching itinerary from Supabase:', error)
            }
        } catch (err) {
            console.warn('Exception fetching itinerary from Supabase:', err)
        }
    }

    // Fall back to Dexie cache
    return await db.itinerary.where('trip_id').equals(tripId).sortBy('order')
}

/**
 * Get packing items for a trip - queries Supabase when online
 * When online: Always returns fresh data from Supabase
 * When offline: Falls back to Dexie cache
 */
export async function getTripPackingOnline(tripId: string | null): Promise<PackingItem[]> {
    if (!tripId) return []

    const online = await isOnline()

    if (online) {
        try {
            const { data, error } = await supabase
                .from('packing')
                .select('*')
                .eq('trip_id', String(tripId))
                .order('order', { ascending: true })

            if (!error && data && data.length > 0) {
                // Cache to Dexie for offline access
                await db.packing.where('trip_id').equals(tripId).delete()
                const transformedData = data.map((item: any) => ({
                    packing_id: item.packing_id,
                    trip_id: item.trip_id,
                    issync: true,
                    title: item.title ?? '',
                    completed: item.completed ?? false,
                    color: item.color,
                    order: item.order ?? 0,
                }))
                await db.packing.bulkAdd(transformedData)
                console.log('✓ Cached packing items from Supabase:', tripId, data.length)
                return transformedData
            } else if (error) {
                console.warn('Error fetching packing from Supabase:', error)
            }
        } catch (err) {
            console.warn('Exception fetching packing from Supabase:', err)
        }
    }

    // Fall back to Dexie cache
    return await db.packing.where('trip_id').equals(tripId).sortBy('order')
}

/**
 * Get expenses for a trip - queries Supabase when online
 * When online: Always returns fresh data from Supabase
 * When offline: Falls back to Dexie cache
 */
export async function getTripExpensesOnline(tripId: string | null): Promise<ExpenseItem[]> {
    if (!tripId) return []

    const online = await isOnline()

    if (online) {
        try {
            const { data, error } = await supabase
                .from('expenses')
                .select('*')
                .eq('trip_id', String(tripId))

            if (!error && data && data.length > 0) {
                // Cache to Dexie for offline access
                await db.expenses.where('trip_id').equals(tripId).delete()
                const transformedData = data.map((item: any) => {
                    let chargedTo: any = undefined
                    try {
                        chargedTo = typeof item.charged_to === 'string'
                            ? JSON.parse(item.charged_to)
                            : item.charged_to
                    } catch (parseError) {
                        console.warn('Failed to parse charged_to:', item.expense_id)
                    }
                    return {
                        expense_id: item.expense_id,
                        trip_id: item.trip_id,
                        issync: true,
                        title: item.title ?? '',
                        amount: item.amount ?? 0,
                        payer_id: item.payer_id ?? undefined,
                        charged_to: chargedTo,
                        datetime: item.datetime,
                    }
                })
                await db.expenses.bulkAdd(transformedData)
                console.log('✓ Cached expenses from Supabase:', tripId, data.length)
                return transformedData
            } else if (error) {
                console.warn('Error fetching expenses from Supabase:', error)
            }
        } catch (err) {
            console.warn('Exception fetching expenses from Supabase:', err)
        }
    }

    // Fall back to Dexie cache
    return await db.expenses.where('trip_id').equals(tripId).toArray()
}


