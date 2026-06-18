/**
 * Build operation: assemble picks + the AI's packaging analyses + a pattern
 * synthesis into a single self-contained HTML file. No LLM involved — this is
 * pure templating. Thumbnails are embedded as base64 data URIs so the report is
 * fully portable (one file, no external assets).
 */
import { escapeHtml, formatInt } from './utils.js';

function statBadge(label, value) {
    return `<span class="badge"><span class="badge-label">${escapeHtml(label)}</span>${escapeHtml(value)}</span>`;
}

function breakdownRow(label, value) {
    if (!value) return '';
    return `<div class="row"><div class="row-label">${escapeHtml(label)}</div><div class="row-value">${escapeHtml(value)}</div></div>`;
}

function renderCard(pick, thumb) {
    const analysis = pick.analysis;

    const thumbHtml = thumb
        ? `<img class="thumb" src="data:${thumb.mime};base64,${thumb.base64}" alt="thumbnail" loading="lazy" />`
        : '<div class="thumb thumb--missing">thumbnail unavailable</div>';

    const badges = [
        statBadge('views', formatInt(pick.views)),
        statBadge('views/day', formatInt(pick.views_per_day)),
        statBadge('breakout', pick.breakout_score != null ? `${pick.breakout_score}x` : '—'),
        statBadge('published', pick.published || '—'),
        statBadge('picked by', pick.selected_by === 'breakout' ? 'breakout' : 'views/day'),
    ].join('');

    let breakdownHtml;
    if (analysis) {
        const t = analysis.thumbnail || {};
        const ti = analysis.title || {};
        const stealRaw = analysis.steal_this;
        const steal = Array.isArray(stealRaw) ? stealRaw : stealRaw ? [stealRaw] : [];
        const stealHtml = steal.length
            ? `<div class="steal"><div class="steal-title">Steal this</div><ul>${steal
                  .map((s) => `<li>${escapeHtml(s)}</li>`)
                  .join('')}</ul></div>`
            : '';

        breakdownHtml = `
            <div class="breakdown">
                <div class="section-title">Thumbnail</div>
                ${breakdownRow('Composition', t.composition)}
                ${breakdownRow('Faces / emotion', t.faces_emotion)}
                ${breakdownRow('Text overlay', t.text_overlay)}
                ${breakdownRow('Color strategy', t.color_strategy)}
                ${breakdownRow('Focal point', t.focal_point)}
                <div class="section-title">Title</div>
                ${breakdownRow('Formula', ti.formula)}
                ${breakdownRow('Curiosity gap', ti.curiosity_gap)}
                <div class="section-title">Why it works</div>
                ${breakdownRow('Title + thumbnail synergy', analysis.title_thumb_synergy)}
                ${breakdownRow('Target viewer', analysis.target_viewer)}
                ${breakdownRow('Why it is winning', analysis.why_winning)}
                ${stealHtml}
            </div>`;
    } else {
        breakdownHtml = '<div class="breakdown breakdown--skipped">No packaging breakdown was provided for this pick.</div>';
    }

    return `
        <article class="card">
            <a class="thumb-link" href="${escapeHtml(pick.url)}" target="_blank" rel="noopener">${thumbHtml}</a>
            <div class="card-body">
                <a class="card-title" href="${escapeHtml(pick.url)}" target="_blank" rel="noopener">${escapeHtml(pick.title)}</a>
                <div class="badges">${badges}</div>
                ${breakdownHtml}
            </div>
        </article>`;
}

/**
 * @param {object}  args
 * @param {object[]} args.picks   selected videos, each optionally carrying `analysis`
 * @param {Map}     args.thumbs   video_id -> { base64, mime } downloaded thumbnails
 * @param {string}  args.pattern  cross-video synthesis text
 */
export function buildReportHtml({ picks, thumbs, pattern, generatedAt, handles, totalVideos, recencyDays }) {
    const groups = new Map();
    for (const pick of picks) {
        const list = groups.get(pick.channel) || [];
        list.push(pick);
        groups.set(pick.channel, list);
    }
    const orderedChannels = [...groups.entries()].sort((a, b) => {
        const aBest = Math.max(...a[1].map((p) => p.views_per_day || 0));
        const bBest = Math.max(...b[1].map((p) => p.views_per_day || 0));
        return bBest - aBest;
    });

    const channelsHtml = orderedChannels
        .map(([channel, channelPicks]) => {
            const cards = channelPicks
                .map((p) => renderCard(p, thumbs.get(p.video_id)))
                .join('');
            return `
                <section class="channel">
                    <h2 class="channel-name">${escapeHtml(channel)}</h2>
                    <div class="cards">${cards}</div>
                </section>`;
        })
        .join('');

    const missing = picks.filter((p) => !p.analysis).map((p) => p.video_id);
    const missingNote = missing.length
        ? `<div class="skipped-note">${missing.length} pick(s) without a breakdown: ${escapeHtml(missing.join(', '))}</div>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>PackHawk — Competitor Packaging Report (${escapeHtml(generatedAt)})</title>
<style>
  :root {
    --bg: #0d1117; --panel: #161b22; --panel-2: #1c2330; --border: #2b3340;
    --text: #e6edf3; --muted: #9aa7b4; --accent: #f0b429; --accent-2: #3b82f6;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 20px 80px; }
  header h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.02em; }
  header h1 .hawk { color: var(--accent); }
  .meta { color: var(--muted); font-size: 14px; margin-bottom: 24px; }
  .pattern { background: linear-gradient(135deg, var(--panel-2), var(--panel));
    border: 1px solid var(--border); border-left: 4px solid var(--accent);
    border-radius: 12px; padding: 20px 22px; margin-bottom: 36px; }
  .pattern h2 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--accent); }
  .pattern p { margin: 0; font-size: 16px; }
  .skipped-note { color: #f0883e; font-size: 13px; margin: -16px 0 24px; }
  .channel { margin-bottom: 40px; }
  .channel-name { font-size: 18px; margin: 0 0 16px; padding-bottom: 8px;
    border-bottom: 1px solid var(--border); }
  .cards { display: grid; gap: 20px; }
  .card { display: grid; grid-template-columns: 320px 1fr; gap: 0;
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 12px; overflow: hidden; }
  @media (max-width: 720px) { .card { grid-template-columns: 1fr; } }
  .thumb-link { display: block; background: #000; }
  .thumb { width: 100%; height: 100%; min-height: 180px; object-fit: cover; display: block; }
  .thumb--missing { display: flex; align-items: center; justify-content: center;
    color: var(--muted); font-size: 13px; min-height: 180px; }
  .card-body { padding: 18px 20px; }
  .card-title { display: block; font-size: 17px; font-weight: 650; color: var(--text);
    text-decoration: none; margin-bottom: 12px; }
  .card-title:hover { color: var(--accent); }
  .badges { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .badge { background: var(--panel-2); border: 1px solid var(--border);
    border-radius: 999px; padding: 4px 10px; font-size: 12px; color: var(--text); }
  .badge-label { color: var(--muted); margin-right: 6px; text-transform: uppercase;
    font-size: 10px; letter-spacing: 0.05em; }
  .breakdown { border-top: 1px solid var(--border); padding-top: 12px; }
  .breakdown--skipped { color: #f0883e; font-size: 14px; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--accent-2); margin: 14px 0 6px; }
  .section-title:first-child { margin-top: 0; }
  .row { display: grid; grid-template-columns: 150px 1fr; gap: 12px; margin-bottom: 6px;
    font-size: 14px; }
  @media (max-width: 720px) { .row { grid-template-columns: 1fr; gap: 2px; } }
  .row-label { color: var(--muted); }
  .steal { margin-top: 14px; background: rgba(240,180,41,0.08);
    border: 1px solid rgba(240,180,41,0.25); border-radius: 8px; padding: 10px 14px; }
  .steal-title { color: var(--accent); font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.08em; margin-bottom: 6px; }
  .steal ul { margin: 0; padding-left: 18px; }
  .steal li { margin-bottom: 4px; }
  footer { color: var(--muted); font-size: 12px; text-align: center; margin-top: 40px; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1><span class="hawk">PackHawk</span> — Competitor Packaging Report</h1>
      <div class="meta">${escapeHtml(generatedAt)} · ${escapeHtml(String(handles?.length || 0))} channels · ${escapeHtml(String(totalVideos || 0))} videos scanned · last ${escapeHtml(String(recencyDays ?? '—'))} days · ${escapeHtml(String(picks.length))} winners</div>
    </header>
    <div class="pattern">
      <h2>What's working this week</h2>
      <p>${escapeHtml(pattern || 'No pattern synthesis was provided.')}</p>
    </div>
    ${missingNote}
    ${channelsHtml || '<p class="meta">No winning videos were provided.</p>'}
    <footer>Generated by PackHawk · ${escapeHtml(generatedAt)}</footer>
  </div>
</body>
</html>`;
}
