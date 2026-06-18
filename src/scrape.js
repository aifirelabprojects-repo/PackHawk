/**
 * PHASE 1 (scrape): pull each channel's newest uploads in parallel, then fetch
 * full metadata for every video with bounded concurrency.
 */
import { log } from 'apify';
import { ytFlatPlaylist, ytVideoMeta } from './ytdlp.js';
import { channelVideosUrl, displayHandle, mapWithConcurrency } from './utils.js';

/** Pull up to `uploadsPerChannel` newest video ids/urls for one channel. */
async function pullChannelUploads(handle, { uploadsPerChannel, proxyUrl, cookieFile }) {
    const url = channelVideosUrl(handle);
    const playlist = await ytFlatPlaylist(url, { playlistEnd: uploadsPerChannel, proxyUrl, cookieFile });
    const entries = Array.isArray(playlist?.entries) ? playlist.entries : [];

    return entries
        .filter((e) => e && e.id)
        .slice(0, uploadsPerChannel)
        .map((e) => ({
            id: e.id,
            url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
            sourceHandle: displayHandle(handle),
        }));
}

/** Pull uploads for every handle in parallel, deduped by video id. */
export async function pullAllUploads(handles, opts) {
    const perChannel = await Promise.all(
        handles.map(async (handle) => {
            try {
                const videos = await pullChannelUploads(handle, opts);
                log.info(`  ${displayHandle(handle)}: pulled ${videos.length} uploads`);
                return videos;
            } catch (err) {
                log.warning(`  ${displayHandle(handle)}: failed to pull uploads — ${err.message}`);
                return [];
            }
        }),
    );

    const seen = new Set();
    const all = [];
    for (const list of perChannel) {
        for (const video of list) {
            if (seen.has(video.id)) continue;
            seen.add(video.id);
            all.push(video);
        }
    }
    return all;
}

/** Pick the highest-resolution thumbnail URL available for a video. */
function bestThumbnail(meta) {
    const thumbs = Array.isArray(meta.thumbnails) ? meta.thumbnails : [];
    let best = null;
    for (const t of thumbs) {
        if (!t?.url) continue;
        const area = (t.width || 0) * (t.height || 0);
        const bestArea = (best?.width || 0) * (best?.height || 0);
        if (!best || area > bestArea) best = t;
    }
    return best?.url || meta.thumbnail || null;
}

/** Reduce a raw yt-dlp info object to just the fields the actor needs. */
function normalizeMeta(meta, sourceHandle) {
    const id = meta.id;
    return {
        video_id: id,
        url: meta.webpage_url || `https://www.youtube.com/watch?v=${id}`,
        title: meta.title || '',
        channel: meta.channel || meta.uploader || sourceHandle,
        channel_id: meta.channel_id || meta.uploader_id || meta.channel || sourceHandle,
        channel_url: meta.channel_url || meta.uploader_url || null,
        sourceHandle,
        views: typeof meta.view_count === 'number' ? meta.view_count : null,
        upload_date: meta.upload_date || null, // YYYYMMDD
        timestamp: meta.timestamp || meta.release_timestamp || null, // epoch seconds
        duration: typeof meta.duration === 'number' ? meta.duration : null,
        thumbnail: bestThumbnail(meta),
        description: meta.description || '',
    };
}

/** Fetch + normalize metadata for every video with bounded concurrency. */
export async function fetchAllMeta(videos, { concurrency, proxyUrl, cookieFile }) {
    let completed = 0;
    const metas = await mapWithConcurrency(videos, concurrency, async (video) => {
        try {
            const raw = await ytVideoMeta(video.url, { proxyUrl, cookieFile });
            completed += 1;
            if (completed % 10 === 0 || completed === videos.length) {
                log.info(`  metadata ${completed}/${videos.length}`);
            }
            return normalizeMeta(raw, video.sourceHandle);
        } catch (err) {
            completed += 1;
            log.warning(`  metadata failed for ${video.url} — ${err.message}`);
            return null;
        }
    });
    return metas.filter(Boolean);
}
