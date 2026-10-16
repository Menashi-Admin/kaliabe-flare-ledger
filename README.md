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
- **Web** (`web/public/`) — static gallery-grade SPA: Leaflet Niger-Delta map,
  operator compliance cards, site-verdict table, methodology & data pages.
- **Data** (`data/gfmr_nigeria_sites_seed.json`) — the committed real seed
  (476 unique Nigeria sites, 2012–2025).

## Live URLs (preview)
- Frontend: `https://kaliabe-flare-web.pages.dev`
- API/Worker: `https://kaliabe-flare.menashiconsulting.workers.dev`
- Digest CSV: `https://kaliabe-flare.menashiconsulting.workers.dev/api/digest.csv`

## API
| Endpoint | Returns |
|---|---|
| `/api/health` | service status |
| `/api/summary` | country + Niger Delta totals |
| `/api/sites` | per-site verdicts (latest year) with penalty, CO₂e, confidence |
| `/api/sites/trend` | lightweight markers for the map |
| `/api/operators` | per-operator compliance cards |
| `/api/digest.csv` | full per-year CSV digest |

## Verdict & penalty math (reproducible)
1. **Volume** (mill. m³/yr) comes from GFMR per-site estimates (VIIRS Nightfire radiance → flow, World Bank calibration).
2. **Penalty (US$)** = `vol_m3 × 35.3147 scf/m³ ÷ 1000 × US$2.00`
   — NUPRC 2022 Flare Gas Regulations Gazette basis (US$2.00 / 1,000 scf = 28.317 m³).
3. **CO₂e / methane-equivalent** = GFMR global ratios (151 bcm ≈ 389 Mt CO₂e incl. 46 Mt CH₄).
4. **Verdict** = `verified_flare` if positive volume in latest record, else `unverified` (below floor / cloud-obscured).
5. **Confidence** = raised by record coverage + named operator; capped at 0.98.

## Build & deploy
```bash
# Worker
cd worker
npm install
npx wrangler d1 execute kaliabe-flare --remote --file=../worker/schema.sql
npx wrangler d1 execute kaliabe-flare --remote --file=../worker/seed.sql
npx wrangler deploy

# Web
cd web
npx wrangler pages deploy public --project-name=kaliabe-flare-web --branch=production
```

## Honesty & independence
- Verified, license-clean open data only. **Nothing is scraped** from Kayrros/GHGSat/Enverus (proprietary ToS).
- Live per-night VIIRS Nightfire (VNF) ingest is a **stub pending an EOG account** — noted on the data page, not faked.
- Not affiliated with or endorsed by NUPRC, NNPC, or any operator. Penalty figures are **derived estimates**, never official assessments.

## Next slices
- **C4 Energy Worth API** rides the same spine (flared-into-money, monetisation value per site/region).
- **C3 MethaneVAR** — the cheap, fast methodology + verdict calculator companion.

## Licences
- World Bank GFMR individual flare data — free with attribution.
- NOAA VIIRS Nightfire (EOG / Payne Institute) — open.
- NUPRC Gazette — public government document.
See `web/public/data.html` and `docs/DATA-LICENCES.md`.