# Methodology & Confidence

**Kaliabe Flare Ledger · method version KFL-M 1.1 (2026-10-16)**
Mirrors the site's [methodology page](https://kaliabe-flare-web.pages.dev/methodology.html). The
code that implements each rule is named next to it; every constant below lives in one place,
`worker/src/index.js`, and is published to clients as `meta.constants`.

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

**Trend label.** The mean of the last 3 years is compared with the mean of up to 5 years before
them. A record shorter than 4 years compares its last year with its first.
- Within ±5% the trend is **stable**; beyond that it is **rising** or **falling**.
- No baseline volume but recent detections is **new** (no percentage is defined).
- No detections in either window is **inactive**.

## 5. Penalty basis and conversion constants

| Constant | Value | Source |
|---|---|---|
| Penalty rate | **US$2.00 per 1,000 scf** | NUPRC Flare Gas (Prevention of Waste and Pollution) Regulations, Gazette [4] |
| scf per m³ | 35.3146667 | exact unit conversion |
| m³ per 1,000 scf | 28.3168 | derived from the above |
| CO₂e per bcm flared | 389 ÷ 151 = **2.576 Mt** | GFMR 2025 global ratio: 151 bcm ≈ 389 Mt CO₂e [1] |
| CH₄ per bcm flared | 46 ÷ 151 = **0.3046 Mt** | GFMR 2025 global ratio: incl. 46 Mt CH₄ [1] |
| ₦ per US$ | 1,550 | indicative display snapshot only |

Penalty (US$) = volume (m³) ÷ 28.3168 × 2.00. For example, Oso in 2025 flared 308.37 million m³,
which gives **US$21.78 m**.

- **Not an assessment.** These are derived estimates on the published basis, not NUPRC
  assessments. Actual liabilities depend on facts the Ledger cannot see: reported volumes,
  exemptions and the producer category.
- **One rate for everyone.** The Ledger applies the US$2.00 rate to every site. The Regulations
  differentiate charges by producer category, but production data are not in the open-data spine.
  For smaller producers the Ledger figure should therefore be read as an upper bound. Check the
  Gazette before citing a figure for a specific producer.
- **Emissions ratios.** The CO₂e and CH₄ figures use a global average ratio. They are
  order-of-magnitude estimates, not site-level combustion modelling.

## 6. Decision-layer derivations (Wave 1, `seriesStats()` / `rank()` / `aggregate()`)

These add framing to the GFMR series, not new data. They are computed once per request in the
Worker and shared by the site, the API and the decision brief.

- **N-yr change** (`change_3yr_pct`, `change_5yr_pct`) — the latest-year volume vs the volume N
  years earlier (2025 vs 2022; 2025 vs 2020). It is **undefined** when the base year had no
  detection, because a percentage on a zero base is meaningless.
- **Peer percentile** (`percentile_volume`) — the share of the *other* members of the peer set with
  a strictly smaller latest-year volume ("larger than N%").
  - The peer sets are all 476 sites, or all 40 operators. "Unattributed" counts as one operator.
  - **Improvement percentile** (`percentile_improvement`) ranks the 3-yr change, lower being
    better ("improving faster than N%"), among peers whose change is defined.
- **Cumulative** (`cumulative_million_m3`, `cumulative_penalty_usd`) — the sum over 2012–2025.
  The cumulative penalty is **notional**: it applies the 2022 rate to every year, and the years
  before 2022 fell under the previous regime.
- **Projection** (`forecast`) — a least-squares line through the last 3 years (2023–2025),
  extended 3 years and clamped at zero.
  - Operator and national projections are fitted to the aggregate series, not summed from sites.
  - **It is a projection, not a fact**, and is labelled as one everywhere it appears.
- **Scenario** — "reduce flaring by X%" multiplies the latest-year volume by (1 − X/100).
  Penalty, CO₂e and CH₄ are linear in volume, so they scale identically.
  - The maths is `scenario()` in `web/public/js/ledger-core.js`. The browser and the Worker
    (which bundles the same file for the brief) share it.
  - It is labelled a scenario everywhere.
- **Watchlist**:
  - *Rising*: the 3-yr change is above the chosen threshold (25 / 50 / 100%). The list is ranked
    by absolute volume added, because a huge percentage on a tiny base is real but less
    material.
  - *Newly detected*: the first positive volume falls in the last 2 years.
  - *Top decile*: `percentile_volume ≥ 90`.
- **Year player** — each year shows that year's GFMR volume. "Detected" means a positive volume in
  that year. Penalty figures for years before 2022 are labelled notional.

## 7. The Niger Delta rectangle caveat

`in_niger_delta` is a **study rectangle**, 4.5–8.5° E by 4.5–7.0° N, set in the seed. It is not
the statutory Niger Delta region (the nine NDDC states), so:

- far-offshore fields such as Oso (ExxonMobil, 4.31° N) fall **outside** it;
- a few inland sites inside the box may sit outside the statutory region.

The state and LGA shown in the flare drawer come from a point-in-polygon test against the
geoBoundaries layers [5]. That is the better guide to administrative location.

## 8. Decision briefs

`/api/brief?scope=national|operator|site&id=…&cut=0–100&format=html|csv` renders a self-contained,
print-ready brief.

- **Contents:** the headline figures, the trend with its projection, the percentile, penalty
  exposure, the scenario (if one is set), sources, the method version and the data vintage.
- **One row list:** the HTML and the CSV are built from the same rows, so they cannot disagree.
- **Stamp:** every brief carries the method version and the data vintage.

## 9. Honesty constraints

- A **derived, open-data** record. Never an official determination, never an operator endorsement.
- Every figure carries its source and method version. Estimates are labelled estimates,
  projections are labelled projections, and scenarios are labelled scenarios.
- No "we detect all leaks" claim. Single-blind tests show no system detects or quantifies every
  release [6].
- Where an input is missing (for example production volumes for intensity), the feature degrades
  and says so; it never substitutes a guess. Undefined changes show as *n/a*, not as zero.

## Sources

1. World Bank, Global Flaring and Methane Reduction Partnership (GFMR). *Flare Volume Estimates by
   Individual Flare Location, 2012–2025*, and the 2025 Global Gas Flaring Tracker.
   https://www.worldbank.org/en/programs/gasflaringreduction/global-flaring-data
2. Elvidge, C. D., Zhizhin, M., Hsu, F.-C., Baugh, K. E. (2013). VIIRS Nightfire: Satellite
   pyrometry at night. *Remote Sensing* 5(9), 4423–4449.
3. Elvidge, C. D., Zhizhin, M., Baugh, K., Hsu, F.-C., Ghosh, T. (2016). Methods for global survey
   of natural gas flaring from Visible Infrared Imaging Radiometer Suite data. *Energies* 9(1), 14.
   Product: Earth Observation Group, VIIRS Nightfire — https://eogdata.mines.edu/products/vnf/
4. Federal Republic of Nigeria. *Flare Gas (Prevention of Waste and Pollution) Regulations*,
   Official Gazette. Administered by NUPRC — https://www.nuprc.gov.ng/
5. geoBoundaries gbOpen, Nigeria ADM1/ADM2 (GRID3), CC BY 4.0 — https://www.geoboundaries.org/
6. Schuit, B. J., et al. (2023). Automated detection and monitoring of methane super-emitters using
   satellite data. *Atmospheric Chemistry and Physics* 23, 9071–9098. See also the Stanford
   single-blind controlled-release tests of satellite methane detection (Sherwin et al., 2024,
   *Scientific Reports*).

Licences for every source: [`DATA-LICENCES.md`](DATA-LICENCES.md).
