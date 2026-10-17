# Integrations & Services

How the Kaliabe Flare Ledger fits together and the external systems it touches. This is the
reference for anyone extending it or standing it up in a new environment.

## Runtime services

**Cloudflare.** The entire billable runtime is Cloudflare's free tier:
- **Worker** `kaliabe-flare` — the verdict engine + REST API. `worker/src/index.js`. Runs the
  penalty, CO₂e and confidence maths, serves `/api/*`, and hosts `/api/digest.csv`.
- **D1** `kaliabe-flare` — the SQLite-born database (`flare_sites`, `flare_annual`). Schema in
  `worker/schema.sql`, seed in `worker/seed.sql`.
- **Pages** `kaliabe-flare-web` — the static site (`web/public/`). Serves the AtLaS overlay, the
  layer GeoJSON, and the blog.
- **Pages Function** `web/functions/api/[[path]].js` — same-origin proxy of `/api/*` to the
  Worker, so the browser sees a single origin and no CORS surface.

No other host services are involved. Recurring cost is effectively $0–3/month.

## Data sources (all license-clean)

| Source | Used for | Licence | Registry |
|---|---|---|---|
| World Bank GFMR — individual flare locations (NOAA VIIRS-derived) | flare sites + annual volumes | open, attribution | `docs/DATA-SOURCES-REGISTRY.md` |
| NOAA / VIIRS Nightfire (Payne Institute) | upstream of GFMR | open | same |
| Flare Gas (Prevention of Waste and Pollution) Regulations 2018 (S.I. No. 9) | penalty basis, two tiers | public regulation (gazette) | same |
| geoBoundaries gbOpen NGA (GRID3) | state + LGA boundaries | CC BY 4.0 | same |
| USGS Africa oil & gas pipelines | pipeline overlay | US public domain | same |
| Natural Earth 10m | rivers (optional) | public domain | same |

`python3 scripts/validate_sources.py` verifies every source is reachable, records version/vintage
and a checksum, and fails loudly if anything is stale. Do not add a source without updating the
registry and the validator.

Proprietary monitoring (Kayrros, GHGSat, Enverus) is **studied, never ingested**.

## Build & model integrations

The project is deliberately built so heavy code generation is absorbed by flat-rate subscription
CLIs, with the orchestrator keeping cost down. This is documented per-pass in `docs/BUILD-COST.md`.

- **Claude Code (subscription)** — the lead builder. `claude --dangerously-skip-permissions -p
  "$(cat docs/BUILD-BRIEF-*.md)"`. Heavy generation, refactors, long files.
- **Codex / ChatGPT (subscription)** — `codex exec`; parallel/second-opinion implementation.
- **OpenRouter** — orchestrator + cheap iteration (planning, glue, tests, small edits).
- **Prismor (runtime security)** — guards the repo during agent builds: blocks prompt injection,
  secret leaks, and database modification. A build brief may need a scoped
  `prismor allow prompt-injection --pattern 'BUILD BRIEF' --expires Nh` for the workspace
  `PRISMOR_WORKSPACE` points at (see `~/.claude/settings.json`).
- **Tiger Dojo AI Brain** (`tigerdojo-ai-brain`, local) — methodology + offering/SOW spine that
  informed this project's build.

### Frontier validation pattern
Design work is stress-tested with a frontier model before it ships: read the docs, then run an
adversarial review of the plan. Standing rule: use a frontier model for validation of logic and
reach; build with cheaper, specialised models via the router. The build records in
`docs/OPUS-*.md` show this pattern in practice.

## Contact & promotion

- **Live site:** `https://kaliabe-flare-web.pages.dev`
- **Blog:** `/blog/why-this-page-exists/`
- **API:** `https://kaliabe-flare.menashiconsulting.workers.dev` (proxied at the site `/api/*`)
- **Brand:** Kaliabe (Nigeria). Posting/outreach from Kaliabe, not the US execution brand.
  See the outreach brand rule in the project's operating notes.