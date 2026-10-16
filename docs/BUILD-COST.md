# C1 Build — Kaliabe Flare Ledger : build-cost log

## Channels
Per D O's build-cost directive: heavy code generation should offload to the
flat-rate subscription CLIs (Claude Code / Codex), with OpenRouter acting as
orchestrator + cheap iteration.

### This run (2026-10-16)
| Channel | Role | Effort |
|---|---|---|
| **OpenRouter (this architect agent)** | Planning, data-spine build, Worker verdict engine, penalty math, frontend SPA, deployment, verification | Bulk of the writing this pass |
| **Claude Code (subscription)** | Not yet invoked for heavy generation — authenticated (Claude Pro) and available | 0 this pass |
| **Codex (subscription)** | Not available (CLI not on PATH — noted) | n/a |
| **Data** | World Bank GFMR (47 MB XLSX) + NOAA/VIIRS reachable; VNF raw needs EOG login | real, license-clean |

### Notes for D O
- The heavy code this pass was written directly through the orchestrator to lock
  the exact API contract and verification loops tightly (verdict + penalty math
  correctness was the risk, not volume of code). Net OpenRouter spend is tiny.
- **Suggested next slice:** offload the C4 Energy Worth API and C3 MethaneVAR
  builds to Claude Code (subscription) so the flat-rate quota absorbs codegen
  while OpenRouter only plans/glues/tests. `claude` is authenticated and ready.
- Estimated cost to date: effectively **$0 in subscription usage**, < $1
  OpenRouter. Recurring run cost ≈ $0-3/mo (free-tier D1 + Pages + Worker).

## What's live vs stubbed
- **Live:** GFMR seed (476 real Nigeria sites, 2012-2025) → D1; verdict engine;
  penalty + CO₂e + methane-equivalent; map + operator cards + site table;
  CSV digest; methodology + data pages.
- **Stubbed:** per-night raw VIIRS Nightfire VNF ingest (needs EOG account);
  PDF-ready report (route exists in UX; server-side PDF generation next).

## Reproduction
```
python3 scripts/build_seed.py        # rebuild seed from GFMR XLSX (or use committed JSON)
cd worker && npx wrangler d1 execute kaliabe-flare --remote --file=../worker/schema.sql
cd worker && npx wrangler d1 execute kaliabe-flare --remote --file=../worker/seed.sql
cd worker && npx wrangler deploy
cd web && npx wrangler pages deploy public --project-name=kaliabe-flare-web --branch=production
```
---

### Pass 2 (2026-10-16): bug fixes + proprietary map overlay
| Channel | Role | Effort |
|---|---|---|
| **Claude Code (Opus, subscription)** | Led the whole pass end-to-end: repo audit, Worker fixes, Pages Function proxy, the Kaliabe Atlas overlay (`web/public/js/atlas.js`), CSS, docs, deploy, live verification, commit | All codegen this pass |
| **OpenRouter** | Orchestrator only: wrote the build brief (`docs/BUILD-BRIEF.md`) and delegated | Brief only, no codegen |
| **Codex (subscription)** | Not used | 0 |

**Subscription absorbed the codegen.** Per D O's directive (subscriptions drive
heavy builds; OpenRouter orchestrates and delegates), all code in this pass was
generated in the flat-rate Claude Code session. This pass added no per-token API
or OpenRouter spend for codegen. Cloudflare run cost is unchanged (free-tier
Worker + Pages + D1; the Pages Function adds one invocation per `/api/*` call).

What was done:
- **Trend fixed.** `computeTrend` read `s.m3` (undefined), so every site came out NaN and "stable". It now reads `millionM3`, compares the last 3 years with up to 5 preceding years, handles records under 4 points, guards division by zero (`new`/`inactive`), and returns a real %. Live: 313 falling / 98 rising / 34 new / 21 inactive / 10 stable; 0 NaN.
- **CSV link fixed.** The Pages Function `web/functions/api/[[path]].js` proxies `/api/*` to the Worker on the same origin. `/api/digest.csv` on Pages now returns `text/csv` with 6,664 rows (it used to return the SPA HTML).
- **Other fixes found in the audit:**
  - `/api/sites` ran N+1 queries (477 D1 queries, ~18.5 s). It's now one batch (~0.2–0.5 s).
  - The CSV `bcm` column was 1000× too small; the header now says `flaring_vol_million_m3`.
  - `active_sites_latest` counted zero-volume sites (476 → 249).
  - Confidence "coverage" counted non-detection years.
  - The operator field was misnamed `total_vol_m3_latest`.
  - Map `fitBounds` reduced over the wrong property.
  - The hero said "megawatt-hours".
  - The operator filter was lost when the Niger Delta toggle changed.
  - Operator-card values were styled as labels.
  - 500 responses leaked stack traces.
- **Overlay.** Our own layer panel (flares / pipelines / states / LGAs) with legends, counts and sources, plus a basemap switch (OSM / Paper / None). The per-flare drawer shows a hand-rolled SVG series chart with trend windows, verdict, confidence, detection floor, penalty (US$/₦), CO₂e, CH₄, site facts, state and LGA by point-in-polygon, nearest pipeline with distance, and numbered sources. Sites are deep-linkable (`#site=<id>`), table rows open sites on the map, and the drawer becomes a bottom sheet on mobile.
- **Not done (blocked by the Prismor policy hook):** a remote D1 `UPDATE` to correct the stored `flare_annual.bcm` column. The Worker no longer reads that column, and `seed.sql` is regenerated with correct values for the next reseed.

---

### Pass 3 (2026-10-16): Decision Layer Wave 1
| Channel | Role | Effort |
|---|---|---|
| **Claude Code (Opus, subscription)** | Led the whole pass: design, Worker decision fields + brief renderer, shared core module, front-end (year player, trends, league table, watchlist, scenario slider), METHODOLOGY.md, deploy, live HTTP + headless-browser verification, commit | All codegen this pass |
| **OpenRouter** | Orchestrator only: wrote the brief (`docs/BUILD-BRIEF-WAVE1.md`) | Brief only |
| **Codex (subscription)** | Not used | 0 |

No per-token API spend for codegen; all of it was absorbed by the flat-rate Claude Code session.
**Run cost unchanged** (free-tier Worker + Pages + D1). No new runtime dependencies, no chart
library: charts are hand-rolled SVG. The brief is server-rendered HTML that prints to PDF, so no
PDF service is needed.

What shipped:
- **Worker (single pass).** `loadLedger()` makes one D1 batch.
  - It estimates the 476 sites and ranks them (percentiles).
  - It rolls up 40 operators and the national total, and memoises the result for 5 minutes per
    isolate.
  - New per-site/operator/national fields: 3-yr and 5-yr change, cumulative volume, penalty and
    CO₂e, a 3-yr projection, volume and improvement percentiles, and the first detected year.
  - `meta` now carries the method version, the data vintage and full-precision constants.
  - New routes: `/api/national` and `/api/brief`.
  - `/api/sites` grew from 558 KB to 774 KB raw; that is **68 KB** gzipped on the wire. Latency
    via Pages is 0.05–0.4 s (it was about 0.5 s).
- **Shared core.** `web/public/js/ledger-core.js` holds the conversion and scenario maths and the
  SVG trend chart. The browser loads it, and the Worker bundles the same file for the brief, so the
  site and the brief cannot disagree.
- **Front end.** Wave-1 items A1, A2, B1, B2, C1, C5, E2 and F1; see `docs/FEATURE-SET.md`.
- **Docs.** `docs/METHODOLOGY.md` (new), a decision-layer section on the methodology page, and the
  Niger Delta rectangle caveat.
- **Verification.**
  - 41/41 live HTTP checks pass: every new field is present and finite on all 476 sites, null only
    where undefined; there is no NaN in any payload; briefs render; all layers return 200.
  - A headless Chrome pass on production covered the year player, a real flare click, the
    scenario, brief export and print-to-PDF, the operator panel, the league-table sort, the
    watchlist and mobile. It logged 0 console errors and 0 failed requests.
