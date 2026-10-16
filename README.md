# Kaliabe Flare Ledger

**Nigeria's first transparent flare ledger** — an open-data flare verification and
decision layer for the Niger Delta.

> Every flare site is attributed to an operator, scored with a verdict, and published with its
> **detection floor and confidence**. Built on open, revocable-by-nobody data. Not affiliated
> with, or endorsed by, NUPRC.

**Live:** [kaliabe-flare-web.pages.dev](https://kaliabe-flare-web.pages.dev)
**API:** [kaliabe-flare.menashiconsulting.workers.dev](https://kaliabe-flare.menashiconsulting.workers.dev)
**CSV digest:** [kaliabe-flare-web.pages.dev/api/digest.csv](https://kaliabe-flare-web.pages.dev/api/digest.csv)

---

## Why it exists

Methane and flare data is abundant and fragmented — satellite operators, regulators and academics
all publish detections. Nobody publishes a **neutral, site-level verdict that a decision-maker
can act on and cite**. The Ledger occupies that layer for Nigeria:

- **476 flare sites** across **40 operators**, 2012–2025
- **390** in the Niger Delta
- **6.60 bcm** flared in the latest year — with a modelled penalty exposure of **US$2.00 per
  1,000 scf** on the NUPRC 2022 Regulations basis
- Every record carries a verdict, a confidence, a detection floor, and a source line

## Who depends on it

Six tiers consume flare metrics, each with a different decision to make — operators (abatement
prioritisation), regulators (enforcement), **EU gas buyers** (methane-intensity thresholds under
the EU Methane Regulation), lenders/insurers (financed emissions and asset risk), carbon markets
(baseline MRV), and assurance services. The full analysis is in
[`docs/BUSINESS-CASE.md`](docs/BUSINESS-CASE.md).

## What it does today

- **Kaliabe Atlas** — our own overlay engine on Leaflet:
  - toggleable layers with legend, count and licence line: flare sites, oil & gas pipelines
    (154), states (37), LGAs (774)
  - basemap switch (OSM / Paper / None)
  - **click any flare** → a detail drawer with the full record: volumes in million m³, bcm and
    MMscfd; a year-by-year bar chart; trend; verdict; confidence; detection floor; penalty in
    US$ and ₦; CO₂e and methane-equivalent loss; numbered sources
  - **computed in the browser**: the containing state and LGA, and the nearest pipeline with its
    commodity and distance
  - shareable per-site links (`#site=<id>`); table rows open the map
- **Operator compliance cards** and a **site-verdict table**
- **Weekly CSV digest** of every site-year (6,664 rows)
- **Methodology and data** pages carrying the caveats and the licences

## Where it's going

A **decision layer**: trend overlays, peer benchmarking, penalty-exposure forecasts, abatement
economics, EU-threshold compliance checks, and exportable decision briefs. The full spec,
sequenced by value per unit of effort, is in [`docs/FEATURE-SET.md`](docs/FEATURE-SET.md).

## Architecture

Cloudflare Worker + D1 for the verdict engine and API, Cloudflare Pages for the site, static
GeoJSON for the overlays. Recurring run cost is effectively **$0–3/month**. Full map, data flow
and repository layout: [`ARCHITECTURE.md`](ARCHITECTURE.md).

```
open data ─▶ scripts/ ─▶ D1 (flare_sites, flare_annual) ─▶ Worker (verdict engine + API)
                       └▶ layers/*.geojson ─────────────▶ Pages (Atlas overlay + detail drawer)
```

## Data sources (all licence-clean)

| Source | Used for | Licence |
|---|---|---|
| World Bank GFMR — individual flare locations (NOAA VIIRS Nightfire derived) | flare sites + annual volumes | open, attribution |
| NOAA/VIIRS Nightfire (Payne Institute, Colorado School of Mines) | upstream of GFMR | open |
| NUPRC 2022 Flare Gas Regulations Gazette | penalty basis (US$2.00 / 1,000 scf) | public regulation |
| geoBoundaries gbOpen NGA (GRID3) | state + LGA boundaries | CC BY 4.0 |
| Natural Earth / USGS Africa O&G pipelines | pipeline overlay | public domain |

Proprietary monitoring (Kayrros, GHGSat, Enverus) is **studied, never ingested**. Full detail:
[`docs/DATA-LICENCES.md`](docs/DATA-LICENCES.md).

## Reproduce it

```bash
python3 scripts/build_seed.py                 # GFMR workbook → Nigeria seed
python3 scripts/fetch_layers.py               # states + pipelines
python3 scripts/fetch_layers2.py              # LGAs
python3 scripts/compact_layers.py             # simplify geometry
python3 scripts/gen_sql.py                    # seed JSON → seed.sql
python3 scripts/build_digest_csv.py           # weekly CSV digest

cd worker && npx wrangler d1 execute kaliabe-flare --remote --file=../worker/schema.sql
cd worker && npx wrangler d1 execute kaliabe-flare --remote --file=../worker/seed.sql
cd worker && npx wrangler deploy
cd web    && npx wrangler pages deploy public --project-name=kaliabe-flare-web --branch=production
```

## Honesty constraints

- A **derived, open-data** record — never an official determination, never an operator endorsement.
- Every figure carries its source and method version; estimates are labelled estimates.
- No "we detect all leaks" claim — single-blind tests show nobody does.
- Where an input is missing, features degrade honestly rather than substituting a guess.

## Project

Built by **Kaliabe** (Tiger Dojo). Origin: `Kaliabe-Detection-App-Research.md` §4 C1.
Method and confidence: [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) ·
Build record: [`docs/BUILD-COST.md`](docs/BUILD-COST.md).
