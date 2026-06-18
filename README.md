# PackHawk — YouTube Competitor Packaging Scout

[![Apify Ready](https://img.shields.io/badge/Apify-Ready-blue)](https://apify.com)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green)](https://nodejs.org/)

Ever wonder what makes a YouTube thumbnail or title actually work? PackHawk is a tool designed to figure exactly that out by looking at what your competitors are doing *right now*.

Here's the twist: PackHawk isn't an AI itself. It's an engine built specifically for AI agents (like Claude) to use. PackHawk handles all the annoying, repetitive work—like scraping YouTube, ranking videos, and finding high-res thumbnails—so the AI can focus on the creative part: actually looking at the images and breaking down why they work.

Since it's built as an Apify Actor, it hooks right into [Apify's MCP integration](https://docs.apify.com/platform/integrations/mcp). You can just ask your AI assistant to "run a competitor scan," and it will use PackHawk to get the data it needs.

---

## How It All Fits Together

Think of PackHawk and your AI assistant as a team. We've broken this down into three phases. (If you're a visual person, check out the [Workflow Diagram](workflow.md)).

1. **Phase 1: The Heavy Lifting (Scan & Rank)** 
   The AI tells PackHawk to run a `scan` and gives it a list of competitor channels. PackHawk rushes off, grabs the latest videos from those channels, crunches the numbers to see which ones are overperforming, and hands the winning `picks` back to the AI—complete with direct links to the high-res thumbnails.

2. **Phase 2: The Creative Breakdown (AI Vision)** 
   This is where the magic happens. The AI looks at those thumbnail URLs, reads the titles, and writes a detailed `analysis` for each one. It looks for patterns: Are they using neon colors? Big text? Surprised faces? 

3. **Phase 3: Building the Report (Optional)** 
   Finally, the AI hands its analysis back to PackHawk and says, "Make this look nice." PackHawk runs a `report` operation, grabs the images, and stitches everything into a clean, standalone HTML file that you can open in your browser.

---

## The Two Main Commands

### 1. The `scan` Command (Default)

This is the core engine. It grabs the newest uploads from your competitors concurrently, so it's fast. Then, it ranks them using two main metrics:
*   **Views-per-day:** How fast is the video gaining traction?
*   **Breakout Score:** Is this video doing way better than that channel's usual baseline?

It grabs the top performers, makes sure the thumbnail URLs actually work, and sends back the results.

**Here's what the AI gets back:**
```jsonc
{
  "operation": "scan",
  "handles": ["@mkbhd", "@veritasium"],
  "recencyDays": 7,
  "totalVideosAnalyzed": 40,
  "winnersSelected": 3,
  "picks": [
    {
      "video_id": "…", "url": "https://youtube.com/watch?v=…",
      "title": "…", "channel": "…",
      "views": 1783432, "published": "2026-06-16",
      "views_per_day": 1271445, "breakout_score": 0.47,
      "channel_median_views": 3800000, "selected_by": "views_per_day",
      "thumbnailUrl": "https://i.ytimg.com/vi/…/maxresdefault.jpg"
      // ... plus a few other details
    }
  ],
  "next_step": "For each pick: open thumbnailUrl, analyze packaging, add an `analysis` object … then call operation=report."
}
```

### 2. The `report` Command

Once the AI has its notes, it passes them back using the `report` command. PackHawk takes those notes and a summary string (the overall `pattern`) and drops them into a pre-built template. 

There's no LLM involved in this step—it's pure templating. It embeds the images directly so the HTML file is completely portable. 

> [!TIP]
> Before calling `report`, the AI attaches an `analysis` to each pick. It usually looks something like this:
> ```jsonc
> {
>   "thumbnail": { "composition": "…", "faces_emotion": "…", "text_overlay": "…" },
>   "title": { "formula": "…", "curiosity_gap": "…" },
>   "why_winning": "…",
>   "steal_this": ["…", "…"]
> }
> ```

---

## Tweak the Settings

You can customize how PackHawk runs. Here are the main knobs you can turn:

| Setting | Used In | Default | What it does |
|---|---|---|---|
| `operation` | — | `scan` | Choose between `scan` and `report`. |
| `competitorHandles` | `scan` | `[]` | Who to watch (e.g., `@mkbhd`). If left empty, it reads `competitor-list.md`. |
| `maxChannels` | `scan` | `5` | The maximum number of channels to check at once. |
| `uploadsPerChannel` | `scan` | `20` | How many recent videos to look at per channel to find the baseline. |
| `recencyDays` | `scan` | `7` | How far back to look for "recent" videos. |
| `topN` | `scan` | `3` | How many top winners to pick. |
| `breakoutMultiplier` | `scan` | `3` | How much better than average a video needs to be to be considered a "breakout." |
| `metadataConcurrency`| `scan` | `10` | How many videos to fetch at the same time. |
| `youtubeCookies` | `scan` | — | Netscape format cookies to bypass YouTube bot detection. Fallback: `YOUTUBE_COOKIES` env var. |
| `reportData` | `report`| — | The payload containing the AI's analysis for the final report. |
| `openReportLocally` | `report`| `true` | Automatically opens the HTML report when running locally. |

---

### Bypassing YouTube Bot Detection

If YouTube blocks the scraper with a "Sign in to confirm you're not a bot" error, you can provide authenticated YouTube cookies:
1. Export your cookies from YouTube in **Netscape format** using a browser extension (like *Get cookies.txt LOCALLY*).
2. Pass the cookie string to the Actor via the `youtubeCookies` input field.
3. **Alternatively**, you can set the `YOUTUBE_COOKIES` environment variable (useful for Docker or `.env` setups). The actor will automatically detect and use these cookies for all `yt-dlp` requests.

---

## Running it Locally

Want to take it for a spin on your own machine? It's pretty straightforward.

```bash
npm install
node src/main.js
```

