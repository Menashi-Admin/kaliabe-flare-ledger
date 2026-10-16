# Kaliabe Flare Ledger — Nigeria

**Nigeria's first transparent flare ledger.** An open-data flare verification
and verdict engine for the Niger Delta: every flare site is attributed to an
operator and given a verdict — verified / unverified / penalty due (₦ & US$) /
methane-equivalent loss / trend — with the **detection floor and confidence
published on every record**.

Built by Kaliabe (Tiger Dojo). Spec: `menashi-brain/AI-BRAIN/02-Projects/Kaliabe-Detection-App-Research.md` §4 C1.

## Contents
- **Worker** (`worker/`) — Cloudflare Worker + D1. Seeds the flare-site table from
  World Bank GFMR individual-flare-site data (NOAA VIIRS Nightfire derived),
  computes verdicts + NUPRC penalty + methane-equivalent loss, serves the API + CSV digest.
- **Web** (`web/public/`) — static gallery-grade SPA: the Kaliabe Atlas overlay
  (`js/atlas.js` — our own layer system on Leaflet: flare sites, pipelines, states,
  LGAs, basemap switch, per-flare detail drawer with series sparkline and
  client-side state/LGA/nearest-pipeline context), operator compliance cards,
  site-verdict table, methodology & data pages.
- **Pages Function** (`web/functions/api/[[path]].js`) — same-origin proxy so
  `kaliabe-flare-web.pages.dev/api/*` (incl. the CSV download) reaches the Worker.
- **Data** (`data/gfmr_nigeria_sites_seed.json`) — the committed real seed
  (476 unique Nigeria sites, 2012–2025).

## Live URLs (preview)
- Frontend: `https://kaliabe-flare-web.pages.dev`
- API/Worker: `https://kaliabe-flare.menashiconsulting.workers.dev`
- Digest CSV: `https://kaliabe-flare-web.pages.dev/api/digest.csv` (proxied to the Worker)

## API
| Endpoint | Returns |
|---|---|
| `/api/health` | service status |
| `/api/summary` | country + Niger Delta totals |
| `/api/sites` | per-site verdicts (latest year) with penalty, CO₂e, confidence, trend (`trend_pct`, `trend_label`, `trend_basis`), full `year_series`, plus `meta` (constants + sources) |
| `/api/sites/trend` | lightweight markers for the map |
| `/api/operators` | per-operator compliance cards |
| `/api/digest.csv` | full per-year CSV digest (`flaring_vol_million_m3`, `bcm`, `mmscfd`) |

## Verdict & penalty math (reproducible)
1. **Volume** (mill. m³/yr) comes from GFMR per-site estimates (VIIRS Nightfire radiance → flow, World Bank calibration).
2. **Penalty (US$)** = `vol_m3 × 35.3147 scf/m³ ÷ 1000 × US$2.00`
   — NUPRC 2022 Flare Gas Regulations Gazette basis (US$2.00 / 1,000 scf = 28.317 m³).
3. **CO₂e / methane-equivalent** = GFMR global ratios (151 bcm ≈ 389 Mt CO₂e incl. 46 Mt CH₄).
4. **Verdict** = `verified_flare` if positive volume in latest record, else `unverified` (below floor / cloud-obscured).
5. **Confidence** = raised by record coverage (share of years with a positive detection) + named operator; capped at 0.98.
6. **Trend** = mean of last 3 years vs mean of up to 5 preceding years; ±5% = stable; `new` when there is no baseline volume (no % defined), `inactive` when neither window has detections.

## Build & deploy
```bash
# Worker
cd worker
npm install
npx wrangler d1 execute kaliabe-flare --remote --file=../worker/schema.sql
npx wrangler d1 execute kaliabe-flare --remote --file=../worker/seed.sql
npx wrangler deploy

# Web (deploys web/functions too — run from web/)
cd web
npx wrangler pages deploy public --project-name=kaliabe-flare-web --branch=production

# Rebuild derived artefacts
python3 scripts/compact_layers.py     # round layer coords to 5 dp, drop unused props
python3 scripts/build_digest_csv.py   # static CSV snapshot, same columns as /api/digest.csv
```

## Honesty & independence
- Verified, license-clean open data only. **Nothing is scraped** from Kayrros/GHGSat/Enverus (proprietary ToS).
- Live per-night VIIRS Nightfire (VNF) ingest is a **stub pending an EOG account** — noted on the data page, not faked.
- Not affiliated with or endorsed by NUPRC, NNPC, or any operator. Penalty figures are **derived estimates**, never official assessments.

## Next slices
- **C4 Energy Worth API** rides the same spine (flared-into-money, monetisation value per site/region).
- **C3 MethaneVAR** — the cheap, fast methodology + verdict calculator companion.

## Map overlay layers
| Layer | Source | Licence |
|---|---|---|
| Flare sites (476) | World Bank GFMR / NOAA VIIRS Nightfire, via the Worker API | Free with attribution |
| Oil & gas pipelines (154) | USGS Africa O&G infrastructure (`DsgAttr01` commodity, `02` origin, `03` destination, `04` length km) | Public domain |
| States (37) | geoBoundaries gbOpen NGA ADM1 (GRID3) | CC BY 4.0 |
| LGAs (774, loaded at idle) | geoBoundaries gbOpen NGA ADM2 (GRID3) | CC BY 4.0 |

## Licences
- World Bank GFMR individual flare data — free with attribution.
- NOAA VIIRS Nightfire (EOG / Payne Institute) — open.
- NUPRC Gazette — public government document.
See `web/public/data.html` and `docs/DATA-LICENCES.md`.