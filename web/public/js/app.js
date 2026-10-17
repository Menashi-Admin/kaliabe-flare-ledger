// Kaliabe Flare Ledger — frontend
// API is same-origin: Pages Function /api/* proxies to the Worker (web/functions/api).
// Override with ?api=https://… for local/dev.
const API = new URLSearchParams(location.search).get('api') || '';

const $ = (id) => document.getElementById(id);
const core = KaliabeCore;
const D = KaliabeDecision;
const { num, money, pct, esc } = core.util;
const fmtM = (v) => num(v, 1);
const T = core.THRESHOLDS;
const fmtBcm = (v) => (v == null ? '—' : Number(v).toFixed(3) + ' bcm');

let META = null;        // meta from the API: constants, method version, latest year
let NATIONAL = null;

async function getJSON(path) {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

async function loadSummary() {
  const d = await getJSON('/api/summary');
  $('statSites').textContent = fmtM(d.sites);
  $('statND').textContent = fmtM(d.niger_delta_sites);
  $('statNDsub').textContent = d.offshore_sites != null ? `+ ${d.offshore_sites} offshore, beyond the state boundary` : '';
  $('statVol').textContent = d.latest_total_bcm ? fmtBcm(d.latest_total_bcm) : (fmtM(d.latest_total_vol_million_m3) + ' mill. m³');
  $('statYear').textContent = d.latest_year || '—';
  $('statActive').textContent = d.active_sites_latest != null ? `${fmtM(d.active_sites_latest)} with a ${d.latest_year} detection` : '';
}

// ---- Map overlay (js/atlas.js) — the drawer gains the decision view (B1, C1, C5, F1)
const atlas = KaliabeAtlas.create($('atlas'), {
  layerBase: './layers/',
  onSelect: (s) => history.replaceState(null, '', `#site=${encodeURIComponent(s.site_id)}`),
  onClose: () => { if (location.hash.startsWith('#site=')) history.replaceState(null, '', location.pathname + location.search); },
  drawerExtra: (s, m) => `
    <h4 class="drawer__h">Decision view</h4>
    ${D.changesHtml(s, m.latest_year)}
    ${D.percentileHtml(s, 'sites')}
    <h4 class="drawer__h">Penalty exposure<sup>3</sup></h4>
    ${D.exposureHtml(s, m)}
    ${D.scenarioHtml('site:' + s.site_id, "this site's")}
    ${D.briefLinksHtml('site', s.site_id)}`,
  onDrawer: (el, s, m) => D.wireScenario(el, s.latest_year_vol_million_m3 || 0, m, (cut) => D.updateBriefLinks(el, cut)),
});

function siteFromHash() {
  const m = location.hash.match(/^#site=(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}
function openSite(id) {
  $('map').scrollIntoView({ behavior: 'smooth', block: 'start' });
  atlas.select(id);
}

// ---- Sites: fetched once, shared by map, year player, national, watchlist, table
let SITES = [];
async function loadSites() {
  const d = await getJSON('/api/sites');
  SITES = d.sites || [];
  META = d.meta; NATIONAL = d.national;
  atlas.setSites(SITES, d.meta);
  initPlayer();
  renderNational();
  renderWatch();
  renderTable(SITES.slice(0, 200));
  const id = siteFromHash();
  if (id) { $('map').scrollIntoView(); atlas.select(id); }
}

// ---- A1 year player: volumes indexed by year in atlas.setSites; totals precomputed here.
const player = { years: [], totals: [], year: null, timer: null };
function initPlayer() {
  const years = atlas.years;
  if (!years.length) return;
  player.years = years;
  player.totals = years.map((y, i) => {
    let vol = 0, det = 0;
    for (const s of SITES) { const v = atlas.volumes(s.site_id)[i]; vol += v; if (v > 0) det++; }
    return { year: y, vol, det };
  });
  const r = $('yearRange');
  r.min = years[0]; r.max = years[years.length - 1]; r.value = r.max; r.disabled = false;
  $('yearTicks').innerHTML = years.map((y) => `<span>${y % 2 === 0 || y === years[years.length - 1] ? `'${String(y).slice(2)}` : ''}</span>`).join('');
  $('playBtn').setAttribute('aria-label', `Play years ${years[0]} to ${years[years.length - 1]}`);
  setYear(+r.max);
}
function setYear(y) {
  const last = player.years[player.years.length - 1];
  player.year = y;
  atlas.setYear(y === last ? null : y);
  const r = $('yearRange');
  if (+r.value !== y) r.value = y;
  r.setAttribute('aria-valuetext', String(y));
  $('yearOut').textContent = y;
  $('mapYear').textContent = y;
  const i = y - player.years[0], t = player.totals[i], prev = player.totals[i - 1];
  const c = core.convert(t.vol, META.constants);
  const dy = prev && prev.vol > 0 ? ((t.vol - prev.vol) / prev.vol) * 100 : null;
  $('yearTotals').innerHTML = `
    <div><dt>${y} flared volume</dt><dd>${num(t.vol, 0)} <span>million m³</span></dd><dd class="kv__sub">${num(c.bcm, 2)} bcm${dy != null ? ` · ${pct(dy)} vs ${y - 1}` : ''}</dd></div>
    <div><dt>Sites detected</dt><dd>${t.det} <span>of ${SITES.length}</span></dd><dd class="kv__sub">positive volume in ${y}</dd></div>
    <div><dt>Penalty, two tiers</dt><dd>${money(c.penalty_usd_upper, 'US$')} <span>/ ${money(c.penalty_usd_lower, '$')}</span></dd><dd class="kv__sub">$2.00 / $0.50 tier, 2018 Regulations${y < 2019 ? ' (notional before July 2018)' : ''}</dd></div>
    <div><dt>CO₂e</dt><dd>${num(c.co2e_t / 1e6, 1)} <span>Mt</span></dd><dd class="kv__sub">unburned CH₄ ${num(c.ch4_t / 1e3, 1)} kt</dd></div>`;
  const ch = document.querySelector('#natChart');
  if (ch && NATIONAL) ch.innerHTML = core.trendChart(NATIONAL.year_series, { forecast: NATIONAL.forecast, mark: y });
}
function stopPlay() {
  clearInterval(player.timer); player.timer = null;
  $('playBtn').setAttribute('aria-pressed', 'false');
  $('playBtn').setAttribute('aria-label', `Play years ${player.years[0]} to ${player.years[player.years.length - 1]}`);
}
$('playBtn').addEventListener('click', () => {
  if (!player.years.length) return;
  if (player.timer) return stopPlay();
  const first = player.years[0], last = player.years[player.years.length - 1];
  if (player.year >= last) setYear(first);
  $('playBtn').setAttribute('aria-pressed', 'true');
  $('playBtn').setAttribute('aria-label', 'Pause year player');
  const step = () => { if (player.year >= last) return stopPlay(); setYear(player.year + 1); };
  player.timer = setInterval(step, matchMedia('(prefers-reduced-motion: reduce)').matches ? 1600 : 850);
});
$('yearRange').addEventListener('input', (e) => { if (player.timer) stopPlay(); setYear(+e.target.value); });

// ---- National exposure (A2 national trend, C1, C5, F1)
function renderNational() {
  const n = NATIONAL, m = META;
  $('national').innerHTML = `
    <div class="nat__main">
      <div class="fig fig--flush">
        <p class="fig__label">${m.latest_year} flared volume, all sites</p>
        <p class="fig__value">${num(n.total_vol_million_m3_latest, 0)}<span> million m³</span></p>
        <p class="fig__sub">${num(n.total_vol_bcm_latest, 2)} bcm · ${n.active_sites} of ${n.sites} sites detected · ${n.operators} operators</p>
      </div>
      <div class="tchart-wrap" id="natChart"></div>
      ${D.changesHtml(n, m.latest_year)}
    </div>
    <div class="nat__side">
      <h3 class="drawer__h">Penalty exposure</h3>
      ${D.exposureHtml(n, m)}
      ${D.scenarioHtml('national', 'national')}
      ${D.briefLinksHtml('national')}
      <p class="exp__note">Method ${esc(m.method_version)} · ${esc(m.data_vintage)}</p>
    </div>`;
  $('natChart').innerHTML = core.trendChart(n.year_series, { forecast: n.forecast, mark: player.year });
  D.wireScenario($('national'), n.total_vol_million_m3_latest, m, (cut) => D.updateBriefLinks($('national'), cut));
}

// ---- E2 watchlist: rising, newly detected, top decile — all from /api/sites
function renderWatch() {
  if (!META) return;
  const Y = META.latest_year, thr = +$('riseThr').value, floor = T.rising_min_added_million_m3;
  // Rising needs BOTH the % threshold and the absolute floor (THRESHOLDS); ranked
  // by volume added, because a large % on a tiny base is real but immaterial.
  const rising = SITES.map((s) => ({ s, r: core.rising(s, thr) })).filter((x) => x.r.qualifies)
    .sort((a, b) => b.r.added - a.r.added);
  const fresh = SITES.filter((s) => s.first_detected_year != null && s.first_detected_year > Y - T.newly_detected_years).sort((a, b) => b.latest_year_vol_million_m3 - a.latest_year_vol_million_m3);
  const td = META.top_decile;
  const top = SITES.filter((s) => s.top_decile).sort((a, b) => b.latest_year_vol_million_m3 - a.latest_year_vol_million_m3);
  const block = (id, title, note, rows, metricHead, metric, siteOf = (x) => x) => `
    <div class="watch__col" id="${id}">
      <h3 class="watch__h">${title} <span class="watch__n">${rows.length}</span></h3>
      <p class="exp__note">${note}</p>
      <div class="tablewrap watch__table">
        <table class="table table--tight">
          <thead><tr><th scope="col">Site · operator</th><th scope="col" class="num">${metricHead}</th><th scope="col" class="num">${Y} M m³</th></tr></thead>
          <tbody>${rows.map((x) => { const s = siteOf(x); return `<tr>
            <td><button class="sitebtn" type="button" data-site="${esc(s.site_id)}">${esc(s.field_name || s.site_id)}</button><br><span class="site-sub">${esc(s.operator)}</span></td>
            <td class="num">${metric(x)}</td><td class="num">${fmtM(s.latest_year_vol_million_m3)}</td></tr>`; }).join('')
            || `<tr><td colspan="3" class="site-sub">None in the current record.</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
  $('watch').innerHTML =
    block('watchRising', 'Rising', `3-yr change ≥ +${thr}% <b>and</b> ≥ ${floor} million m³ added (${Y} vs ${Y - 3}); largest volume added first.`, rising, 'Added · 3-yr change',
      ({ r }) => `+${fmtM(r.added)} M m³<br><span class="site-sub">${pct(r.pct)}${r.small_base ? ` · small base (${num(r.base, 2)})` : ''}</span>`, (x) => x.s) +
    block('watchNew', 'Newly detected', `First detection in ${Y - 1} or ${Y}; no flaring recorded before.`, fresh, 'First yr', (s) => s.first_detected_year) +
    block('watchTop', 'Top decile by volume', `Top 10% of all ${td ? td.peer_set_size : SITES.length} sites on ${Y} volume: the ${td ? td.slots : ''} largest, cut-off <b>${td ? num(td.cutoff_million_m3, 2) : '—'} million m³</b>.`, top, 'Pctile <span class="site-sub">of detected</span>', (s) => s.percentile_volume == null ? 'n/a' : s.percentile_volume);
}
// Threshold options come from core.THRESHOLDS, so the select can't drift from the method.
$('riseThr').innerHTML = T.rising_pct_options.map((v) => `<option value="${v}"${v === T.rising_pct_default ? ' selected' : ''}>+${v}%</option>`).join('');
$('riseThr').addEventListener('change', renderWatch);
$('watch').addEventListener('click', (e) => { const b = e.target.closest('[data-site]'); if (b) openSite(b.dataset.site); });

function renderTable(rows) {
  $('siteBody').innerHTML = rows.map((s) => {
    const on = s.verdict === 'verified_flare';
    const t = s.trend_label || 'stable';
    const cls = t === 'rising' || t === 'new' ? 'trend-up' : t === 'falling' ? 'trend-down' : '';
    const arrow = { rising: '↑', falling: '↓', new: '↑', inactive: '·', stable: '→', not_significant: '~' }[t] || '→';
    const sub = [s.field_type && s.field_type !== 'NA' ? s.field_type : null, s.location ? s.location.toLowerCase() : null].filter(Boolean).join(' · ');
    return `<tr>
      <td><button class="sitebtn" type="button" data-site="${esc(s.site_id)}">${esc(s.field_name || s.site_id)}</button><br><span class="site-sub">${esc(sub)}</span></td>
      <td>${esc(s.operator)}</td>
      <td><span class="verdict ${on ? 'verdict--on' : 'verdict--off'}">${on ? 'Verified flare' : 'Unverified'}</span></td>
      <td class="num">${fmtM(s.latest_year_vol_million_m3)}</td>
      <td class="${cls}" title="${esc((s.trend_basis || '') + '; ' + (s.trend_significance || ''))}">${arrow} ${t === 'not_significant' ? 'not significant' : t}${s.trend_pct != null && t !== 'inactive' ? ` <span class="site-sub">${pct(s.trend_pct)}</span>` : ''}</td>
      <td class="num">${s.confidence ? Math.round(s.confidence * 100) + '%' : '—'}</td>
      <td class="num">${money(s.penalty_usd_latest_upper, '$')}<br><span class="site-sub">${money(s.penalty_usd_latest_lower, '$')}</span></td>
    </tr>`;
  }).join('');
}
$('siteBody').addEventListener('click', (e) => { const b = e.target.closest('[data-site]'); if (b) openSite(b.dataset.site); });

// ---- Operators: cards (B1 percentile) · league table (B2) · focus panel (A2, C1, C5, F1)
let operators = [];
let view = 'cards';
async function loadOperators() {
  const d = await getJSON('/api/operators');
  operators = d.operators || [];
  META = META || d.meta;
  renderOperators();
  const m = location.hash.match(/^#operator=(.+)$/);
  if (m) sitesP.then(() => openOperator(decodeURIComponent(m[1])));
}
function filteredOps() {
  const q = $('opFilter').value.trim().toLowerCase();
  const nd = $('ndOnly').checked;
  return operators.filter((o) => (!nd || o.niger_delta_sites > 0) && o.operator.toLowerCase().includes(q));
}
function renderOperators() {
  const ops = filteredOps();
  $('opCards').hidden = view !== 'cards';
  $('opLeague').hidden = view !== 'table';
  if (view === 'table') return renderLeague(ops);
  $('opCards').innerHTML = ops.map((o) => {
    const idle = 1 - o.active_sites / Math.max(1, o.sites);
    return `
    <article class="card card--open" data-op="${esc(o.operator)}">
      <div class="card__head">
        <h3 class="card__name"><button type="button" class="card__btn" data-op="${esc(o.operator)}">${esc(o.operator)}</button></h3>
        <span class="card__badge">${o.active_sites}/${o.sites} active</span>
      </div>
      <div class="card__rows">
        <span><b>Flare sites</b><b>${o.sites}</b></span>
        <span><b>Niger Delta</b><b>${o.niger_delta_sites}</b></span>
        <span><b>Latest vol.</b><b>${fmtM(o.total_vol_million_m3_latest)} mill. m³</b><i>${fmtBcm(o.total_vol_bcm_latest)}</i></span>
        <span><b>Penalty (est.)</b><b>${money(o.penalty_usd_latest_upper, 'US$')}</b><i>$2.00 tier · ${money(o.penalty_usd_latest_lower, 'US$')} at $0.50</i></span>
        <span><b>3-yr change</b><b>${D.chg(o.change_3yr_pct, o.change_3yr_significant)}</b><i>${o.percentile_improvement != null ? `improving faster than ${o.percentile_improvement}% of ${o.peer_set_size.improvement}` : 'improvement rank n/a'}</i></span>
        <span><b>Peer percentile</b><b>${o.percentile_volume == null ? 'n/a' : o.percentile_volume + '%'}</b><i>${o.percentile_volume == null ? `no ${o.latest_year} detection; excluded` : `of ${o.peer_set_size.volume} operators with a detection`}</i></span>
        <span><b>Idle sites</b><b>${Math.round(100 * idle)}%</b><i>no latest-year detection</i></span>
      </div>
      <p class="card__more" aria-hidden="true">Trend &amp; exposure →</p>
    </article>`;
  }).join('') || '<p class="ops__note">No operators match.</p>';
}
$('opCards').addEventListener('click', (e) => {
  const c = e.target.closest('[data-op]');
  if (c) openOperator(c.dataset.op);
});

// League table
const COLS = [
  { k: 'operator', label: 'Operator', text: true },
  { k: 'sites', label: 'Sites', f: (v) => v },
  { k: 'total_vol_million_m3_latest', label: 'Latest, M m³', f: fmtM },
  { k: 'cumulative_million_m3', label: 'Cum. 2012–25, M m³', f: (v) => num(v, 0) },
  { k: 'change_3yr_pct', label: '3-yr change', f: (v, o) => D.chg(v, o.change_3yr_significant) },
  { k: 'penalty_usd_latest_upper', label: 'Penalty now, $2.00 tier', f: (v) => money(v, '$') },
  { k: 'penalty_usd_latest_lower', label: 'Penalty now, $0.50 tier', f: (v) => money(v, '$') },
  { k: 'cumulative_penalty_usd_upper', label: 'Cum., $2.00 tier', f: (v) => money(v, '$') },
  { k: 'percentile_volume', label: 'Pctile', f: (v, o) => (v == null ? 'n/a' : `${v}%<br><span class="site-sub">of ${o.peer_set_size.volume}</span>`) },
];
const sort = { k: 'total_vol_million_m3_latest', dir: -1 };
function renderLeague(ops) {
  $('leagueHead').innerHTML = `<th scope="col" class="num">#</th>` + COLS.map((c) => {
    const s = sort.k === c.k ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none';
    return `<th scope="col" class="${c.text ? '' : 'num'}" aria-sort="${s}"><button type="button" class="sortbtn" data-k="${c.k}">${c.label}<span aria-hidden="true">${s === 'descending' ? ' ↓' : s === 'ascending' ? ' ↑' : ''}</span></button></th>`;
  }).join('');
  const col = COLS.find((c) => c.k === sort.k);
  const rows = [...ops].sort((a, b) => {
    const x = a[sort.k], y = b[sort.k];
    if (x == null && y == null) return 0;
    if (x == null) return 1;   // undefined values always sort last
    if (y == null) return -1;
    return col.text ? sort.dir * String(x).localeCompare(String(y)) : sort.dir * (x - y);
  });
  $('leagueBody').innerHTML = rows.map((o, i) => `<tr>
    <td class="num site-sub">${i + 1}</td>
    ${COLS.map((c) => c.text
      ? `<th scope="row"><button type="button" class="sitebtn" data-op="${esc(o.operator)}">${esc(o.operator)}</button></th>`
      : `<td class="num">${c.f(o[c.k], o)}</td>`).join('')}
  </tr>`).join('') || `<tr><td colspan="${COLS.length + 1}">No operators match.</td></tr>`;
}
$('leagueHead').addEventListener('click', (e) => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  const col = COLS.find((c) => c.k === b.dataset.k);
  sort.dir = sort.k === col.k ? -sort.dir : (col.text ? 1 : -1);
  sort.k = col.k;
  renderOperators();
  const again = $('leagueHead').querySelector(`[data-k="${col.k}"]`);
  if (again) again.focus();
});
$('leagueBody').addEventListener('click', (e) => { const b = e.target.closest('[data-op]'); if (b) openOperator(b.dataset.op); });
document.querySelectorAll('.seg__opt').forEach((b) => b.addEventListener('click', () => {
  view = b.dataset.view;
  document.querySelectorAll('.seg__opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderOperators();
}));

// Operator focus panel
let focusReturn = null;
function openOperator(name) {
  const o = operators.find((x) => x.operator === name);
  if (!o || !META) return;
  const m = META, el = $('opFocus');
  focusReturn = document.activeElement;
  const top = SITES.filter((s) => s.operator === o.operator).slice(0, 5);
  el.innerHTML = `
    <header class="drawer__head">
      <p class="drawer__kicker">Operator · ${o.sites} flare sites · ${o.niger_delta_sites} in the Niger Delta</p>
      <button class="drawer__close" type="button" aria-label="Close operator panel">×</button>
    </header>
    <h3 class="drawer__title" id="opFocusTitle">${esc(o.operator)}</h3>
    <div class="nat">
      <div class="nat__main">
        <div class="fig fig--flush">
          <p class="fig__label">${m.latest_year} flared volume</p>
          <p class="fig__value">${num(o.total_vol_million_m3_latest, 1)}<span> million m³</span></p>
          <p class="fig__sub">${num(o.total_vol_bcm_latest, 3)} bcm · ${o.active_sites} of ${o.sites} sites detected · cumulative ${num(o.cumulative_million_m3, 0)} million m³ since 2012</p>
        </div>
        ${core.trendChart(o.year_series, { forecast: o.forecast })}
        ${D.changesHtml(o, m.latest_year)}
        ${D.percentileHtml(o, 'operators')}
        ${top.length ? `<h4 class="drawer__h">Largest sites, ${m.latest_year}</h4><ul class="toplist">${top.map((s) => `<li><button class="sitebtn" type="button" data-site="${esc(s.site_id)}">${esc(s.field_name || s.site_id)}</button> <span class="site-sub">${fmtM(s.latest_year_vol_million_m3)} M m³</span></li>`).join('')}</ul>` : ''}
      </div>
      <div class="nat__side">
        <h4 class="drawer__h">Penalty exposure</h4>
        ${D.exposureHtml(o, m)}
        ${D.scenarioHtml('op:' + o.operator, `${o.operator}'s`)}
        ${D.briefLinksHtml('operator', o.operator)}
      </div>
    </div>`;
  el.hidden = false;
  D.wireScenario(el, o.total_vol_million_m3_latest, m, (cut) => D.updateBriefLinks(el, cut));
  el.querySelector('.drawer__close').addEventListener('click', closeOperator);
  history.replaceState(null, '', `#operator=${encodeURIComponent(o.operator)}`);
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}
function closeOperator() {
  $('opFocus').hidden = true;
  if (location.hash.startsWith('#operator=')) history.replaceState(null, '', location.pathname + location.search);
  if (focusReturn && document.contains(focusReturn)) focusReturn.focus();
}
$('opFocus').addEventListener('click', (e) => { const b = e.target.closest('[data-site]'); if (b) openSite(b.dataset.site); });
$('opFocus').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOperator(); });
$('opFilter').addEventListener('input', renderOperators);
$('ndOnly').addEventListener('change', renderOperators);

const fail = (where, html) => (err) => { console.error(err); $(where).innerHTML = html; };
loadSummary().catch((e) => console.error(e));
const sitesP = loadSites().catch(fail('siteBody', '<tr><td colspan="7">Site data temporarily unavailable.</td></tr>'));
// Operators need META (constants) for the focus panel; it arrives with either response.
loadOperators().then(() => sitesP).catch(fail('opCards', '<p class="ops__note">Operator data temporarily unavailable.</p>'));
