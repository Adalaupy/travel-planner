type ParseResult = {
    name?: string
    lat?: number
    lng?: number
    iframe?: string
}

export async function parseMapLink(url: string): Promise<ParseResult> {
    const res: ParseResult = {}
    const trimmed = url.trim()
    if (!trimmed) return res

    let parsedUrl: URL

    try {
        parsedUrl = new URL(trimmed)
    } catch {
        return res
    }

    try {
        const u = parsedUrl
        const href = trimmed
        const path = u.pathname || ''

        const atMatch = href.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
        if (atMatch) {
            const lat = parseFloat(atMatch[1])
            const lng = parseFloat(atMatch[2])
            const segs = path.split('/').filter(Boolean)
            const placeIndex = segs.indexOf('place')
            if (placeIndex !== -1 && segs.length > placeIndex + 1) {
                res.name = decodeURIComponent(segs[placeIndex + 1])
            }
            res.lat = lat
            res.lng = lng
            res.iframe = `<iframe src="https://www.google.com/maps?q=${lat},${lng}&output=embed" width=600 height=450 style=\"border:0;\" allowFullScreen loading=\"lazy\"></iframe>`
            return res
        }

        const dMatch = href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
        if (dMatch) {
            const lat = parseFloat(dMatch[1])
            const lng = parseFloat(dMatch[2])
            res.lat = lat
            res.lng = lng
            res.iframe = `<iframe src="https://www.google.com/maps?q=${lat},${lng}&output=embed" width=600 height=450 style=\"border:0;\" allowFullScreen loading=\"lazy\"></iframe>`
            return res
        }

        const q = u.searchParams.get('query') || u.searchParams.get('q')
        if (q) {
            res.name = q
        } else {
            const parts = u.pathname.split('/').filter(Boolean)
            const placeIndex = parts.indexOf('place')
            if (placeIndex !== -1 && parts.length > placeIndex + 1) {
                res.name = decodeURIComponent(parts[placeIndex + 1])
            } else if (parts.length) {
                res.name = decodeURIComponent(parts[parts.length - 1])
            }
        }
    } catch {
        return res
    }

    if (res.name) {
        try {
            const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(res.name)}`
            const r = await fetch(nomUrl, { headers: { 'User-Agent': 'travel-planner-app' } })
            const js = await r.json()
            if (Array.isArray(js) && js.length > 0) {
                const first = js[0]
                const lat = parseFloat(first.lat)
                const lng = parseFloat(first.lon)
                res.name = first.display_name
                res.lat = lat
                res.lng = lng
                const delta = 0.01
                const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`
                res.iframe = `<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}" width=600 height=450 style=\"border:0;\"></iframe>`
            }
        } catch {
            // no-op
        }
    }

    return res
}

export default parseMapLink
