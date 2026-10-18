# BUILD BRIEF — Mini-Grid Siting Tool (Kaliabe / Flare Tracker module)

## Goal
Add a **Mini-Grid Siting Tool** to the Flare Tracker as a new surface (page + API routes) that turns the existing per-site data into bankable mini-grid siting opportunities. This is Build B, building directly on the live KFL-M 1.4 tracker.

## What it is
For every flare site (and, where useful, settlement clusters), compute a siting score and rank across four inputs the tracker already emits or can derive:

1. **Grid access gap** (`people_within_10km_not_grid`, `rural_access_proxy_pct`) — high gap = more demand for an independent grid.
2. **Power potential** (`gas_available_GWh`, `electric_potential_MW`) — the gas-to-power feedstock for the mini-grid.
3. **Population demand** (`pop demand 10km`, nearest settlement, `main_centre_25km_pop`).
4. **Security posture** (`sec_energy` incidents 10/25/50km, ACLED LGA trend) — a mid-grid in an unsafe corridor is not bankable.

Optionally add a **solar GHI term** so hybrid solar+gas sites rank higher (source: energydata.info KTH Solar Potential GHI for Nigeria, CC-BY). If that data is heavy to integrate, label it a documented proxy and omit rather than fake it.

## Output surface
- New page `web/public/siting.html` matching the house style (folio, ivory/forest/brass tokens, reveal motion, honest footnote).
- New API route(s) on the existing Worker, e.g. `/api/siting?scope=national|delta` returning ranked opportunity list with siting score and the four component terms, each labelled. Do NOT touch the existing live API shape.
- National aggregate: how many bankable mini-grid opportunities, ~MW, ~households, in Niger Delta vs national.

## Honesty rules (non-negotiable, match the tracker)
- Every score component is an ESTIMATE and labelled `estimate` with its basis.
- No fabricated siting numbers. If solar GHI cannot be wired cleanly, drop it and say so.
- Site count and per-site figures must come from the real bundled JSONs (`web/public/data/*.json`, `gfmr_nigeria_sites_seed.json`), not invented.
- Keep the existing public pages and API working; do not break KFL-M 1.4.

## Engineering constraints
- Reuse `ledger-core.js` derivation where possible (gas→MW→households math lives there).
- Worker reads bundled JSON (Prismor `db-modification` blocks remote D1 writes — do not try to reseed D1).
- Match the site's design system exactly; no new color tokens; no em/en dashes; no curly quotes; sentence-case headings.
- Keep zero recurring run cost at inference.

## Definition of done
- `/home/ubuntu/kaliabe-flare-ledger` working tree has: `scripts/build_siting.py` (or ingest), updated `web/public/data/siting.json`, new `web/public/siting.html`, Worker routes in `worker/src/index.js`.
- `method_version` bumped to **KFL-M 1.5 (2026-10-18)** with a changelog line.
- API verified live: `/api/siting` returns ranked list, 0 NaN, every component labelled, honest footnote intact.
- Pages deploy to **production branch main** explicitly (`--branch=main`) and live-verified on flaretracker.kaliabe.ng.
- Commit pushed to `github.com/Menashi-Admin/kaliabe-flare-ledger`.

## Reference paths
- Repo: `/home/ubuntu/kaliabe-flare-ledger`
- Data: `web/public/data/security.json` (has `incidents` + ACLED), `web/public/data/pop_demand.json`, `web/public/data/access_rates.json`, `data/gfmr_nigeria_sites_seed.json`
- Design tokens + page patterns: `web/public/index.html`, `web/public/data.html`, `docs/DEVELOPMENT.md`
- Worker: `worker/src/index.js` (serialization block ~line 140-180, METHOD_VERSION line 89)