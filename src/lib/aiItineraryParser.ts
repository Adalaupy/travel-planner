export type ParsedItineraryLine = {
    day: number;
    time?: string;
    activityTitle: string;
    googleMapsUrl?: string;
    url?: string;
    remark?: string;
};

export type ParsedAiItinerary = {
    tripTitle: string;
    destination: string;
    startDate: string;
    endDate: string;
    itinerary: ParsedItineraryLine[];
    notes?: string;
};

function readLabeledLine(line: string, label: string): string {
    if (!line.startsWith(label)) {
        throw new Error(`Expected line to start with "${label}".`);
    }

    return line.slice(label.length).trim();
}

export async function parseAiItineraryImport(
    rawText: string,
): Promise<ParsedAiItinerary> {
    const normalized = rawText.replace(/\r\n/g, "\n").trim();

    if (!normalized) {
        throw new Error("Import text is empty.");
    }

    const lines = normalized.split("\n");

    if (lines.length < 7) {
        throw new Error("Input is too short for the required itinerary format.");
    }

    const tripTitle = readLabeledLine(lines[0].trim(), "TRIP_TITLE:");
    const destination = readLabeledLine(lines[1].trim(), "DESTINATION:");
    const startDate = readLabeledLine(lines[2].trim(), "START_DATE:");
    const endDate = readLabeledLine(lines[3].trim(), "END_DATE:");

    let cursor = 4;
    while (cursor < lines.length && !lines[cursor].trim()) {
        cursor += 1;
    }

    if (lines[cursor]?.trim() !== "ITINERARY:") {
        throw new Error('Missing "ITINERARY:" section.');
    }

    cursor += 1;

    const itinerary: ParsedItineraryLine[] = [];
    let notes: string | undefined;

    while (cursor < lines.length) {
        const rawLine = lines[cursor].trim();

        if (!rawLine) {
            cursor += 1;
            continue;
        }

        if (rawLine.startsWith("NOTES:")) {
            notes = rawLine.slice("NOTES:".length).trim() || undefined;
            cursor += 1;
            break;
        }

        const dayMatch = rawLine.match(/^DAY\s+(\d+)\s*\|\s*(.*)$/i);
        if (!dayMatch) {
            throw new Error(`Invalid itinerary line: "${rawLine}".`);
        }

        const day = Number(dayMatch[1]);
        const payload = dayMatch[2];
        const parts = payload.split("|").map((part) => part.trim());

        if (parts.length !== 5) {
            throw new Error(
                `Each itinerary line must contain 5 pipe-separated fields after DAY. Problem line: "${rawLine}".`,
            );
        }

        const [time, activityTitle, googleMapsUrl, url, remark] = parts;
        const finalGoogleMapsUrl = googleMapsUrl || undefined;

        itinerary.push({
            day,
            time: time || undefined,
            activityTitle,
            googleMapsUrl: finalGoogleMapsUrl,
            url: url || undefined,
            remark: remark || undefined,
        });

        cursor += 1;
    }

    while (cursor < lines.length) {
        const trailing = lines[cursor].trim();
        if (trailing && !trailing.startsWith("NOTES:")) {
            throw new Error(`Unexpected trailing line after itinerary: "${trailing}".`);
        }
        cursor += 1;
    }

    if (!itinerary.length) {
        throw new Error("At least one itinerary row is required under ITINERARY: section.");
    }

    return {
        tripTitle,
        destination,
        startDate,
        endDate,
        itinerary,
        notes,
    };
}
