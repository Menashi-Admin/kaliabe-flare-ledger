# BUILD BRIEF — Kaliabe Flare Ledger: fix bugs + proprietary interactive map overlay

You are Opus leading this build. Repo: /home/ubuntu/kaliabe-flare-ledger (Cloudflare Pages `kaliabe-flare-web` + Worker `kaliabe-flare` + D1).

Read the whole repo before editing. Work end-to-end, then deploy and verify live.
Constraints: native Ubuntu; each shell is fresh so `source ~/.bashrc` or use `~/.npm-global/bin` for npx/wrangler. Only touch this repo.

## PART 1 — FIX THESE BUGS (verified, real)

1. **Trend is broken.** In `worker/src/index.js`, `computeTrend(series)` is called with `volMillionM3` (objects `{year, millionM3}`) but the function does `series.map((s) => s.m3)` → always `undefined` → every trend computes NaN and resolves to `"stable"`. Fix the property name (`s.millionM3`) AND make the trend logic robust: handle <4 points, guard division by zero, and return a real percentage. The site's Trend column must show genuine rising/falling/stable.

2. **CSV download link is dead.** `web/public/index.html` links `href="/api/digest.csv"` (resolves to the Pages origin, which has no such route → returns SPA HTML). Options: (a) add a Cloudflare Pages Function `web/functions/api/digest.csv.js` that proxies to the Worker, OR (b) point the link at the Worker URL. Prefer a clean same-origin Pages Function proxy so the link works and keeps the Worker URL out of the markup. Verify the downloaded file is real CSV.

3. While in there, audit for any other dead links / broken fetches / wrong units and fix them. The verdict + penalty math must remain correct (NUPRC US$2.00/1,000 scf; 1,000 scf = 28.317 m³; GFMR per-year values are in MILLION m³).

## PART 2 — PROPRIETARY INTERACTIVE MAP OVERLAY (the main ask)

Replace the plain Leaflet marker map with **our own map overlay layer system** — not a third-party overlay product, our own code on top of Leaflet. Requirements:

**A. Layer control (our own UI, not a stock plugin look).**
Toggleable layers, each with a legend + source attribution + counted features:
- **Flare sites** (our data, from the Worker API) — the primary layer, symbolised by volume, colour by verdict.
- **Nigeria states** — `web/public/layers/nga-states.geojson` (CC BY 4.0, GRID3)
- **LGAs** — `web/public/layers/nga-lgas.geojson` (CC BY 4.0, GRID3)
- **Oil & gas pipelines** — `web/public/layers/nga-pipelines.geojson` (USGS public domain)
- Basemap switch (OSM light default; optionally a muted/paper style to match the design).

**B. Per-flare detail on interaction (this is the core).**
Clicking any flare site opens a **rich detail panel** (side drawer or large popover — design it, don't use a bare Leaflet popup) showing everything we know:
- operator, field name, field type, location, lat/lon, onshore/offshore, in-Niger-Delta flag
- latest year + latest-year volume (million m³ AND bcm), full **year-by-year series** (render a small inline sparkline/bar chart — hand-rolled SVG, no heavy chart lib)
- verdict + confidence + **detection floor** text
- penalty estimate (US$ and indicative ₦), CO₂e tonnes, methane-equivalent tonnes
- trend (real, from the fix above)
- attribution/source line for every derived figure
Wire it to `/api/sites` (per-site detail incl. `year_series`) — fetch once, index by site_id for instant interaction.

**C. Supplementary data available by interacting with the overlay.**
When a flare is selected, surface the *nearest* supplementary context from the loaded layers: nearest pipeline (name/origin/destination if present), the state + LGA it falls in. Compute client-side (point-in-polygon + nearest-line is fine; keep it light). Show it in the detail panel as "Nearby infrastructure / Administrative context."

**D. Design bar (D O's taste):** restraint, negative space, gallery-grade; cream/paper, ink, one accent; every pixel purposeful; no filler, no heavy chrome. Keep the existing visual language in `web/public/css/base.css` and extend it coherently. Mobile-usable.

## PART 3 — DEPLOY + VERIFY
- `cd worker && npx wrangler deploy` (Worker, with the trend fix).
- `cd web && npx wrangler pages deploy public --project-name=kaliabe-flare-web --branch=production`.
- **Verify live with real HTTP checks** (curl/urllib): the Pages site loads; a flare click data path returns `/api/sites` with non-NaN `trend_pct`; the CSV link downloads real CSV; each `/layers/*.geojson` returns 200. Do not claim success without showing the checks.
- Commit to git on `main` with a clear message.

## PART 4 — BUILD-COST LOG
Append to `docs/BUILD-COST.md`: this pass was led by **Claude Code (Opus, subscription)** — record what you did and confirm the flat-rate subscription absorbed this codegen (D O's explicit directive: subs drive heavy build, OpenRouter orchestrates/delegates).

## Deliverable summary to print at the end
- Every bug fixed (with the before/after proof)
- Live URLs + the verification results
- The layer list + how the overlay works
- Commit hash
Keep it factual; if something can't be done, say so plainly rather than faking it.