/* Kaliabe decision components — shared by the flare drawer, the operator panel
 * and the national section: percentile phrasing, penalty exposure, the
 * scenario slider and the brief links. Maths comes from KaliabeCore; constants
 * from the API's meta.constants.
 */
(function (global) {
  'use strict';
  const core = global.KaliabeCore;
  const { num, money, pct, esc, sig } = core.util;
  const API = new URLSearchParams(location.search).get('api') || '';
  const cuts = new Map();   // scenario setting per subject, survives re-renders

  // sg === false: within detection noise, so no direction colour and an "n.s." mark.
  const chg = (v, sg) => (v == null ? '<span class="kv__sub">n/a</span>'
    : sg === false ? `<span class="kv__sub" title="Not significant: within detection noise (see methodology)">${pct(v)} n.s.</span>`
      : `<span class="${v > 0 ? 'trend-up' : v < 0 ? 'trend-down' : ''}">${pct(v)}</span>`);

  function briefHref(scope, id, cut, format) {
    const q = new URLSearchParams({ scope });
    if (id) q.set('id', id);
    if (cut) q.set('cut', String(cut));
    if (format) q.set('format', format);
    return `${API}/api/brief?${q}`;
  }

  // "larger than N% of operators", "improving faster than N%"
  // Peer-set size is stated wherever a percentile appears; members with no
  // usable value are excluded from the calculation and shown n/a, never as zero.
  function percentileHtml(o, peers) {
    const n = o.peer_set_size || {};
    const vol = o.percentile_volume == null
      ? `<span class="kv__sub">Volume percentile n/a — no ${o.latest_year} detection, so excluded from the peer set (${n.volume} detected ${peers})</span>`
      : `${o.percentile_volume === 100 ? `Larger than <b>every other</b> detected ${peers.replace(/s$/, '')}` : `Larger than <b>${o.percentile_volume}%</b> of detected ${peers}`} <span class="kv__sub">by ${o.latest_year} volume · peer set ${n.volume} (${n.excluded_volume} undetected excluded)</span>`;
    const imp = o.percentile_improvement == null
      ? `<span class="kv__sub">Improvement rank n/a — no detection in the 3-yr base year (peer set ${n.improvement})</span>`
      : `Improving faster than <b>${o.percentile_improvement}%</b> of ${peers} <span class="kv__sub">on 3-yr change · peer set ${n.improvement} with a detected base year</span>`;
    return `<p class="pctl"><span>${vol}</span><span>${imp}</span></p>`;
  }

  function changesHtml(o, year) {
    return `<dl class="facts facts--2">
      <div><dt>3-yr change</dt><dd>${chg(o.change_3yr_pct, o.change_3yr_significant)}</dd><dd class="kv__sub">${year} vs ${year - 3}</dd></div>
      <div><dt>5-yr change</dt><dd>${chg(o.change_5yr_pct, o.change_5yr_significant)}</dd><dd class="kv__sub">${year} vs ${year - 5}</dd></div>
    </dl>`;
  }

  // Two-tier penalty (Reg. 13(1) $2.00 / Reg. 13(2) $0.50). No midpoint, ever.
  function tierNote(meta) {
    const p = meta.penalty || {};
    return `<p class="exp__note"><b>${esc(p.short || 'Flare Gas Regulations 2018 (S.I. No. 9 of 2018), Reg. 13')}.</b> ${esc(p.assumption || '')}
      Exemptions (force majeure; Deliver-or-Pay volumes) are not deducted: they cannot be seen from satellite data. <a href="methodology.html#penalty">Method</a></p>`;
  }
  function exposureHtml(o, meta) {
    const f = o.forecast || [];
    const y = meta.latest_year;
    const up = o.penalty_usd_latest_upper, lo = o.penalty_usd_latest_lower;
    return `<table class="tiers">
      <thead><tr><th scope="col"></th><th scope="col" class="num">$2.00 tier<span>≥10k bbl/d · upper</span></th><th scope="col" class="num">$0.50 tier<span>&lt;10k bbl/d · lower</span></th></tr></thead>
      <tbody>
        <tr><th scope="row">Penalty, ${y}</th><td class="num">${money(up, 'US$')}</td><td class="num">${money(lo, 'US$')}</td></tr>
        <tr><th scope="row">Cumulative <span class="kv__sub">2012–${y}, notional</span></th><td class="num">${money(o.cumulative_penalty_usd_upper, 'US$')}</td><td class="num">${money(o.cumulative_penalty_usd_lower, 'US$')}</td></tr>
        <tr><th scope="row">${f.length ? f[0].year : 'Next yr'} <span class="tag">projection</span></th><td class="num">${money(o.forecast_penalty_usd_next_upper, 'US$')}</td><td class="num">${money(o.forecast_penalty_usd_next_lower, 'US$')}</td></tr>
      </tbody>
    </table>
    ${tierNote(meta)}
    <p class="exp__note">Cumulative applies the 2018 Regulations' tiers to every year (they were made in July 2018; earlier years fell under the previous regime). Projection: ${esc(meta.forecast_method || '')}.</p>`;
  }

  // Scenario slider. key identifies the subject (e.g. "site:s_3987").
  function scenarioHtml(key, label) {
    const cut = cuts.get(key) || 0;
    const id = 'scen-' + key.replace(/[^a-z0-9]+/gi, '-');
    return `<div class="scen" data-scen="${esc(key)}">
      <div class="scen__head">
        <label class="scen__label" for="${id}">Scenario: reduce ${esc(label)} flaring by <output class="scen__pct">${cut}</output>%</label>
        <span class="tag">scenario</span>
      </div>
      <input class="scen__range" type="range" id="${id}" min="0" max="100" step="${core.THRESHOLDS.scenario_step_pct}" value="${cut}" aria-valuetext="${cut}% reduction" />
      <dl class="scen__out" aria-live="polite"></dl>
      <p class="exp__note scen__note"></p>
    </div>`;
  }

  // Wire every .scen inside root. vol = latest-year million m³; onCut(cut) for brief links.
  function wireScenario(root, vol, meta, onCut) {
    root.querySelectorAll('.scen').forEach((el) => {
      const key = el.dataset.scen;
      const input = el.querySelector('.scen__range');
      const render = () => {
        const cut = Number(input.value);
        cuts.set(key, cut);
        const r = core.scenario(vol, cut, meta.constants);
        el.querySelector('.scen__pct').textContent = cut;
        input.setAttribute('aria-valuetext', `${cut}% reduction`);
        // Rounded to 3 significant figures: a scenario is not a measurement.
        const row = (lbl, k, fmt) => `<div><dt>${lbl}</dt><dd>${fmt(sig(r.after[k]))}</dd><dd class="kv__sub">${cut ? '−' + fmt(sig(r.saved[k])) : 'as recorded'}</dd></div>`;
        el.querySelector('.scen__out').innerHTML =
          row('Volume', 'million_m3', (v) => num(v, v < 10 ? 2 : 0) + ' M m³') +
          row('CO₂e', 'co2e_t', (v) => num(v / 1e3, v < 1e4 ? 1 : 0) + ' kt') +
          row('Unburned CH₄', 'ch4_t', (v) => num(v, 0) + ' t') +
          row('Penalty $2.00 tier', 'penalty_usd_upper', (v) => money(v, '$')) +
          row('Penalty $0.50 tier', 'penalty_usd_lower', (v) => money(v, '$'));
        el.querySelector('.scen__note').textContent =
          `Assumption: ${r.assumption} (${meta.latest_year} volume). Figures rounded to 3 significant figures.`;
        if (onCut) onCut(cut);
      };
      input.addEventListener('input', render);
      render();
    });
  }

  function briefLinksHtml(scope, id) {
    return `<p class="brieflinks" data-brief-scope="${esc(scope)}" data-brief-id="${esc(id || '')}">
      <a class="btn" data-fmt="html" target="_blank" rel="noopener" href="${briefHref(scope, id)}">Decision brief ↗</a>
      <a class="btn btn--quiet" data-fmt="csv" href="${briefHref(scope, id, 0, 'csv')}">CSV</a>
    </p>`;
  }
  function updateBriefLinks(root, cut) {
    root.querySelectorAll('.brieflinks').forEach((p) => {
      p.querySelectorAll('a[data-fmt]').forEach((a) => {
        a.href = briefHref(p.dataset.briefScope, p.dataset.briefId, cut, a.dataset.fmt === 'csv' ? 'csv' : '');
      });
    });
  }

  global.KaliabeDecision = { percentileHtml, changesHtml, exposureHtml, tierNote, scenarioHtml, wireScenario, briefLinksHtml, updateBriefLinks, briefHref, chg };
})(window);
