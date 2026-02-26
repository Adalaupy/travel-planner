import { useEffect, useState, useCallback } from 'react'
import {
    getTripTravelersOnline,
    getTripItineraryOnline,
    getTripPackingOnline,
    getTripExpensesOnline,
    isOnline,
} from '../lib/syncService'
import { TravelerItem, ItineraryItem, PackingItem, ExpenseItem } from '../lib/db'

interface UseTripDataOptions {
    /** Auto-refetch when online status changes */
    autoRefetch?: boolean
    /** Refetch interval in milliseconds (0 = no auto-refetch) */
    refetchInterval?: number
}

interface UseTripDataResult<T> {
    data: T[]
    loading: boolean
    error: Error | null
    refetch: () => Promise<void>
    isOnline: boolean
}

/**
 * Custom hook for fetching trip data with online/offline support
 * - When online: Queries Supabase directly for fresh data
 * - When offline: Uses Dexie cache
 * - Automatically caches Supabase data to Dexie for offline access
 * - Handles refetching on online status change
 *
 * Usage:
 *   const { data: travelers, loading, error } = useTripData('travelers', tripId)
 */
export function useTripData<T extends TravelerItem | ItineraryItem | PackingItem | ExpenseItem>(
    dataType: 'travelers' | 'itinerary' | 'packing' | 'expenses',
    tripId: string | null | undefined,
    options: UseTripDataOptions = {}
): UseTripDataResult<T> {
    const [data, setData] = useState<T[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<Error | null>(null)
    const [isOnlineStatus, setIsOnlineStatus] = useState(true)

    const { autoRefetch = true, refetchInterval = 0 } = options

    // Query function based on dataType
    const queryFn = useCallback(async (type: string, id: string | null): Promise<any[]> => {
        if (!id) return []

        switch (type) {
            case 'travelers':
                return await getTripTravelersOnline(id)
            case 'itinerary':
                return await getTripItineraryOnline(id)
            case 'packing':
                return await getTripPackingOnline(id)
            case 'expenses':
                return await getTripExpensesOnline(id)
            default:
                return []
        }
    }, [])

    // Refetch function
    const refetch = useCallback(async () => {
        if (!tripId) {
            setData([])
            setLoading(false)
            return
        }

        try {
            setLoading(true)
            setError(null)
            const result = await queryFn(dataType, tripId)
            setData(result as T[])
            console.log(`✓ Loaded ${dataType}:`, result.length)
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            setError(error)
            console.error(`Error loading ${dataType}:`, error)
        } finally {
            setLoading(false)
        }
    }, [tripId, dataType, queryFn])

    // Initial load
    useEffect(() => {
        refetch()
    }, [refetch])

    // Monitor online status and refetch if needed
    useEffect(() => {
        if (!autoRefetch) return

        const handleOnlineStatusChange = async () => {
            const online = await isOnline()
            setIsOnlineStatus(online)
            if (online) {
                console.log(`🌐 Back online - refetching ${dataType}`)
                await refetch()
            }
        }

        const handleOnline = () => handleOnlineStatusChange()
        const handleOffline = () => setIsOnlineStatus(false)

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [autoRefetch, dataType, refetch])

    // Optional: auto-refetch at intervals
    useEffect(() => {
        if (!refetchInterval || refetchInterval <= 0) return

        const interval = setInterval(() => {
            refetch()
        }, refetchInterval)

        return () => clearInterval(interval)
    }, [refetchInterval, refetch])

    return {
        data,
        loading,
        error,
        refetch,
        isOnline: isOnlineStatus,
    }
}

/**
 * Hook to monitor online status
 */
export function useOnlineStatus() {
    const [isOnline, setIsOnline] = useState(true)

    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    return isOnline
}
