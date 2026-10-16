# Data Sources & Licences — Kaliabe Flare Ledger

All data in this ledger is **license-clean open data**. Each source, its
contents, licence, and access method are listed below.

## Primary datasets

| Dataset | Contents used | Licence | Access |
|---|---|---|---|
| **NOAA VIIRS Nightfire (VNF)** | Nighttime flare heat — location, temperature, radiance, timing | Open (NASA/NOAA; EOG Colorado School of Mines) | https://eogdata.mines.edu/products/vnf/ |
| **World Bank GFMR — Individual Flare Locations** | Per-site, per-year flare volumes 2012–2025 + operator/field attribution | Free with attribution | https://www.worldbank.org/en/programs/gasflaringreduction/global-flaring-data |
| **NUPRC Flare Gas Regulations Gazette (2022)** | Penalty basis: US$2.00 / 1,000 scf (28.317 m³) | Public government gazette | https://ngfcp.nuprc.gov.ng/ |

## Production chain (how the seed was built)
1. Downloaded the World Bank GFMR **"Flare Volume Estimates by Individual Flare
   Location 2012–2025"** XLSX (open download, free with attribution).
2. Filtered to Nigeria (`Country == Nigeria`), which yields **6,664 site-year
   observations across 476 unique sites** and 40 named operators (NEPL, ExxonMobil,
   Oando, NNPC, TotalEnergies, Chevron, etc.).
3. Aggregated to `data/gfmr_nigeria_sites_seed.json` and generated
   `worker/schema.sql` + `worker/seed.sql` for D1 seeding.

## Live ingestion status
- Raw per-night VIIRS Nightfire files at eogdata.mines.edu require an **EOG account
  login** (eogauth.mines.edu). Until that credential exists, the ledger is fed by the
  **published GFMR per-site dataset**, which is itself VIIRS Nightfire–derived and
  license-clean. This is documented as a "stub" on the data page rather than faked.
- Optional future feeds: CAMS Methane Hotspot CSV (open, ECMWF/Copernicus attribution).

## What we do NOT ingest
- **Kayrros Methane Watch / GHGSat / Enverus** — proprietary SaaS with ToS that
  restricts scraping/redistribution. Study-only benchmarks, never ingested.
- **MethaneSAT** — sensor offline since June 2025; not treated as a live feed.
- **Project Eucalyptus** — non-commercial licence; method studied, not copied.

## Verification
- 476 sites sum to ≈ **6.60 bcm** in the latest year (2025), consistent with Nigeria's
  published flaring scale (World Bank GFMR 2025: Nigeria among top-9 flarers).
- Penalty cross-check (NEPL): 1,510.5 mill. m³ = 1.5105e9 m³ × 35.3147 scf/m³
  = 53.34e9 scf ÷ 1000 × $2.00 = **$106.7M** — as served by `/api/operators`. ✓

## Citation
- World Bank, *Global Gas Flaring Tracker* (2025–2026 reports) — https://www.worldbank.org/en/programs/gasflaringreduction/global-flaring-data
- World Bank, *Gas Flaring Estimates: Methodology for determining flare gas volumes from satellite data* — https://pubdocs.worldbank.org/en/853661587048977000/Estimation-of-flare-gas-volumes-from-satellite-data-002.pdf
- Schuit et al. 2023, methane hot-spot detection (CAMS/ECMWF) — https://confluence.ecmwf.int/spaces/CKB/pages/505389789/Methane+Hotspot+Explorer+documentation