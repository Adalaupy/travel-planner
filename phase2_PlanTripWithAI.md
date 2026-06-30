## Phase 2 Action Plan: Trip + AI Import

### Scope
- Input type: text paste or `.txt` file only.
- AI automation: itinerary only.
- Other tabs: travelers, packing, and expenses stay manual for now.

### Goal
Let the user paste AI trip output into the app, then save the trip itinerary automatically with duplicate-trip checks before any replacement happens.

### Forced format template
Use this exact plain-text structure:

```text
TRIP_TITLE: <trip title>
DESTINATION: <city/country>
START_DATE: YYYY-MM-DD
END_DATE: YYYY-MM-DD

ITINERARY:
DAY 1 | <time optional> | <activity title required> | <google_maps_url optional> | <url optional> | <remark optional>
DAY 2 | <time optional> | <activity title required> | <google_maps_url optional> | <url optional> | <remark optional>

NOTES: <optional extra notes>
```

### Itinerary tab fields
- Required: day number, activity title
- Optional: time, Google Maps link, URL, remark
- For AI output, keep `google_maps_url` blank to avoid invalid links.
- If a Google Maps link is provided, the app can parse the place name and coordinates when the URL format is valid.

### Prompt template
Copy this into the AI chat:

```text
You are helping me plan a trip.

Return ONLY plain text using this exact format:

TRIP_TITLE: <trip title>
DESTINATION: <city/country>
START_DATE: YYYY-MM-DD
END_DATE: YYYY-MM-DD

ITINERARY:
DAY <number> | <time optional> | <activity title required> | <google_maps_url optional> | <url optional> | <remark optional>

Field rules for each itinerary line:
- DAY: required
- date: derived from START_DATE and END_DATE, do not provide it in each line
- time: optional
- activity title: required
- google_maps_url: always leave blank in AI output
- url: optional
- remark: optional
- You can include multiple DAY lines.
- Add one line for each day in the trip, in ascending order starting from DAY 1.
- Continue until the last travel day.

NOTES: <optional extra notes>

Rules:
- Do not use markdown.
- Do not use JSON.
- Do not add extra headings.
- Do not explain the answer.
- Keep the itinerary section only.
- Use one line per itinerary item.
- Always keep google_maps_url blank (do not provide any map link).
- Follow the field rules exactly and do not add extra fields.
- The app will derive the itinerary date from DAY number plus START_DATE and END_DATE.
- Generate all trip days, not just the first day.
```

### Action steps
1. Add an import area that accepts pasted text and `.txt` upload.
2. Parse only the forced format above.
3. Validate `TRIP_TITLE`, `START_DATE`, `END_DATE`, and every itinerary line.
4. Check whether a trip with the same title already exists in trips the current user can access.
5. If no matching trip exists, continue with normal create flow.
6. If a matching trip exists, show a modal asking: `This trip already exists. Replace current work? Yes / No`.
7. If the user selects `No`, stop and change nothing.
8. If the user selects `Yes`, check ownership of the matched trip.
9. If the matched trip is owned by the current user, allow replacement.
10. If the matched trip is only shared by another user, block replacement and tell the user to rename the trip title before importing.
11. Show parsed preview before final save: title, date range, day count, and itinerary rows.
12. Save the trip shell and itinerary only.
13. Keep travelers, packing, and expenses manual.
14. Reuse the current ownership and share checks before saving.
15. Show a clear success, blocked, or error message.

### Duplicate trip rule
- Match by trip title within trips the current user can access.
- Owned trip: replacement allowed after confirmation.
- Shared trip: replacement not allowed.
- If replacement is blocked, ask the user to rename the trip title and import again.

### Potential functions to trigger
Allowed function list for this phase:
- `createTrip` - create a new trip shell when importing into a new trip
- `updateTrip` - update trip title and dates if the import includes them
- `addItineraryItem` - create each itinerary row from the parsed text
- `updateItineraryItem` - update an existing itinerary row when importing into an existing trip
- `deleteItineraryItem` - replace or remove itinerary rows when needed
- `parseMapLink` - parse a Google Maps URL and extract place data when present
- `getTrip` - load an existing trip before updating it
- `getUserTrips` - list trips if the user must choose a target trip first
- `syncTripFromSupabase` - refresh remote data after saving, if online
- `validateAndRecoverTripSync` - verify sync consistency after the save

Not used in this phase:
- travelers, packing, and expenses functions
- sharing functions
- any direct database access outside the approved service layer

### Success check
- A user can paste the AI result, review the parsed itinerary, and either create a new trip or replace their own existing trip.
- A shared trip with the same title cannot be overwritten through this flow.