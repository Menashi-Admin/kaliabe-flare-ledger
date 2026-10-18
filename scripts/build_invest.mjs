#!/usr/bin/env node
// KFL-M 1.6 offline run of the Worker on the committed seed.
//
// Bundles worker/src/index.js exactly as wrangler would (esbuild, JSON imports
// inlined), replaces D1 with an in-memory copy of data/gfmr_nigeria_sites_seed.json
// (the file scripts/gen_sql.py turns into worker/seed.sql), and calls the real
// fetch handler. So the snapshot below is produced by the same code that serves
// /api/invest, not by a re-implementation.
//
//   node scripts/build_invest.mjs              -> web/public/data/invest.json
//   node scripts/build_invest.mjs --route /api/siting?scope=national   (prints JSON)
//
// The live FIRMS fetch is pointed at an unreachable address so the bundled
// snapshot is used, as it is at deploy time. No network, no D1 writes.
import { build } from '../worker/node_modules/esbuild/lib/main.js';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function loadWorker() {
  const dir = mkdtempSync(join(tmpdir(), 'kfl-invest-'));
  const out = join(dir, 'worker.mjs');
  await build({
    entryPoints: [join(ROOT, 'worker/src/index.js')],
    bundle: true, format: 'esm', platform: 'neutral', outfile: out,
    loader: { '.json': 'json' }, logLevel: 'error',
  });
  const mod = await import(pathToFileURL(out).href);
  rmSync(dir, { recursive: true, force: true });
  return mod.default;
}

// In-memory D1: the two SELECTs loadLedger() issues, from the seed.
export function seedDB() {
  const seed = JSON.parse(readFileSync(join(ROOT, 'data/gfmr_nigeria_sites_seed.json'), 'utf8'));
  const sites = seed.map((s) => ({
    site_id: s.site_id, lat: s.lat, lon: s.lon,
    operator: (s.operator || ''), field_name: s.field_name || '', field_type: s.field_type || '',
    location: s.location || 'ONSHORE', in_niger_delta: s.in_niger_delta ? 1 : 0, source: 'GFMR/WorldBank',
    first_year: s.first_year, last_year: s.last_year,
  }));
  const annual = [];
  for (const s of seed) for (const [y, v] of Object.entries(s.annual_vol_m3)) annual.push({ site_id: s.site_id, year: Number(y), flaring_vol_m3: v });
  annual.sort((a, b) => (a.site_id < b.site_id ? -1 : a.site_id > b.site_id ? 1 : a.year - b.year));
  const stmt = (sql) => ({
    sql,
    async all() { return { results: /FROM flare_annual/.test(sql) ? annual : sites }; },
    bind() { return this; },
  });
  return {
    prepare: stmt,
    async batch(list) { return Promise.all(list.map((s) => s.all())); },
  };
}

let workerP = null;
export async function offline(route) {
  const worker = await (workerP || (workerP = loadWorker()));
  const env = { DB: seedDB(), LIVE_URL: 'http://127.0.0.1:9/unreachable' };
  const res = await worker.fetch(new Request('https://offline.local' + route), env, {});
  if (!res.ok) throw new Error(`${route}: HTTP ${res.status}`);
  return res.json();
}

// ---- Stress tests (published as web/public/data/invest_stress.json) --------
// The questions the 1.6 brief asked, answered on the committed seed. Pure
// functions of the /api/invest payload, so anyone can re-run them.
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const stats = (a) => ({ n: a.length, mean: r1(mean(a)), min: a.length ? Math.min(...a) : null, max: a.length ? Math.max(...a) : null });
function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

function stress(inv, sit) {
  const S = inv.sites, W = inv.method.weights, K = Object.keys(W);
  const cuts = Object.entries(inv.method.bands).filter(([, lo]) => lo > 0).sort((a, b) => b[1] - a[1]);
  const band = (x) => (cuts.find(([, lo]) => x >= lo) || ['D'])[0];
  const scored = S.filter((r) => !r.gated);
  const sitBy = new Map(sit.sites.map((r) => [r.site_id, r]));
  const pick = (id, why) => {
    const r = S.find((x) => x.site_id === id);
    if (!r) return null;
    const c = r.components.consistency;
    return { why, site_id: id, field_name: r.field_name, invest_score: r.invest_score, band: r.band, score_ungated: r.score_ungated,
      consistency: c.score, terms: Object.fromEntries(Object.entries(c.terms).map(([k, t]) => [k, t.score])),
      firms: { nights: r.inputs.firms_nights_detected, of: r.inputs.firms_window_nights, detections: r.inputs.firms_detections, bright_ti4_K: r.inputs.firms_mean_bright_ti4_K, frp_MW: r.inputs.firms_mean_frp_MW },
      gfmr_latest_million_m3: r.inputs.latest_year_vol_million_m3, flags: r.flags.map((f) => f.id) };
  };
  // 1. Persistence: one warm pixel and no gas, live heat and no record, a single weak pixel on a big record, and the siting top picks.
  const oneWarm = S.filter((r) => r.inputs.firms_detections === 1 && !(r.inputs.latest_year_vol_million_m3 > 0)).map((r) => r.site_id);
  const liveNoRec = S.filter((r) => r.flags.some((f) => f.id === 'live_no_record')).map((r) => r.site_id);
  const weakBig = S.filter((r) => r.inputs.firms_detections === 1 && r.inputs.latest_year_vol_million_m3 >= 50).map((r) => r.site_id);
  const sitTop = sit.sites.slice(0, 5).map((r) => r.site_id);
  const persistTop = S.slice().sort((a, b) => b.inputs.firms_nights_detected - a.inputs.firms_nights_detected).slice(0, 3).map((r) => r.site_id);
  const maxOneNight = Math.round(100 * inv.method.weights.consistency * inv.method.terms.consistency.persistence / inv.method.firms_window.nights * 10) / 10;
  // 2. Security: clean, tense but stable, one attack within 10 km, hostile.
  const I = (r) => r.inputs;
  const groups = {
    clean: S.filter((r) => (I(r).energy_attacks_50km || 0) === 0),
    tense_but_stable: S.filter((r) => I(r).energy_attacks_10km === 0 && (I(r).energy_attacks_50km || 0) >= 15),
    one_within_10km: S.filter((r) => I(r).energy_attacks_10km === 1),
    hostile: S.filter((r) => (I(r).energy_attacks_10km || 0) >= 3),
  };
  const security = {};
  for (const [g, list] of Object.entries(groups)) {
    security[g] = { invest_1_6: stats(list.map((r) => r.components.security.score)), siting_1_5: stats(list.map((r) => sitBy.get(r.site_id).components.security.score)) };
  }
  // 3. Weight sensitivity: every weight moved up to +/-30% (relative), 2,000 draws.
  const sc = (r, w) => { let ws = 0, a = 0; for (const k of K) { const v = r.components[k].score; if (v != null) { ws += w[k]; a += w[k] * v; } } return Math.round(a / ws); };
  const base = new Map(scored.map((r) => [r.site_id, sc(r, W)]));
  const mismatch = scored.filter((r) => base.get(r.site_id) !== r.invest_score).length;
  const top = (m, n) => new Set([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]));
  const rankOf = (m) => new Map([...m.entries()].sort((a, b) => b[1] - a[1]).map((e, i) => [e[0], i]));
  const t10 = top(base, 10), br = rankOf(base);
  const rand = rng(16), draws = 2000, moved = [], kept = [], rho = [], shift = [];
  for (let d = 0; d < draws; d++) {
    const w = {}; let t = 0;
    for (const k of K) { w[k] = W[k] * (0.7 + 0.6 * rand()); t += w[k]; }
    for (const k of K) w[k] /= t;
    const m = new Map(scored.map((r) => [r.site_id, sc(r, w)]));
    const rr = rankOf(m), n = m.size;
    let mv = 0, d2 = 0, mx = 0;
    for (const [id, v] of m) { if (band(v) !== band(base.get(id))) mv++; d2 += (rr.get(id) - br.get(id)) ** 2; mx = Math.max(mx, Math.abs(v - base.get(id))); }
    moved.push(mv / n); rho.push(1 - (6 * d2) / (n * (n * n - 1))); shift.push(mx);
    kept.push([...top(m, 10)].filter((id) => t10.has(id)).length);
  }
  const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.round(p * (a.length - 1))];
  const dropOne = {};
  for (const k of K) {
    const w = { ...W, [k]: 0 };
    const m = new Map(scored.map((r) => [r.site_id, sc(r, w)]));
    dropOne[k] = { top10_kept: [...top(m, 10)].filter((id) => t10.has(id)).length, band_changes_pct: Math.round(100 * [...m].filter(([id, v]) => band(v) !== band(base.get(id))).length / m.size) };
  }
  return {
    method_version: inv.method_version,
    generated_from: 'node scripts/build_invest.mjs on data/gfmr_nigeria_sites_seed.json and the bundled FIRMS window',
    label: 'estimate',
    persistence: {
      max_points_from_one_night: maxOneNight,
      note: `one night of FIRMS detection is worth at most ${maxOneNight} points of the 100-point score`,
      known_bad_one_warm_pixel_no_gas: oneWarm.map((id) => pick(id, 'a single FIRMS detection and no GFMR gas in the latest year')),
      known_bad_live_heat_no_record: liveNoRec.map((id) => pick(id, 'FIRMS sees heat on several nights, GFMR records no gas')),
      weak_pixel_big_record: weakBig.map((id) => pick(id, 'one weak FIRMS detection at a site GFMR records as a large flare')),
      known_good_siting_top5: sitTop.map((id) => pick(id, 'top 5 of the 1.5 siting screen')),
      most_persistent: persistTop.map((id) => pick(id, 'seen on the most FIRMS nights')),
    },
    security: {
      groups,
      definitions: { clean: 'no recorded attack within 50 km', tense_but_stable: 'none within 10 km, 15 or more within 50 km', one_within_10km: 'exactly one within 10 km', hostile: '3 or more within 10 km' },
      by_group: security,
    },
    spread: { national: inv.aggregate.national.score, ungated: inv.aggregate.national.ungated, components_scored: inv.aggregate.national.components_scored, bands: inv.aggregate.national.bands,
      near_band_edge_pct: Math.round(100 * scored.filter((r) => r.band_margin != null && r.band_margin <= 2).length / scored.length) },
    sensitivity: {
      design: `each component weight multiplied by a uniform 0.7 to 1.3, renormalised; ${draws} draws; ${scored.length} scored sites; recomputation check mismatches ${mismatch}`,
      band_changes_pct: { median: Math.round(100 * q(moved, 0.5)), p90: Math.round(100 * q(moved, 0.9)) },
      top10_kept: { median: q(kept, 0.5), p10: q(kept, 0.1) },
      spearman_rho: { median: Math.round(q(rho, 0.5) * 1000) / 1000, p10: Math.round(q(rho, 0.1) * 1000) / 1000 },
      max_site_shift_points: { median: q(shift, 0.5), p90: q(shift, 0.9) },
      drop_one_component: dropOne,
    },
    flags: Object.fromEntries(['live_no_record', 'record_live_quiet'].map((f) => [f, S.filter((r) => r.flags.some((x) => x.id === f)).map((r) => ({ site_id: r.site_id, field_name: r.field_name, band: r.band }))])),
    checks: inv.checks,
  };
}
// Strip the group member lists down to counts for the published file.
const slim = (st) => ({ ...st, security: { ...st.security, groups: Object.fromEntries(Object.entries(st.security.groups).map(([k, v]) => [k, v.length])) } });

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--route');
  const c = process.argv.indexOf('--compare');
  if (i > 0) {
    process.stdout.write(JSON.stringify(await offline(process.argv[i + 1])));
  } else if (c > 0) {
    // node scripts/build_invest.mjs --compare https://flaretracker.kaliabe.ng
    const base = process.argv[c + 1].replace(/\/$/, '');
    let bad = 0;
    for (const route of ['/api/invest?scope=national', '/api/invest?scope=delta', '/api/invest?scope=national&band=A']) {
      const [a, b] = [await offline(route), await (await fetch(base + route)).json()];
      const strip = (x) => JSON.stringify({ ...x, sites: x.sites, aggregate: x.aggregate });
      const same = strip(a) === strip(b);
      const diffs = a.sites.filter((r, k) => JSON.stringify(r) !== JSON.stringify(b.sites[k])).length;
      if (!same) bad++;
      console.log(`${route}: ${same ? 'identical' : 'DIFFERS'} (${a.count} vs ${b.count} sites, ${diffs} site rows differ; live ${b.method_version}, non-finite ${b.checks && b.checks.non_finite_numbers})`);
    }
    process.exit(bad ? 1 : 0);
  } else {
    const d = await offline('/api/invest?scope=national');
    writeFileSync(join(ROOT, 'web/public/data/invest.json'), JSON.stringify(d));
    const st = stress(d, await offline('/api/siting?scope=national'));
    writeFileSync(join(ROOT, 'web/public/data/invest_stress.json'), JSON.stringify(slim(st)));
    const s = d.spread, se = st.security.by_group, sn = st.sensitivity;
    console.error(`invest.json: ${d.count} sites, ${d.method_version}; scored ${s.scored}, gated ${s.gated}; non-finite ${d.checks.non_finite_numbers}`);
    console.error(`  scored p10/p50/p90 ${s.score.p10}/${s.score.p50}/${s.score.p90}, IQR ${s.score.iqr}; ungated ${s.ungated.min} to ${s.ungated.max}, IQR ${s.ungated.iqr}; bands ${JSON.stringify(d.aggregate.national.bands)}`);
    console.error(`  security mean: clean ${se.clean.invest_1_6.mean}, tense ${se.tense_but_stable.invest_1_6.mean}, one<10km ${se.one_within_10km.invest_1_6.mean}, hostile ${se.hostile.invest_1_6.mean}`);
    console.error(`  sensitivity: band changes ${sn.band_changes_pct.median}% (p90 ${sn.band_changes_pct.p90}%), top10 kept ${sn.top10_kept.median}, rho ${sn.spearman_rho.median}, max shift ${sn.max_site_shift_points.p90}; near edge ${st.spread.near_band_edge_pct}%`);
    console.error(`  one night of FIRMS = ${st.persistence.max_points_from_one_night} points max; flags ${Object.entries(st.flags).map(([k, v]) => k + ' ' + v.length).join(', ')}`);
  }
}
