# BUILD BRIEF — Enrichment: live thermal, population demand, power gap, security overlay

Pass led by you (Opus via Claude Code). Repo `/home/ubuntu/kaliabe-flare-ledger`. Read
`README.md`, `ARCHITECTURE.md`, `docs/ENRICHMENT-PLAN.md`, `docs/METHODOLOGY.md`,
`docs/FEATURE-SET.md`, `web/public/js/ledger-core.js`, `web/public/js/atlas.js`,
`worker/src/index.js` first.

Native Ubuntu, fresh shells (`source ~/.bashrc`). Only this repo. Verify live with real HTTP
checks; do not fabricate. Heavy generation = this subscription; keep OpenRouter minimal.

Design researched and endpoints verified on 2026-10-17. All data below is license-clean
(open / CC-BY / NASA-open). The KFL-M method version becomes **1.3** when shipped.

## Aim

Turn each flare site from a *record* into a *business-development opportunity*: the flared gas
as free fuel, the nearby population as demand, the electricity deficit as the market gap, and a
live thermal + security overlay as current ground truth. Four parts, build in order
**B → C → A → D**.

## PART B — Population demand (build first: it feeds C)

Source: GRID3 NGA Population v3.0 (Aug 2025, Bayesian, 100 m grid, UN-WPP 2025 scaled, CC-BY
4.0). Tile service verified: 
`https://tiles.arcgis.com/tiles/BU6Aadhn6tbBEdyk/arcgis/rest/services/NGA_gridded_population_v3_tile_package/MapServer/0?f=json`
(returns GeoTIFF; also available via WorldPop `https://wopr.worldpop.org/download/611`).

**Required:**
1. A script `scripts/pop_demand.py` that, for every flare site (476), computes and stores:
   `pop5km`, `pop10km`, `pop25km`, `pop50km` (people within radius, from the 100 m grid),
   `nearest_settlement` + `nearest_settlement_pop` + `dist_km` (from GRID3 settlement extents or
   a population-weighted centroid within the radius), and `state`.
   - Use the 100 m raster. If the full national raster is impractically heavy to ship/cache,
     index it once locally (GeoTIFF split/tiled), compute radii, and emit a **compact JSON
     attribute file** to `web/public/data/pop_demand.json` (~476 rows) that the Worker and site
     both read — do NOT ship the 100 m raster to the browser.
   - Record the GRID3 release + licence + the method (radius via zonal stats, raster to point)
     in the registry and methodology.
2. These become site attributes in the API (`/api/sites`) and the drawer.

## PART C — Power gap math (the deal number)

1. **Inject access-rate context.** Add a small, cited table of electrification context:
   national grid access ~59%, urban ~89%, **rural ~33%**; ~85–105 m Nigerians without grid
   access (cite NBS / World Bank–ESMAP SDG7 / PMI). Add **state-level rural access proxies** for
   the oil-producing states (Bayelsa, Rivers, Delta, Akwa Ibom, Edo, Imo, Ondo, Cross River,
   Abia) where a credible published figure exists; otherwise keep the national rural figure and
   say so. Store as `docs/DATA-SOURCES-REGISTRY.md` entries with licence + vintage.
2. **Gap math per site** (in `ledger-core.js`, shared site+Worker, bump method to 1.3):
   - `gas_available_GWh` = latest-year flared m³ × **0.0100 MWh/m³** (thermal HHV of methane)
   - `electric_potential_MW` = gas_available_GWh ÷ 8760 × **0.40** (simple-cycle gas turbine
     electrical efficiency; state the assumption) — under 1 MW round to 0.1 MW
   - `households_servable` = electric_potential_MW × 8760 × capacity_factor(0.85) ÷
     (state_rural_assumption households.serving). Use a stated per-household assumption
     (default a Tier-1/2 micro-grid load ≈ e.g. 100 kWh/month → ~1.2 MWh/yr/hh, cite it) so the
     number is defensible and adjustable.
   - `people_within_10km_not_grid` = pop10km × (1 − rural access proxy for that state) — the
     addressable consumers.
   - Label every one of these as an **estimate** with its assumption; never present them as fact.
3. **API + UI:** expose these per-site in `/api/sites` and the drawer as a "**Generation
   opportunity**" block: gas currently wasted (GWh), viable generator size (MW), households it
   could power, people within 10 km without grid. This is the showcase "clear gap and pipeline
   for generation".

## PART A — Live flare thermal (make the claim true)

Source: NASA FIRMS, VIIRS-375m C2 active-fire NRT (`bright_ti4` K, `frp` MW; global 24h CSV
verified live, 110k+ rows). Flares = stable very-high-`bright_ti4`, day-night persistent,
high FRP — distinguishable from bush fires.

**Required:**
1. A scheduled job (GitHub Action on a cron is acceptable and free; a scheduled Cloudflare
   Worker Cron Trigger is also fine if it fits the existing deploy) that daily pulls the Nigeria
   bbox VIIRS 24h file and, for each flare site, records per-night detections within the site's
   bounding circle.
2. Store per site: `live_last_seen`, `live_nights_detected_pct` (share of clear nights),
   `live_mean_bright_ti4_K`, `live_mean_frp_MW`, `live_site_burning` (bool if detected on a
   meaningful share of recent clear nights). Persist to a small KV/D1 table or a committed JSON
   that the site reads.
3. **Flag mode:** a site the year-archive says is *falling* but is still burning brightly on
   ≥50% of recent nights is flagged *under-report (live check) — investigate*. This converts the
   year-verdict into a live check. Add it to the drawer + verdict logic.
4. Overlay: a toggleable "Live thermal (last 24h)" layer on the map (points with `bright_ti4`
   colour ramp + FRP size), plus a per-site "live now" indicator.
5. Attribution line (NASA FIRMS / LANCE) + retrieval date on the layer.

Run this **once** in the pass to record a real first snapshot; the scheduler handles daily
refresh.

## PART D — Security / OSINT overlay

Source: ACLED Nigeria (Africa file, weekly). Note: ACLED requires a free myACLED account for
bulk download. If you cannot authenticate on this box, **build the layer + ingestion harness
against a small checked-in sample** and leave a clear `docs/DATA-SOURCES-REGISTRY.md` flag:
"ACLED — requires myACLED account; sample seeded, bulk pull pending credentials". Do not fake a
full security overlay you did not compute.

**Required (build the harness regardless):**
1. `scripts/ingest_acled.py` scaffolding: ingest Nigeria conflict events, geolocated, with
   event type + date + fatalities.
2. Per-site precompute: `sec_events_10km`, `sec_events_25km`, `sec_events_50km`, split by type,
   and a 12-month `sec_trend` ("declining / flat / rising") — computed from at least a real seed
   if available, else recorded as "pending live data".
3. Map overlay (toggleable) of event clusters; per-site security block in the drawer with
   citation + data vintage. State clearly the source and that it's non-commercial-monitoring
   evidence, not a judgement.
4. If you cannot get real event data in this pass, ship the harness + documented sample and mark
   the overlay "seed only — enable when ACLED pull is wired".

## PART 5 — Source registry + validator

- Add FIRMS, GRID3 (population), GRID3 (settlements), state access rates, and ACLED to
  `scripts/validate_sources.py` + `docs/DATA-SOURCES-REGISTRY.md`, each with reachability check,
  vintage, licence, and checksum where stable. `validate_sources.py` must still pass and exit 0.
- Update `docs/METHODOLOGY.md` (→ 1.3), `docs/DATA-LICENCES.md`, `docs/FEATURE-SET.md` (tick
  what shipped as Wave 2).

## Part 6 — Deploy + verify (show evidence)

- Deploy Worker + Pages. Run `scripts/validate_sources.py` (multi-source incl new ones), paste
  output.
- Live HTTP checks: `/api/sites` carries the new population + gap fields for a sample (Oso,
  Egbema West, a Niger Delta site); the drawer renders the "Generation opportunity" block; the
  live thermal layer is present (or its placeholder) and attribution shows; worker brief
  includes the gap math; no NaN anywhere; every layer 200.
- Headless Chrome if available on the box (blog, drawer, live layer, pop block, security block,
  any consoles errors); if not, say so plainly.
- Commit to `main`.

## Part 7 — Docs

- Append this pass to `docs/BUILD-COST.md` (led by Claude Code/Opus subscription; record the
  local verification via OpenRouter/this orchestrator).
- `README.md` feature list + `docs/BUSINESS-CASE.md` get a short "live & opportunity" section
  referencing this.

## Final output

Print a factual summary: what shipped in B/C/A/D, exact new fields with example values, live
URLs (site/API/blog), scheduler wiring, ACLED status (real vs sample), verification evidence,
commit hash, anything uncompleted and why. Say plainly rather than faking.