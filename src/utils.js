/**
 * Small shared helpers used across the actor.
 */

export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn` over `items` with a bounded number of concurrent invocations.
 * Results are returned in the same order as `items`.
 */
export async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(limit, items.length));

    const worker = async () => {
        while (true) {
            const index = cursor++;
            if (index >= items.length) return;
            results[index] = await fn(items[index], index);
        }
    };

    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
}

/**
 * Build the canonical "/videos" channel URL from a user-supplied handle, which
 * may be a bare name ("MrBeast"), an @handle ("@MrBeast"), or a full channel URL.
 */
export function channelVideosUrl(handle) {
    const raw = String(handle).trim();

    if (/^https?:\/\//i.test(raw)) {
        const noTrailing = raw.replace(/\/+$/, '');
        return /\/videos$/i.test(noTrailing) ? noTrailing : `${noTrailing}/videos`;
    }

    const name = raw.replace(/^@/, '');
    return `https://www.youtube.com/@${name}/videos`;
}

/** Human-friendly label for a handle, used in logs and the report. */
export function displayHandle(handle) {
    const raw = String(handle).trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    return raw.startsWith('@') ? raw : `@${raw}`;
}

/** Median of a numeric array (0 for an empty array). */
export function median(nums) {
    const sorted = [...nums].sort((a, b) => a - b);
    const n = sorted.length;
    if (n === 0) return 0;
    const mid = Math.floor(n / 2);
    return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Escape a string for safe interpolation into HTML text/attributes. */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Format an integer with thousands separators (e.g. 1234567 -> "1,234,567"). */
export function formatInt(value) {
    if (value == null || Number.isNaN(value)) return '—';
    return Math.round(value).toLocaleString('en-US');
}
