/* Kaliabe Ledger core — the shared maths and the hand-rolled SVG trend chart.
 *
 * Loaded in two places from this one file so a figure can never disagree with
 * itself: the browser (as window.KaliabeCore) and the Worker, which bundles it
 * to render the decision brief server-side. No dependencies, no DOM access.
 *
 * Every conversion takes the constants `k` from the API (`meta.constants`) —
 * the Worker is the only place the constants are defined.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KaliabeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // million m³ → every derived unit. k: { m3_per_1000scf, penalty_usd_per_1000scf,
  // co2e_mt_per_bcm, ch4_mt_per_bcm, scf_per_m3 }
  function convert(millionM3, k) {
    const v = Number.isFinite(millionM3) ? millionM3 : 0;
    const bcm = v / 1e3;
    return {
      million_m3: v,
      bcm,
      mmscfd: (v * k.scf_per_m3) / 365,
      penalty_usd: ((v * 1e6) / k.m3_per_1000scf) * k.penalty_usd_per_1000scf,
      co2e_t: bcm * k.co2e_mt_per_bcm * 1e6,
      ch4_t: bcm * k.ch4_mt_per_bcm * 1e6,
    };
  }

  // Scenario: "reduce flaring by cutPct %". Linear in volume by construction.
  function scenario(millionM3, cutPct, k) {
    const cut = Math.max(0, Math.min(100, Number(cutPct) || 0));
    const base = convert(millionM3, k);
    const after = convert(millionM3 * (1 - cut / 100), k);
    const saved = {};
    for (const key of Object.keys(base)) saved[key] = base[key] - after[key];
    return { cut_pct: cut, base, after, saved };
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

  return { convert, scenario, trendChart, util: { num, money, pct, esc, ordinal } };
});
