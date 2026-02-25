# Travel Planner (local-first)

Plan trips with a local-first workflow and optional Supabase sync.

## Table of Contents

- [Features](#features)
- [Tools](#tools)
- [Getting Started](#getting-started)
- [Import/Export](#importexport)


## Features

- Trip dashboard with search and quick create
- Itinerary with drag-and-drop ordering
- Packing checklist, travelers, and expenses
- Import/export trips as JSON (supports multi-file import)
- Downloadable import template for reference

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

## Import/Export

- Open My Trips, then Backup.
- Export: choose one or more trips and download a JSON backup.
- Import: select one or more JSON files to import.
- Template: use "Download Import Template" to get a ready-to-fill sample.

