/* Kaliabe Ledger core — the shared maths and the hand-rolled SVG trend chart.
 *
 * Loaded in two places from this one file so a figure can never disagree with
 * itself: the browser (as window.KaliabeCore) and the Worker, which bundles it
 * to render the decision brief server-side. No dependencies, no DOM access.
 *
 * Every conversion takes the constants `k` from the API (`meta.constants`) —
 * the Worker is the only place the constants are defined. Every *threshold*
 * (what counts as rising, significant, top decile …) lives here, in THRESHOLDS,
 * so the Worker, the browser and the methodology page read the same numbers.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KaliabeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------ thresholds
  // KFL-M 1.2. One named, documented set. `doc` is rendered verbatim on the
  // methodology page and mirrored in docs/METHODOLOGY.md §6.
  const THRESHOLDS = {
    trend_stable_band_pct: 5,
    trend_min_abs_change_million_m3: 0.5,
    trend_min_detected_years: 2,
    change_min_abs_million_m3: 0.5,
    rising_pct_options: [25, 50, 100],
    rising_pct_default: 25,
    rising_min_added_million_m3: 0.5,
    small_base_million_m3: 1,
    newly_detected_years: 2,
    top_decile_fraction: 0.1,
    scenario_step_pct: 5,
    scenario_sig_figs: 3,
    // KFL-M 1.3 — live thermal (NASA FIRMS) and security trend (ACLED).
    live_min_window_nights: 3,
    live_burning_night_share_pct: 50,
    sec_trend_band_pct: 25,
    sec_trend_min_abs_events: 3,
  };
  const THRESHOLD_DOCS = [
    ['trend_stable_band_pct', 'Trend: stable band', '±5%', 'A recent-vs-baseline change inside ±5% is labelled stable.'],
    ['trend_min_abs_change_million_m3', 'Trend: minimum absolute change', '0.5 million m³/yr', 'A direction (rising/falling) also needs the window means to differ by at least this much; smaller moves are within detection noise and are labelled “not significant”.'],
    ['trend_min_detected_years', 'Trend: detected years per window', '2 (or the whole window if shorter)', 'Both the recent (3-yr) and baseline (up to 5-yr) windows need this many years with a detection. A window made of non-detections may be cloud or below-floor flaring, so no direction is claimed.'],
    ['change_min_abs_million_m3', '3-/5-yr change: minimum absolute change', '0.5 million m³', 'A point-to-point change is coloured as up/down only if it moves at least this much and beyond ±5%; otherwise it is shown muted and marked n.s.'],
    ['rising_pct_default', 'Watchlist “rising”: minimum % (default)', '+25% (options 25 / 50 / 100%)', 'The 3-yr change must reach the chosen percentage …'],
    ['rising_min_added_million_m3', 'Watchlist “rising”: minimum volume added', '0.5 million m³', '… and add at least this volume. The absolute floor exists because a percentage on a tiny base (0.01 → 0.05 is +400%) says nothing material; it applies to every % option.'],
    ['small_base_million_m3', 'Small-base flag', '1 million m³', 'Where the base-year volume is below this, the percentage is flagged “small base” and the volume added is shown first.'],
    ['newly_detected_years', 'Watchlist “newly detected”', 'last 2 years', 'First positive volume in the latest year or the year before.'],
    ['top_decile_fraction', 'Top decile', 'top 10% of the full site set', 'Latest-year volume, ranked over every site in the ledger (detected or not); the cut-off volume is shown beside the list.'],
    ['scenario_sig_figs', 'Scenario rounding', '3 significant figures', 'Scenario outputs are rounded to 3 significant figures (step 5%) so they are not read as precise; always labelled “scenario” with the assumption.'],
    ['live_burning_night_share_pct', 'Live thermal: “burning now”', '≥50% of nights in the window, window ≥3 nights', 'A site is live-burning when VIIRS (NASA FIRMS) detected it on at least half the nights in the rolling window. Cloudy nights count as misses, so the share is a lower bound.'],
    ['live_min_window_nights', 'Live thermal: minimum window', '3 nights', 'No live verdict until the window covers this many nights.'],
    ['sec_trend_band_pct', 'Security trend band', '±25% and ±3 events', 'Political-violence events in the LGAs touching the 25 km circle, last 12 months vs the 12 before: rising / declining only if the change is beyond ±25% and at least 3 events; otherwise flat.'],
  ];

  // million m³ → every derived unit. k: { m3_per_1000scf, penalty_usd_per_1000scf_upper,
  // penalty_usd_per_1000scf_lower, co2e_mt_per_bcm, ch4_mt_per_bcm, ch4_co2e_mt_per_bcm, scf_per_m3 }
  // The penalty is ALWAYS a pair: the Reg. 13(1) $2.00 tier (≥10,000 bbl/d, upper
  // bound) and the Reg. 13(2) $0.50 tier (<10,000 bbl/d, lower bound). We hold no
  // production rates, so we never pick one, and never publish a midpoint.
  function convert(millionM3, k) {
    const v = Number.isFinite(millionM3) ? millionM3 : 0;
    const bcm = v / 1e3;
    const kscf = (v * 1e6) / k.m3_per_1000scf;
    return {
      million_m3: v,
      bcm,
      mmscfd: (v * k.scf_per_m3) / 365,
      penalty_usd_upper: kscf * k.penalty_usd_per_1000scf_upper,
      penalty_usd_lower: kscf * k.penalty_usd_per_1000scf_lower,
      co2e_t: bcm * k.co2e_mt_per_bcm * 1e6,
      ch4_t: bcm * k.ch4_mt_per_bcm * 1e6,
      ch4_co2e_t: bcm * k.ch4_co2e_mt_per_bcm * 1e6,
    };
  }

  // Point-to-point change significance (3-/5-yr change). null when undefined.
  function changeSignificant(base, now, T = THRESHOLDS) {
    if (!(base > 0)) return null;
    const pctv = ((now - base) / base) * 100;
    return Math.abs(now - base) >= T.change_min_abs_million_m3 && Math.abs(pctv) > T.trend_stable_band_pct;
  }

  // Watchlist "rising": ≥ thrPct 3-yr change AND ≥ the absolute floor added.
  function rising(site, thrPct, T = THRESHOLDS) {
    const ys = site.year_series || [];
    if (ys.length < 4 || site.change_3yr_pct == null) return { qualifies: false };
    const base = ys[ys.length - 4].million_m3 || 0, now = ys[ys.length - 1].million_m3 || 0;
    const added = now - base;
    return {
      qualifies: site.change_3yr_pct >= thrPct && added >= T.rising_min_added_million_m3,
      pct: site.change_3yr_pct, added, base, now, small_base: base < T.small_base_million_m3,
    };
  }

  // Scenario: "reduce flaring by cutPct %". Linear in volume by construction.
  function scenario(millionM3, cutPct, k) {
    const cut = Math.max(0, Math.min(100, Number(cutPct) || 0));
    const base = convert(millionM3, k);
    const after = convert(millionM3 * (1 - cut / 100), k);
    const saved = {};
    for (const key of Object.keys(base)) saved[key] = base[key] - after[key];
    return { cut_pct: cut, base, after, saved, label: 'scenario', assumption: `a uniform ${cut}% cut to the recorded latest-year volume; every output scales linearly with volume — a scenario, not a forecast` };
  }

  // ------------------------------------------------------- power gap (1.3)
  // The flared gas as fuel, the people nearby as demand. Every output is an
  // ESTIMATE on stated assumptions (k.gap, published by the Worker):
  //   gas_available_GWh     = latest-year m³ × gas_mwh_per_m3 ÷ 1,000
  //   electric_potential_MW = gas_available_MWh ÷ 8,760 × gen_efficiency
  //       (the generator size the gas could fuel continuously)
  //   households_servable   = MW × 8,760 × capacity_factor ÷ household_mwh_per_yr
  //   people_within_10km_not_grid = pop10km × (1 − rural access proxy)
  // ctx: { pop10km, rural_access_pct }. Missing inputs give null, never a guess.
  function roundMW(mw) {
    if (mw == null || !isFinite(mw)) return null;
    return mw < 10 ? Math.round(mw * 10) / 10 : Math.round(mw);
  }
  function powerGap(millionM3, ctx, k) {
    const g = k.gap;
    const v = Number.isFinite(millionM3) && millionM3 > 0 ? millionM3 : 0;
    const mwh = v * 1e6 * g.gas_mwh_per_m3;
    const mw = (mwh / 8760) * g.gen_efficiency;
    const hh = (mw * 8760 * g.capacity_factor) / g.household_mwh_per_yr;
    const acc = ctx && Number.isFinite(ctx.rural_access_pct) ? ctx.rural_access_pct : null;
    const pop = ctx && Number.isFinite(ctx.pop10km) ? ctx.pop10km : null;
    const dark = pop != null && acc != null ? pop * (1 - acc / 100) : null;
    return {
      gas_available_GWh: mwh / 1e3 >= 10 ? Math.round(mwh / 1e3) : Math.round(mwh / 1e2) / 10,
      electric_potential_MW: roundMW(mw),
      electric_potential_MW_exact: mw,
      households_servable: hh > 0 ? sig(hh, 2) : 0,
      people_within_10km_not_grid: dark == null ? null : dark > 0 ? sig(dark, 2) : 0,
      rural_access_proxy_pct: acc,
      label: 'estimate',
    };
  }

  // ------------------------------------------------ live thermal check (1.3)
  // live: per-site FIRMS summary (or undefined), win: nights in the window.
  // Returns burning status and the under-report flag: the archive says
  // "falling" but VIIRS still sees the flare on ≥ half the recent nights.
  function liveCheck(live, win, trendLabel, T = THRESHOLDS) {
    if (!(win >= T.live_min_window_nights)) return { live_site_burning: null, live_status: 'insufficient window', live_flag: null };
    const share = live ? live.live_nights_detected_pct : 0;
    const burning = share >= T.live_burning_night_share_pct;
    const flag = burning && trendLabel === 'falling' ? 'under-report (live check) — investigate' : null;
    return {
      live_site_burning: burning,
      live_status: !live ? 'not detected in window' : burning ? 'burning' : 'intermittent',
      live_flag: flag,
    };
  }

  // ------------------------------------------------------ security trend (1.3)
  // monthly: 24 counts, oldest first. Last 12 vs the 12 before.
  function secTrend(monthly, T = THRESHOLDS) {
    if (!Array.isArray(monthly) || monthly.length < 24) return { sec_trend: 'pending live data', last12: null, prev12: null, pct: null };
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const prev = sum(monthly.slice(-24, -12)), last = sum(monthly.slice(-12));
    if (!prev && !last) return { sec_trend: 'none recorded', last12: 0, prev12: 0, pct: null };
    const pct = prev ? ((last - prev) / prev) * 100 : null;
    const big = Math.abs(last - prev) >= T.sec_trend_min_abs_events;
    const out = (s) => ({ sec_trend: s, last12: last, prev12: prev, pct });
    if (big && (pct == null || pct > T.sec_trend_band_pct) && last > prev) return out('rising');
    if (big && pct != null && pct < -T.sec_trend_band_pct) return out('declining');
    return out('flat');
  }

  // ---------------------------------------------------------------- formatting
  const nf = (d) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const num = (v, d = 1) => (v == null || !isFinite(v) ? '—' : nf(d).format(v));
  function money(v, sym) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return `${sym}${(v / 1e9).toFixed(2)} bn`;
    if (a >= 1e6) return `${sym}${(v / 1e6).toFixed(2)} m`;
    if (a >= 1e3) return `${sym}${(v / 1e3).toFixed(1)} k`;
    return `${sym}${v.toFixed(0)}`;
  }
  // Round to n significant figures (scenario outputs).
  const sig = (v, n = THRESHOLDS.scenario_sig_figs) => (v == null || !isFinite(v) || v === 0 ? v : Number(v.toPrecision(n)));
  // The two-tier penalty, as text. Order is fixed: $2.00 tier first, then $0.50.
  const penaltyPair = (upper, lower, sym = 'US$') => `${money(upper, sym)} at the $2.00 tier · ${money(lower, sym)} at the $0.50 tier`;
  const pct = (v) => (v == null || !isFinite(v) ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), Math.abs(v) >= 100 ? 0 : 1)}%`);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Percentile phrasing, kept in one place so site, card and brief agree.
  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  // ----------------------------------------------------------- trend chart
  // series: [{ year, million_m3 }]; forecast: [{ year, million_m3 }] (dashed,
  // labelled "projection"); mark: a year to highlight (the year player's year).
  const INK = '#1c1a16', SOFT = '#5c5749', ACCENT = '#b5761e', LINE = '#d8d0bd';
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function trendChart(series, opts = {}) {
    const s = (series || []).filter((d) => d && d.year != null);
    if (!s.length) return '';
    const fc = opts.forecast || [];
    const all = s.concat(fc);
    const W = opts.width || 560, H = opts.height || 200;
    const L = 46, R = 14, T = 14, B = 26;
    const x0 = all[0].year, x1 = all[all.length - 1].year;
    const ymax = niceMax(Math.max(...all.map((d) => d.million_m3 || 0)));
    const X = (y) => L + ((y - x0) / Math.max(1, x1 - x0)) * (W - L - R);
    const Y = (v) => T + (1 - (v || 0) / ymax) * (H - T - B);
    const unit = opts.unit || 'million m³';
    const fmt = (v) => (v === 0 ? '0' : ymax >= 1000 ? num(v / 1000, 2) + 'k' : num(v, ymax < 10 ? 2 : 0));
    const ticks = [0, 0.5, 1].map((f) => f * ymax);
    const grid = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${LINE}" stroke-width="1"/>` +
      `<text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end" fill="${SOFT}">${fmt(v)}</text>`).join('');
    const xt = [];
    const step = (x1 - x0) > 10 ? 3 : (x1 - x0) > 5 ? 2 : 1;
    for (let y = x0; y <= x1; y += step) xt.push(y);
    if (xt[xt.length - 1] !== x1) xt.push(x1);
    const xaxis = xt.map((y) => `<text x="${X(y)}" y="${H - 8}" text-anchor="middle" fill="${SOFT}">${y}</text>`).join('');
    const path = s.map((d, i) => `${i ? 'L' : 'M'}${X(d.year).toFixed(1)} ${Y(d.million_m3).toFixed(1)}`).join('');
    const area = `${path}L${X(s[s.length - 1].year).toFixed(1)} ${Y(0)}L${X(s[0].year).toFixed(1)} ${Y(0)}Z`;
    const dots = s.map((d) => `<circle cx="${X(d.year).toFixed(1)}" cy="${Y(d.million_m3).toFixed(1)}" r="${d.year === opts.mark ? 4.5 : 2.4}" fill="${d.year === opts.mark ? ACCENT : INK}"><title>${d.year} · ${num(d.million_m3, 2)} ${unit}</title></circle>`).join('');
    let proj = '';
    if (fc.length) {
      const last = s[s.length - 1];
      const fp = [last].concat(fc).map((d, i) => `${i ? 'L' : 'M'}${X(d.year).toFixed(1)} ${Y(d.million_m3).toFixed(1)}`).join('');
      const xa = X(fc[0].year) - (X(fc[0].year) - X(last.year)) / 2;
      proj = `<rect x="${xa}" y="${T}" width="${W - R - xa}" height="${H - T - B}" fill="${ACCENT}" fill-opacity=".06"/>` +
        `<text x="${W - R - 2}" y="${H - B - 5}" text-anchor="end" fill="${ACCENT}">projection</text>` +
        `<path d="${fp}" fill="none" stroke="${ACCENT}" stroke-width="1.6" stroke-dasharray="4 3"/>` +
        fc.map((d) => `<circle cx="${X(d.year).toFixed(1)}" cy="${Y(d.million_m3).toFixed(1)}" r="2.4" fill="#fff" stroke="${ACCENT}"><title>${d.year} · ${num(d.million_m3, 2)} ${unit} (projection)</title></circle>`).join('');
    }
    let mark = '';
    if (opts.mark != null && opts.mark >= x0 && opts.mark <= x1) {
      mark = `<line x1="${X(opts.mark)}" x2="${X(opts.mark)}" y1="${T}" y2="${H - B}" stroke="${ACCENT}" stroke-opacity=".55" stroke-width="1"/>`;
    }
    const label = opts.label || `Flared volume by year, ${s[0].year}–${s[s.length - 1].year}${fc.length ? ', with projection to ' + fc[fc.length - 1].year : ''}`;
    return `<svg class="tchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" style="font-family:inherit;font-size:10px;width:100%;height:auto;display:block">
      ${grid}${mark}
      <path d="${area}" fill="${INK}" fill-opacity=".05"/>
      <path d="${path}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      ${proj}${dots}${xaxis}
      <text x="${L}" y="${T - 4}" fill="${SOFT}">${esc(unit)}</text>
    </svg>`;
  }

  return { THRESHOLDS, THRESHOLD_DOCS, convert, scenario, changeSignificant, rising, powerGap, liveCheck, secTrend, trendChart, util: { num, money, pct, esc, ordinal, sig, penaltyPair } };
});
