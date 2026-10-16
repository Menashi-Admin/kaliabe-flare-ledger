/* Kaliabe decision components — shared by the flare drawer, the operator panel
 * and the national section: percentile phrasing, penalty exposure, the
 * scenario slider and the brief links. Maths comes from KaliabeCore; constants
 * from the API's meta.constants.
 */
(function (global) {
  'use strict';
  const core = global.KaliabeCore;
  const { num, money, pct, esc } = core.util;
  const API = new URLSearchParams(location.search).get('api') || '';
  const cuts = new Map();   // scenario setting per subject, survives re-renders

  const chg = (v) => (v == null ? '<span class="kv__sub">n/a</span>' : `<span class="${v > 0 ? 'trend-up' : v < 0 ? 'trend-down' : ''}">${pct(v)}</span>`);

  function briefHref(scope, id, cut, format) {
    const q = new URLSearchParams({ scope });
    if (id) q.set('id', id);
    if (cut) q.set('cut', String(cut));
    if (format) q.set('format', format);
    return `${API}/api/brief?${q}`;
  }

  // "larger than N% of operators", "improving faster than N%"
  function percentileHtml(o, peers) {
    if (o.percentile_volume == null) return '';
    const imp = o.percentile_improvement == null
      ? `<span class="kv__sub">Improvement rank n/a — no detection in the 3-yr base year</span>`
      : `Improving faster than <b>${o.percentile_improvement}%</b> of ${peers} <span class="kv__sub">on 3-yr change</span>`;
    const vol = o.percentile_volume === 100 ? `Larger than <b>every other</b> ${peers.replace(/s$/, '')}` : `Larger than <b>${o.percentile_volume}%</b> of ${peers}`;
    return `<p class="pctl"><span>${vol} <span class="kv__sub">by ${o.latest_year} volume</span></span><span>${imp}</span></p>`;
  }

  function changesHtml(o, year) {
    return `<dl class="facts facts--2">
      <div><dt>3-yr change</dt><dd>${chg(o.change_3yr_pct)}</dd><dd class="kv__sub">${year} vs ${year - 3}</dd></div>
      <div><dt>5-yr change</dt><dd>${chg(o.change_5yr_pct)}</dd><dd class="kv__sub">${year} vs ${year - 5}</dd></div>
    </dl>`;
  }

  function exposureHtml(o, currentUsd, meta) {
    const f = o.forecast || [];
    const y = meta.latest_year;
    return `<dl class="facts">
      <div><dt>Penalty, ${y}</dt><dd>${money(currentUsd, 'US$')}</dd><dd class="kv__sub">current</dd></div>
      <div><dt>Cumulative</dt><dd>${money(o.cumulative_penalty_usd, 'US$')}</dd><dd class="kv__sub">2012–${y}, notional</dd></div>
      <div><dt>${f.length ? f[0].year : 'Next yr'} <span class="tag">projection</span></dt><dd>${money(o.forecast_penalty_usd_next, 'US$')}</dd><dd class="kv__sub">${f.length ? `${f.length}-yr: ${money(o.forecast_penalty_usd_3yr, 'US$')}` : ''}</dd></div>
    </dl>
    <p class="exp__note">Cumulative applies the 2022 NUPRC rate to every year (earlier years fell under the previous regime). Projection: ${esc(meta.forecast_method || '')}.</p>`;
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
      <input class="scen__range" type="range" id="${id}" min="0" max="100" step="5" value="${cut}" aria-valuetext="${cut}% reduction" />
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
        const row = (lbl, k, fmt) => `<div><dt>${lbl}</dt><dd>${fmt(r.after[k])}</dd><dd class="kv__sub">${cut ? '−' + fmt(r.saved[k]) : 'as recorded'}</dd></div>`;
        el.querySelector('.scen__out').innerHTML =
          row('Volume', 'million_m3', (v) => num(v, 1) + ' M m³') +
          row('CO₂e', 'co2e_t', (v) => num(v / 1e3, 0) + ' kt') +
          row('CH₄-equiv.', 'ch4_t', (v) => num(v / 1e3, 1) + ' kt') +
          row('Penalty', 'penalty_usd', (v) => money(v, '$'));
        el.querySelector('.scen__note').textContent = cut
          ? `Scenario, not a forecast: a uniform ${cut}% cut applied to the ${meta.latest_year} recorded volume; every output scales linearly.`
          : `Move the slider to model a cut against the ${meta.latest_year} recorded volume.`;
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

  global.KaliabeDecision = { percentileHtml, changesHtml, exposureHtml, scenarioHtml, wireScenario, briefLinksHtml, updateBriefLinks, briefHref, chg };
})(window);
