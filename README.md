# Travel Planner (local-first)

Plan trips with a local-first workflow and optional Supabase sync.

## Table of Contents

- [Features](#features)
- [Tools](#tools)
- [Getting Started](#getting-started)
- [Trip Sharing](#trip-sharing)
- [Import/Export](#importexport)
- [Try Me](#try-me)


## Features

- **Trip Management**: Dashboard with search and quick create
- **Trip Sharing**: Share trips with other users by username (full edit access)
- **Itinerary**: Drag-and-drop ordering with time-based planning
- **Packing Checklist**: Color-coded items with completion tracking
- **Travelers & Expenses**: Manage group members and split costs
- **Import/Export**: Bulk import/export trips as JSON (supports multi-file import)
- **Templates**: Downloadable import templates for reference
- **Local-First**: Works offline with optional Supabase sync

## Tools

- Next.js (React)
- TypeScript
- Dexie (IndexedDB)
- Supabase (Postgres + auth)
- dnd-kit (drag-and-drop)

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


## Try Me
https://adalaupy.github.io/travel-planner/