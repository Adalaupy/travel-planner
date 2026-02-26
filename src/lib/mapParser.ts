type ParseResult = {
    name?: string
    lat?: number
    lng?: number
    iframe?: string
}

function tryParseFromGoogle(urlStr: string): { name?: string; lat?: number; lng?: number } | null {
    try {
        const u = new URL(urlStr)
        const href = urlStr
        const path = u.pathname || ''

        // 1) pathname contains @lat,lng,zoom -> /@lat,lng,15z
        const atMatch = href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
        if (atMatch) {
            // try to get place name from path segments (e.g., /maps/place/Awsard/)
            const segs = path.split('/').filter(Boolean)
            let name: string | undefined
            const placeIndex = segs.indexOf('place')
            if (placeIndex !== -1 && segs.length > placeIndex + 1) {
                name = decodeURIComponent(segs[placeIndex + 1])
            }
            return { name, lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) }
        }

        // 2) some urls include !3dLAT!4dLON sequences
        const dMatch = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
        if (dMatch) {
            return { lat: parseFloat(dMatch[1]), lng: parseFloat(dMatch[2]) }
        }

        // 3) query param 'q' may contain address
        const q = u.searchParams.get('q')
        if (q) {
            return { name: q }
        }

        return null
    } catch (e) {
        return null
    }
}

export async function parseMapLink(url: string): Promise<ParseResult> {
    const res: ParseResult = {}

    const g = tryParseFromGoogle(url)
    if (g && typeof g.lat === 'number' && typeof g.lng === 'number') {
        res.lat = g.lat
        res.lng = g.lng
        if (g.name) res.name = g.name
        // Use a simple Google Maps embed by coordinates (no API key required for the embed URL)
        res.iframe = `<iframe src="https://www.google.com/maps?q=${res.lat},${res.lng}&output=embed" width=600 height=450 style=\"border:0;\" allowFullScreen loading=\"lazy\"></iframe>`
        return res
    }

    // If Google parse yielded a name (but no coords), try Nominatim lookup
    const nameToLookup = g?.name
    if (nameToLookup) {
        try {
            const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(nameToLookup)}`
            const r = await fetch(nomUrl, { headers: { 'User-Agent': 'travel-planner-app' } })
            const js = await r.json()
            if (Array.isArray(js) && js.length > 0) {
                const first = js[0]
                res.name = first.display_name
                res.lat = parseFloat(first.lat)
                res.lng = parseFloat(first.lon)
                // create an OSM embed centered on the point with a small bbox
                const lat = res.lat
                const lng = res.lng
                const delta = 0.01
                const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`
                res.iframe = `<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}" width=600 height=450 style=\"border:0;\"></iframe>`
                return res
            }
        } catch (e) {
            // ignore
        }
    }

    // Fallback: attempt to extract a free-text place token from pathname and query, then try Nominatim
    try {
        const u = new URL(url)
        let q = u.searchParams.get('query') || u.searchParams.get('q') || ''
        if (!q) {
            const parts = u.pathname.split('/').filter(Boolean)
            // prefer segment after 'place' or last meaningful segment
            const placeIndex = parts.indexOf('place')
            if (placeIndex !== -1 && parts.length > placeIndex + 1) q = decodeURIComponent(parts[placeIndex + 1])
            else if (parts.length) q = decodeURIComponent(parts[parts.length - 1])
        }
        if (q) {
            const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`
            const r = await fetch(nomUrl, { headers: { 'User-Agent': 'travel-planner-app' } })
            const js = await r.json()
            if (Array.isArray(js) && js.length > 0) {
                const first = js[0]
                res.name = first.display_name
                res.lat = parseFloat(first.lat)
                res.lng = parseFloat(first.lon)
                const lat = res.lat
                const lng = res.lng
                const delta = 0.01
                const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`
                res.iframe = `<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}" width=600 height=450 style=\"border:0;\"></iframe>`
                return res
            }
        }
    } catch (e) {
        // swallow
    }

    return res
}

export default parseMapLink
