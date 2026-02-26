# Travel Planner

Plan trips collaboratively with real-time sync, sharing, and offline support.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tools](#tools)
- [Getting Started](#getting-started)
- [Trip Sharing](#trip-sharing)
- [Import/Export](#importexport)
- [Data Sync & Consistency](#data-sync--consistency)
- [Try Me](#try-me)


## Features

- **Trip Management**: Dashboard with search and quick create
- **Trip Sharing**: Share trips with other users by username (full edit access, real-time updates)
- **Itinerary**: Drag-and-drop ordering with time-based planning
- **Packing Checklist**: Color-coded items with completion tracking
- **Travelers & Expenses**: Manage group members and split costs with instant visibility
- **Import/Export**: Bulk import/export trips as JSON (supports multi-file import)
- **Templates**: Downloadable import templates for reference
- **Offline Support**: Works offline with automatic Supabase sync when online
- **Real-Time Data**: Online-first data fetching ensures all users see fresh data

## Architecture

The app uses a **hybrid offline-first with online-first queries** architecture:

- **Supabase (PostgreSQL)**: Remote source of truth for all trip data
- **Dexie (IndexedDB)**: Local cache for offline support and fast lookups
- **Online-First Data Layer**: Components query Supabase directly when online, with automatic fallback to Dexie when offline
- **Automatic Syncing**: Background sync ensures local data stays consistent with remote when connectivity returns
- **Multi-User Safety**: Trip metadata is synchronized before access checks to prevent stale permission data

### Data Flow

1. **Online**: Components fetch from Supabase via `useTripData` hook, with data automatically cached to Dexie
2. **Offline**: Components fallback to reading from Dexie cache
3. **Sync**: When going online, background sync validates and updates local data with fresh Supabase data
4. **Shared Trips**: Trip metadata (sharing info) is kept fresh to prevent false "Access Denied" errors

### Key Functions

- `useTripData()`: Custom hook for fetching any trip data type with automatic online/offline handling
- `syncTripFromSupabase()`: Comprehensive sync of trip and all related data
- `syncTripMetadataFromSupabase()`: Lightweight metadata-only sync for permission validation
- `getTripTravelersOnline()`, `getTripItineraryOnline()`, `getTripPackingOnline()`, `getTripExpensesOnline()`: Online-first query functions

## Tools

- Next.js 16+ (React framework)
- TypeScript (type safety)
- Dexie (IndexedDB wrapper)
- Supabase (PostgreSQL backend + Auth)
- dnd-kit (drag-and-drop library)

## Getting Started

Install dependencies and run the dev server:

```powershell
npm install
npm run dev
```

## Trip Sharing

Share your trips with other users for collaborative planning:

1. **Share a Trip**:
   - Open any trip you own
   - Click the "Share" button next to the trip title
   - Enter the username of the person you want to share with
   - Click "Share" to grant access

2. **Shared Trip Access**:
   - Shared users have full edit access to the trip
   - Shared trips appear with a yellow background and "📤 Shared with you" badge on My Trips page
   - Only the trip owner can delete the trip or manage sharing

3. **Remove Sharing**:
   - Open the trip and click "Share"
   - Click "Remove" next to any shared user to revoke access

**Note**: Both users must be signed up with Supabase authentication for sharing to work.

## Import/Export

- Export: choose one or more trips and download a JSON backup.
- Import: select one or more JSON files to import.
- Template: use "Download Import Template" to get a ready-to-fill sample.

## Data Sync & Consistency

The app maintains data consistency across multiple users and devices:

- **Automatic Sync on Online**: When the app goes online, trip data is automatically synced from Supabase
- **Fresh Permission Checks**: Trip metadata (sharing info) is synced before access validation to prevent false denials
- **Multi-User Updates**: Components use online-first queries, so changes made by other users are immediately visible
- **Offline Queue**: When offline, changes are queued in IndexedDB and synced when connectivity returns
- **Atomic Updates**: Database syncs use transactions to prevent partial data corruption

### Multi-User Scenario Example

1. User A and User B both open a shared trip
2. User B adds a traveler to the trip (saved to Supabase)
3. User A adds an expense - the component fetches fresh travelers from Supabase via `useTripData` hook
4. User A immediately sees the new traveler from User B in the expense dropdown

## Try Me
https://adalaupy.github.io/travel-planner/