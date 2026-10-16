/**
 * Kaliabe Flare Ledger — Cloudflare Worker
 * Verdict engine + REST API over D1.
 *
 * Real data spine: World Bank GFMR "Flare Volume Estimates by Individual
 * Flare Location 2012-2025" (Nigeria subset), sourced from NOAA VIIRS
 * Nightfire (Payne Institute / Colorado School of Mines). Seeded into D1.
 *
 * Penalty basis: NUPRC 2022 Flare Gas (Prevention of Waste and Pollution)
 * Regulations Gazette — US$2.00 per 1,000 scf (28.317 m³ of associated gas).
 *
 * Method caveats are deliberately explicit: VIIRS measures flare *heat*;
 * volume↔radiance calibration carries uncertainty from gas composition and
 * combustion efficiency. Every verdict carries a detection floor + confidence.
 */
import core from '../../web/public/js/ledger-core.js';

// ---- Penalty & conversion constants (cite in code + methodology page) ----
// NOTE units: GFMR "Flaring Vol (million m3)" is stored per-site per-year in the
// seed as MILLION m3 (so Oso 308.37 = 308.37 million m3 = 0.30837 bcm). All
// downstream math converts explicitly from million-m3 to real units.
const PENALTY_USD_PER_1000SCF = 2.0;      // NUPRC 2022 Gazette
const SCF_PER_M3 = 35.3146667;            // 1 m3 = 35.3146667 scf
const M3_PER_1000SCF = 1000 / SCF_PER_M3; // = 28.3168 m3 per 1000 scf
const PENALTY_USD_PER_M3 = PENALTY_USD_PER_1000SCF / M3_PER_1000SCF; // $0.07063/m3
// GFMR global calibration ratios (2025 tracker): 151 bcm -> 389 MtCO2e incl 46 Mt CH4
const CO2E_MT_PER_BCM = 389 / 151;   // 2.576
const CH4_MT_PER_BCM = 46 / 151;     // 0.3046
// Indicative naira FX (display only; mark as estimate)
const NGN_PER_USD = 1550; // indicative, cite as of-data snapshot

// Full-precision constants handed to the shared core (web/public/js/ledger-core.js)
// and published in meta.constants so the browser never defines its own.
const K = {
  penalty_usd_per_1000scf: PENALTY_USD_PER_1000SCF,
  scf_per_m3: SCF_PER_M3,
  m3_per_1000scf: M3_PER_1000SCF,
  co2e_mt_per_bcm: CO2E_MT_PER_BCM,
  ch4_mt_per_bcm: CH4_MT_PER_BCM,
  ngn_per_usd_indicative: NGN_PER_USD,
};

// Method version + data vintage: stamped on every API response and brief.
const METHOD_VERSION = 'KFL-M 1.1 (2026-10-16)';
const DATA_VINTAGE = 'World Bank GFMR flare-location estimates 2012–2025 (latest year 2025); Ledger seed loaded 2026-10-16';
const FORECAST_YEARS = 3;
const FORECAST_METHOD = 'least-squares line through the last 3 years, extended 3 years and clamped at zero — a projection, not a fact';
const CHANGE_METHOD = 'N-yr change = latest-year volume vs the volume N years earlier; undefined when that base year had no detection';
const CUMULATIVE_NOTE = 'notional: the 2022 NUPRC rate applied to every year 2012–2025 (earlier years fell under the previous regime)';

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

  // million m3 -> bcm ( /1e3 ) and million m3 -> m3 ( *1e6 )
  const latestBcm = latestMillionM3 / 1e3;         // 308.37 M m3 = 0.30837 bcm
  const latestM3 = latestMillionM3 * 1e6;          // real m3 for penalty math

  const volMillionM3 = years.map((r) => ({ year: r.year, millionM3: r.flaring_vol_m3 || 0 }));
  const trend = computeTrend(volMillionM3);

  // Penalty (USD) on the latest-year flared volume.
  // USD = scf/1000 * $2.00 ; scf = m3 * SCF_PER_M3
  const latestScf = latestM3 * SCF_PER_M3;
  const penaltyUSD = latestScf / 1000 * PENALTY_USD_PER_1000SCF;
  const penaltyNGN = penaltyUSD * NGN_PER_USD;

  // Methane-equivalent loss & CO2e for latest year (from bcm, global calibration)
  const co2eT = latestBcm * CO2E_MT_PER_BCM * 1e6;   // Mt -> tonnes
  const ch4T = latestBcm * CH4_MT_PER_BCM * 1e6;     // Mt CH4-equivalent -> tonnes

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
    // Confidence from data coverage (years of record) + onshore/offshore attribution.
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
    in_niger_delta: !!site.in_niger_delta,
    latest_year: latestYear,
    latest_year_vol_million_m3: round(latestMillionM3, 2),
    latest_year_vol_m3: round(latestM3, 0),
    latest_year_bcm: round(latestBcm, 4),
    trend_pct: trend.pct == null ? null : round(trend.pct, 1),
    trend_label: trend.label,
    trend_basis: trend.basis,
    verdict,
    confidence: round(confidence, 3),
    detection_floor: detectionFloor,
    penalty_usd_latest: round(penaltyUSD, 2),
    penalty_ngn_latest: round(penaltyNGN, 2),
    penalty_basis: 'NUPRC 2022 Gazette, US$2.00 per 1,000 scf (28.317 m³)',
    co2e_tonnes_latest: round(co2eT, 1),
    methane_tonnes_equivalent_latest: round(ch4T, 2),
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
    out.push({ year: y0 + h, million_m3: round(v, 2), penalty_usd: round(core.convert(v, K).penalty_usd, 0) });
  }
  return out;
}
function seriesStats(series) {
  const ys = series.map((d) => d.millionM3 || 0);
  const cum = ys.reduce((a, b) => a + b, 0);
  const c = core.convert(cum, K);
  const fc = projection(series);
  return {
    change_3yr_pct: changePct(ys, 3),
    change_5yr_pct: changePct(ys, 5),
    cumulative_million_m3: round(cum, 2),
    cumulative_penalty_usd: round(c.penalty_usd, 0),
    cumulative_co2e_tonnes: round(c.co2e_t, 0),
    forecast: fc,
    forecast_penalty_usd_next: fc.length ? fc[0].penalty_usd : null,
    forecast_penalty_usd_3yr: fc.length ? round(fc.reduce((a, d) => a + d.penalty_usd, 0), 0) : null,
  };
}

// Percentile ranks vs a peer set (0–100, share of *other* members strictly
// below). Volume: "larger than N%". Improvement on 3-yr change (lower = better):
// "improving faster than N%"; null where the 3-yr change is undefined.
function rank(items, volKey) {
  const vols = items.map((x) => x[volKey] || 0).sort((a, b) => a - b);
  const chg = items.map((x) => x.change_3yr_pct).filter((v) => v != null).sort((a, b) => a - b);
  const below = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; };
  const above = (arr, v) => arr.length - below(arr, v + 1e-9);
  for (const x of items) {
    x.percentile_volume = vols.length > 1 ? Math.round((100 * below(vols, x[volKey] || 0)) / (vols.length - 1)) : null;
    x.percentile_improvement = x.change_3yr_pct != null && chg.length > 1
      ? Math.round((100 * above(chg, x.change_3yr_pct)) / (chg.length - 1)) : null;
    x.peer_set_size = { volume: vols.length, improvement: chg.length };
  }
}

function aggregate(sites, latestYear) {
  const byYear = new Map();
  let active = 0, nd = 0;
  for (const s of sites) {
    for (const p of s.year_series) byYear.set(p.year, (byYear.get(p.year) || 0) + (p.million_m3 || 0));
    if (s.latest_year_vol_million_m3 > 0) active++;
    if (s.in_niger_delta) nd++;
  }
  const series = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, millionM3: v }));
  const latest = byYear.get(latestYear) || 0;
  const c = core.convert(latest, K);
  return {
    sites: sites.length,
    active_sites: active,
    niger_delta_sites: nd,
    latest_year: latestYear,
    total_vol_million_m3_latest: round(latest, 2),
    total_vol_bcm_latest: round(latest / 1e3, 4),
    penalty_usd_latest: round(c.penalty_usd, 2),
    co2e_tonnes_latest: round(c.co2e_t, 0),
    methane_tonnes_equivalent_latest: round(c.ch4_t, 0),
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

  const data = { sites, operators, national, meta: buildMeta(latestYear) };
  ledgerCache = { at: Date.now(), data };
  return data;
}

function buildMeta(latestYear) {
  return {
    method_version: METHOD_VERSION,
    data_vintage: DATA_VINTAGE,
    latest_year: latestYear,
    units: 'GFMR per-year volumes in million m³; bcm = million m³ / 1,000',
    penalty_usd_per_1000scf: PENALTY_USD_PER_1000SCF,
    m3_per_1000scf: round(M3_PER_1000SCF, 3),
    ngn_per_usd_indicative: NGN_PER_USD,
    co2e_mt_per_bcm: round(CO2E_MT_PER_BCM, 4),
    ch4_mt_per_bcm: round(CH4_MT_PER_BCM, 4),
    constants: K,
    trend_method: `mean of last 3 yrs vs preceding up to 5 yrs; ±${TREND_THRESHOLD_PCT}% = stable`,
    change_method: CHANGE_METHOD,
    forecast_method: FORECAST_METHOD,
    cumulative_note: CUMULATIVE_NOTE,
    percentile_method: 'share of the other members of the peer set (all sites, or all operators) strictly below on latest-year volume; improvement ranks the 3-yr change, lower = better',
    sources: {
      volume: 'World Bank GFMR, Flare Volume Estimates by Individual Flare Location 2012–2025 (NOAA VIIRS Nightfire / EOG, Payne Institute)',
      penalty: 'NUPRC Flare Gas (Prevention of Waste and Pollution) Regulations 2022, US$2.00 per 1,000 scf',
      emissions: 'GFMR 2025 global ratios: 151 bcm ≈ 389 Mt CO₂e incl. 46 Mt CH₄',
    },
  };
}

// Trend: mean of the most recent 3 years vs mean of up to 5 preceding years.
// Returns { pct, label, basis }. pct is a real percentage (e.g. -23.4) or null
// when undefined (no baseline). Labels: rising | falling | stable | new | inactive.
const TREND_THRESHOLD_PCT = 5;
function computeTrend(series) {
  const ys = series
    .filter((s) => s && s.year != null)
    .sort((a, b) => a.year - b.year)
    .map((s) => (Number.isFinite(s.millionM3) ? s.millionM3 : 0));
  const n = ys.length;
  if (n < 2) return { pct: null, label: 'stable', basis: 'insufficient record (<2 years)' };
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
    if (avgR > 0) return { pct: null, label: 'new', basis: basis + '; no baseline flaring' };
    return { pct: 0, label: 'inactive', basis: basis + '; no detections in either window' };
  }
  const pct = ((avgR - avgE) / avgE) * 100;
  return { pct, label: trendLabel(pct), basis };
}

function trendLabel(t) {
  if (t > TREND_THRESHOLD_PCT) return 'rising';
  if (t < -TREND_THRESHOLD_PCT) return 'falling';
  return 'stable';
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
  const { num, money, pct, esc, ordinal } = core.util;

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
    ['brief', 'data_vintage', DATA_VINTAGE, '', ''],
    ['headline', 'flared_volume', round(vol, 2), 'million m³', String(Y)],
    ['headline', 'flared_volume_bcm', round(now.bcm, 4), 'bcm', String(Y)],
    ['headline', 'co2e', round(now.co2e_t, 0), 't CO₂e', 'GFMR global ratio; order-of-magnitude'],
    ['headline', 'methane_equivalent', round(now.ch4_t, 0), 't CH₄', 'GFMR global ratio; order-of-magnitude'],
  ];
  if (scope === 'site') {
    rows.push(['headline', 'verdict', o.verdict, '', ''], ['headline', 'confidence', o.confidence, '0–1', ''],
      ['headline', 'detection_floor', o.detection_floor, '', '']);
  } else {
    rows.push(['headline', 'sites', o.sites, '', ''], ['headline', 'sites_detected_latest_year', o.active_sites, '', String(Y)]);
  }
  rows.push(
    ['trend', 'change_3yr', o.change_3yr_pct, '%', `${Y} vs ${Y - 3}`],
    ['trend', 'change_5yr', o.change_5yr_pct, '%', `${Y} vs ${Y - 5}`],
  );
  if (scope === 'site') rows.push(['trend', 'trend_label', o.trend_label, '', o.trend_basis]);
  if (peers) {
    rows.push(['percentile', 'volume', o.percentile_volume, 'pctile', `larger than this share of ${o.peer_set_size.volume - 1} other ${peers}, ${Y}`],
      ['percentile', 'improvement', o.percentile_improvement, 'pctile', o.percentile_improvement == null ? '3-yr change undefined (no detection in base year)' : `improving faster than this share of ${o.peer_set_size.improvement - 1} other ${peers}`]);
  }
  rows.push(
    ['penalty', 'current', round(now.penalty_usd, 0), 'US$', `${Y} volume × US$2.00/1,000 scf`],
    ['penalty', 'current_ngn_indicative', round(now.penalty_usd * NGN_PER_USD, 0), '₦', `indicative at ${NGN_PER_USD}/US$`],
    ['penalty', 'cumulative', o.cumulative_penalty_usd, 'US$', `${yr0}–${Y}; ${CUMULATIVE_NOTE}`],
    ['penalty', 'cumulative_volume', o.cumulative_million_m3, 'million m³', `${yr0}–${Y}`],
  );
  for (const f of o.forecast) rows.push(['projection', `penalty_${f.year}`, f.penalty_usd, 'US$', `PROJECTION · ${num(f.million_m3, 1)} million m³ · ${FORECAST_METHOD}`]);
  if (sc) {
    for (const [k, unit] of [['million_m3', 'million m³'], ['co2e_t', 't CO₂e'], ['ch4_t', 't CH₄'], ['penalty_usd', 'US$']]) {
      rows.push(['scenario', `${k}_after_${cut}pct_cut`, round(sc.after[k], 2), unit, `SCENARIO · saves ${num(sc.saved[k], 0)} ${unit} vs ${Y}`]);
    }
  }
  for (const p of o.year_series) rows.push(['series', String(p.year), p.million_m3, 'million m³', '']);
  const SOURCES = [
    meta.sources.volume, meta.sources.penalty, meta.sources.emissions,
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

  const chg = (v) => (v == null ? '<span class="na">n/a</span>' : pct(v));
  const fig = (label, value, sub) => `<div class="fig"><p class="l">${label}</p><p class="v">${value}</p>${sub ? `<p class="s">${sub}</p>` : ''}</div>`;
  const pctTxt = peers ? `
    <h2>Peer percentile</h2>
    <p class="big">${o.percentile_volume === 100 ? `Larger than <b>every other</b> ${peers.replace(/s$/, '')}` : `Larger than <b>${o.percentile_volume}%</b> of ${peers}`} by ${Y} flared volume <span class="s">(${ordinal(o.percentile_volume)} percentile of ${o.peer_set_size.volume})</span></p>
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
<div class="figs">
  ${fig(`${Y} flared volume`, `${num(vol, 1)} <span class="s">million m³</span>`, `${num(now.bcm, 3)} bcm · ${num(now.mmscfd, 1)} MMscfd`)}
  ${fig(`${Y} penalty basis`, money(now.penalty_usd, 'US$'), `≈ ${money(now.penalty_usd * NGN_PER_USD, '₦')} indicative`)}
  ${fig('CO₂e', `${num(now.co2e_t / 1e3, 0)} kt`, `CH₄-equiv. ${num(now.ch4_t / 1e3, 1)} kt`)}
  ${scope === 'site'
    ? fig('Verdict', o.verdict === 'verified_flare' ? 'Verified' : 'Unverified', `${Math.round(o.confidence * 100)}% confidence`)
    : fig('Sites', `${o.active_sites}/${o.sites}`, `detected in ${Y}`)}
</div>
${scope === 'site' ? `<p class="s" style="margin-top:8px"><b>Detection floor.</b> ${esc(o.detection_floor)}</p>` : ''}
<h2>Trend</h2>
${core.trendChart(o.year_series, { forecast: o.forecast, width: 760, height: 220 })}
<p class="big">3-yr change <b>${chg(o.change_3yr_pct)}</b> <span class="s">(${Y} vs ${Y - 3})</span> · 5-yr change <b>${chg(o.change_5yr_pct)}</b> <span class="s">(${Y} vs ${Y - 5})</span>${scope === 'site' ? ` · trend <b>${esc(o.trend_label)}</b> ${o.trend_pct != null ? pct(o.trend_pct) : ''} <span class="s">(${esc(o.trend_basis)})</span>` : ''}</p>
${pctTxt}
<h2>Penalty exposure</h2>
<table><thead><tr><th>Measure</th><th>Basis</th><th class="n">US$</th></tr></thead><tbody>
<tr><td>Current</td><td>${Y} volume at US$2.00 / 1,000 scf</td><td class="n">${money(now.penalty_usd, '$')}</td></tr>
<tr><td>Cumulative</td><td>${yr0}–${Y}, ${num(o.cumulative_million_m3, 0)} million m³ — notional, 2022 rate applied to all years</td><td class="n">${money(o.cumulative_penalty_usd, '$')}</td></tr>
${o.forecast.map((f) => `<tr class="proj"><td>${f.year}<span class="tag">projection</span></td><td>${num(f.million_m3, 1)} million m³ if the ${Y - 2}–${Y} line continues</td><td class="n">${money(f.penalty_usd, '$')}</td></tr>`).join('')}
</tbody></table>
<p class="s">Projection: ${esc(FORECAST_METHOD)}.</p>
${sc ? `<h2>Scenario: flaring cut by ${cut}% <span class="tag">scenario</span></h2>
<table><thead><tr><th>Measure (${Y})</th><th class="n">As recorded</th><th class="n">Scenario</th><th class="n">Difference</th></tr></thead><tbody>
<tr><td>Flared volume (million m³)</td><td class="n">${num(sc.base.million_m3, 1)}</td><td class="n">${num(sc.after.million_m3, 1)}</td><td class="n">−${num(sc.saved.million_m3, 1)}</td></tr>
<tr><td>CO₂e (t)</td><td class="n">${num(sc.base.co2e_t, 0)}</td><td class="n">${num(sc.after.co2e_t, 0)}</td><td class="n">−${num(sc.saved.co2e_t, 0)}</td></tr>
<tr><td>Methane-equivalent (t CH₄)</td><td class="n">${num(sc.base.ch4_t, 0)}</td><td class="n">${num(sc.after.ch4_t, 0)}</td><td class="n">−${num(sc.saved.ch4_t, 0)}</td></tr>
<tr><td>Penalty basis (US$)</td><td class="n">${money(sc.base.penalty_usd, '$')}</td><td class="n">${money(sc.after.penalty_usd, '$')}</td><td class="n">−${money(sc.saved.penalty_usd, '$')}</td></tr>
</tbody></table>
<p class="s">Assumption: a uniform ${cut}% cut to the ${Y} recorded volume; every output scales linearly with volume. A scenario, not a forecast.</p>` : ''}
${topOps.length ? `<h2>Largest operators, ${Y}</h2><table><thead><tr><th>Operator</th><th class="n">Sites</th><th class="n">Million m³</th><th class="n">3-yr change</th><th class="n">Penalty (US$)</th></tr></thead><tbody>
${topOps.map((x) => `<tr><td>${esc(x.operator)}</td><td class="n">${x.sites}</td><td class="n">${num(x.total_vol_million_m3_latest, 1)}</td><td class="n">${chg(x.change_3yr_pct)}</td><td class="n">${money(x.penalty_usd_latest, '$')}</td></tr>`).join('')}</tbody></table>` : ''}
${topSites.length ? `<h2>Largest sites, ${Y}</h2><table><thead><tr><th>Site</th>${scope === 'national' ? '<th>Operator</th>' : ''}<th class="n">Million m³</th><th class="n">3-yr change</th><th class="n">Penalty (US$)</th></tr></thead><tbody>
${topSites.map((x) => `<tr><td>${esc(x.field_name || x.site_id)} <span class="s">${esc(x.site_id)}</span></td>${scope === 'national' ? `<td>${esc(x.operator)}</td>` : ''}<td class="n">${num(x.latest_year_vol_million_m3, 1)}</td><td class="n">${chg(x.change_3yr_pct)}</td><td class="n">${money(x.penalty_usd_latest, '$')}</td></tr>`).join('')}</tbody></table>` : ''}
<div class="note"><b>A derived, open-data record.</b> Not an official NUPRC determination and no operator endorsement. Volumes are satellite-derived (VIIRS measures flare heat; volume follows a radiance→flow calibration that carries uncertainty). Projections are labelled projections; scenarios are labelled scenarios.</div>
<h2>Sources</h2>
<ol>${SOURCES.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
<p class="s">Kaliabe Flare Ledger · kaliabe-flare-web.pages.dev · ${esc(METHOD_VERSION)}</p>
</main></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', ...corsHeaders } });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/health') return json({ status: 'ok', source: 'World Bank GFMR / NOAA VIIRS', service: 'kaliabe-flare' });

      if (path === '/api/sites') {
        const { sites, national, meta } = await loadLedger(env);
        return json({ count: sites.length, basis: PENALTY_USD_PER_1000SCF, meta, national, sites });
      }

      if (path === '/api/national') {
        const { national, meta } = await loadLedger(env);
        return json({ meta, national });
      }

      if (path === '/api/brief') return brief(url, await loadLedger(env));

      if (path === '/api/sites/trend') {
        // lightweight aggregate for map — latest year markers
        const rows = await env.DB.prepare(
          `SELECT s.site_id, s.lat, s.lon, s.operator, s.in_niger_delta,
                  a.year, a.flaring_vol_m3
           FROM flare_sites s JOIN flare_annual a ON s.site_id=a.site_id
           WHERE a.year=(SELECT MAX(year) FROM flare_annual a2 WHERE a2.site_id=s.site_id)`
        ).all();
        return json({ count: rows.results.length, markers: rows.results.map((r) => ({
          id: r.site_id, lat: r.lat, lon: r.lon, operator: r.operator,
          year: r.year, million_m3: round(r.flaring_vol_m3,2), bcm: round(r.flaring_vol_m3/1e3,4), nigerDelta: !!r.in_niger_delta })) });
      }

      if (path === '/api/operators') {
        const { operators, national, meta } = await loadLedger(env);
        return json({ count: operators.length, meta, national, operators });
      }

      if (path === '/api/summary') {
        const s = await env.DB.prepare(
          `SELECT COUNT(DISTINCT site_id) AS sites,
                  COUNT(DISTINCT CASE WHEN in_niger_delta=1 THEN site_id END) AS niger_delta_sites FROM flare_sites`
        ).first();
        const vol = await env.DB.prepare(
          `SELECT SUM(flaring_vol_m3) AS latest_vol_m3,
                  COUNT(DISTINCT CASE WHEN flaring_vol_m3 > 0 THEN site_id END) AS active
           FROM flare_annual
           WHERE year=(SELECT MAX(year) FROM flare_annual)`
        ).first();
        return json({
          sites: s.sites, niger_delta_sites: s.niger_delta_sites,
          latest_year: (await env.DB.prepare('SELECT MAX(year) y FROM flare_annual').first()).y,
          latest_total_vol_million_m3: round(vol.latest_vol_m3, 2),
          latest_total_bcm: round(vol.latest_vol_m3 / 1e3, 4),   // stored million m3 -> bcm
          active_sites_latest: vol.active,
          evidence: 'World Bank GFMR individual flare sites (NOAA VIIRS Nightfire derived) 2012-2025',
          penalty_basis: 'NUPRC 2022 Gazette US$2.00/1,000 scf',
          naira_indicative: `${NGN_PER_USD}/USD`
        });
      }

      if (path === '/api/digest.csv') {
        const rows = await env.DB.prepare(
          `SELECT s.site_id, s.lat, s.lon, s.operator, s.field_name, s.field_type, s.location, s.in_niger_delta,
                  a.year, a.flaring_vol_m3
           FROM flare_sites s JOIN flare_annual a ON s.site_id=a.site_id
           ORDER BY s.site_id, a.year`
        ).all();
        // GFMR volumes are MILLION m3. bcm = million m3 / 1e3; MMscfd = million m3/yr × 35.3147 / 365.
        const header = ['site_id','lat','lon','operator','field_name','field_type','location','in_niger_delta','year','flaring_vol_million_m3','bcm','mmscfd'];
        const esc = (v) => { const s=String(v==null?'':v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
        const lines = [header.join(','), ...rows.results.map((r) => {
          const v = r.flaring_vol_m3 || 0;
          return [
            esc(r.site_id), esc(r.lat), esc(r.lon), esc(r.operator), esc(r.field_name),
            esc(r.field_type), esc(r.location), esc(r.in_niger_delta), esc(r.year),
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