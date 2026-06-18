/**
 * PackHawk — YouTube Competitor Packaging Scout (Apify Actor)
 *
 * An LLM-free engine designed to be driven by an AI (e.g. Claude over MCP).
 * It has two operations:
 *
 *   operation = "scan"   (default)
 *     Scrape each competitor's newest uploads, fetch metadata, rank by
 *     views/day + breakout score, and return the winning picks with their
 *     thumbnail URLs and full metadata. The calling AI then VIEWS each
 *     thumbnail, writes the packaging breakdown, and synthesizes the patterns.
 *
 *   operation = "report"
 *     Given the picks (each with the AI's `analysis`) plus a `pattern` string,
 *     assemble a single self-contained HTML report (thumbnails embedded as
 *     base64). Pure templating — no LLM, no API key.
 */
import { Actor, log } from 'apify';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveHandles } from './handles.js';
import { pullAllUploads, fetchAllMeta } from './scrape.js';
import { rankAndSelect } from './rank.js';
import { resolveThumbnailUrl, thumbnailCandidates, downloadThumbnail } from './thumbs.js';
import { buildReportHtml } from './report.js';
import { displayHandle, mapWithConcurrency, sleep } from './utils.js';

const REPORT_KEY = 'report';

/** Open a file with the OS default application (local runs only). */
function openLocally(filePath) {
    try {
        let cmd;
        let args;
        if (process.platform === 'win32') {
            cmd = 'cmd';
            args = ['/c', 'start', '', filePath];
        } else if (process.platform === 'darwin') {
            cmd = 'open';
            args = [filePath];
        } else {
            cmd = 'xdg-open';
            args = [filePath];
        }
        spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
    } catch (err) {
        log.warning(`Could not auto-open the report: ${err.message}`);
    }
}

const NEXT_STEP =
    'For each pick: open thumbnailUrl and study the thumbnail together with the title and description. ' +
    'Add an `analysis` object to the pick with keys: thumbnail {composition, faces_emotion, text_overlay, ' +
    'color_strategy, focal_point}, title {formula, curiosity_gap}, title_thumb_synergy, target_viewer, ' +
    'why_winning, steal_this[]. Then write a 3-4 sentence cross-video `pattern`. Finally, call this actor ' +
    'again with operation="report" and reportData={pattern, picks} to get the self-contained HTML report.';

/** operation = "scan" */
async function runScan(input) {
    const {
        competitorHandles = [],
        maxChannels = 5,
        uploadsPerChannel = 20,
        recencyDays = 7,
        topN = 3,
        breakoutMultiplier = 3,
        metadataConcurrency = 10,
        proxyConfiguration: proxyInput,
        youtubeCookies,
    } = input;

    const handles = (await resolveHandles(competitorHandles)).slice(0, maxChannels);
    if (!handles.length) throw new Error('No competitor handles to scan.');
    log.info(`Scanning ${handles.length} channel(s): ${handles.map(displayHandle).join(', ')}`);

    let proxyUrl;
    const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
    if (proxyConfiguration) {
        proxyUrl = await proxyConfiguration.newUrl();
        log.info('Using Apify Proxy for YouTube requests.');
    } else {
        log.warning('No proxy configured — YouTube may rate-limit datacenter IPs at scale.');
    }

    let cookieFile;
    const finalCookies = youtubeCookies || process.env.YOUTUBE_COOKIES;
    if (finalCookies && finalCookies.trim()) {
        cookieFile = path.resolve('./youtube-cookies.txt');
        await fs.writeFile(cookieFile, finalCookies.trim(), 'utf8');
        log.info('Using provided YouTube cookies (from input or environment).');
    }

    const generatedAt = new Date().toISOString().slice(0, 10);

    await Actor.setStatusMessage('Phase 1: pulling competitor uploads...');
    const videos = await pullAllUploads(handles, { uploadsPerChannel, proxyUrl, cookieFile });
    if (!videos.length) {
        throw new Error('Could not pull any uploads. Check the handles or proxy configuration.');
    }

    await Actor.setStatusMessage(`Phase 1: fetching metadata for ${videos.length} videos...`);
    const metas = await fetchAllMeta(videos, { concurrency: metadataConcurrency, proxyUrl, cookieFile });
    log.info(`Got metadata for ${metas.length}/${videos.length} videos.`);

    const { selection, recentCount } = rankAndSelect(metas, { recencyDays, topN, breakoutMultiplier });
    log.info(`${recentCount} videos in the last ${recencyDays} days, selected ${selection.length} winner(s).`);

    // Resolve a reliable thumbnail URL per pick (parallel HEAD probes).
    await mapWithConcurrency(selection, 8, async (pick) => {
        pick.thumbnailUrl = await resolveThumbnailUrl(pick.video_id, pick.thumbnail);
        pick.thumbnailCandidates = thumbnailCandidates(pick.video_id, pick.thumbnail);
    });

    for (const pick of selection) {
        await Actor.pushData(pick);
    }

    const output = {
        operation: 'scan',
        status: 'succeeded',
        generatedAt,
        handles,
        recencyDays,
        totalVideosAnalyzed: metas.length,
        recentVideos: recentCount,
        winnersSelected: selection.length,
        picks: selection,
        next_step: NEXT_STEP,
    };
    await Actor.setValue('OUTPUT', output);
    await Actor.setStatusMessage(`Scan done — ${selection.length} winners across ${handles.length} channels.`);
    log.info('Scan complete. The picks (with thumbnailUrl) are in the dataset and OUTPUT.');

    // Let the many yt-dlp child-process handles finish closing before the
    // process tears down — avoids an intermittent Node-v24-on-Windows libuv
    // double-close assertion (src\win\async.c). No effect on Linux / the platform.
    await sleep(300);
}

/** operation = "report" */
async function runReport(input) {
    const data = input.reportData || {};
    const picks = Array.isArray(data.picks) ? data.picks : [];
    if (!picks.length) {
        throw new Error('operation="report" requires reportData.picks (the scan picks, each with an `analysis`).');
    }

    const generatedAt = data.generatedAt || new Date().toISOString().slice(0, 10);
    const openReport = input.openReportLocally !== false;

    await Actor.setStatusMessage(`Building report for ${picks.length} picks...`);

    // Download + embed each thumbnail (base64). Failures degrade gracefully.
    const thumbs = new Map();
    await mapWithConcurrency(picks, 6, async (pick) => {
        try {
            const thumb = await downloadThumbnail(pick.video_id, pick.thumbnailUrl || pick.thumbnail);
            thumbs.set(pick.video_id, thumb);
        } catch (err) {
            log.warning(`Thumbnail unavailable for ${pick.video_id}: ${err.message}`);
        }
    });

    const html = buildReportHtml({
        picks,
        thumbs,
        pattern: data.pattern,
        generatedAt,
        handles: data.handles,
        totalVideos: data.totalVideosAnalyzed,
        recencyDays: data.recencyDays,
    });

    await Actor.setValue(REPORT_KEY, html, { contentType: 'text/html; charset=utf-8' });

    const store = await Actor.openKeyValueStore();
    const reportUrl = store.getPublicUrl ? store.getPublicUrl(REPORT_KEY) : null;

    if (!Actor.isAtHome() && openReport) {
        try {
            const outDir = path.join(process.cwd(), 'runs', generatedAt);
            await fs.mkdir(outDir, { recursive: true });
            const outFile = path.join(outDir, 'report.html');
            await fs.writeFile(outFile, html, 'utf8');
            log.info(`Report written to ${outFile} — opening...`);
            openLocally(outFile);
        } catch (err) {
            log.warning(`Could not write/open local report: ${err.message}`);
        }
    }

    await Actor.setValue('OUTPUT', {
        operation: 'report',
        status: 'succeeded',
        generatedAt,
        winners: picks.length,
        withBreakdown: thumbs.size,
        reportKey: REPORT_KEY,
        reportUrl,
    });
    if (reportUrl) log.info(`Report available at: ${reportUrl}`);
    await Actor.setStatusMessage('Report built.');
}

await Actor.main(async () => {
    const input = (await Actor.getInput()) || {};
    const operation = input.operation || 'scan';
    log.info(`PackHawk operation: ${operation}`);

    if (operation === 'report') {
        await runReport(input);
    } else {
        await runScan(input);
    }

    // Node v24 on Windows can intermittently abort during libuv teardown when
    // many yt-dlp child processes and keep-alive sockets close (src\win\async.c).
    // Everything is already persisted by now, so exit explicitly for a
    // deterministic exit code on local runs. The Apify platform (Linux) is
    // unaffected and keeps the SDK's normal exit path.
    if (!Actor.isAtHome()) process.exit(0);
});
