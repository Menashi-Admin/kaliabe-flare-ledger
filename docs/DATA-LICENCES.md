# Data Sources & Licences — Kaliabe Flare Ledger

All data in this ledger is **license-clean open data**. Each source, its
contents, licence, and access method are listed below.

## Primary datasets

| Dataset | Contents used | Licence | Access |
|---|---|---|---|
| **NOAA VIIRS Nightfire (VNF)** | Nighttime flare heat — location, temperature, radiance, timing | Open (NASA/NOAA; EOG Colorado School of Mines) | https://eogdata.mines.edu/products/vnf/ |
| **World Bank GFMR — Individual Flare Locations** | Per-site, per-year flare volumes 2012–2025 + operator/field attribution. **Vintage: June 2026 release** (three-satellite VIIRS method; series restated back to 2012) | Free with attribution | https://www.worldbank.org/en/programs/gasflaringreduction/global-flaring-data |
| **World Bank Global Gas Flaring Tracker, 23 June 2026** | Emissions ratios: 167 bcm → 429 MtCO₂e incl. 50 MtCO₂e unburned methane (1.8 Mt CH₄) | Free with attribution | same page |
| **Flare Gas (Prevention of Waste and Pollution) Regulations, 2018** — S.I. No. 9 of 2018, Official Gazette No. 88, Vol. 105, 9 July 2018 | Penalty basis, Reg. 13: US$2.00 per 1,000 scf (28.317 m³) where ≥10,000 bbl oil/day; US$0.50 where less. Exemptions: force majeure; Deliver-or-Pay volumes (Reg. 13(3)) | Public government gazette | https://ngfcp.nuprc.gov.ng/wp-content/uploads/2022/09/FGN-Official-Gazette-on-Flare-Gas-v2.0-002.pdf (scanned; 2022 in the URL is the upload date) |
| **geoBoundaries gbOpen NGA ADM1/ADM2 (GRID3)** | States, LGAs, and the Niger Delta nine-state boundary used for `in_niger_delta` | CC BY 4.0 (machine-read from the geoBoundaries API) | https://www.geoboundaries.org/ |

Reachability, vintage, checksums and licences are re-checked by `scripts/validate_sources.py`,
which writes [`DATA-SOURCES-REGISTRY.md`](DATA-SOURCES-REGISTRY.md).

## Production chain (how the seed was built)
1. Downloaded the World Bank GFMR **"Flare Volume Estimates by Individual Flare
   Location 2012–2025"** XLSX, June 2026 release (open download, free with attribution;
   SHA-256 `8b6052d23c09584d5964d6549026961b5ee8529b9b882edb4073fd6e9bc40354`).
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
- The workbook's global 2025 total is 166.6 bcm, matching the June 2026 tracker's 167 bcm, which
  confirms the vintage.
- Penalty cross-check (NEPL): 1,510.5 mill. m³ = 1.5105e9 m³ × 35.3147 scf/m³
  = 53.34e9 scf ÷ 1000 → **$106.7M at the $2.00 tier / $26.7M at the $0.50 tier**, as served by
  `/api/operators` (`penalty_usd_latest_upper` / `_lower`).

## Citation
- World Bank, *Global Gas Flaring Tracker* (2025–2026 reports) — https://www.worldbank.org/en/programs/gasflaringreduction/global-flaring-data
- World Bank, *Gas Flaring Estimates: Methodology for determining flare gas volumes from satellite data* — https://pubdocs.worldbank.org/en/853661587048977000/Estimation-of-flare-gas-volumes-from-satellite-data-002.pdf
- Schuit et al. 2023, methane hot-spot detection (CAMS/ECMWF) — https://confluence.ecmwf.int/spaces/CKB/pages/505389789/Methane+Hotspot+Explorer+documentation