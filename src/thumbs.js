/**
 * Thumbnail helpers. No LLM involved — these just resolve and download the
 * public YouTube thumbnail images.
 *
 * ytimg sometimes serves a tiny gray placeholder (~1-2 KB) with a 200 status for
 * a missing maxresdefault frame, so size is checked, not just the status code.
 */

const MIN_BYTES = 2000;

/** Ordered, de-duplicated list of thumbnail URLs to try for a video. */
export function thumbnailCandidates(videoId, providedUrl) {
    const ordered = [
        `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        providedUrl,
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    ].filter(Boolean);
    return [...new Set(ordered)];
}

/**
 * Resolve the best working thumbnail URL with a lightweight HEAD probe
 * (maxres -> metadata thumb -> hqdefault). Falls back to hqdefault, which
 * effectively always exists.
 */
export async function resolveThumbnailUrl(videoId, providedUrl) {
    for (const url of thumbnailCandidates(videoId, providedUrl)) {
        try {
            const res = await fetch(url, { method: 'HEAD' });
            if (!res.ok) continue;
            const len = Number(res.headers.get('content-length') || 0);
            if (len === 0 || len >= MIN_BYTES) return url;
        } catch {
            // try next candidate
        }
    }
    return providedUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Download a thumbnail and return base64 bytes + mime, for embedding in the
 * self-contained HTML report.
 */
export async function downloadThumbnail(videoId, providedUrl) {
    let lastError = 'no candidates';
    for (const url of thumbnailCandidates(videoId, providedUrl)) {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                lastError = `HTTP ${res.status} for ${url}`;
                continue;
            }
            const buffer = Buffer.from(await res.arrayBuffer());
            if (buffer.length < MIN_BYTES) {
                lastError = `placeholder image (${buffer.length} bytes) for ${url}`;
                continue;
            }
            const mime = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
            return { base64: buffer.toString('base64'), mime, bytes: buffer.length, url };
        } catch (err) {
            lastError = `${err.message} for ${url}`;
        }
    }
    throw new Error(`thumbnail download failed (${lastError})`);
}
