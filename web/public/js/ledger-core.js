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
    // KFL-M 1.5 mini-grid siting screen (core.siting). Gates, not weights.
    siting_min_mw: 0.1,
    siting_min_people_not_grid: 1000,
    siting_max_energy_attacks_10km: 2,
    siting_cluster_km: 20,
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
    ['siting_min_mw', 'Siting gate: gas-to-power', '0.1 MW', 'A site is screened in only if its latest-year flared gas could fuel at least a 100 kW generator continuously.'],
    ['siting_min_people_not_grid', 'Siting gate: unserved demand', '1,000 people', 'At least this many people within 10 km estimated to be without grid access.'],
    ['siting_max_energy_attacks_10km', 'Siting gate: security', '2 or fewer attacks within 10 km', 'Three or more recorded attacks on oil, gas or power infrastructure within 10 km since 2015 screens a site out.'],
    ['siting_cluster_km', 'Siting: opportunity cluster', 'within 20 km of the lead site', 'The best-scoring screened-in site leads an opportunity; screened-in sites within 20 km of it (overlapping 10 km catchments) join it, because one mini-grid would serve the shared catchment.'],
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

  // ------------------------------------------------- mini-grid siting (1.5)
  // A screening score, 0 to 100, for a gas (or hybrid solar + gas) mini-grid
  // at a flare site. Built only from fields the site record already carries.
  // Every term is an ESTIMATE; a null input gives a null term, never a guess,
  // and the weights of the remaining terms are renormalised.
  const SITING = {
    weights: { access_gap: 0.27, power: 0.23, demand: 0.18, security: 0.22, solar: 0.10 },
    scales: {
      access_gap: [1e3, 2e5],     // people without access within 10 km, log scale
      power: [0.1, 10],           // MW the gas could fuel, log scale; 10 MW and up scores 100
      demand: [1e3, 1e5],         // population of the main centre within 25 km, log scale
      demand_near_km: 5,          // full credit when the centre is this close
      demand_far_factor: 0.5,     // credit at 25 km (a longer distribution line)
      security_per_attack_10km: 20,
      security_per_attack_10_25km: 2,
      security_rising_trend: 15,
      solar: [4.0, 5.5],          // GHI kWh/m2/day, linear
    },
  };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const logScale = (v, lo, hi) => (v > 0 ? clamp01((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) : 0);
  const fin = (v) => typeof v === 'number' && isFinite(v);

  // site: one /api/sites record. solar: { ghi_kwh_m2_day, pvout_kwh_kwp_yr } or null.
  function siting(site, solar, T = THRESHOLDS) {
    const S = SITING.scales, W = SITING.weights;
    const mw = fin(site.electric_potential_MW_exact) ? site.electric_potential_MW_exact : fin(site.electric_potential_MW) ? site.electric_potential_MW : null;
    const dark = fin(site.people_within_10km_not_grid) ? site.people_within_10km_not_grid : null;
    const se = site.sec_energy || null;
    const term = (score, value, basis) => ({ score: score == null ? null : Math.round(score * 100), value, basis, label: 'estimate' });

    const access = dark == null ? term(null, null, 'no population or access figure for this site')
      : term(logScale(dark, ...S.access_gap), dark, `${num(dark, 0)} people within 10 km without grid access (GRID3 pop10km x (1 - state rural access proxy ${site.rural_access_proxy_pct}%)); log scale ${num(S.access_gap[0], 0)} to ${num(S.access_gap[1], 0)}`);
    const power = mw == null ? term(null, null, 'no latest-year volume')
      : term(logScale(mw, ...S.power), mw, `${num(mw, mw < 10 ? 1 : 0)} MW the latest-year flared gas could fuel continuously (${num(site.gas_available_GWh, 1)} GWh/yr of gas at 40% efficiency); log scale ${S.power[0]} to ${S.power[1]} MW${mw > S.power[1] ? '; more gas than one mini-grid needs, an embedded-generation case' : ''}`);
    let demand;
    if (!fin(site.main_centre_25km_pop) || !site.main_centre_25km) demand = term(dark == null ? null : 0, 0, 'no named settlement within 25 km');
    else {
      const d = fin(site.main_centre_25km_dist_km) ? site.main_centre_25km_dist_km : 25;
      const f = d <= S.demand_near_km ? 1 : 1 - (1 - S.demand_far_factor) * Math.min(1, (d - S.demand_near_km) / (25 - S.demand_near_km));
      demand = term(logScale(site.main_centre_25km_pop, ...S.demand) * f, site.main_centre_25km_pop,
        `${site.main_centre_25km} (${num(site.main_centre_25km_pop, 0)} people within 2 km of the point), ${num(d, 1)} km away; log scale ${num(S.demand[0], 0)} to ${num(S.demand[1], 0)}, distance factor ${num(f, 2)}`);
    }
    let security;
    if (!se) security = term(null, null, 'no incident overlay for this site');
    else {
      const a10 = se.attacks_10km || 0, a25 = Math.max(0, (se.attacks_25km || 0) - a10);
      const rising = site.sec_trend === 'rising';
      const v = 100 - S.security_per_attack_10km * a10 - S.security_per_attack_10_25km * a25 - (rising ? S.security_rising_trend : 0);
      security = term(clamp01(v / 100), a10, `${a10} energy-infrastructure attacks within 10 km and ${a25} more within 25 km since 2015 (Oxford/Inuwa 2026); ACLED area trend ${site.sec_trend}; 100 - ${S.security_per_attack_10km} per 10 km attack - ${S.security_per_attack_10_25km} per 10 to 25 km attack${rising ? ` - ${S.security_rising_trend} for a rising trend` : ''}`);
    }
    const ghi = solar && fin(solar.ghi_kwh_m2_day) ? solar.ghi_kwh_m2_day : null;
    const sol = ghi == null ? term(null, null, 'no solar resource value for this site')
      : term(clamp01((ghi - S.solar[0]) / (S.solar[1] - S.solar[0])), ghi, `GHI ${num(ghi, 2)} kWh/m2/day${fin(solar.pvout_kwh_kwp_yr) ? `, PV output ${num(solar.pvout_kwh_kwp_yr, 0)} kWh/kWp/yr` : ''} (Global Solar Atlas 2); linear ${S.solar[0]} to ${S.solar[1]}`);

    const components = { access_gap: access, power, demand, security, solar: sol };
    let wsum = 0, acc = 0;
    for (const [k, c] of Object.entries(components)) if (c.score != null) { wsum += W[k]; acc += W[k] * c.score; }
    const score = wsum ? Math.round(acc / wsum) : null;

    const a10 = se ? se.attacks_10km || 0 : null;
    const gates = [
      { id: 'onshore', pass: site.niger_delta_class !== 'offshore', rule: 'onshore (an offshore flare needs a gas line to shore before it can feed a mini-grid)' },
      { id: 'power', pass: mw != null && mw >= T.siting_min_mw, rule: `gas could fuel at least ${T.siting_min_mw} MW` },
      { id: 'demand', pass: dark != null && dark >= T.siting_min_people_not_grid, rule: `at least ${num(T.siting_min_people_not_grid, 0)} people without access within 10 km` },
      { id: 'security', pass: a10 != null && a10 <= T.siting_max_energy_attacks_10km, rule: `${T.siting_max_energy_attacks_10km} or fewer energy-infrastructure attacks within 10 km` },
    ];
    return {
      siting_score: score,
      screened_in: gates.every((g) => g.pass),
      failed_gates: gates.filter((g) => !g.pass).map((g) => g.id),
      gates, components,
      weights_used: wsum ? Number(wsum.toFixed(2)) : 0,
      label: 'estimate',
    };
  }

  // Great-circle distance, km.
  function haversineKm(a, b) {
    const R = 6371.0088, r = Math.PI / 180;
    const dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Opportunities: leader clustering. The best-scoring unassigned site leads;
  // every unassigned site within siting_cluster_km of it (its 10 km circle
  // overlaps the lead's) joins. Repeat. No chaining, so a cluster never spans
  // more than 2 x siting_cluster_km. Leads are all more than siting_cluster_km
  // apart, so their 10 km circles are disjoint: summing the leads' unserved
  // figures is a lower bound on the people without access, never a double count.
  // rows: [{ site_id, lat, lon, siting_score, electric_potential_MW_exact,
  //          households_servable, people_within_10km_not_grid }]
  function sitingClusters(rows, T = THRESHOLDS) {
    const left = rows.slice().sort((a, b) => (b.siting_score || 0) - (a.siting_score || 0) || (b.electric_potential_MW_exact || 0) - (a.electric_potential_MW_exact || 0));
    const out = [];
    while (left.length) {
      const lead = left.shift();
      const g = [lead];
      for (let i = left.length - 1; i >= 0; i--) if (haversineKm(lead, left[i]) <= T.siting_cluster_km) g.push(left.splice(i, 1)[0]);
      g.sort((a, b) => (b.siting_score || 0) - (a.siting_score || 0));
      const mw = g.reduce((a, r) => a + (r.electric_potential_MW_exact || 0), 0);
      out.push({
        lead_site_id: lead.site_id,
        site_ids: g.map((r) => r.site_id),
        sites: g.length,
        lead_score: lead.siting_score,
        radius_km: Math.round(Math.max(0, ...g.map((r) => haversineKm(lead, r))) * 10) / 10,
        electric_potential_MW: roundMW(mw),
        electric_potential_MW_exact: mw,
        households_servable: sig(g.reduce((a, r) => a + (r.households_servable || 0), 0), 2),
        people_not_grid_lead: lead.people_within_10km_not_grid || 0,
      });
    }
    return out;
  }

  // ------------------------------------------- live thermal window (1.6)
  // history: web/public/data/live/firms_history.json ({ nights: { date: { sites:
  // { id: { n, nd, bt4, frp, last } } } } }); bt4 and frp are per-night SUMS over
  // n detections, nd of them night-time passes. A night counts toward the window
  // only if some site had a night-time detection on it: a night with no
  // detection anywhere is a missing file, not 476 sites going dark.
  function firmsWindow(history) {
    const all = Object.keys((history && history.nights) || {}).sort();
    const counted = all.filter((n) => Object.values(history.nights[n].sites || {}).some((v) => v.nd > 0));
    const sites = {};
    for (const n of counted) {
      for (const [id, v] of Object.entries(history.nights[n].sites)) {
        const p = sites[id] || (sites[id] = { nights_detected: 0, detections: 0, night_detections: 0, bt4_sum: 0, frp_sum: 0, last_seen: '' });
        p.nights_detected += v.nd > 0 ? 1 : 0;
        p.detections += v.n; p.night_detections += v.nd;
        p.bt4_sum += v.bt4; p.frp_sum += v.frp;
        if (v.last > p.last_seen) p.last_seen = v.last;
      }
    }
    for (const p of Object.values(sites)) {
      p.mean_bright_ti4_K = p.detections ? Math.round((p.bt4_sum / p.detections) * 10) / 10 : null;
      p.mean_frp_MW = p.detections ? Math.round((p.frp_sum / p.detections) * 100) / 100 : null;
      delete p.bt4_sum; delete p.frp_sum;
    }
    return {
      nights: counted.length, first: counted[0] || null, last: counted[counted.length - 1] || null,
      excluded_nights: all.filter((n) => !counted.includes(n)), sites,
    };
  }

  // ------------------------------------------------ investable score (1.6)
  // A screening score, 0 to 100, for the question an investor asks first: is
  // the gas there, is the demand there, and is it safe enough to build. Four
  // components, each built from normalised terms (0 to 100). Raw instrument
  // units (bright_ti4 K, FRP MW) are shown as inputs and normalised before
  // they reach the score. A null input gives a null term, never a guess;
  // weights of missing terms are renormalised (weights_used < 1 marks it). The
  // two hard gates of the 1.5 siting screen (onshore, >= siting_min_mw) set the
  // score to 0; the ungated score is still published.
  const INVEST = {
    weights: { consistency: 0.28, demand: 0.34, security: 0.26, viability: 0.12 },
    terms: {
      consistency: { record: 0.30, volume: 0.25, trend: 0.15, persistence: 0.20, intensity: 0.10 },
      demand: { unserved: 0.45, access: 0.10, proximity: 0.20, centre: 0.25 },
      // security = attacks x (context_floor + (1 - context_floor) x context), context weighted as below
      security: { lethality: 0.40, conflict: 0.35, trend: 0.25 },
      viability: { demand_gate: 0.30, security_gate: 0.30, solar: 0.40 },
    },
    scales: {
      record_years: 5,                 // GFMR years with a detection, out of the last 5
      volume: [0.25, 100],             // latest-year million m3, log; 0.25 is about the 0.1 MW gate
      trend_falling_zero_pct: -80,     // a falling trend scores 0 at -80% and 1 at 0%
      trend_neutral: { not_significant: 0.5, new: 0.6, inactive: 0 },
      intensity_frp: [0.5, 20],        // mean FRP per detection, MW, log
      unserved: [1e3, 2e5],            // people within 10 km without access, log (as siting)
      access: [50, 15],                // state rural access proxy %, linear: 50% scores 0, 15% scores 1
      proximity_km: [2, 20],           // nearest settlement: full credit to 2 km, none past 20 km
      attacks_band_weight: { km10: 1, km10_25: 0.15, km25_50: 0.03 },
      attacks_saturate: 10,            // distance- and age-weighted attacks, log; 10 or more scores 0
      recency_years: 8,                // attacks count in full if the last one was this year, at the floor after 8 years
      recency_floor: 0.5,
      recency_ref_year: 2026,          // years-since is counted from here (incident record runs to 2025)
      context_floor: 0.6,              // the best attack record keeps 60% of its credit however tense the area
      lethality_saturate: 20,          // deaths within 25 km, log
      conflict_saturate: 300,          // ACLED political-violence events, LGAs in 25 km, 12 months, log (area counts overstate)
      sec_trend: { declining: 1, 'none recorded': 1, flat: 0.7, rising: 0.3 },
      flag_quiet_min_million_m3: 50,   // record says a large flare (FIRMS saw 33 of the 38 this size), FIRMS saw it on at most 1 night
      flag_live_min_nights: 2,         // FIRMS sees heat on this many nights, record says no gas
    },
    bands: [['A', 75], ['B', 65], ['C', 55], ['D', 0]],
    band_labels: {
      A: 'strong screening case: gas, demand and security all hold up',
      B: 'workable: one component needs a closer look',
      C: 'marginal: weak on at least one of the three questions',
      D: 'weak: the screen finds little to build on',
      gated: 'screened out by a hard gate (offshore, or gas under the minimum generator size)',
    },
  };

  // Plain-language one-liners for every derived figure. The page renders these
  // as hover explainers and /api/invest publishes them, so they cannot drift.
  const GLOSSARY = {
    invest_score: 'Investable score, 0 to 100: a weighted mean of consistency (28%), demand (34%), security (26%) and viability (12%). A triage score for deciding which sites to look at first, not an investment recommendation.',
    band: 'Grade band from the investable score: A 75 and up, B 65 to 74, C 55 to 64, D under 55. Gated means a hard gate failed and the score is set to 0. Bands are fixed cut-offs, not re-fitted when the data refreshes.',
    score_ungated: 'The score before the hard gates are applied, published so a gated site (for example an offshore flare) can still be compared.',
    weights_used: 'Share of the weights that had an input. Below 1 means a term had no data and the remaining weights were scaled up.',
    consistency: 'Is the fuel reliable? Years the World Bank satellite record saw this flare, how much gas it burned in the latest year, the direction of the trend, and how often NASA satellites saw it burning in the last nights.',
    demand: 'Is there someone to sell power to? People nearby without grid access, how far the nearest settlement is, and the size of the main town within 25 km.',
    security: 'Is it safe enough to build and operate? The record of attacks on oil, gas and power infrastructure nearby, weighted by distance and age, sets the ceiling; deaths, local political violence and its trend move the score within it. Many attacks close by cannot be offset by a quiet trend.',
    viability: 'Would the 1.5 siting screen keep it? Its two soft gates (enough unserved people, few attacks within 10 km) and the solar resource for a hybrid plant.',
    record: 'Share of the last 5 years (2021 to 2025) in which the World Bank GFMR satellite record detected this flare. Five of five means the gas has been there every year.',
    volume: 'Gas flared in the latest year, million cubic metres (World Bank GFMR). Scored on a log scale, so a site ten times larger gains a fixed step rather than ten times the points.',
    trend: 'Direction of the flare: mean of the last 3 years against the up to 5 years before. Falling gas is a shrinking fuel supply; rising is scored the same as stable, not higher.',
    persistence: 'Share of recent nights NASA FIRMS (VIIRS on Suomi NPP, NOAA-20 and NOAA-21) detected heat at this site on a night pass. Cloud counts as a miss, so this is a lower bound; a single warm pixel moves the total score by under one point.',
    intensity: 'Mean fire radiative power per detection, from NASA FIRMS, normalised on a log scale (0.5 to 20 MW). Day and night detections both count. Blank when the site was not detected in the window.',
    bright_ti4: 'bright_ti4: brightness temperature of the hottest pixel in the VIIRS I4 band (3.7 micrometres), in kelvin. Shown as an input only: it saturates near 367 K and daytime sun warms it, so it is not used in the score.',
    frp: 'FRP, fire radiative power: the heat the fire radiates, in megawatts, estimated by NASA from the satellite pixel. A bigger, steadier flare has a higher FRP.',
    nights_window: 'Nights in the FIRMS window that had data. A night with no detection at any site is treated as a missing file and left out.',
    unserved: 'People within 10 km estimated to have no grid electricity: GRID3 population times (1 minus the state rural access proxy). Log scale, 1,000 to 200,000.',
    access: 'State rural access proxy: the share of rural people with electricity, from the 2024 Nigeria DHS state rate times the national rural to total ratio. Lower access scores higher. It is a state-wide figure, the same for every site in a state.',
    proximity: 'Distance to the nearest GRID3 settlement. Full credit within 2 km, none beyond 20 km: every kilometre is distribution line to build.',
    centre: 'The largest named settlement within 25 km (GRID3), scored on its size and discounted with distance; the same term as the 1.5 siting screen.',
    households_servable: 'Households the gas could power at 100 kWh a month if all of it were captured. Shown, not scored: it is the latest-year volume restated, and volume is already scored under consistency.',
    attacks: 'Recorded attacks on oil, gas and power infrastructure since 2015 (Oxford / Inuwa et al. 2026), weighted by distance (within 10 km counts 1, 10 to 25 km 0.15, 25 to 50 km 0.03) and by age (see recency). Log scale; 10 or more weighted attacks scores 0. This term multiplies the security score, so it acts as a ceiling.',
    recency: 'Years since the most recent recorded attack within 25 km (else 50 km). The attack count is weighted in full if that attack was this year, falling to half if it was 8 or more years ago. Folded into the attacks term, not scored on its own.',
    lethality: 'Deaths in recorded energy-infrastructure attacks within 25 km since 2015. Log scale; 20 or more scores 0.',
    conflict: 'Political-violence events (ACLED) in the last 12 months in the local government areas touching the 25 km circle. Area counts overstate what lies strictly within 25 km, so the scale is gentle: log, 300 or more scores 0.',
    sec_trend: 'ACLED political-violence trend in the same area: last 12 months against the 12 before. Rising lowers the score; declining or none recorded scores full marks.',
    dominant_state: 'State where most nearby recorded attacks happened. Shown, not scored: a state-wide penalty would mark down quiet sites in a busy state.',
    demand_gate: '1.5 siting gate: at least 1,000 people without access within 10 km.',
    security_gate: '1.5 siting gate: 2 or fewer energy-infrastructure attacks within 10 km.',
    solar: 'Global horizontal irradiation at the site (Global Solar Atlas 2), so a hybrid solar and gas plant ranks higher.',
    hard_gates: 'Hard gates: the site must be onshore (offshore gas needs a line to shore) and its gas must fuel at least a 0.1 MW generator. Failing either sets the score to 0.',
    flags: 'Flags mark sites where the two satellite sources disagree. They do not change the score; they say what to check first.',
    band_margin: 'Points between the score and the nearest band cut-off. Under 3 means a small change in the weights could move the site into the next band; read such sites as on the line.',
  };

  // site: a /api/sites record plus electric_potential_MW_exact.
  // live: firmsWindow(...).sites[id] or null; nights: firmsWindow(...).nights.
  // sit: core.siting(...) for the same site (gates and the solar / demand terms).
  function invest(site, live, nights, sit, T = THRESHOLDS) {
    const S = INVEST.scales, TW = INVEST.terms;
    const term = (score, value, basis) => ({ score: score == null || !isFinite(score) ? null : Math.round(clamp01(score) * 100), value: value == null ? null : value, basis, label: 'estimate' });
    const combine = (terms, w) => {
      let ws = 0, acc = 0;
      for (const [k, t] of Object.entries(terms)) if (t.score != null) { ws += w[k]; acc += w[k] * t.score; }
      return { score: ws ? Math.round(acc / ws) : null, weights_used: Number(ws.toFixed(2)), terms };
    };
    const inv = (v, sat) => 1 - logScale(1 + v, 1, 1 + sat);

    // Consistency: is the fuel there, and will it stay?
    const ys = (site.year_series || []).slice(-S.record_years);
    const det = ys.filter((d) => d.million_m3 > 0).length;
    const vol = fin(site.latest_year_vol_million_m3) ? site.latest_year_vol_million_m3 : null;
    const tl = site.trend_label;
    let trendScore;
    if (tl === 'rising' || tl === 'stable') trendScore = 1;
    else if (tl === 'falling') trendScore = fin(site.trend_pct) ? 1 - site.trend_pct / S.trend_falling_zero_pct : 0.5;
    else trendScore = S.trend_neutral[tl] != null ? S.trend_neutral[tl] : null;
    const seen = live ? live.nights_detected : 0;
    const dayOnly = live ? live.detections - live.night_detections : 0;
    const consistency = combine({
      record: ys.length ? term(det / S.record_years, det, `GFMR detected the flare in ${det} of the last ${S.record_years} years (${ys[0].year} to ${ys[ys.length - 1].year})`) : term(null, null, 'no GFMR record'),
      volume: vol == null ? term(null, null, 'no latest-year volume')
        : term(logScale(vol, ...S.volume), vol, `${num(vol, 2)} million m3 flared in ${site.latest_year}; log scale ${S.volume[0]} to ${S.volume[1]}`),
      trend: term(trendScore, fin(site.trend_pct) ? site.trend_pct : null, `trend ${String(tl || 'n/a').replace('_', ' ')}${fin(site.trend_pct) ? ' (' + pct(site.trend_pct) + ')' : ''}; ${tl === 'falling' ? `scores 0 at ${S.trend_falling_zero_pct}%` : tl === 'rising' || tl === 'stable' ? 'rising scores the same as stable' : 'no significant direction, partial credit'}`),
      persistence: !(nights > 0) ? term(null, null, 'no FIRMS window')
        : term(seen / nights, seen, `detected on ${seen} of ${nights} nights by NASA FIRMS VIIRS night passes${dayOnly > 0 ? ` (${dayOnly} daytime detections not counted here)` : ''}; cloud counts as a miss, so a lower bound`),
      intensity: !live || !fin(live.mean_frp_MW) ? term(null, null, 'not detected in the FIRMS window, so no intensity reading')
        : term(logScale(live.mean_frp_MW, ...S.intensity_frp), live.mean_frp_MW, `mean FRP ${num(live.mean_frp_MW, 2)} MW over ${live.detections} detections; log scale ${S.intensity_frp[0]} to ${S.intensity_frp[1]} MW`),
    }, TW.consistency);

    // Demand: people without power, close enough to reach.
    const dark = fin(site.people_within_10km_not_grid) ? site.people_within_10km_not_grid : null;
    const acc = fin(site.rural_access_proxy_pct) ? site.rural_access_proxy_pct : null;
    const dist = fin(site.dist_km) ? site.dist_km : null;
    const cen = sit && sit.components && sit.components.demand;
    const demand = combine({
      unserved: dark == null ? term(null, null, 'no population or access figure') : term(logScale(dark, ...S.unserved), dark, `${num(dark, 0)} people within 10 km without grid access; log scale ${num(S.unserved[0], 0)} to ${num(S.unserved[1], 0)}`),
      access: acc == null ? term(null, null, 'no access figure') : term((S.access[0] - acc) / (S.access[0] - S.access[1]), acc, `state rural access proxy ${num(acc, 1)}%; linear, ${S.access[0]}% scores 0 and ${S.access[1]}% scores 100`),
      proximity: dist == null ? term(null, null, 'no settlement distance') : term(1 - (dist - S.proximity_km[0]) / (S.proximity_km[1] - S.proximity_km[0]), dist, `nearest settlement ${site.nearest_settlement || 'n/a'} at ${num(dist, 1)} km; full credit to ${S.proximity_km[0]} km, none past ${S.proximity_km[1]} km`),
      centre: cen && cen.score != null ? { ...cen } : term(null, null, 'no main centre term'),
    }, TW.demand);

    // Security: the attack record is a ceiling; context moves the score under it.
    const se = site.sec_energy || null;
    let security;
    if (!se) security = { score: null, weights_used: 0, terms: { attacks: term(null, null, 'no incident overlay') } };
    else {
      const B = S.attacks_band_weight;
      const a10 = se.attacks_10km || 0, a25 = Math.max(0, (se.attacks_25km || 0) - a10), a50 = Math.max(0, (se.attacks_50km || 0) - (se.attacks_25km || 0));
      const yr = se.most_recent_attack_year;
      const ago = yr ? S.recency_ref_year - yr : null;
      const decay = yr ? 1 - (1 - S.recency_floor) * Math.min(1, ago / S.recency_years) : 1;
      const wtd = (B.km10 * a10 + B.km10_25 * a25 + B.km25_50 * a50) * decay;
      const pv = site.sec_area25_12m && fin(site.sec_area25_12m.pv) ? site.sec_area25_12m.pv : null;
      const st = site.sec_trend;
      const attacks = term(inv(wtd, S.attacks_saturate), Math.round(wtd * 10) / 10, `${a10} attacks within 10 km, ${a25} at 10 to 25 km, ${a50} at 25 to 50 km since 2015; distance-weighted x${B.km10}, x${B.km10_25}, x${B.km25_50} and age factor ${num(decay, 2)}: ${num(wtd, 1)} weighted; log scale, ${S.attacks_saturate} scores 0`);
      const ctx = combine({
        lethality: term(inv(se.deaths_25km || 0, S.lethality_saturate), se.deaths_25km || 0, `${se.deaths_25km || 0} deaths in recorded attacks within 25 km; log scale, ${S.lethality_saturate} scores 0`),
        conflict: pv == null ? term(null, null, 'no ACLED area count') : term(inv(pv, S.conflict_saturate), pv, `${pv} political-violence events in 12 months in the LGAs touching 25 km (ACLED); log scale, ${S.conflict_saturate} scores 0`),
        trend: S.sec_trend[st] == null ? term(null, null, `ACLED trend ${st || 'n/a'}`) : term(S.sec_trend[st], st, `ACLED area trend ${st}`),
      }, TW.security);
      const recency = { score: Math.round(decay * 100), value: yr || null, basis: yr ? `most recent attack nearby in ${yr}, ${ago} years before ${S.recency_ref_year}: attacks weighted x${num(decay, 2)} (x1 this year, x${S.recency_floor} at ${S.recency_years} years or more)` : 'no recorded attack within 50 km', folded_into: 'attacks', label: 'estimate' };
      const cf = S.context_floor;
      security = {
        score: ctx.score == null ? attacks.score : Math.round(attacks.score * (cf + (1 - cf) * ctx.score / 100)),
        weights_used: ctx.score == null ? cf : 1,
        formula: `attacks x (${cf} + ${Number((1 - cf).toFixed(2))} x context); context = weighted mean of lethality, conflict and trend`,
        context_score: ctx.score,
        terms: { attacks, recency, ...ctx.terms },
      };
    }

    // Viability: the 1.5 screen's soft gates and the solar resource.
    const g = {};
    for (const x of (sit && sit.gates) || []) g[x.id] = x.pass;
    const sol = sit && sit.components && sit.components.solar;
    const viability = combine({
      demand_gate: g.demand == null ? term(null, null, 'no siting gate') : term(g.demand ? 1 : 0, g.demand, `1.5 demand gate ${g.demand ? 'passed' : 'failed'}: ${num(T.siting_min_people_not_grid, 0)} or more people without access within 10 km`),
      security_gate: g.security == null ? term(null, null, 'no siting gate') : term(g.security ? 1 : 0, g.security, `1.5 security gate ${g.security ? 'passed' : 'failed'}: ${T.siting_max_energy_attacks_10km} or fewer attacks within 10 km`),
      solar: sol && sol.score != null ? { ...sol } : term(null, null, 'no solar value'),
    }, TW.viability);

    const components = { consistency, demand, security, viability };
    let ws = 0, sum = 0;
    for (const [k, c] of Object.entries(components)) if (c.score != null) { ws += INVEST.weights[k]; sum += INVEST.weights[k] * c.score; }
    const ungated = ws ? Math.round(sum / ws) : null;
    const hard = [
      { id: 'onshore', pass: site.niger_delta_class !== 'offshore' },
      { id: 'power', pass: g.power === true },
    ];
    const gated = hard.some((x) => !x.pass);
    const score = gated ? 0 : ungated;
    const band = gated ? 'gated' : score == null ? null : INVEST.bands.find((b) => score >= b[1])[0];
    // Points to the nearest band cut-off: under 3 means the letter could flip on a small weight change.
    const band_margin = gated || score == null ? null : Math.min(...INVEST.bands.filter((b) => b[1] > 0).map((b) => Math.abs(score - b[1])));

    // Where the long record and the live window disagree, say so; the score is unchanged.
    const flags = [];
    if (nights > 0 && seen >= S.flag_live_min_nights && !(vol > 0)) flags.push({ id: 'live_no_record', text: `NASA FIRMS saw heat here on ${seen} of ${nights} nights, but GFMR records no gas in ${site.latest_year}: a restarted flare, or another heat source within 1 km. Check before relying on either.` });
    if (nights > 0 && vol >= S.flag_quiet_min_million_m3 && seen <= 1) flags.push({ id: 'record_live_quiet', text: `GFMR records ${num(vol, 1)} million m3 in ${site.latest_year}, but FIRMS saw the site on ${seen} of ${nights} nights: cloud, a cut in flaring, or a shutdown. Confirm the gas is still there.` });
    return {
      invest_score: score, band, band_margin, score_ungated: ungated, gated,
      failed_hard_gates: hard.filter((x) => !x.pass).map((x) => x.id),
      weights_used: Number(ws.toFixed(2)),
      flags, components, label: 'estimate',
    };
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

  return { THRESHOLDS, THRESHOLD_DOCS, SITING, INVEST, GLOSSARY, convert, scenario, changeSignificant, rising, powerGap, liveCheck, secTrend, siting, sitingClusters, firmsWindow, invest, haversineKm, trendChart, util: { num, money, pct, esc, ordinal, sig, penaltyPair } };
});
