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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/health') return json({ status: 'ok', source: 'World Bank GFMR / NOAA VIIRS', service: 'kaliabe-flare' });

      if (path === '/api/sites') {
        const [sitesRes, annualRes] = await env.DB.batch([
          env.DB.prepare('SELECT * FROM flare_sites'),
          env.DB.prepare('SELECT site_id, year, flaring_vol_m3 FROM flare_annual ORDER BY site_id, year'),
        ]);
        const bySite = new Map();
        for (const r of annualRes.results) {
          if (!bySite.has(r.site_id)) bySite.set(r.site_id, []);
          bySite.get(r.site_id).push(r);
        }
        const out = sitesRes.results
          .filter((s) => bySite.has(s.site_id))
          .map((s) => estimate(s, bySite.get(s.site_id)))
          .sort((x, y) => (y.latest_year_vol_million_m3 || 0) - (x.latest_year_vol_million_m3 || 0));
        return json({
          count: out.length,
          basis: PENALTY_USD_PER_1000SCF,
          meta: {
            units: 'GFMR per-year volumes in million m³; bcm = million m³ / 1,000',
            penalty_usd_per_1000scf: PENALTY_USD_PER_1000SCF,
            m3_per_1000scf: round(M3_PER_1000SCF, 3),
            ngn_per_usd_indicative: NGN_PER_USD,
            co2e_mt_per_bcm: round(CO2E_MT_PER_BCM, 4),
            ch4_mt_per_bcm: round(CH4_MT_PER_BCM, 4),
            trend_method: `mean of last 3 yrs vs preceding up to 5 yrs; ±${TREND_THRESHOLD_PCT}% = stable`,
            sources: {
              volume: 'World Bank GFMR, Flare Volume Estimates by Individual Flare Location 2012–2025 (NOAA VIIRS Nightfire / EOG, Payne Institute)',
              penalty: 'NUPRC Flare Gas (Prevention of Waste and Pollution) Regulations 2022, US$2.00 per 1,000 scf',
              emissions: 'GFMR 2025 global ratios: 151 bcm ≈ 389 Mt CO₂e incl. 46 Mt CH₄',
            },
          },
          sites: out,
        });
      }

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
        const rows = await env.DB.prepare(
          `SELECT s.site_id, s.operator, s.lat, s.lon, s.field_name, s.in_niger_delta,
                  a.year, a.flaring_vol_m3
           FROM flare_sites s JOIN flare_annual a ON s.site_id=a.site_id
           WHERE a.year=(SELECT MAX(year) FROM flare_annual a2 WHERE a2.site_id=s.site_id)`
        ).all();
        const map = new Map();
        for (const r of rows.results) {
          const op = (r.operator || 'Unattributed').trim();
          if (!map.has(op)) map.set(op, { operator: op, sites: 0, active_sites: 0, total_vol_million_m3_latest: 0, niger_delta_sites: 0 });
          const e = map.get(op);
          e.sites += 1;
          if (r.flaring_vol_m3 > 0) e.active_sites += 1;
          e.total_vol_million_m3_latest += (r.flaring_vol_m3 || 0);
          if (r.in_niger_delta) e.niger_delta_sites += 1;
        }
        const ops = [...map.values()].map((o) => ({
          ...o,
          total_vol_million_m3_latest: round(o.total_vol_million_m3_latest, 2),
          total_vol_bcm_latest: round(o.total_vol_million_m3_latest / 1e3, 4),   // million m3 -> bcm
          penalty_usd_latest: round(o.total_vol_million_m3_latest * 1e6 * SCF_PER_M3 / 1000 * PENALTY_USD_PER_1000SCF, 2),
        })).sort((a, b) => b.total_vol_million_m3_latest - a.total_vol_million_m3_latest);
        return json({ count: ops.length, operators: ops });
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