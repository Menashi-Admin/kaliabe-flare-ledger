# Feature Set — The Decision Layer

**Kaliabe Flare Ledger · overlays and trends for decision-making**
Status: **Wave 1 shipped 2026-10-16** (method KFL-M 1.1) · **Tuning pass shipped 2026-10-17** (KFL-M 1.2) · Waves 2–3: spec

The current Ledger answers *"what is flaring?"*. The decision layer answers
*"so what should we do?"*. Every feature below is an **overlay or trend on the same open-data
spine** — no new proprietary data required, only new ways of framing it.

Design principle: **every view ends in a decision**, and every figure cites its source and its
uncertainty. No feature ships that is merely decorative.

---

## A. Trend overlays (time as a first-class dimension)

| # | Feature | Decision it drives | Audience |
|---|---|---|---|
| A1 ✅ | **Year player** — animate 2012→2025 on the map; scrub a year, watch flares light and die | Where is the problem growing vs receding? | All |
| A2 ✅ | **Per-site / operator / state trend lines** with 3-year and 5-year change | Is this operator getting better or worse? | Operators, regulators |
| A3 | **Change-point detection** — flag sites where flaring stepped up or down | What happened, and when — did a fix land? | All |
| A4 | **Normalised intensity** — flaring per unit of production (m³/bbl) where production data exists | Is the *rate* improving, not just the volume? | Buyers, financiers |
| A5 | **Cumulative history** — running total of flared volume, CO₂e and penalty for any selection | What is the total damage this asset has done? | Media, litigation-risk |

## B. Benchmarking overlays (comparison as a decision tool)

| # | Feature | Decision it drives | Audience |
|---|---|---|---|
| B1 ✅ | **Peer percentile** — operator vs national median; site vs basin median | Who is a laggard we should pressure? | Investors, buyers |
| B2 ✅ | **League table** by flared volume, intensity, and penalty exposure | Where does our name sit? | Operators |
| B3 | **State / basin roll-ups** — aggregate by administrative and geological unit | Which jurisdiction is the problem? | Regulators, policy |
| B4 | **Trend-vs-peer quadrant** — big-and-worsening, big-but-improving, etc. | Who needs intervention vs credit | Financiers, media |

## C. Exposure and economics overlays (money as the decision)

| # | Feature | Decision it drives | Audience |
|---|---|---|---|
| C1 ✅ | **Penalty exposure** — current, cumulative, and forecast at both Reg. 13 tiers (Flare Gas Regulations 2018) | What is our liability if nothing changes? | Operators, regulators |
| C2 | **Abatement economics** — cost per tonne CO₂e abated vs carbon price (EU ETS / credit price); payback | Fix it or pay it? | Operators |
| C3 | **"Worth fixing" ranking** — sites ranked by abatement value, not just volume | Where does the first dollar go? | Operators |
| C4 | **Gas-monetisation value** — flared volume valued as saleable gas / power | What are we literally burning? | Operators, government |
| C5 ✅ | **Scenario slider** — "if this site/operator cuts flaring X%, then…" instantly recomputed | What would the win actually look like? | All |

## D. Compliance overlays (thresholds as the decision)

| # | Feature | Decision it drives | Audience |
|---|---|---|---|
| D1 | **EU methane-intensity threshold check** — site/operator intensity vs the Art. 29 maximum | Can we still sell to Europe? | Buyers, operators |
| D2 | **OGMP 2.0 level indicator** — reported vs observed gap | Are our numbers credible? | Operators, investors |
| D3 | **Compliance gap heat** — colour by distance to threshold, not by raw volume | Which assets are at risk of failing? | Buyers, financiers |
| D4 | **Supplier scorecard** — exportable intensity record per operator for importers | What do we hand our EU buyer? | Buyers |

## E. Portfolio and monitoring (for capital)

| # | Feature | Decision it drives | Audience |
|---|---|---|---|
| E1 | **Portfolio exposure view** — concentration by operator, state, basin | What is our financed-emissions concentration? | Banks, investors |
| E2 ✅ | **Watchlist / alerts** — new flares, rising sites, threshold crossings | What changed since I last looked? | All |
| E3 | **Site-level risk score** combining volume, trend, confidence and compliance gap | Which single assets do we escalate? | Financiers, insurers |
| E4 | **Comparative snapshots** — save and diff two dates | What moved in the quarter? | Analysts |

## F. Output: decision briefs

| # | Feature | Decision it drives |
|---|---|---|
| F1 ✅ | **Exportable decision brief** (PDF/CSV) per site, operator, state or portfolio — figures, trends, sources, uncertainty |
| F2 | **Dated public record** — every brief watermarked with its data vintage and method version |

---

## Build order (value per unit of effort)

**Wave 1 — the decision surface (highest value, lowest risk):** ✅ shipped 2026-10-16
A1 year player · A2 trend lines · B1 peer percentile · B2 league table · C1 penalty exposure ·
C5 scenario slider · E2 watchlist · F1 export brief.

| # | Shipped as | Where |
|---|---|---|
| A1 ✅ | Timeline under the map, 2012→2025: keyboard-operable range + play/pause. Volumes indexed by year once on load; scrubbing only restyles markers (no refetch, no rebuild). Year totals: volume, sites detected, penalty basis (notional before 2022), CO₂e | `atlas.setYear`, `app.js` |
| A2 ✅ | Hand-rolled SVG trend line with dashed, labelled projection — national (marks the player's year) and per operator (click any card or league row). 3-yr and 5-yr change | `ledger-core.js trendChart` |
| B1 ✅ | `percentile_volume` ("larger than N%") and `percentile_improvement` ("improving faster than N%", on 3-yr change) for every site and operator — on cards, drawer, operator panel, brief | Worker `rank()` |
| B2 ✅ | League table toggle beside the cards: sites, latest, cumulative, 3-yr change, penalty now/cumulative, percentile; every column sortable (buttons + `aria-sort`) | `app.js` |
| C1 ✅ | Current, cumulative (notional) and 3-yr projected penalty — per site, operator, national | Worker `seriesStats()` |
| C5 ✅ | "Reduce flaring by X%" slider in the drawer, operator panel and national section; recomputes volume, CO₂e, CH₄, penalty; labelled scenario; carried into the brief link | `ledger-core.js scenario` |
| E2 ✅ | Rising (threshold 25/50/100%, ranked by volume added), newly detected (last 2 yrs), top decile; rows open the site on the map | `app.js renderWatch` |
| F1 ✅ | `/api/brief?scope=national\|operator\|site&id=&cut=&format=html\|csv` — self-contained, print-to-PDF brief and matching CSV, stamped with method version + data vintage | Worker `brief()` |

**Deferred from Wave 1 (stated plainly):**
- A2 *state* trend lines — needs the B3 state roll-up (site→state is currently computed in the
  browser per site); moved to Wave 2 with B3.
- E2 *threshold crossings* — no compliance thresholds exist until D1; rising / new / top-decile
  shipped.
- F1 is print-to-PDF from a self-contained HTML brief, not a server-generated PDF file (no PDF
  library on the Worker, by design — zero recurring cost).
- F1 covers national, operator and site scope; *state* and *portfolio* scope follow B3 / E1.

**Tuning pass (KFL-M 1.2):** ✅ shipped 2026-10-17

| Item | Shipped as | Where |
|---|---|---|
| ✅ Penalty citation | Corrected everywhere to the *Flare Gas (Prevention of Waste and Pollution) Regulations, 2018*, S.I. No. 9 of 2018 (Gazette No. 88, Vol. 105) | Worker `PENALTY`, site, docs |
| ✅ Two-tier penalty | Every penalty (current, cumulative, projection, scenario, year player, tables, brief, CSV) at $2.00 (≥10k bbl/d, upper) **and** $0.50 (<10k bbl/d, lower); the assumption is stated; no midpoint; force-majeure and Deliver-or-Pay exemptions shown | `ledger-core.js convert`, Worker, `decision.js exposureHtml` |
| ✅ GFMR vintage | June 2026 release (three-satellite method) confirmed against the tracker and labelled in `meta.vintage`, the site and every brief | Worker `VINTAGE` |
| ✅ Emissions constants | June 2026 tracker: 429/167 MtCO₂e per bcm; unburned CH₄ now reported as mass (1.8/167); old figures kept in a comment | Worker constants |
| ✅ Niger Delta boundary | Nine-state union by point-in-polygon; offshore sites labelled with nearest state and distance | `scripts/classify_niger_delta.py` |
| ✅ Source registry | `scripts/validate_sources.py` → `docs/DATA-SOURCES-REGISTRY.md`; exits non-zero on an unreachable source | scripts |
| ✅ Thresholds | One named set (`THRESHOLDS`): rising % + 0.5 million m³ floor, trend/change significance, peer-set n/a rule, top-decile cut-off shown, scenario rounding; documented on the methodology page (rendered from the code) | `ledger-core.js` |
| ✅ Writing | Launch note published at `/blog/why-this-page-exists/` with a minimal `/blog/` index; Writing link in nav + footer | `scripts/build_blog.py` |

**Wave 2 — the commercial hooks:**
A4 normalised intensity · C2/C3 abatement economics · D1 EU threshold check · D4 supplier
scorecard · E3 risk score · **enrichment layers (KFL-M 1.3, below)**.

**Wave 2 enrichment — live & opportunity (KFL-M 1.3):** ✅ shipped 2026-10-17 (B → C → A → D)

| Item | Shipped as | Where |
|---|---|---|
| ✅ B. Population demand | `pop5km/10km/25km/50km`, nearest GRID3 named settlement (+ 2 km population, distance), largest centre within 25 km, state — GRID3 Population v3.0, 100 m zonal sums; 476-row JSON, raster never shipped | `scripts/pop_demand.py` → `web/public/data/pop_demand.json` |
| ✅ C. Power gap (the deal number) | `gas_available_GWh`, `electric_potential_MW`, `households_servable`, `people_within_10km_not_grid`, each labelled *estimate* with its assumption; "Generation opportunity" block in the drawer and the brief; national/operator roll-ups (people not summed — circles overlap) | `ledger-core.js powerGap`, `scripts/fetch_access_rates.py` |
| ✅ C. Access context | WDI national/urban/rural (2024: 62.5 / 85.5 / 23.5%); NDHS 2023-24 state rates; derived state rural proxy (state × national rural/total) — no published rural-by-state figure exists | `web/public/data/access_rates.json` |
| ✅ A. Live flare thermal | Daily NASA FIRMS VIIRS 375 m pull (GitHub Action), 1 km site match, rolling 30-night window: `live_last_seen`, `live_nights_detected_pct`, `live_mean_bright_ti4_K`, `live_mean_frp_MW`, `live_site_burning`; **under-report (live check) flag** when archive says falling but burning on ≥50% of nights; "Live thermal (last 24h)" layer + "Live now" pill | `scripts/live_thermal.py`, `.github/workflows/live-thermal.yml`, `/api/live` |
| ✅ D. Security overlay (LGA level) | Real ACLED monthly events by LGA (HDX), P-code join to OCHA COD-AB: site LGA, 25/50 km LGA-area counts by type, 12-month `sec_trend`; LGA choropleth layer; drawer + brief block with citation | `scripts/ingest_acled.py` → `security.json`, `layers/security-lga.geojson` |
| ⏳ D. Security point counts | `sec_events_10km/25km/50km` need ACLED point events (myACLED account). Harness (`--api`) built and self-tested on a SYNTHETIC fixture; fields null, marked pending | `scripts/ingest_acled.py --api` |

**Wave 3 — the deep tools:**
A3 change-point detection · B4 quadrant · C4 monetisation value · D2 OGMP gap · E1 portfolio
view · E4 snapshots · A5 cumulative history.

---

## Honesty constraints (non-negotiable in every feature)

- Never an official determination; never imply NUPRC or operator endorsement.
- Every figure carries source + method version + detection floor + confidence.
- Estimates are labelled estimates; scenarios are labelled scenarios.
- No "we detect all leaks" claim — single-blind tests show nobody does.
- Where a data input is missing (e.g. production volumes for intensity), the feature degrades
  honestly and says so rather than substituting a guess.
