# Architecture

**Kaliabe Flare Ledger** — an open-data flare verification and decision layer for Nigeria.

## Shape

```
                         open data sources (license-clean)
   ┌───────────────────────────────────────────────────────────────────────┐
   │  World Bank GFMR flare volumes   NOAA/VIIRS Nightfire (Payne Inst.)   │
   │  geoBoundaries NGA ADM1/ADM2     USGS Africa O&G pipelines            │
   │  NUPRC 2022 Flare Gas Regulations Gazette (penalty basis)             │
   └───────────────────────────────────────────────────────────────────────┘
                        │                     │                    │
                   scripts/               scripts/            docs/
                   build_seed.py       fetch_layers.py      METHODOLOGY.md
                        │                     │
                        ▼                     ▼
   ┌────────────────────────────┐   ┌────────────────────────────┐
   │  Cloudflare D1             │   │  Static layer files        │
   │  flare_sites               │   │  web/public/layers/*.geojson│
   │  flare_annual              │   │  states · LGAs · pipelines │
   └────────────────────────────┘   └────────────────────────────┘
                        │                     │
                        ▼                     ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  Cloudflare Worker  "kaliabe-flare"                              │
   │  verdict engine · penalty + CO₂e math · REST API                 │
   │  /api/summary /api/sites /api/sites/trend /api/operators         │
   │  /api/digest.csv /api/health                                     │
   └──────────────────────────────────────────────────────────────────┘
                        │
                        ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  Cloudflare Pages  "kaliabe-flare-web"                           │
   │  index.html · methodology.html · data.html                       │
   │  js/atlas.js  — our own overlay engine on Leaflet                │
   │    · layer panel (flare / pipelines / states / LGAs)             │
   │    · per-flare detail drawer (series, verdict, confidence)       │
   │    · in-browser nearest-pipeline + point-in-polygon context      │
   │  functions/api/[[path]].js — same-origin proxy to the Worker     │
   └──────────────────────────────────────────────────────────────────┘
```

## Why this shape

- **Zero-recurring-cost spine.** Cloudflare Pages + Worker + D1 free tier, plus static GeoJSON.
  Recurring run cost is effectively $0–3/month. A public good should not carry a bill.
- **Separation of verdict from presentation.** All derivation (penalty, CO₂e, confidence,
  detection floor) happens in the Worker, so every surface — site, CSV, API consumer — returns
  the same numbers with the same caveats.
- **Neutral by construction.** Only open, revocable-by-nobody sources. No scraping of
  proprietary monitoring (Kayrros / GHGSat / Enverus are studied, never ingested).
- **Same-origin API.** The Pages Function proxies `/api/*` to the Worker so the site has one
  origin, clean links, and no CORS surface for the browser.

## Repository layout

```
kaliabe-flare-ledger/
├── README.md                 entry point / spotlight
├── ARCHITECTURE.md           this file
├── docs/
│   ├── BUSINESS-CASE.md      who depends on carbon monitoring metrics
│   ├── FEATURE-SET.md        decision-layer overlay + trend spec
│   ├── METHODOLOGY.md        public method + confidence (mirrors the site)
│   ├── DATA-LICENCES.md      every source and its licence
│   ├── CLOUDFLARE-REFS.md    infrastructure reference
│   ├── BUILD-BRIEF.md        the brief handed to the building model
│   ├── BUILD-COST.md         which model/channel produced what
│   └── OPUS-BUILD-OUTPUT.md  build record
├── worker/                   Cloudflare Worker + D1 schema/seed
│   ├── src/index.js          verdict engine + REST API
│   ├── schema.sql            flare_sites, flare_annual
│   ├── seed.sql              generated seed (Nigeria subset)
│   └── wrangler.toml
├── web/                      Cloudflare Pages site
│   ├── public/
│   │   ├── index.html        map + operators + verdicts
│   │   ├── methodology.html  method + confidence
│   │   ├── data.html         sources + licences
│   │   ├── css/base.css
│   │   ├── js/app.js         page wiring
│   │   ├── js/atlas.js       our overlay engine
│   │   └── layers/*.geojson  states · LGAs · pipelines
│   └── functions/api/[[path]].js
├── data/                     seed inputs (GFMR Nigeria subset)
└── scripts/                  reproducible build + fetch scripts
    ├── build_seed.py         GFMR XLSX → seed JSON
    ├── extract_gfmr_nigeria.py
    ├── fetch_layers.py       states + pipelines
    ├── fetch_layers2.py      LGAs
    ├── compact_layers.py     simplify/round layer geometry
    ├── gen_sql.py            seed JSON → seed.sql
    └── build_digest_csv.py   → weekly CSV digest
```

## Data flow (reproducible end to end)

1. `python3 scripts/build_seed.py` — rebuild the Nigeria seed from the World Bank GFMR workbook.
2. `python3 scripts/fetch_layers.py && python3 scripts/fetch_layers2.py` — refresh overlay layers.
3. `python3 scripts/compact_layers.py` — simplify geometry for the web.
4. `python3 scripts/gen_sql.py` — generate `worker/seed.sql`.
5. `cd worker && npx wrangler d1 execute kaliabe-flare --remote --file=../worker/schema.sql`
   then `--file=../worker/seed.sql`, then `npx wrangler deploy`.
6. `cd web && npx wrangler pages deploy public --project-name=kaliabe-flare-web --branch=production`.

## Method and honesty

The full method and its limits live in `docs/METHODOLOGY.md` and on the site's methodology page.
In short: VIIRS measures flare **heat**; volume follows a radiance→flow calibration carrying
uncertainty; every verdict therefore carries a **detection floor** and a **confidence**. The
Ledger is a derived, open-data record — it is never an official NUPRC determination and carries
no operator endorsement.
