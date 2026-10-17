/**
 * Kaliabe Flare Ledger — Cloudflare Worker
 * Verdict engine + REST API over D1.
 *
 * Real data spine: World Bank GFMR "Flare Volume Estimates by Individual
 * Flare Location 2012-2025" (Nigeria subset), released with the June 2026
 * Global Gas Flaring Tracker (three-satellite VIIRS method), sourced from NOAA
 * VIIRS Nightfire (Payne Institute / Colorado School of Mines). Seeded into D1.
 *
 * Penalty basis: Flare Gas (Prevention of Waste and Pollution) Regulations, 2018
 * — S.I. No. 9 of 2018, Official Gazette No. 88 Vol. 105 (9 July 2018). Reg. 13
 * sets a TIERED flare payment per 28.317 scm (1,000 scf): US$2.00 where the OML
 * or marginal field produces ≥10,000 bbl oil/day, US$0.50 where it produces
 * less. We hold no production rates, so every penalty is published as both tiers.
 *
 * Method caveats are deliberately explicit: VIIRS measures flare *heat*;
 * volume↔radiance calibration carries uncertainty from gas composition and
 * combustion efficiency. Every verdict carries a detection floor + confidence.
 */
import core from '../../web/public/js/ledger-core.js';
import ND from './niger-delta.json';

const T = core.THRESHOLDS;

// ---- Penalty & conversion constants (cite in code + methodology page) ----
// NOTE units: GFMR "Flaring Vol (million m3)" is stored per-site per-year in the
// seed as MILLION m3 (so Oso 308.37 = 308.37 million m3 = 0.30837 bcm). All
// downstream math converts explicitly from million-m3 to real units.
//
// Flare Gas (Prevention of Waste and Pollution) Regulations, 2018 (S.I. No. 9 of 2018), Reg. 13:
const PENALTY_USD_PER_1000SCF_UPPER = 2.0; // Reg. 13(1): ≥10,000 bbl oil/day in the OML / marginal field
const PENALTY_USD_PER_1000SCF_LOWER = 0.5; // Reg. 13(2): <10,000 bbl oil/day
const SCF_PER_M3 = 35.3146667;            // 1 m3 = 35.3146667 scf
const M3_PER_1000SCF = 1000 / SCF_PER_M3; // = 28.317 m3 per 1,000 scf (the Regulations' 28.317 scm)
// Emissions ratios — World Bank Global Gas Flaring Tracker, 23 June 2026 (data year 2025):
// 167 bcm flared -> 429 MtCO2e, including 50 MtCO2e of unburned methane (1.8 Mt CH4 by mass).
const CO2E_MT_PER_BCM = 429 / 167;      // 2.5689 Mt CO2e per bcm
const CH4_CO2E_MT_PER_BCM = 50 / 167;   // 0.2994 Mt CO2e (as unburned methane) per bcm
const CH4_MT_PER_BCM = 1.8 / 167;       // 0.01078 Mt CH4 (mass) per bcm
// Superseded (KFL-M ≤1.1), kept for traceability — July 2025 tracker, data year 2024, single-
// satellite method: 151 bcm -> 389 MtCO2e incl. 46 Mt "CH4" => 2.576 Mt CO2e/bcm, 0.3046 /bcm.
// The 46 (now 50) figure is methane expressed in CO2e, not CH4 mass; ≤1.1 mislabelled it "t CH4".
// Indicative naira FX (display only; mark as estimate)
const NGN_PER_USD = 1550; // indicative, cite as of-data snapshot

// Full-precision constants handed to the shared core (web/public/js/ledger-core.js)
// and published in meta.constants so the browser never defines its own.
const K = {
  penalty_usd_per_1000scf_upper: PENALTY_USD_PER_1000SCF_UPPER,
  penalty_usd_per_1000scf_lower: PENALTY_USD_PER_1000SCF_LOWER,
  scf_per_m3: SCF_PER_M3,
  m3_per_1000scf: M3_PER_1000SCF,
  co2e_mt_per_bcm: CO2E_MT_PER_BCM,
  ch4_mt_per_bcm: CH4_MT_PER_BCM,
  ch4_co2e_mt_per_bcm: CH4_CO2E_MT_PER_BCM,
  ngn_per_usd_indicative: NGN_PER_USD,
};

const PENALTY = {
  instrument: 'Flare Gas (Prevention of Waste and Pollution) Regulations, 2018',
  citation: 'S.I. No. 9 of 2018 — Federal Republic of Nigeria Official Gazette No. 88, Vol. 105, 9 July 2018 (made 5 July 2018 under s.9 Petroleum Act and s.5 Associated Gas Reinjection Act)',
  short: 'Flare Gas Regulations 2018 (S.I. No. 9 of 2018), Reg. 13',
  tiers: [
    { tier: 'upper', regulation: 'Reg. 13(1)', usd_per_1000scf: PENALTY_USD_PER_1000SCF_UPPER, applies_when: '10,000 bbl of oil per day or more produced in the OML / marginal field', bound: 'upper bound' },
    { tier: 'lower', regulation: 'Reg. 13(2)', usd_per_1000scf: PENALTY_USD_PER_1000SCF_LOWER, applies_when: 'less than 10,000 bbl of oil per day produced in the OML / marginal field', bound: 'lower bound' },
  ],
  unit: 'per 28.317 standard cubic metres (1,000 scf) of gas flared, routine or non-routine',
  assumption: 'We do not hold production rates; the regulation sets $2.00 (≥10,000 bbl/d) or $0.50 (<10,000 bbl/d). Both tiers are shown; no midpoint is used.',
  exemptions: [
    'Force majeure (Reg. 13(1)–(2) provisos): no payment where flaring was caused by act of war, community disturbance, insurrection, storm, flood, earthquake or other natural phenomenon beyond the producer’s reasonable control.',
    'Deliver-or-Pay (Reg. 13(3)): no payment on an agreed volume of flare gas committed to a Permit Holder under a Deliver or Pay Agreement, from the start of commercial operations of the flare reduction project.',
  ],
  not_modelled: 'Exempt volumes cannot be seen from satellite data, so no exemption is deducted; the Reg. 19 additional US$2.50/1,000 scf non-compliance payment is not modelled.',
};
const PENALTY_BASIS = 'Flare Gas Regulations 2018 (S.I. No. 9 of 2018) Reg. 13: US$2.00 (≥10,000 bbl/d) or US$0.50 (<10,000 bbl/d) per 1,000 scf (28.317 m³)';

// Method version + data vintage: stamped on every API response and brief.
const METHOD_VERSION = 'KFL-M 1.2 (2026-10-17)';
const METHOD_CHANGES = 'KFL-M 1.2: penalty basis corrected to the 2018 Regulations (S.I. No. 9 of 2018) with both Reg. 13 tiers; GFMR vintage labelled; emissions ratios updated to the June 2026 tracker; Niger Delta by state boundary; thresholds made explicit.';
const VINTAGE = {
  dataset: 'World Bank GFMR, Flare Volume Estimates by Individual Flare Location 2012–2025 (xlsx)',
  release: 'Global Gas Flaring Tracker, 23 June 2026',
  methodology: 'new GFMR/Payne Institute methodology: three VIIRS satellites (Suomi NPP, NOAA-20, NOAA-21), multi-year flare location tracking, revised volume calibration; whole 2012–2025 series restated',
  workbook_created: '2026-06-08',
  check: 'workbook global 2025 sum = 166.6 bcm, matching the tracker’s 167 bcm (2024: 156.9 vs the tracker’s restated 157)',
  seed_loaded: '2026-10-16',
  emissions_ratios: 'Global Gas Flaring Tracker, June 2026 (data year 2025): 167 bcm → 429 MtCO₂e incl. 50 MtCO₂e unburned methane (1.8 Mt CH₄)',
};
const DATA_VINTAGE = 'World Bank GFMR flare-location estimates 2012–2025, June 2026 release (three-satellite methodology; latest year 2025); Ledger seed loaded 2026-10-16';
const FORECAST_YEARS = 3;
const FORECAST_METHOD = 'least-squares line through the last 3 years, extended 3 years and clamped at zero — a projection, not a fact';
const CHANGE_METHOD = `N-yr change = latest-year volume vs the volume N years earlier; undefined when that base year had no detection; significant only if it moves ≥${T.change_min_abs_million_m3} million m³ and beyond ±${T.trend_stable_band_pct}%`;
const CUMULATIVE_NOTE = 'notional: the 2018 Regulations’ tiers applied to every year 2012–2025 (the Regulations were made 5 July 2018; earlier years fell under the previous regime)';

// Niger Delta classification (scripts/classify_niger_delta.py → niger-delta.json).
function ndOf(siteId) {
  const r = ND.sites[siteId] || { class: 'unclassified' };
  const label = r.class === 'niger_delta' ? `Niger Delta — ${r.state} State`
    : r.class === 'offshore' ? `Offshore, beyond the state boundary — nearest state ${r.nearest_state}${r.nearest_is_niger_delta ? ' (Niger Delta)' : ' (not Niger Delta)'}, ${r.nearest_km} km`
      : r.class === 'outside' ? `Outside the Niger Delta — ${r.state} State` : 'Unclassified';
  return { in_niger_delta: r.class === 'niger_delta', niger_delta_class: r.class, niger_delta_label: label, niger_delta_detail: r };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, max-age=300' : 'no-store',
      ...corsHeaders,
    },
  });
}

function estimate(site, annual) {
  // Build per-year series + verdict metrics.
  const years = annual
    .filter((r) => r.year != null && r.flaring_vol_m3 != null)
    .sort((a, b) => a.year - b.year);

  const latest = years[years.length - 1];
  // GFMR stores MILLION m3 per year (e.g. Oso 308.37 = 308.37 million m3)
  const latestMillionM3 = latest ? latest.flaring_vol_m3 : 0;
  const latestYear = latest ? latest.year : null;

  const volMillionM3 = years.map((r) => ({ year: r.year, millionM3: r.flaring_vol_m3 || 0 }));
  const trend = computeTrend(volMillionM3);
  // Penalty (both Reg. 13 tiers), CO2e and methane for the latest-year volume.
  const c = core.convert(latestMillionM3, K);

  // ---- Verdict logic ----
  // Detection floor: VIIRS Nightfire reliably detects large flares; GFMR
  // publishes sites above a site-size floor (Small/Medium/Large). We treat a
  // positive latest-year volume as "verified flare detected"; a 0 or missing
  // latest year as "unverified / below detection or cloud-obscured".
  let verdict, confidence, detectionFloor;
  if (!latest || latestMillionM3 <= 0) {
    verdict = 'unverified';
    confidence = 0.4;
    detectionFloor = 'None detected in latest VIIRS/GFMR record (below site-level floor or cloud-obscured)';
  } else {
    verdict = 'verified_flare';
    // Coverage = share of years in the record with a positive detection
    // (zero-volume years are non-detections, not coverage).
    const detectedYears = years.filter((r) => r.flaring_vol_m3 > 0).length;
    const coverage = detectedYears / Math.max(1, (latestYear - site.first_year + 1));
    const hasOperator = site.operator && String(site.operator).trim() !== 'Unattributed';
    confidence = Math.min(0.98, 0.55 + coverage * 0.3 + (hasOperator ? 0.08 : 0));
    detectionFloor = 'VIIRS Nightfire detects flare heat ≥1400K; volume via radiance→flow calibration (World Bank GFMR / EOG)';
  }

  return {
    site_id: site.site_id,
    lat: site.lat,
    lon: site.lon,
    operator: site.operator || 'Unattributed',
    field_name: site.field_name,
    field_type: site.field_type,
    location: site.location,
    ...ndOf(site.site_id),
    latest_year: latestYear,
    latest_year_vol_million_m3: round(latestMillionM3, 2),
    latest_year_vol_m3: round(latestMillionM3 * 1e6, 0),
    latest_year_bcm: round(c.bcm, 4),
    trend_pct: trend.pct == null ? null : round(trend.pct, 1),
    trend_label: trend.label,
    trend_basis: trend.basis,
    trend_significance: trend.significance,
    verdict,
    confidence: round(confidence, 3),
    detection_floor: detectionFloor,
    penalty_usd_latest_upper: round(c.penalty_usd_upper, 2),
    penalty_usd_latest_lower: round(c.penalty_usd_lower, 2),
    penalty_ngn_latest_upper: round(c.penalty_usd_upper * NGN_PER_USD, 2),
    penalty_ngn_latest_lower: round(c.penalty_usd_lower * NGN_PER_USD, 2),
    penalty_basis: PENALTY_BASIS,
    co2e_tonnes_latest: round(c.co2e_t, 1),
    methane_tonnes_latest: round(c.ch4_t, 2),
    methane_co2e_tonnes_latest: round(c.ch4_co2e_t, 1),
    // GFMR per-year values are in million m3
    year_series: years.map((r) => ({ year: r.year, million_m3: round(r.flaring_vol_m3, 2) })),
    first_detected_year: (years.find((r) => r.flaring_vol_m3 > 0) || {}).year || null,
    ...seriesStats(volMillionM3),
  };
}

// ---- Decision-layer statistics on a dense { year, millionM3 } series ----
// Shared by sites, operators and the national aggregate so all three use the
// same change, cumulative and forecast definitions.
function changePct(ys, n) {
  const L = ys.length - 1;
  if (L - n < 0) return null;
  const base = ys[L - n], now = ys[L];
  return base > 0 ? round(((now - base) / base) * 100, 1) : null;
}
function changeSig(ys, n) {
  const L = ys.length - 1;
  return L - n < 0 ? null : core.changeSignificant(ys[L - n], ys[L], T);
}
function projection(series) {
  // Least squares through the last 3 points, x = -2, -1, 0.
  const last = series.slice(-3);
  if (last.length < 2) return [];
  const xs = last.map((_, i) => i - (last.length - 1));
  const ys = last.map((d) => d.millionM3 || 0);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) * (x - mx); });
  const slope = sxx ? sxy / sxx : 0;
  const y0 = series[series.length - 1].year;
  const out = [];
  for (let h = 1; h <= FORECAST_YEARS; h++) {
    const v = Math.max(0, my + slope * (h - mx));
    const c = core.convert(v, K);
    out.push({ year: y0 + h, million_m3: round(v, 2), penalty_usd_upper: round(c.penalty_usd_upper, 0), penalty_usd_lower: round(c.penalty_usd_lower, 0) });
  }
  return out;
}
function seriesStats(series) {
  const ys = series.map((d) => d.millionM3 || 0);
  const cum = ys.reduce((a, b) => a + b, 0);
  const c = core.convert(cum, K);
  const fc = projection(series);
  const sum = (k) => (fc.length ? round(fc.reduce((a, d) => a + d[k], 0), 0) : null);
  return {
    change_3yr_pct: changePct(ys, 3),
    change_3yr_significant: changeSig(ys, 3),
    change_5yr_pct: changePct(ys, 5),
    change_5yr_significant: changeSig(ys, 5),
    cumulative_million_m3: round(cum, 2),
    cumulative_penalty_usd_upper: round(c.penalty_usd_upper, 0),
    cumulative_penalty_usd_lower: round(c.penalty_usd_lower, 0),
    cumulative_co2e_tonnes: round(c.co2e_t, 0),
    forecast: fc,
    forecast_penalty_usd_next_upper: fc.length ? fc[0].penalty_usd_upper : null,
    forecast_penalty_usd_next_lower: fc.length ? fc[0].penalty_usd_lower : null,
    forecast_penalty_usd_3yr_upper: sum('penalty_usd_upper'),
    forecast_penalty_usd_3yr_lower: sum('penalty_usd_lower'),
  };
}

// Percentile ranks vs a peer set (0–100, share of the *other* peers strictly
// below). Volume: "larger than N%" — the peer set is only the members with a
// latest-year detection; undetected members get null ("n/a"), never a zero.
// Improvement on 3-yr change (lower = better): "improving faster than N%" —
// the peer set is only members with a usable (detected) base year.
function rank(items, volKey) {
  const vols = items.map((x) => x[volKey] || 0).filter((v) => v > 0).sort((a, b) => a - b);
  const chg = items.map((x) => x.change_3yr_pct).filter((v) => v != null).sort((a, b) => a - b);
  const below = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; };
  const above = (arr, v) => arr.length - below(arr, v + 1e-9);
  for (const x of items) {
    const v = x[volKey] || 0;
    x.percentile_volume = v > 0 && vols.length > 1 ? Math.round((100 * below(vols, v)) / (vols.length - 1)) : null;
    x.percentile_improvement = x.change_3yr_pct != null && chg.length > 1
      ? Math.round((100 * above(chg, x.change_3yr_pct)) / (chg.length - 1)) : null;
    x.peer_set_size = { volume: vols.length, improvement: chg.length, excluded_volume: items.length - vols.length, excluded_improvement: items.length - chg.length };
  }
}

// Top decile: latest-year volume, decile of the FULL site set (detected or not).
// n = ceil(10% × all sites); cut-off = the n-th largest volume; ties included.
function topDecile(sites) {
  const vols = sites.map((s) => s.latest_year_vol_million_m3 || 0).sort((a, b) => b - a);
  const n = Math.ceil(vols.length * T.top_decile_fraction);
  const cutoff = vols[n - 1] || 0;
  let count = 0;
  for (const s of sites) { s.top_decile = cutoff > 0 && (s.latest_year_vol_million_m3 || 0) >= cutoff; if (s.top_decile) count++; }
  return {
    rule: `latest-year volume ≥ the ${n}th-largest of all ${vols.length} sites (top ${Math.round(T.top_decile_fraction * 100)}% of the full site set; ties included)`,
    peer_set_size: vols.length, slots: n, cutoff_million_m3: round(cutoff, 2), count,
  };
}

function aggregate(sites, latestYear) {
  const byYear = new Map();
  let active = 0, nd = 0, off = 0;
  for (const s of sites) {
    for (const p of s.year_series) byYear.set(p.year, (byYear.get(p.year) || 0) + (p.million_m3 || 0));
    if (s.latest_year_vol_million_m3 > 0) active++;
    if (s.in_niger_delta) nd++;
    if (s.niger_delta_class === 'offshore') off++;
  }
  const series = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, millionM3: v }));
  const latest = byYear.get(latestYear) || 0;
  const c = core.convert(latest, K);
  return {
    sites: sites.length,
    active_sites: active,
    niger_delta_sites: nd,
    offshore_sites: off,
    latest_year: latestYear,
    total_vol_million_m3_latest: round(latest, 2),
    total_vol_bcm_latest: round(latest / 1e3, 4),
    penalty_usd_latest_upper: round(c.penalty_usd_upper, 2),
    penalty_usd_latest_lower: round(c.penalty_usd_lower, 2),
    co2e_tonnes_latest: round(c.co2e_t, 0),
    methane_tonnes_latest: round(c.ch4_t, 0),
    methane_co2e_tonnes_latest: round(c.ch4_co2e_t, 0),
    year_series: series.map((d) => ({ year: d.year, million_m3: round(d.millionM3, 2) })),
    ...seriesStats(series),
  };
}

// One pass over D1 → estimated + ranked sites, operator and national roll-ups.
// Memoised per isolate for the same 5 minutes the responses are cached.
let ledgerCache = null;
async function loadLedger(env) {
  if (ledgerCache && Date.now() - ledgerCache.at < 300e3) return ledgerCache.data;
  const [sitesRes, annualRes] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM flare_sites'),
    env.DB.prepare('SELECT site_id, year, flaring_vol_m3 FROM flare_annual ORDER BY site_id, year'),
  ]);
  const bySite = new Map();
  for (const r of annualRes.results) {
    if (!bySite.has(r.site_id)) bySite.set(r.site_id, []);
    bySite.get(r.site_id).push(r);
  }
  const sites = sitesRes.results
    .filter((s) => bySite.has(s.site_id))
    .map((s) => estimate(s, bySite.get(s.site_id)))
    .sort((x, y) => (y.latest_year_vol_million_m3 || 0) - (x.latest_year_vol_million_m3 || 0));
  for (const s of sites) s.operator = String(s.operator).trim() || 'Unattributed';
  rank(sites, 'latest_year_vol_million_m3');
  const decile = topDecile(sites);
  const latestYear = sites.reduce((y, s) => Math.max(y, s.latest_year || 0), 0);

  const groups = new Map();
  for (const s of sites) {
    if (!groups.has(s.operator)) groups.set(s.operator, []);
    groups.get(s.operator).push(s);
  }
  const operators = [...groups.entries()]
    .map(([operator, list]) => ({ operator, ...aggregate(list, latestYear) }))
    .sort((a, b) => b.total_vol_million_m3_latest - a.total_vol_million_m3_latest);
  rank(operators, 'total_vol_million_m3_latest');
  const national = { scope: 'Nigeria (GFMR site set)', operators: operators.length, ...aggregate(sites, latestYear) };

  const data = { sites, operators, national, meta: buildMeta(latestYear, decile) };
  ledgerCache = { at: Date.now(), data };
  return data;
}

function buildMeta(latestYear, decile) {
  return {
    method_version: METHOD_VERSION,
    method_changes: METHOD_CHANGES,
    data_vintage: DATA_VINTAGE,
    vintage: VINTAGE,
    latest_year: latestYear,
    units: 'GFMR per-year volumes in million m³; bcm = million m³ / 1,000',
    penalty: PENALTY,
    penalty_usd_per_1000scf_upper: PENALTY_USD_PER_1000SCF_UPPER,
    penalty_usd_per_1000scf_lower: PENALTY_USD_PER_1000SCF_LOWER,
    m3_per_1000scf: round(M3_PER_1000SCF, 3),
    ngn_per_usd_indicative: NGN_PER_USD,
    co2e_mt_per_bcm: round(CO2E_MT_PER_BCM, 4),
    ch4_mt_per_bcm: round(CH4_MT_PER_BCM, 5),
    ch4_co2e_mt_per_bcm: round(CH4_CO2E_MT_PER_BCM, 4),
    constants: K,
    thresholds: T,
    top_decile: decile,
    niger_delta: { method: ND.method, states: ND.states, counts: ND.counts },
    trend_method: `mean of last 3 yrs vs preceding up to 5 yrs; ±${T.trend_stable_band_pct}% = stable; a direction needs ≥${T.trend_min_abs_change_million_m3} million m³/yr difference and ≥${T.trend_min_detected_years} detected years in each window, otherwise “not significant”`,
    change_method: CHANGE_METHOD,
    forecast_method: FORECAST_METHOD,
    cumulative_note: CUMULATIVE_NOTE,
    percentile_method: 'share of the other members of the peer set strictly below on latest-year volume; the peer set is the members with a latest-year detection (others n/a). Improvement ranks the 3-yr change, lower = better, among members with a detected base year (others n/a)',
    sources: {
      volume: 'World Bank GFMR, Flare Volume Estimates by Individual Flare Location 2012–2025, June 2026 release (three-satellite NOAA VIIRS Nightfire method; EOG, Payne Institute)',
      penalty: `${PENALTY.instrument}, ${PENALTY.citation}; Reg. 13: US$2.00 (≥10,000 bbl/d) or US$0.50 (<10,000 bbl/d) per 28.317 m³ (1,000 scf)`,
      emissions: 'World Bank Global Gas Flaring Tracker, June 2026 (data year 2025): 167 bcm ≈ 429 MtCO₂e incl. 50 MtCO₂e unburned methane (1.8 Mt CH₄)',
      boundary: 'Niger Delta: union of the nine Niger Delta states, geoBoundaries gbOpen NGA ADM1 (GRID3), CC BY 4.0',
    },
  };
}

// Trend: mean of the most recent 3 years vs mean of up to 5 preceding years.
// Returns { pct, label, basis, significance }. pct is a real percentage or null
// when undefined (no baseline). Labels: rising | falling | stable |
// not_significant | new | inactive. A direction is only claimed when the change
// clears the detection-noise rule in core.THRESHOLDS.
function computeTrend(series) {
  const ys = series
    .filter((s) => s && s.year != null)
    .sort((a, b) => a.year - b.year)
    .map((s) => (Number.isFinite(s.millionM3) ? s.millionM3 : 0));
  const n = ys.length;
  if (n < 2) return { pct: null, label: 'not_significant', basis: 'insufficient record (<2 years)', significance: 'record shorter than 2 years' };
  // <4 points: compare last year with first year.
  let recent, earlier, basis;
  if (n < 4) {
    recent = [ys[n - 1]];
    earlier = [ys[0]];
    basis = `last year vs first year (${n}-year record)`;
  } else {
    const k = 3;
    recent = ys.slice(n - k);
    earlier = ys.slice(Math.max(0, n - k - 5), n - k);
    basis = `mean of last ${recent.length} yrs vs preceding ${earlier.length} yrs`;
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const avgR = mean(recent);
  const avgE = mean(earlier);
  if (!(avgE > 0)) {
    // Division guard: no baseline volume.
    if (avgR > 0) return { pct: null, label: 'new', basis: basis + '; no baseline flaring', significance: 'no baseline detection' };
    return { pct: 0, label: 'inactive', basis: basis + '; no detections in either window', significance: 'no detections' };
  }
  const pct = ((avgR - avgE) / avgE) * 100;
  if (Math.abs(pct) <= T.trend_stable_band_pct) return { pct, label: 'stable', basis, significance: `within ±${T.trend_stable_band_pct}%` };
  const det = (a) => a.filter((v) => v > 0).length;
  const need = (a) => Math.min(T.trend_min_detected_years, a.length);
  const why = [];
  if (Math.abs(avgR - avgE) < T.trend_min_abs_change_million_m3) why.push(`change of ${round(Math.abs(avgR - avgE), 2)} million m³/yr is below the ${T.trend_min_abs_change_million_m3} floor`);
  if (det(recent) < need(recent)) why.push(`${det(recent)} of ${recent.length} recent years detected (need ${need(recent)})`);
  if (det(earlier) < need(earlier)) why.push(`${det(earlier)} of ${earlier.length} baseline years detected (need ${need(earlier)})`);
  if (why.length) return { pct, label: 'not_significant', basis, significance: 'within detection noise: ' + why.join('; ') };
  return { pct, label: pct > 0 ? 'rising' : 'falling', basis, significance: 'significant' };
}

function round(n, d) {
  if (n == null || isNaN(n)) return null;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

// ---- F1: decision brief — /api/brief?scope=national|operator|site&id=…&cut=0–100&format=html|csv
// One list of rows drives both the CSV and the HTML, so the two never diverge.
function brief(url, ledger) {
  const q = url.searchParams;
  const scope = ['national', 'operator', 'site'].includes(q.get('scope')) ? q.get('scope') : 'national';
  const id = (q.get('id') || '').trim();
  const cut = Math.max(0, Math.min(100, Math.round(Number(q.get('cut')) || 0)));
  const format = q.get('format') === 'csv' ? 'csv' : 'html';
  const { sites, operators, national, meta } = ledger;
  const { num, money, pct, esc, ordinal, sig } = core.util;

  let o, title, kicker, vol, peers;
  if (scope === 'site') {
    o = sites.find((s) => s.site_id === id);
    if (!o) return json({ error: 'unknown site id' }, 404);
    title = o.field_name || o.site_id; kicker = `Flare site ${o.site_id} · ${o.operator}`;
    vol = o.latest_year_vol_million_m3; peers = 'sites';
  } else if (scope === 'operator') {
    o = operators.find((x) => x.operator.toLowerCase() === id.toLowerCase());
    if (!o) return json({ error: 'unknown operator' }, 404);
    title = o.operator; kicker = `Operator · ${o.sites} flare sites`;
    vol = o.total_vol_million_m3_latest; peers = 'operators';
  } else {
    o = national; title = 'Nigeria — national flare exposure'; kicker = `National · ${o.sites} sites · ${o.operators} operators`;
    vol = o.total_vol_million_m3_latest;
  }
  const Y = meta.latest_year;
  const now = core.convert(vol, K);
  const sc = cut ? core.scenario(vol, cut, K) : null;
  const generated = new Date().toISOString().slice(0, 10);
  const yr0 = o.year_series[0].year;

  // [section, metric, value, unit, note]
  const rows = [
    ['brief', 'scope', scope, '', ''], ['brief', 'subject', title, '', kicker],
    ['brief', 'generated', generated, 'date', ''], ['brief', 'method_version', METHOD_VERSION, '', ''],
    ['brief', 'method_changes', METHOD_CHANGES, '', ''],
    ['brief', 'data_vintage', DATA_VINTAGE, '', ''],
    ['brief', 'gfmr_release', VINTAGE.release, '', VINTAGE.methodology],
    ['headline', 'flared_volume', round(vol, 2), 'million m³', String(Y)],
    ['headline', 'flared_volume_bcm', round(now.bcm, 4), 'bcm', String(Y)],
    ['headline', 'co2e', round(now.co2e_t, 0), 't CO₂e', 'GFMR global ratio; order-of-magnitude'],
    ['headline', 'methane_unburned', round(now.ch4_t, 0), 't CH₄', 'GFMR June 2026 global ratio (1.8 Mt CH₄ per 167 bcm); order-of-magnitude'],
    ['headline', 'methane_unburned_co2e', round(now.ch4_co2e_t, 0), 't CO₂e', 'included in co2e (50 MtCO₂e per 167 bcm)'],
  ];
  if (scope === 'site') {
    rows.push(['headline', 'verdict', o.verdict, '', ''], ['headline', 'confidence', o.confidence, '0–1', ''],
      ['headline', 'detection_floor', o.detection_floor, '', ''], ['headline', 'niger_delta', o.niger_delta_class, '', o.niger_delta_label]);
  } else {
    rows.push(['headline', 'sites', o.sites, '', ''], ['headline', 'sites_detected_latest_year', o.active_sites, '', String(Y)]);
  }
  rows.push(
    ['trend', 'change_3yr', o.change_3yr_pct, '%', `${Y} vs ${Y - 3}${o.change_3yr_significant === false ? '; not significant' : ''}`],
    ['trend', 'change_5yr', o.change_5yr_pct, '%', `${Y} vs ${Y - 5}${o.change_5yr_significant === false ? '; not significant' : ''}`],
  );
  if (scope === 'site') rows.push(['trend', 'trend_label', o.trend_label, '', `${o.trend_basis}; ${o.trend_significance}`]);
  if (peers) {
    rows.push(['percentile', 'volume', o.percentile_volume, 'pctile', o.percentile_volume == null ? `n/a — no ${Y} detection; excluded from the peer set of ${o.peer_set_size.volume} detected ${peers}` : `larger than this share of ${o.peer_set_size.volume - 1} other detected ${peers}, ${Y} (peer set ${o.peer_set_size.volume}; ${o.peer_set_size.excluded_volume} undetected excluded)`],
      ['percentile', 'improvement', o.percentile_improvement, 'pctile', o.percentile_improvement == null ? '3-yr change undefined (no detection in base year)' : `improving faster than this share of ${o.peer_set_size.improvement - 1} other ${peers}`]);
  }
  rows.push(
    ['penalty', 'basis', PENALTY.short, '', PENALTY.citation],
    ['penalty', 'assumption', PENALTY.assumption, '', ''],
    ['penalty', 'current_upper_2usd_tier', round(now.penalty_usd_upper, 0), 'US$', `${Y} volume × US$2.00/1,000 scf — Reg. 13(1), ≥10,000 bbl/d; upper bound`],
    ['penalty', 'current_lower_050usd_tier', round(now.penalty_usd_lower, 0), 'US$', `${Y} volume × US$0.50/1,000 scf — Reg. 13(2), <10,000 bbl/d; lower bound`],
    ['penalty', 'current_upper_ngn_indicative', round(now.penalty_usd_upper * NGN_PER_USD, 0), '₦', `$2.00 tier, indicative at ${NGN_PER_USD}/US$`],
    ['penalty', 'current_lower_ngn_indicative', round(now.penalty_usd_lower * NGN_PER_USD, 0), '₦', `$0.50 tier, indicative at ${NGN_PER_USD}/US$`],
    ['penalty', 'cumulative_upper_2usd_tier', o.cumulative_penalty_usd_upper, 'US$', `${yr0}–${Y}; ${CUMULATIVE_NOTE}`],
    ['penalty', 'cumulative_lower_050usd_tier', o.cumulative_penalty_usd_lower, 'US$', `${yr0}–${Y}; ${CUMULATIVE_NOTE}`],
    ['penalty', 'cumulative_volume', o.cumulative_million_m3, 'million m³', `${yr0}–${Y}`],
    ...PENALTY.exemptions.map((e, i) => ['penalty', `exemption_${i + 1}`, e, '', 'not deducted: exempt volumes are not visible in satellite data']),
  );
  for (const f of o.forecast) {
    rows.push(['projection', `penalty_${f.year}_upper_2usd_tier`, f.penalty_usd_upper, 'US$', `PROJECTION · ${num(f.million_m3, 1)} million m³ · ${FORECAST_METHOD}`],
      ['projection', `penalty_${f.year}_lower_050usd_tier`, f.penalty_usd_lower, 'US$', `PROJECTION · ${num(f.million_m3, 1)} million m³`]);
  }
  if (sc) {
    rows.push(['scenario', 'assumption', `SCENARIO · ${sc.assumption}`, '', `${Y} recorded volume`]);
    for (const [k, unit] of [['million_m3', 'million m³'], ['co2e_t', 't CO₂e'], ['ch4_t', 't CH₄'], ['penalty_usd_upper', 'US$ ($2.00 tier)'], ['penalty_usd_lower', 'US$ ($0.50 tier)']]) {
      rows.push(['scenario', `${k}_after_${cut}pct_cut`, sig(sc.after[k]), unit, `SCENARIO (3 s.f.) · saves ${sig(sc.saved[k])} ${unit} vs ${Y}`]);
    }
  }
  for (const p of o.year_series) rows.push(['series', String(p.year), p.million_m3, 'million m³', '']);
  const SOURCES = [
    meta.sources.volume, meta.sources.penalty, meta.sources.emissions, meta.sources.boundary,
    `Kaliabe derivations (${METHOD_VERSION}): trend, N-yr change, percentile, cumulative and projection — see docs/METHODOLOGY.md`,
  ];
  rows.push(...SOURCES.map((s, i) => ['source', String(i + 1), s, '', '']));

  const slug = (scope === 'national' ? 'nigeria' : (scope === 'site' ? o.site_id : o.operator)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const fname = `kaliabe-brief-${scope}-${slug}${cut ? `-cut${cut}` : ''}-${generated}`;
  if (format === 'csv') {
    const e = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const body = ['section,metric,value,unit,note', ...rows.map((r) => r.map(e).join(','))].join('\n') + '\n';
    return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${fname}.csv"`, 'cache-control': 'public, max-age=300', ...corsHeaders } });
  }

  const chg = (v, sg) => (v == null ? '<span class="na">n/a</span>' : sg === false ? `<span class="na">${pct(v)} n.s.</span>` : pct(v));
  const fig = (label, value, sub) => `<div class="fig"><p class="l">${label}</p><p class="v">${value}</p>${sub ? `<p class="s">${sub}</p>` : ''}</div>`;
  const pctTxt = peers ? `
    <h2>Peer percentile</h2>
    <p class="big">${o.percentile_volume == null ? `Volume percentile <b>n/a</b> — no ${Y} detection, so excluded from the peer set` : o.percentile_volume === 100 ? `Larger than <b>every other</b> detected ${peers.replace(/s$/, '')}` : `Larger than <b>${o.percentile_volume}%</b> of detected ${peers}`} by ${Y} flared volume <span class="s">(${o.percentile_volume == null ? '' : ordinal(o.percentile_volume) + ' percentile; '}peer set ${o.peer_set_size.volume} ${peers} with a ${Y} detection, ${o.peer_set_size.excluded_volume} undetected excluded)</span></p>
    <p class="big">${o.percentile_improvement == null ? 'Improvement rank undefined — no detection in the 3-yr base year.' : `Improving faster than <b>${o.percentile_improvement}%</b> of ${peers} on 3-yr change <span class="s">(peer set ${o.peer_set_size.improvement})</span>`}</p>` : '';
  const topSites = scope !== 'site' ? sites.filter((s) => scope === 'national' || s.operator === o.operator).slice(0, 10) : [];
  const topOps = scope === 'national' ? operators.slice(0, 10) : [];
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Kaliabe decision brief</title>
<style>
:root{--paper:#f5f1e8;--ink:#1c1a16;--soft:#5c5749;--line:#d8d0bd;--accent:#b5761e}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.55 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
main{max-width:820px;margin:0 auto;padding:40px 32px 56px}
.k{color:var(--accent);font-size:11px;letter-spacing:.16em;text-transform:uppercase;margin:0}
h1{font:500 32px/1.1 Georgia,serif;margin:8px 0 4px}h2{font:600 17px Georgia,serif;margin:30px 0 10px;padding-top:14px;border-top:1px solid var(--line)}
.meta{color:var(--soft);font-size:12px;margin:0}
.figs{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-top:1px solid var(--ink);border-bottom:1px solid var(--line);margin-top:22px}
.fig{padding:12px 12px 12px 0}.fig+.fig{padding-left:12px;border-left:1px solid var(--line)}
.fig .l{margin:0;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}.fig .v{margin:2px 0 0;font:22px Georgia,serif}.fig .s,.s{margin:0;color:var(--soft);font-size:11px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}th{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.proj{color:var(--accent)}.tag{display:inline-block;font-size:10px;letter-spacing:.1em;text-transform:uppercase;border:1px solid var(--accent);color:var(--accent);padding:0 6px;border-radius:10px;margin-left:6px;vertical-align:2px}
.big{margin:4px 0;font-size:15px}.na{color:var(--soft)}
.note{border-left:3px solid var(--accent);background:#efe2c4;padding:10px 14px;font-size:12px;margin:22px 0 0}
ol{padding-left:18px;font-size:12px;color:var(--soft)}
.bar{display:flex;gap:10px;margin:0 0 18px}.bar button,.bar a{font:inherit;font-size:12px;border:1px solid var(--ink);background:none;color:var(--ink);padding:5px 12px;border-radius:20px;cursor:pointer;text-decoration:none}
@media print{body{background:#fff}main{padding:0;max-width:none}.bar{display:none}h2{break-after:avoid}table,svg,.figs{break-inside:avoid}@page{margin:16mm}}
@media(max-width:640px){.figs{grid-template-columns:1fr 1fr}.fig:nth-child(3){padding-left:0;border-left:0}}
</style></head><body><main>
<div class="bar"><button type="button" onclick="window.print()">Print / save as PDF</button><a href="?${esc(new URLSearchParams({ scope, id, cut: String(cut), format: 'csv' }).toString())}">Download CSV</a></div>
<p class="k">Kaliabe Flare Ledger · decision brief</p>
<h1>${esc(title)}</h1>
<p class="meta">${esc(kicker)}</p>
<p class="meta">Generated ${generated} · Method ${esc(METHOD_VERSION)} · Data vintage: ${esc(DATA_VINTAGE)}</p>
<p class="meta">${esc(METHOD_CHANGES)}</p>
<div class="figs">
  ${fig(`${Y} flared volume`, `${num(vol, 1)} <span class="s">million m³</span>`, `${num(now.bcm, 3)} bcm · ${num(now.mmscfd, 1)} MMscfd`)}
  ${fig(`${Y} penalty, two tiers`, `${money(now.penalty_usd_upper, '$')} <span class="s">/ ${money(now.penalty_usd_lower, '$')}</span>`, '$2.00 tier (upper) / $0.50 tier (lower)')}
  ${fig('CO₂e', `${num(now.co2e_t / 1e3, 0)} kt`, `unburned CH₄ ${num(now.ch4_t, 0)} t (${num(now.ch4_co2e_t / 1e3, 0)} kt CO₂e)`)}
  ${scope === 'site'
    ? fig('Verdict', o.verdict === 'verified_flare' ? 'Verified' : 'Unverified', `${Math.round(o.confidence * 100)}% confidence`)
    : fig('Sites', `${o.active_sites}/${o.sites}`, `detected in ${Y}`)}
</div>
${scope === 'site' ? `<p class="s" style="margin-top:8px"><b>Detection floor.</b> ${esc(o.detection_floor)}</p><p class="s"><b>Location.</b> ${esc(o.niger_delta_label)}</p>` : ''}
<h2>Trend</h2>
${core.trendChart(o.year_series, { forecast: o.forecast, width: 760, height: 220 })}
<p class="big">3-yr change <b>${chg(o.change_3yr_pct, o.change_3yr_significant)}</b> <span class="s">(${Y} vs ${Y - 3})</span> · 5-yr change <b>${chg(o.change_5yr_pct, o.change_5yr_significant)}</b> <span class="s">(${Y} vs ${Y - 5})</span>${scope === 'site' ? ` · trend <b>${esc(o.trend_label.replace('_', ' '))}</b> ${o.trend_pct != null ? pct(o.trend_pct) : ''} <span class="s">(${esc(o.trend_basis)}; ${esc(o.trend_significance)})</span>` : ''}</p>
<p class="s">n.s. = not significant: moves less than ${T.change_min_abs_million_m3} million m³ or within ±${T.trend_stable_band_pct}%, i.e. within detection noise.</p>
${pctTxt}
<h2>Penalty exposure — two tiers</h2>
<p class="s">Basis: <b>${esc(PENALTY.instrument)}</b>, ${esc(PENALTY.citation)}. Reg. 13 charges per 28.317 m³ (1,000 scf) flared, routine or non-routine.</p>
<p class="big"><b>Assumption.</b> ${esc(PENALTY.assumption)}</p>
<table><thead><tr><th>Measure</th><th>Basis</th><th class="n">$2.00 tier<br><span class="s">≥10,000 bbl/d · upper</span></th><th class="n">$0.50 tier<br><span class="s">&lt;10,000 bbl/d · lower</span></th></tr></thead><tbody>
<tr><td>Current</td><td>${Y} volume, ${num(vol, 1)} million m³</td><td class="n">${money(now.penalty_usd_upper, '$')}</td><td class="n">${money(now.penalty_usd_lower, '$')}</td></tr>
<tr><td>Cumulative</td><td>${yr0}–${Y}, ${num(o.cumulative_million_m3, 0)} million m³ — notional (Regulations made July 2018)</td><td class="n">${money(o.cumulative_penalty_usd_upper, '$')}</td><td class="n">${money(o.cumulative_penalty_usd_lower, '$')}</td></tr>
${o.forecast.map((f) => `<tr class="proj"><td>${f.year}<span class="tag">projection</span></td><td>${num(f.million_m3, 1)} million m³ if the ${Y - 2}–${Y} line continues</td><td class="n">${money(f.penalty_usd_upper, '$')}</td><td class="n">${money(f.penalty_usd_lower, '$')}</td></tr>`).join('')}
</tbody></table>
<p class="s">Exemptions in the Regulations, <b>not deducted</b> here because exempt volumes cannot be seen from satellite data: ${PENALTY.exemptions.map(esc).join(' ')} ${esc(PENALTY.not_modelled)}</p>
<p class="s">Projection: ${esc(FORECAST_METHOD)}.</p>
${sc ? `<h2>Scenario: flaring cut by ${cut}% <span class="tag">scenario</span></h2>
<p class="big"><b>Scenario assumption.</b> ${esc(sc.assumption)} (${Y} recorded volume). Rounded to 3 significant figures.</p>
<table><thead><tr><th>Measure (${Y})</th><th class="n">As recorded</th><th class="n">Scenario <span class="tag">scenario</span></th><th class="n">Difference</th></tr></thead><tbody>
<tr><td>Flared volume (million m³)</td><td class="n">${num(sig(sc.base.million_m3), 2)}</td><td class="n">${num(sig(sc.after.million_m3), 2)}</td><td class="n">−${num(sig(sc.saved.million_m3), 2)}</td></tr>
<tr><td>CO₂e (t)</td><td class="n">${num(sig(sc.base.co2e_t), 0)}</td><td class="n">${num(sig(sc.after.co2e_t), 0)}</td><td class="n">−${num(sig(sc.saved.co2e_t), 0)}</td></tr>
<tr><td>Unburned methane (t CH₄)</td><td class="n">${num(sig(sc.base.ch4_t), 0)}</td><td class="n">${num(sig(sc.after.ch4_t), 0)}</td><td class="n">−${num(sig(sc.saved.ch4_t), 0)}</td></tr>
<tr><td>Penalty, $2.00 tier (US$)</td><td class="n">${money(sc.base.penalty_usd_upper, '$')}</td><td class="n">${money(sc.after.penalty_usd_upper, '$')}</td><td class="n">−${money(sc.saved.penalty_usd_upper, '$')}</td></tr>
<tr><td>Penalty, $0.50 tier (US$)</td><td class="n">${money(sc.base.penalty_usd_lower, '$')}</td><td class="n">${money(sc.after.penalty_usd_lower, '$')}</td><td class="n">−${money(sc.saved.penalty_usd_lower, '$')}</td></tr>
</tbody></table>
<p class="s">A scenario, not a forecast.</p>` : ''}
${topOps.length ? `<h2>Largest operators, ${Y}</h2><table><thead><tr><th>Operator</th><th class="n">Sites</th><th class="n">Million m³</th><th class="n">3-yr change</th><th class="n">Penalty $2.00 / $0.50 tier</th></tr></thead><tbody>
${topOps.map((x) => `<tr><td>${esc(x.operator)}</td><td class="n">${x.sites}</td><td class="n">${num(x.total_vol_million_m3_latest, 1)}</td><td class="n">${chg(x.change_3yr_pct, x.change_3yr_significant)}</td><td class="n">${money(x.penalty_usd_latest_upper, '$')} / ${money(x.penalty_usd_latest_lower, '$')}</td></tr>`).join('')}</tbody></table>` : ''}
${topSites.length ? `<h2>Largest sites, ${Y}</h2><table><thead><tr><th>Site</th>${scope === 'national' ? '<th>Operator</th>' : ''}<th class="n">Million m³</th><th class="n">3-yr change</th><th class="n">Penalty $2.00 / $0.50 tier</th></tr></thead><tbody>
${topSites.map((x) => `<tr><td>${esc(x.field_name || x.site_id)} <span class="s">${esc(x.site_id)}</span></td>${scope === 'national' ? `<td>${esc(x.operator)}</td>` : ''}<td class="n">${num(x.latest_year_vol_million_m3, 1)}</td><td class="n">${chg(x.change_3yr_pct, x.change_3yr_significant)}</td><td class="n">${money(x.penalty_usd_latest_upper, '$')} / ${money(x.penalty_usd_latest_lower, '$')}</td></tr>`).join('')}</tbody></table>` : ''}
<div class="note"><b>A derived, open-data record.</b> Not an official NUPRC determination and no operator endorsement. Penalties are shown at both Reg. 13 tiers because production rates are not held. Volumes are satellite-derived (VIIRS measures flare heat; volume follows a radiance→flow calibration that carries uncertainty). Projections are labelled projections; scenarios are labelled scenarios.</div>
<h2>Sources</h2>
<ol>${SOURCES.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
<p class="s">Kaliabe Flare Ledger · kaliabe-flare-web.pages.dev · ${esc(METHOD_VERSION)} · GFMR ${esc(VINTAGE.release)}</p>
</main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', ...corsHeaders } });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/health') return json({ status: 'ok', source: 'World Bank GFMR / NOAA VIIRS', service: 'kaliabe-flare', method_version: METHOD_VERSION, gfmr_release: VINTAGE.release });

      if (path === '/api/sites') {
        const { sites, national, meta } = await loadLedger(env);
        return json({ count: sites.length, basis: PENALTY_BASIS, meta, national, sites });
      }

      if (path === '/api/national') {
        const { national, meta } = await loadLedger(env);
        return json({ meta, national });
      }

      if (path === '/api/brief') return brief(url, await loadLedger(env));

      if (path === '/api/sites/trend') {
        // lightweight aggregate for map — latest year markers
        const rows = await env.DB.prepare(
          `SELECT s.site_id, s.lat, s.lon, s.operator,
                  a.year, a.flaring_vol_m3
           FROM flare_sites s JOIN flare_annual a ON s.site_id=a.site_id
           WHERE a.year=(SELECT MAX(year) FROM flare_annual a2 WHERE a2.site_id=s.site_id)`
        ).all();
        return json({ count: rows.results.length, markers: rows.results.map((r) => {
          const nd = ndOf(r.site_id);
          return { id: r.site_id, lat: r.lat, lon: r.lon, operator: r.operator,
            year: r.year, million_m3: round(r.flaring_vol_m3,2), bcm: round(r.flaring_vol_m3/1e3,4), nigerDelta: nd.in_niger_delta, nigerDeltaClass: nd.niger_delta_class };
        }) });
      }

      if (path === '/api/operators') {
        const { operators, national, meta } = await loadLedger(env);
        return json({ count: operators.length, meta, national, operators });
      }

      if (path === '/api/summary') {
        const { national, meta } = await loadLedger(env);
        return json({
          sites: national.sites, niger_delta_sites: national.niger_delta_sites, offshore_sites: national.offshore_sites,
          niger_delta_method: ND.method,
          latest_year: national.latest_year,
          latest_total_vol_million_m3: national.total_vol_million_m3_latest,
          latest_total_bcm: national.total_vol_bcm_latest,
          active_sites_latest: national.active_sites,
          penalty_usd_latest_upper: national.penalty_usd_latest_upper,
          penalty_usd_latest_lower: national.penalty_usd_latest_lower,
          evidence: meta.sources.volume,
          gfmr_release: VINTAGE.release,
          penalty_basis: PENALTY_BASIS,
          penalty_assumption: PENALTY.assumption,
          method_version: METHOD_VERSION,
          naira_indicative: `${NGN_PER_USD}/USD`
        });
      }

      if (path === '/api/digest.csv') {
        const rows = await env.DB.prepare(
          `SELECT s.site_id, s.lat, s.lon, s.operator, s.field_name, s.field_type, s.location,
                  a.year, a.flaring_vol_m3
           FROM flare_sites s JOIN flare_annual a ON s.site_id=a.site_id
           ORDER BY s.site_id, a.year`
        ).all();
        // GFMR volumes are MILLION m3. bcm = million m3 / 1e3; MMscfd = million m3/yr × 35.3147 / 365.
        const header = ['site_id','lat','lon','operator','field_name','field_type','location','in_niger_delta','niger_delta_class','year','flaring_vol_million_m3','bcm','mmscfd'];
        const esc = (v) => { const s=String(v==null?'':v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
        const lines = [header.join(','), ...rows.results.map((r) => {
          const v = r.flaring_vol_m3 || 0;
          const nd = ndOf(r.site_id);
          return [
            esc(r.site_id), esc(r.lat), esc(r.lon), esc(r.operator), esc(r.field_name),
            esc(r.field_type), esc(r.location), nd.in_niger_delta ? 1 : 0, nd.niger_delta_class, esc(r.year),
            esc(round(v, 2)), esc(round(v / 1e3, 6)), esc(round(v * SCF_PER_M3 / 365, 4)),
          ].join(',');
        })];
        return new Response(lines.join('\n') + '\n', {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': 'attachment; filename="kaliabe-flare-digest.csv"',
            'cache-control': 'public, max-age=300',
            ...corsHeaders,
          },
        });
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};