/**
 * PHASE 1 (rank & select): compute views-per-day and a per-channel "breakout
 * score", keep only videos published within the recency window, then select the
 * top performers plus any breakout outliers.
 */
import { median } from './utils.js';

/** Days between a video's publish time and `now` (ms). Returns null if unknown. */
function ageDays(meta, now) {
    let uploadMs = null;
    if (typeof meta.timestamp === 'number') {
        uploadMs = meta.timestamp * 1000;
    } else if (meta.upload_date && /^\d{8}$/.test(meta.upload_date)) {
        const y = Number(meta.upload_date.slice(0, 4));
        const mo = Number(meta.upload_date.slice(4, 6));
        const d = Number(meta.upload_date.slice(6, 8));
        uploadMs = Date.UTC(y, mo - 1, d);
    }
    if (uploadMs == null) return null;
    return (now - uploadMs) / 86_400_000;
}

/** ISO date (YYYY-MM-DD) for a video's publish time, or null. */
function publishedDate(meta) {
    if (typeof meta.timestamp === 'number') {
        return new Date(meta.timestamp * 1000).toISOString().slice(0, 10);
    }
    if (meta.upload_date && /^\d{8}$/.test(meta.upload_date)) {
        return `${meta.upload_date.slice(0, 4)}-${meta.upload_date.slice(4, 6)}-${meta.upload_date.slice(6, 8)}`;
    }
    return null;
}

/**
 * Rank videos and choose the winners.
 *
 * @returns {{ selection: object[], enriched: object[], recentCount: number }}
 */
export function rankAndSelect(metas, { recencyDays, topN, breakoutMultiplier, now = Date.now() }) {
    // Per-channel median views across ALL pulled videos (not just recent ones) —
    // this is the baseline a video must beat to count as a breakout.
    const byChannel = new Map();
    for (const m of metas) {
        const list = byChannel.get(m.channel_id) || [];
        list.push(m);
        byChannel.set(m.channel_id, list);
    }
    const channelMedian = new Map();
    for (const [channelId, list] of byChannel) {
        const views = list.map((x) => x.views).filter((v) => typeof v === 'number' && v > 0);
        channelMedian.set(channelId, views.length ? median(views) : 0);
    }

    // Enrich every video with the derived metrics.
    const enriched = metas.map((m) => {
        const age = ageDays(m, now);
        const views = typeof m.views === 'number' ? m.views : 0;
        const vpd = age == null ? null : views / Math.max(age, 0.5);
        const med = channelMedian.get(m.channel_id) || 0;
        const breakout = med > 0 ? views / med : null;
        return {
            ...m,
            published: publishedDate(m),
            age_days: age == null ? null : Number(age.toFixed(2)),
            views_per_day: vpd == null ? null : Math.round(vpd),
            channel_median_views: Math.round(med),
            breakout_score: breakout == null ? null : Number(breakout.toFixed(2)),
        };
    });

    // Eligible = published within the recency window.
    const recent = enriched.filter((m) => m.age_days != null && m.age_days >= 0 && m.age_days <= recencyDays);

    const selected = new Map();

    // (a) Top N by views-per-day.
    const byVpd = recent
        .filter((m) => m.views_per_day != null)
        .sort((a, b) => b.views_per_day - a.views_per_day);
    for (const m of byVpd.slice(0, topN)) {
        selected.set(m.video_id, { ...m, selected_by: 'views_per_day' });
    }

    // (b) Breakout outliers (> multiplier x channel median), added on top.
    for (const m of recent) {
        if (m.breakout_score != null && m.breakout_score > breakoutMultiplier && !selected.has(m.video_id)) {
            selected.set(m.video_id, { ...m, selected_by: 'breakout' });
        }
    }

    const selection = [...selected.values()].sort(
        (a, b) => (b.views_per_day || 0) - (a.views_per_day || 0),
    );

    return { selection, enriched, recentCount: recent.length };
}
