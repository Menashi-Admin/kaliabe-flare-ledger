# Kaliabe Flare Ledger

**Nigeria's first transparent flare ledger** — an open-data flare verification and
decision layer for the Niger Delta.

> Every flare site is attributed to an operator, scored with a verdict, and published with its
> **detection floor and confidence**. Built on open, revocable-by-nobody data. Not affiliated
> with, or endorsed by, NUPRC.

**Live:** [kaliabe-flare-web.pages.dev](https://kaliabe-flare-web.pages.dev)
**API:** [kaliabe-flare.menashiconsulting.workers.dev](https://kaliabe-flare.menashiconsulting.workers.dev)
**CSV digest:** [kaliabe-flare-web.pages.dev/api/digest.csv](https://kaliabe-flare-web.pages.dev/api/digest.csv)
**Why it exists:** [blog/why-this-page-exists](https://kaliabe-flare-web.pages.dev/blog/why-this-page-exists/)

---

### Work with this project

- **Read & advertise:** `README.md` (this) · `ARCHITECTURE.md` · `INTEGRATIONS.md` ·
  `blog/why-this-page-exists.md`
- **Extend or fix:** `CONTRIBUTING.md` · `docs/DEVELOPMENT.md` · `docs/FEATURE-SET.md`
- **Method & data:** `docs/METHODOLOGY.md` · `docs/DATA-LICENCES.md` ·
  `docs/DATA-SOURCES-REGISTRY.md`
- **Licence:** MIT (`LICENSE`)
**Decision brief (national):** [kaliabe-flare-web.pages.dev/api/brief?scope=national](https://kaliabe-flare-web.pages.dev/api/brief?scope=national)

---

## Why it exists

Methane and flare data is abundant and fragmented — satellite operators, regulators and academics
all publish detections. Nobody publishes a **neutral, site-level verdict that a decision-maker
can act on and cite**. The Ledger occupies that layer for Nigeria:

- **476 flare sites** across **40 operators**, 2012–2025 (World Bank GFMR, June 2026 release,
  three-satellite methodology)
- **405** inside the nine Niger Delta states, **70** offshore beyond the state boundary (labelled
  separately), **1** elsewhere
- **6.60 bcm** flared in the latest year, with a modelled penalty of **US$466.2 m at the $2.00
  tier / US$116.6 m at the $0.50 tier** under the *Flare Gas (Prevention of Waste and Pollution)
  Regulations, 2018* (S.I. No. 9 of 2018), Reg. 13. We do not hold production rates, so both tiers
  are shown and no midpoint is used.
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
    MMscfd; a year-by-year bar chart; trend (with a significance rule); verdict; confidence;
    detection floor; penalty at both Reg. 13 tiers in US$ and ₦; CO₂e and unburned CH₄; numbered
    sources
  - **computed in the browser**: the containing state and LGA, and the nearest pipeline with its
    commodity and distance
  - shareable per-site links (`#site=<id>`); table rows open the map
- **Decision layer (Wave 1)**:
  - a **year player** (2012→2025) under the map, with year totals;
  - national and per-operator **trend lines** with 3-yr and 5-yr change and a labelled
    projection;
  - **peer percentiles**, a sortable **league table**, and **penalty exposure** (current,
    cumulative, projected);
  - a **scenario slider** ("reduce flaring by X%");
  - a **watchlist** of rising, newly detected and top-decile sites;
  - an exportable **decision brief** (print-to-PDF HTML + CSV) for any site, operator or the
    nation.
- **Live & opportunity (KFL-M 1.3)**: every site carries
  - **population demand**: GRID3 v3.0 people within 5/10/25/50 km, the nearest named settlement and the
    largest centre within 25 km;
  - a **Generation opportunity** block (estimates): gas wasted (GWh/yr), the generator it could fuel
    (MW), the households it could power, and the people within 10 km without electricity access
    (WDI + NDHS 2023-24 state proxy);
  - a **live thermal check**: NASA FIRMS VIIRS 375 m, pulled daily by a GitHub Action. It reports
    nights detected, mean bright_ti4 and FRP, a "Live now" indicator, and an **under-report flag**
    where the archive says *falling* but the flare still burns on ≥50% of nights. There is also a
    toggleable *Live thermal (last 24h)* layer;
  - **security context**: ACLED reported events by LGA (via HDX) with a 12-month trend and a
    toggleable LGA layer. Point-radius counts are pending a myACLED account.
- **Operator compliance cards** and a **site-verdict table**
- **Weekly CSV digest** of every site-year (6,664 rows)
- **Methodology and data** pages carrying the caveats, the licences and every threshold
  (rendered from `ledger-core.js`)
- **Writing**: the launch note, [Why this page exists](https://kaliabe-flare-web.pages.dev/blog/why-this-page-exists/)
- **Source registry**: `scripts/validate_sources.py` → [`docs/DATA-SOURCES-REGISTRY.md`](docs/DATA-SOURCES-REGISTRY.md)
  (reachability, vintage, checksum and licence for every source; exits non-zero if one is
  unreachable)

## Where it's going

Wave 1 of the decision layer and the Wave 2 enrichment layers (live & opportunity, KFL-M 1.3) are
live (above). Next come the rest of Wave 2's commercial hooks: normalised
intensity, abatement economics, the EU methane-threshold check, supplier scorecards and a
site risk score. The full spec, sequenced by value per unit of effort, is in
[`docs/FEATURE-SET.md`](docs/FEATURE-SET.md).

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
| World Bank GFMR — individual flare locations 2012–2025, June 2026 release (NOAA VIIRS Nightfire derived, three satellites) | flare sites + annual volumes | open, attribution |
| World Bank Global Gas Flaring Tracker, June 2026 | emissions ratios (167 bcm → 429 MtCO₂e incl. 50 MtCO₂e methane) | open, attribution |
| NOAA/VIIRS Nightfire (Payne Institute, Colorado School of Mines) | upstream of GFMR | open |
| Flare Gas (Prevention of Waste and Pollution) Regulations, 2018 — S.I. No. 9 of 2018, Gazette No. 88 Vol. 105 | penalty basis, Reg. 13: US$2.00 (≥10,000 bbl/d) / US$0.50 (<10,000 bbl/d) per 1,000 scf | public regulation |
| geoBoundaries gbOpen NGA (GRID3) | state + LGA boundaries; Niger Delta nine-state boundary | CC BY 4.0 |
| Natural Earth / USGS Africa O&G pipelines | pipeline overlay | public domain |
| GRID3 NGA Population v3.0 (100 m) + GRID3 Settlement Points | population within 5–50 km, nearest settlement | CC BY 4.0 |
| World Bank WDI (Tracking SDG7) + Nigeria DHS 2023-24 | electricity-access context, state rural proxy | CC BY 4.0 / DHS terms |
| NASA FIRMS (LANCE) VIIRS 375 m NRT | live thermal check + last-24h layer (daily) | NASA open data |
| ACLED Nigeria (LGA monthly, via HDX) + OCHA COD-AB | security context | ACLED terms (attribution; non-commercial) / CC BY-IGO |

Proprietary monitoring (Kayrros, GHGSat, Enverus) is **studied, never ingested**. Full detail:
[`docs/DATA-LICENCES.md`](docs/DATA-LICENCES.md).

## Reproduce it

```bash
python3 scripts/build_seed.py                 # GFMR workbook → Nigeria seed
python3 scripts/fetch_layers.py               # states + pipelines
python3 scripts/fetch_layers2.py              # LGAs
python3 scripts/compact_layers.py             # simplify geometry
python3 scripts/classify_niger_delta.py       # nine-state point-in-polygon → worker/src/niger-delta.json
python3 scripts/gen_sql.py                    # seed JSON → seed.sql
python3 scripts/build_blog.py                 # blog/*.md → web/public/blog/
pip install -r scripts/requirements-enrich.txt   # numpy, rasterio, openpyxl (1.3 enrichment only)
python3 scripts/pop_demand.py                 # GRID3 raster → web/public/data/pop_demand.json
python3 scripts/fetch_access_rates.py         # WDI + NDHS → web/public/data/access_rates.json
python3 scripts/ingest_acled.py               # ACLED (HDX) → security.json + layers/security-lga.geojson
python3 scripts/live_thermal.py               # NASA FIRMS → web/public/data/live/ (daily via GitHub Action)
python3 scripts/validate_sources.py           # source registry; non-zero if a source is unreachable
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

## Commodity cost tracker (KCC 1.0)

A separate surface from the Flare Tracker: `web/public/kcc.html` and `/api/kcc/quote?from=..&to=..&commodity=..` give a low / central / high cost per tonne to move a commodity between two Nigerian places, on an open owned rate model. Negotiation-planning ranges, not quotes. Method, assumptions, sources and gaps: [`docs/METHODOLOGY-KCC.md`](docs/METHODOLOGY-KCC.md). Build: `scripts/build_commodities.py`, `scripts/build_route_table.py`, `scripts/kcc_reference.mjs`.
