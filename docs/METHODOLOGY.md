# Methodology & Confidence

**Kaliabe Flare Ledger · method version KFL-M 1.3 (2026-10-17)**
Mirrors the site's [methodology page](https://kaliabe-flare-web.pages.dev/methodology.html). The
code that implements each rule is named next to it.

- Every **constant** lives in `worker/src/index.js` and is published as `meta.constants`.
- Every **threshold** lives in `THRESHOLDS` in `web/public/js/ledger-core.js`. It is published as
  `meta.thresholds`, and the site's methodology page renders its threshold table from that object.

### Change log

| Version | Date | Change |
|---|---|---|
| **KFL-M 1.3** | 2026-10-17 | **Enrichment — live & opportunity** (§9). Population within 5/10/25/50 km (GRID3 v3.0); power-gap estimates (`core.powerGap`); electricity-access context (WDI, NDHS 2023-24) with a derived state rural proxy; live NASA FIRMS thermal check with an under-report flag (`core.liveCheck`); ACLED LGA security context and 12-month trend (`core.secTrend`). New thresholds: `live_min_window_nights`, `live_burning_night_share_pct`, `sec_trend_band_pct`, `sec_trend_min_abs_events`. No change to verdicts, trends or penalties. |
| KFL-M 1.2 | 2026-10-17 | **Penalty basis corrected.** The governing instrument is the Flare Gas (Prevention of Waste and Pollution) Regulations, **2018** (S.I. No. 9 of 2018), not "NUPRC 2022 Regulations". Every penalty is now shown at **both** Reg. 13 tiers ($2.00 / $0.50) and no midpoint is used; the exemptions are stated. GFMR vintage labelled (June 2026 release, three-satellite method). Emissions ratios updated to the June 2026 tracker, and unburned methane is now reported as CH₄ mass (1.1 labelled a CO₂e quantity "t CH₄"). Niger Delta now by the nine-state boundary, with offshore sites labelled. Thresholds named and explicit: significance rules, rising floor, peer-set rules, top-decile cut-off, scenario rounding. |
| KFL-M 1.1 | 2026-10-16 | Decision layer Wave 1. |

> **Independence.** The Ledger is an independent, open-data project. It is not affiliated with,
> endorsed by, or reporting for NUPRC, NNPC or any operator. Every figure is a **derived
> estimate**. None is a regulatory determination.

---

## 1. What VIIRS measures

Flares are detected by **NOAA VIIRS Nightfire (VNF)**, produced by the Earth Observation Group
(Payne Institute, Colorado School of Mines). VIIRS records short-wave and mid-wave infrared
radiance at night and fits a Planck curve to each hot pixel. That gives a temperature, a source
area and a radiant heat estimate. Gas flares burn at about 1,400–2,000 K, hotter than biomass
fires or industrial sources, so detections above ~1,400 K are treated as flare candidates [2][3].

**VIIRS measures heat, not gas.** It does not see methane or flow directly. Every volume in the
Ledger is the output of a calibration (§2), not a measurement of a molecule.

## 2. Radiance → flow calibration and its uncertainty

Site volumes come from the **World Bank Global Flaring and Methane Reduction (GFMR)** partnership's
*Flare Volume Estimates by Individual Flare Location, 2012–2025* [1]. GFMR converts each site's
annual radiant heat into a gas volume using a calibration fitted against reported national flaring
statistics [3].

**Vintage.** The seed is the workbook released with the **Global Gas Flaring Tracker of 23 June 2026**
(URL path `…-0400072026/related/Flare-Volume-Estimates-by-individual-Flare-Location-2012-2025.xlsx`;
workbook created 2026-06-08; SHA-256 `8b6052d2…0bc40354`, which matches the live file per
`docs/DATA-SOURCES-REGISTRY.md`).

- **Method.** That release uses the new GFMR / Payne Institute methodology: three VIIRS satellites
  (Suomi NPP, NOAA-20, NOAA-21) instead of one, multi-year flare location tracking and a revised
  volume calibration.
- **Restated series.** The whole 2012–2025 series was restated, so it does not match pre-2026
  editions.
- **How we checked.** The workbook's global 2025 total is **166.6 bcm**, matching the tracker's
  167 bcm. Its 2024 total is 156.9 bcm, matching the tracker's restated 157 bcm; the July 2025
  edition had said 151 bcm.
- **Where it is shown.** The vintage is stamped in `meta.vintage`, in `meta.data_vintage` and on
  every brief.

The sources of uncertainty, none of which can be removed from satellite data alone:

- **Gas composition.** Heating value varies by field, so equal heat can mean different volumes.
- **Combustion efficiency.** Wind and flare design change how much gas burns.
- **Sampling.** The Niger Delta is cloudy for much of the year, and cloud-obscured nights are
  missed. Annual figures are built from the nights that were clear.
- **Calibration transfer.** One global calibration is applied to every site in every country.

The Ledger therefore treats every volume as **a direction and an order of magnitude**, never an
exact quantity. Units: GFMR publishes **million m³ per site per year**. bcm = million m³ ÷ 1,000,
and MMscfd = million m³ × 35.3147 ÷ 365.

## 3. Detection floor

VIIRS cannot resolve small or intermittent flares, and cloud hides some nights. A site with no
volume in a year is therefore **below the detection floor or obscured**, not "not flaring". Each
record carries its detection floor as text (`detection_floor`).

## 4. Verdicts and confidence (`estimate()` in `worker/src/index.js`)

| Verdict | Rule | Confidence |
|---|---|---|
| **Verified flare** | positive volume in the latest year (2025) | `min(0.98, 0.55 + 0.30 × coverage + 0.08 × named_operator)` |
| **Unverified** | zero or no volume in the latest year | `0.40` |

- `coverage` = the number of years with a positive detection ÷ the number of years in the record
  (`latest_year − first_year + 1`). A zero-volume year is a non-detection and does not count as
  coverage.
- `named_operator` = 1 when the site has an operator other than "Unattributed".
- The cap at **0.98** is deliberate: the calibration uncertainty in §2 never goes away.

**Trend label** (`computeTrend()`). The mean of the last 3 years is compared with the mean of up to 5
years before them. A record shorter than 4 years compares its last year with its first.
- Within ±5% the trend is **stable**.
- Beyond ±5%, it is **rising** or **falling** only if the change is **significant**:
  - the two window means differ by at least **0.5 million m³/yr**, *and*
  - each window has at least **2 detected years** (or every year, if the window is shorter).
- Otherwise the trend is **not significant** (`not_significant`), and `trend_significance` gives the
  reason. A window made of non-detections may be cloud or below-floor flaring, and below the floor
  is not the same as not flaring.
- No baseline volume but recent detections is **new** (no percentage is defined).
- No detections in either window is **inactive**.

On the live set (476 sites) this gives 72 rising, 126 falling, 10 stable, 213 not significant,
34 new and 21 inactive. Under 1.1 it was 98 rising and 313 falling. Most of the difference is sites
that dropped below the detection floor in the recent window: 1.1 called them "falling", and 1.2
declines to.

## 5. Penalty basis and conversion constants

**Instrument.** *Flare Gas (Prevention of Waste and Pollution) Regulations, 2018*, S.I. No. 9 of 2018 —
Federal Republic of Nigeria Official Gazette No. 88, Vol. 105, 9 July 2018 (made 5 July 2018 under s.9
Petroleum Act and s.5 Associated Gas Reinjection Act) [4]. KFL-M ≤1.1 cited "NUPRC 2022 Regulations",
which was **incorrect**.

**Regulation 13** sets a **tiered** flare payment on the volume of gas flared, by production rate, "irrespective of
whether the flaring is Routine or Non-Routine":

| Tier | Applies where the OML or marginal field produces | Rate | Ledger use |
|---|---|---|---|
| Reg. 13(1) | **10,000 bbl of oil per day or more** | **US$2.00** per 28.317 scm (1,000 scf) | upper bound |
| Reg. 13(2) | **less than 10,000 bbl of oil per day** | **US$0.50** per 28.317 scm (1,000 scf) | lower bound |

> **Assumption.** We do not hold production rates; the regulation sets $2.00 (≥10,000 bbl/d) or $0.50
> (<10,000 bbl/d). We therefore publish every penalty at **both tiers** — current, cumulative, projected and
> scenario — and **never a midpoint**. The tier depends on production in the whole lease or field, not on one flare.

**Exemptions** (stated, not deducted, because the volumes involved cannot be seen from satellite data):
- **Force majeure** — the provisos to Reg. 13(1)–(2): no liability where the flaring was caused by an act of
  war, community disturbance, insurrection, storm, flood, earthquake or other natural phenomenon beyond the
  producer's reasonable control.
- **Deliver-or-Pay** — Reg. 13(3): no flare payment on an agreed volume of flare gas committed to a Permit
  Holder under a Deliver or Pay Agreement, from the start of commercial operations of the flare reduction project.

Not modelled: the additional US$2.50 per 1,000 scf payment for specified non-compliance (Reg. 19).

| Constant | Value | Source |
|---|---|---|
| Penalty, upper tier | **US$2.00 per 1,000 scf** | Reg. 13(1) [4] |
| Penalty, lower tier | **US$0.50 per 1,000 scf** | Reg. 13(2) [4] |
| scf per m³ | 35.3146667 | exact unit conversion |
| m³ per 1,000 scf | 28.317 | derived from the above; equals the Regulations' 28.317 scm |
| CO₂e per bcm flared | 429 ÷ 167 = **2.569 Mt CO₂e** | GFMR tracker, June 2026 (data year 2025): 167 bcm → 429 MtCO₂e [1] |
| Unburned CH₄ (as CO₂e) per bcm | 50 ÷ 167 = **0.2994 Mt CO₂e** | same: "including 50 MMtCO₂e in the form of unburned methane" [1] |
| Unburned CH₄ (mass) per bcm | 1.8 ÷ 167 = **0.01078 Mt CH₄** | same: "(1.8 million tonnes)" [1] |
| ₦ per US$ | 1,550 | indicative display snapshot only |

*Superseded (KFL-M ≤1.1), kept for traceability:* the July 2025 tracker (data year 2024, single-satellite
method), 151 bcm ≈ 389 MtCO₂e incl. 46 MtCO₂e methane, gave 2.576 Mt CO₂e/bcm and 0.3046/bcm. The second
figure was labelled "t CH₄", but it is methane expressed as CO₂e, not CH₄ mass.

Penalty (US$) = volume (m³) ÷ 28.317 × rate. For example, Oso flared 308.37 million m³ in 2025, which
gives **US$21.78 m at the $2.00 tier** and **US$5.44 m at the $0.50 tier**. The national 2025 figure is
**US$466.2 m / US$116.6 m**.

- **Not an assessment.** These are derived estimates on the published basis, not NUPRC assessments.
  Actual liabilities depend on facts the Ledger cannot see: the producer's production rate, reported
  volumes and exempt volumes.
- **Emissions ratios.** The CO₂e and CH₄ figures use a global average ratio. They are
  order-of-magnitude estimates, not site-level combustion modelling.

## 6. Decision-layer derivations and thresholds (`seriesStats()` / `rank()` / `topDecile()` / `THRESHOLDS`)

These add framing to the GFMR series, not new data. They are computed once per request in the
Worker and shared by the site, the API and the decision brief.

### Thresholds (all in `THRESHOLDS`, `web/public/js/ledger-core.js`)

| Key | Default | Rule and reason |
|---|---|---|
| `trend_stable_band_pct` | 5 | A recent-vs-baseline change within ±5% is *stable*. |
| `trend_min_abs_change_million_m3` | 0.5 | A trend direction also needs the window means to differ by ≥ 0.5 million m³/yr; below that it is within detection noise ("not significant"). |
| `trend_min_detected_years` | 2 | Both trend windows need ≥ 2 detected years (or every year, if shorter); otherwise "not significant". |
| `change_min_abs_million_m3` | 0.5 | A 3-/5-yr change is significant only if it moves ≥ 0.5 million m³ *and* beyond ±5%. Non-significant changes are shown muted with "n.s.", and `change_Nyr_significant` is `false`. |
| `rising_pct_options` / `rising_pct_default` | 25 / 50 / 100; default **25** | Watchlist "rising": the 3-yr change must reach the chosen % … |
| `rising_min_added_million_m3` | **0.5** | … **and** add ≥ 0.5 million m³, for every % option. **Why the absolute floor:** a percentage on a tiny base is real but immaterial (0.01 → 0.05 million m³ is +400%). The floor keeps the list to changes that matter in volume. Rows show both the volume added and the %. |
| `small_base_million_m3` | 1 | A base-year volume below 1 million m³ flags the percentage as "small base". For example, Egbema West (s_4041a), 0.56 → 284.87 million m³, is shown as "+284.3 M m³ · +50,770% · small base (0.56)". |
| `newly_detected_years` | 2 | "Newly detected" = first positive volume in the latest year or the year before. |
| `top_decile_fraction` | 0.1 | Top decile = latest-year volume ≥ the n-th largest of the **full** site set, n = ceil(10% × 476) = 48; ties included. The cut-off (**39.13 million m³** for 2025) is published in `meta.top_decile` and shown in the UI. |
| `scenario_step_pct` / `scenario_sig_figs` | 5 / 3 | The scenario slider moves in 5% steps. Outputs are rounded to 3 significant figures and always carry the "scenario" label and their assumption. |

### Derivations

- **N-yr change** (`change_3yr_pct`, `change_5yr_pct`, with `change_3yr_significant`, `change_5yr_significant`)
  — the latest-year volume vs the volume N years earlier (2025 vs 2022; 2025 vs 2020). It is **undefined**
  when the base year had no detection, because a percentage on a zero base is meaningless.
- **Peer percentile** (`percentile_volume`) — the share of the *other* members of the peer set with a
  strictly smaller latest-year volume ("larger than N%").
  - **Peer set rule:** only members **with a latest-year detection**: 249 of 476 sites, and operators with a
    2025 detection. Members with no detection have no usable value. They are **excluded from the calculation
    and shown as n/a**, never counted as zero.
  - **Improvement percentile** (`percentile_improvement`) ranks the 3-yr change, lower being better, among
    peers with a detected base year (364 of 476 sites). The others are n/a.
  - `peer_set_size` carries `{ volume, improvement, excluded_volume, excluded_improvement }`, and the peer-set
    size is printed wherever a percentile appears (drawer, operator card, league table, brief).
- **Cumulative** (`cumulative_million_m3`, `cumulative_penalty_usd_upper` / `_lower`) — the sum over
  2012–2025 at both tiers. It is **notional**: the Regulations were made in July 2018, and earlier years fell
  under the previous regime.
- **Projection** (`forecast`, each year carrying `penalty_usd_upper` / `_lower`) — a least-squares line
  through the last 3 years (2023–2025), extended 3 years and clamped at zero.
  - Operator and national projections are fitted to the aggregate series, not summed from sites.
  - **It is a projection, not a fact**, and is labelled as one everywhere it appears.
- **Scenario** — "reduce flaring by X%" multiplies the latest-year volume by (1 − X/100). Penalty (both tiers),
  CO₂e and CH₄ are linear in volume, so they scale identically. The maths is `scenario()` in `ledger-core.js`,
  shared by the browser and the Worker. It returns its own `label` and `assumption`, which are always shown.
- **Watchlist** — *rising*, *newly detected* and *top decile*, as in the threshold table.
- **Year player** — each year shows that year's GFMR volume and the penalty at both tiers. Years before 2019
  are labelled notional, because the Regulations date from July 2018.

## 7. Niger Delta classification (`scripts/classify_niger_delta.py`)

KFL-M ≤1.1 used a study rectangle (4.5–8.5° E, 4.5–7.0° N), which misclassified offshore fields
such as Oso. 1.2 uses a real boundary: the union of the **nine Niger Delta states** (Abia, Akwa Ibom,
Bayelsa, Cross River, Delta, Edo, Imo, Ondo, Rivers), taken from the geoBoundaries ADM1 layer we
already ship [5]. Each site is classified by point-in-polygon against all 37 ADM1 units:

| Class | Rule | Count (476) | `in_niger_delta` |
|---|---|---|---|
| `niger_delta` | inside one of the nine states | 405 | true |
| `offshore` | inside no state polygon; labelled with the nearest state and the distance to it | 70 (69 nearest a Niger Delta state, 1 nearest Lagos) | false |
| `outside` | inside a state that is not one of the nine | 1 (Kaduna) | false |

- **Offshore sites are labelled, not bucketed.** They are not counted as Niger Delta, but
  `niger_delta_label` says so explicitly; for example, Oso is "Offshore, beyond the state boundary — nearest
  state Rivers (Niger Delta), 18.3 km". They are counted separately as `offshore_sites`.
- **69 sites changed flag** compared with the rectangle:
  - 27 offshore fields that the rectangle had counted as Niger Delta are now labelled offshore (e.g. Okan,
    Meji, Bonga, Oyo, Meren).
  - 42 sites inside Niger Delta states that the rectangle had missed (mostly Rivers and Bayelsa sites
    south of 4.5° N) are now included (e.g. NLNG, Bonny, Nembe Creek).
- **Coastline caveat.** The ADM1 web layer is simplified, so sites within a few hundred metres of the
  coastline can fall on either side. GFMR's own ONSHORE/OFFSHORE field is kept separately; 33
  GFMR-"OFFSHORE" sites fall inside a state polygon (estuaries, near-shore).
- **Implementation.** The classification is generated into `worker/src/niger-delta.json`, which the Worker
  bundles; it is not read from the D1 `in_niger_delta` column, which is stale until the next reseed.
  `seed.sql` is regenerated with the new flag.

## 8. Decision briefs

`/api/brief?scope=national|operator|site&id=…&cut=0–100&format=html|csv` renders a self-contained,
print-ready brief.

- **Contents:** the headline figures, the trend with its projection, the percentile with its peer
  set, penalty exposure **at both tiers** (with the assumption and exemptions), the scenario (if one is
  set, rounded, with its label and assumption), sources, the method version, the 1.2 change note, the
  GFMR release and the data vintage.
- **One row list:** the HTML and the CSV are built from the same rows, so they cannot disagree.
- **Stamp:** every brief carries the method version and the data vintage.

## 9. Enrichment — live & opportunity (KFL-M 1.3)

These turn each site from a *record* into a *development brief*. **Every number in this section is an
estimate** on the stated assumption, labelled `estimate` in the API (`gap_label`) and on every surface.

### 9.1 Population demand (`scripts/pop_demand.py` → `web/public/data/pop_demand.json`)

- **Source:** GRID3 NGA Population v3.0 — Bayesian-modelled gridded population, 100 m cells (3 arc-seconds),
  scaled to UN-WPP 2025; CC BY 4.0. Downloaded from WorldPop (`wopr.worldpop.org/download/611`, zip SHA-256
  `12a45438…31aee42`, GeoTIFF dated 2025-02-27). Its national sum is 237,527,782, equal to WDI's 2025
  population.
- **Method:** a zonal sum, raster to point. `popNkm` is the sum of the cells whose centre lies within N km
  (great-circle distance) of the site, for N = 5, 10, 25 and 50. Sea cells are no-data and count as zero, so
  offshore sites have small inner rings (Oso: 0 within 10 km, 939,704 within 50 km).
- **Settlements:** GRID3 NGA Settlement Points (eHealth Africa, Proxy Logics, ORNL; released March 2021;
  CC BY 4.0). 80,959 points were fetched (the site bounding box plus ~0.5°).
  - `nearest_settlement` is the nearest named point. Its `nearest_settlement_pop` is the people within
    2 km of that point, because GRID3 points carry no population.
  - `main_centre_25km` is the named point within 25 km with the largest 2-km population.
  - Names are GRID3's. A point may sit inside a larger town: "Ahiahu" near Egbema West lies in Omoku's core,
    hence ~120,000 people within 2 km.
- **State:** the containing state from §7, or the nearest state for offshore sites (labelled).

### 9.2 Electricity-access context (`scripts/fetch_access_rates.py` → `web/public/data/access_rates.json`)

| Figure | Value | Source |
|---|---|---|
| National access, % population | **62.5%** (2024); 61.2% (2023); 59.5% (2021) | World Bank WDI `EG.ELC.ACCS.ZS` (Tracking SDG7), CC BY 4.0, last updated 2026-10-08 |
| Urban / rural | **85.5% / 23.5%** (2024); 85.0% / 32.9% (2023) | WDI `.UR.ZS` / `.RU.ZS` |
| People without access | **≈ 87.3 million** (2024) | derived: WDI population 232.7 m × (1 − 62.5%) |
| NDHS 2023-24 population with electricity | 50.5% total · 77.9% urban · **27.7% rural** | Nigeria DHS 2023-24 (NPC & ICF), DHS Program API `HC_ELEC_P_ELC` |
| Oil-state access (NDHS 2023-24, state-wide) | Bayelsa 64.5 · Rivers 87.3 · Delta 76.4 · Akwa Ibom 61.2 · Edo 89.6 · Imo 62.6 · Ondo 67.5 · Cross River 39.7 · Abia 76.7 (%) | same |

- **The brief's approximations.** The brief quoted "~59% national / ~89% urban / ~33% rural". Those are
  WDI values from 2021–2023. The current WDI vintage (2024) is used instead, and the year-to-year swing in
  the rural series (32.9% → 23.5%) is a survey effect, stated as such.
- **No rural-by-state figure.** Neither WDI nor NDHS publishes one, so the **state rural proxy is derived**:
  NDHS state population-with-electricity × the national rural/total ratio (27.7 ÷ 50.5 = 0.549). For
  example, Rivers 87.3% → 47.9%, Bayelsa 64.5% → 35.4%, Cross River 39.7% → 21.8%.
- **Fallback.** A state without an NDHS figure uses the national NDHS rural rate (27.7%). This does not
  occur for any current site.
- **Caveats:**
  - "With electricity" means a reported connection or supply, not hours of supply.
  - Applying a rural rate to an urban ring (e.g. Port Harcourt) overstates the gap there.

### 9.3 Power gap (`powerGap()` in `ledger-core.js`; constants in `meta.constants.gap`)

| Output | Formula | Assumption |
|---|---|---|
| `gas_available_GWh` | latest-year m³ × **0.0100 MWh/m³** ÷ 1,000 | thermal (higher heating value) energy of methane-rich associated gas (~36–38 MJ/m³) |
| `electric_potential_MW` | gas MWh ÷ 8,760 × **0.40** | simple-cycle gas turbine / gas engine electrical efficiency. The size of generator the gas could fuel continuously. Under 10 MW it is rounded to 0.1 MW, above that to 1 MW |
| `households_servable` | MW × 8,760 × **0.85** ÷ **1.2 MWh/household/yr** | capacity factor 0.85. 100 kWh/month per household, just under the ESMAP Multi-Tier Framework **Tier 4** floor (1,250 kWh/yr; Tier 3 starts at 365). Rounded to 2 s.f. *(The brief called this load "Tier 1/2"; under the MTF it is upper Tier 3.)* |
| `people_within_10km_not_grid` | pop10km × (1 − rural access proxy) | §9.2; rounded to 2 s.f. |

- **Example — Oso (2025: 308.37 million m³):** 3,084 GWh/yr → **141 MW** → **870,000 households**; 0 people
  within 10 km (offshore).
- **Example — Egbema West:** 2,849 GWh/yr → 130 MW → 810,000 households; **79,000** of 120,915 people within
  10 km without access (Imo proxy 34.3%).
- **Roll-ups** (`national.opportunity`, `operator.opportunity`) sum GWh, MW and households. **People are
  not summed**, because the 10 km circles overlap.
- **Not a feasibility study.** These assume that all of the latest year's flare could be captured and
  that the flare continues. Gas quality, capture cost, uptime and offtake are not modelled.

### 9.4 Live thermal check (`scripts/live_thermal.py`, daily; `liveCheck()` in `ledger-core.js`)

- **Source:** NASA FIRMS (LANCE), VIIRS 375 m active fire NRT, collection 2 — Suomi NPP, NOAA-20 and NOAA-21,
  "Northern and Central Africa" regional CSV files (no key). NASA open data, acknowledgement requested.
- **Matching:** detections inside the Nigeria bbox (2.6–14.8° E, 2.8–14.0° N) are assigned to the nearest
  ledger site within **1 km**. On the first snapshot, 93% of the detections within 1.5 km of a site (666 of
  716) fell within 0.5 km.
- **Window and counting:**
  - The window is a rolling 30 UTC dates; the first run seeded 8 dates from the 7-day files.
  - A night counts as detected when a night pass (`daynight = N`) hit the site.
  - `live_nights_detected_pct` = detected nights ÷ nights in the window. FIRMS gives no per-site cloud
    mask, so cloudy nights count as misses and the share is a **lower bound**.
- **Rules** (`THRESHOLDS`):
  - `live_site_burning` = detected on ≥ **50%** of nights, once the window has ≥ **3** nights.
  - **Under-report flag:** the trend label (§4) is *falling* but the site is live-burning →
    "under-report (live check) — investigate". This is a prompt to look, not a finding.
- **Observed values.** Flares sit at **~310–330 K mean `bright_ti4`** in this product. A 375 m pixel
  averages the flame with cooler surroundings, so they are not the "very high" temperatures of VIIRS
  Nightfire's Planck fit (§1). Bush fires overlap in `bright_ti4`, so the ledger relies on the location
  match to known GFMR sites, not on a temperature cut.
- **First snapshot** (retrieved 2026-10-17 02:27 UTC; window 2026-10-09 … 2026-10-16): 85 sites detected,
  24 burning, 55 detected in the last 24 h, **8 flagged** (Oso, Odidi, Oben, Erha, Cawthorne Channel,
  Agbami-Ekoli, Jones Creek, Ekulama).
- **Delivery:** the Worker reads the committed file from the public repository (cached 15 min) and falls
  back to the copy bundled at deploy time; `meta.enrichment.live.origin` says which.

### 9.5 Security context (`scripts/ingest_acled.py`; `secTrend()` in `ledger-core.js`)

- **Source:** ACLED Nigeria monthly events and fatalities by LGA (admin-2, OCHA P-code), via HDX
  (`nigeria-acled-conflict-data`, as of 2026-10-15): political violence (events + fatalities), civilian
  targeting (a subset of political violence) and demonstrations (events).
- **Licence:** ACLED Terms of Use & Attribution Policy. Used for non-commercial monitoring; confirm with
  ACLED before any commercial reuse.
- **Join:** ACLED P-codes ↔ OCHA COD-AB NGA admin-2 polygons (HDX `cod-ab-nga`, CC BY-IGO). The site's LGA is
  found by point-in-polygon; offshore sites take the nearest LGA, labelled.
- **Areas:** `sec_area25_12m` / `sec_area50_12m` sum every LGA whose polygon lies within 25 / 50 km. These
  are **LGA aggregates, not point counts**: an LGA that only grazes the circle contributes all of its events.
- **Trend:** political-violence events in the 25 km area, last 12 complete months (2025-10 … 2026-09) vs the
  12 before. It is **rising** or **declining** only beyond ±25% *and* ≥ 3 events; otherwise **flat**. With
  none in either window it is "none recorded".
- **Point counts pending:** `sec_events_10km/25km/50km` need ACLED point events (a myACLED account) and are
  null, with `sec_point_status` = pending. The `--api` path is built. The checked-in
  `data/samples/acled_point_sample_SYNTHETIC.csv` is invented test data for `--self-test` only.
- **Not a judgement.** These are reported conflict events, evidence for monitoring. They are not a risk
  rating of a site or an operator.

## 10. Honesty constraints

- A **derived, open-data** record. Never an official determination, never an operator endorsement.
- Every figure carries its source and method version. Estimates are labelled estimates,
  projections are labelled projections, and scenarios are labelled scenarios.
- No "we detect all leaks" claim. Single-blind tests show no system detects or quantifies every
  release [6].
- Where an input is missing (for example production volumes for intensity), the feature degrades
  and says so; it never substitutes a guess. Undefined changes show as *n/a*, not as zero.

## Sources

1. World Bank, Global Flaring and Methane Reduction Partnership (GFMR). *Flare Volume Estimates by
   Individual Flare Location, 2012–2025* (June 2026 release), and the *Global Gas Flaring Tracker*,
   23 June 2026. https://www.worldbank.org/en/programs/gasflaringreduction/global-flaring-data
2. Elvidge, C. D., Zhizhin, M., Hsu, F.-C., Baugh, K. E. (2013). VIIRS Nightfire: Satellite
   pyrometry at night. *Remote Sensing* 5(9), 4423–4449.
3. Elvidge, C. D., Zhizhin, M., Baugh, K., Hsu, F.-C., Ghosh, T. (2016). Methods for global survey
   of natural gas flaring from Visible Infrared Imaging Radiometer Suite data. *Energies* 9(1), 14.
   Product: Earth Observation Group, VIIRS Nightfire — https://eogdata.mines.edu/products/vnf/
4. Federal Republic of Nigeria. *Flare Gas (Prevention of Waste and Pollution) Regulations, 2018*,
   S.I. No. 9 of 2018, Official Gazette No. 88, Vol. 105, 9 July 2018. Copy hosted by the NUPRC Nigerian
   Gas Flare Commercialisation Programme:
   https://ngfcp.nuprc.gov.ng/wp-content/uploads/2022/09/FGN-Official-Gazette-on-Flare-Gas-v2.0-002.pdf
   (scanned; the text of Reg. 13 was OCR-verified on 2026-10-17, and the checksum is pinned in
   `docs/DATA-SOURCES-REGISTRY.md`).
5. geoBoundaries gbOpen, Nigeria ADM1/ADM2 (GRID3), CC BY 4.0 — https://www.geoboundaries.org/
6. Schuit, B. J., et al. (2023). Automated detection and monitoring of methane super-emitters using
   satellite data. *Atmospheric Chemistry and Physics* 23, 9071–9098. See also the Stanford
   single-blind controlled-release tests of satellite methane detection (Sherwin et al., 2024,
   *Scientific Reports*).

7. GRID3 (2025). *Nigeria gridded population estimates, version 3.0* (CC BY 4.0), via WorldPop. GRID3 / eHealth
   Africa, Proxy Logics, ORNL (2021). *Settlement Points in Nigeria* (CC BY 4.0).
8. World Bank, World Development Indicators — Access to electricity (EG.ELC.ACCS.*), Tracking SDG7 (ESMAP et al.);
   National Population Commission & ICF, *Nigeria Demographic and Health Survey 2023-24*, via The DHS Program API.
   ESMAP (2015), *Beyond Connections: Energy Access Redefined* (Multi-Tier Framework).
9. NASA FIRMS / LANCE, VIIRS 375 m Active Fire NRT (VNP14IMGTDL_NRT, VJ114IMGTDL_NRT, VJ214IMGTDL_NRT);
   Schroeder, W. et al. (2014), *Remote Sensing of Environment* 143, 85–96.
10. Raleigh, C., Linke, A., Hegre, H., Karlsen, J. (2010). Introducing ACLED. *Journal of Peace Research* 47(5);
    ACLED, acleddata.com; OCHA COD-AB Nigeria (HDX).

Licences for every source: [`DATA-LICENCES.md`](DATA-LICENCES.md). Reachability, vintage and
checksums: [`DATA-SOURCES-REGISTRY.md`](DATA-SOURCES-REGISTRY.md) (`scripts/validate_sources.py`).
