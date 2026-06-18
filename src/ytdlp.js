/**
 * Thin wrappers around youtube-dl-exec (yt-dlp). youtube-dl-exec auto-parses
 * stdout into an object whenever the output is JSON, so the `dump*Json` calls
 * here return parsed objects rather than strings.
 */
import ytdlp from 'youtube-dl-exec';

/**
 * Pull a channel's newest uploads in flat-playlist mode — fast, one request,
 * no per-video extraction. Returns the raw yt-dlp playlist object (with
 * `.entries`).
 */
export async function ytFlatPlaylist(channelUrl, { playlistEnd = 20, proxyUrl, timeoutMs = 120_000, cookieFile } = {}) {
    const options = {
        flatPlaylist: true,
        dumpSingleJson: true,
        playlistEnd,
        quiet: true,
        noWarnings: true,
        ignoreErrors: true,
    };
    if (proxyUrl) options.proxy = proxyUrl;
    if (cookieFile) options.cookies = cookieFile;
    return ytdlp(channelUrl, options, { timeout: timeoutMs });
}

/**
 * Fetch full metadata for a single video without downloading it. Returns the
 * parsed yt-dlp info JSON object.
 */
export async function ytVideoMeta(videoUrl, { proxyUrl, timeoutMs = 90_000, cookieFile } = {}) {
    const options = {
        skipDownload: true,
        dumpSingleJson: true,
        noPlaylist: true,
        quiet: true,
        noWarnings: true,
    };
    if (proxyUrl) options.proxy = proxyUrl;
    if (cookieFile) options.cookies = cookieFile;
    return ytdlp(videoUrl, options, { timeout: timeoutMs });
}
