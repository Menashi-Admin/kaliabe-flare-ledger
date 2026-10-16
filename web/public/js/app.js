// Kaliabe Flare Ledger — frontend
// API is same-origin: Pages Function /api/* proxies to the Worker (web/functions/api).
// Override with ?api=https://… for local/dev.
const API = new URLSearchParams(location.search).get('api') || '';

const $ = (id) => document.getElementById(id);
const { num, money, pct, esc } = KaliabeAtlas.util;
const fmtM = (v) => num(v, 1);
const fmtUsd = (v) => (v == null ? '—' : '$' + num(v, 0));
const fmtBcm = (v) => (v == null ? '—' : Number(v).toFixed(3) + ' bcm');

async function getJSON(path) {
  const r = await fetch(`${API}${path}`);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

async function loadSummary() {
  const d = await getJSON('/api/summary');
  $('statSites').textContent = fmtM(d.sites);
  $('statND').textContent = fmtM(d.niger_delta_sites);
  $('statVol').textContent = d.latest_total_bcm ? fmtBcm(d.latest_total_bcm) : (fmtM(d.latest_total_vol_million_m3) + ' mill. m³');
  $('statYear').textContent = d.latest_year || '—';
  $('statActive').textContent = d.active_sites_latest != null ? `${fmtM(d.active_sites_latest)} with a ${d.latest_year} detection` : '';
}

// ---- Map overlay (js/atlas.js)
const atlas = KaliabeAtlas.create($('atlas'), {
  layerBase: './layers/',
  onSelect: (s) => history.replaceState(null, '', `#site=${encodeURIComponent(s.site_id)}`),
  onClose: () => { if (location.hash.startsWith('#site=')) history.replaceState(null, '', location.pathname + location.search); },
});

function siteFromHash() {
  const m = location.hash.match(/^#site=(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ---- Sites: fetched once, shared by map + table
async function loadSites() {
  const d = await getJSON('/api/sites');
  const sites = d.sites || [];
  atlas.setSites(sites, d.meta);
  const yr = sites.reduce((y, s) => Math.max(y, s.latest_year || 0), 0);
  if (yr) $('mapYear').textContent = yr;
  renderTable(sites.slice(0, 200));
  const id = siteFromHash();
  if (id) { $('map').scrollIntoView(); atlas.select(id); }
}

function renderTable(rows) {
  $('siteBody').innerHTML = rows.map((s) => {
    const on = s.verdict === 'verified_flare';
    const t = s.trend_label || 'stable';
    const cls = t === 'rising' || t === 'new' ? 'trend-up' : t === 'falling' ? 'trend-down' : '';
    const arrow = { rising: '↑', falling: '↓', new: '↑', inactive: '·', stable: '→' }[t] || '→';
    const sub = [s.field_type && s.field_type !== 'NA' ? s.field_type : null, s.location ? s.location.toLowerCase() : null].filter(Boolean).join(' · ');
    return `<tr>
      <td><button class="sitebtn" type="button" data-site="${esc(s.site_id)}">${esc(s.field_name || s.site_id)}</button><br><span class="site-sub">${esc(sub)}</span></td>
      <td>${esc(s.operator)}</td>
      <td><span class="verdict ${on ? 'verdict--on' : 'verdict--off'}">${on ? 'Verified flare' : 'Unverified'}</span></td>
      <td class="num">${fmtM(s.latest_year_vol_million_m3)}</td>
      <td class="${cls}" title="${esc(s.trend_basis || '')}">${arrow} ${t}${s.trend_pct != null && t !== 'inactive' ? ` <span class="site-sub">${pct(s.trend_pct)}</span>` : ''}</td>
      <td class="num">${s.confidence ? Math.round(s.confidence * 100) + '%' : '—'}</td>
      <td class="num">${fmtUsd(s.penalty_usd_latest)}</td>
    </tr>`;
  }).join('');
}

$('siteBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-site]');
  if (!b) return;
  $('map').scrollIntoView({ behavior: 'smooth', block: 'start' });
  atlas.select(b.dataset.site);
});

// ---- Operators
let operators = [];
async function loadOperators() {
  const d = await getJSON('/api/operators');
  operators = d.operators || [];
  renderOperators();
}
function renderOperators() {
  const q = $('opFilter').value.trim().toLowerCase();
  const nd = $('ndOnly').checked;
  const ops = operators.filter((o) => (!nd || o.niger_delta_sites > 0) && o.operator.toLowerCase().includes(q));
  $('opCards').innerHTML = ops.map((o) => {
    const idle = 1 - o.active_sites / Math.max(1, o.sites);
    return `
    <article class="card">
      <div class="card__head">
        <h3 class="card__name">${esc(o.operator)}</h3>
        <span class="card__badge">${o.active_sites}/${o.sites} active</span>
      </div>
      <div class="card__rows">
        <span><b>Flare sites</b><b>${o.sites}</b></span>
        <span><b>Niger Delta</b><b>${o.niger_delta_sites}</b></span>
        <span><b>Latest vol.</b><b>${fmtM(o.total_vol_million_m3_latest)} mill. m³</b><i>${fmtBcm(o.total_vol_bcm_latest)}</i></span>
        <span><b>Penalty (est.)</b><b>${money(o.penalty_usd_latest, 'US$')}</b></span>
        <span><b>Idle sites</b><b>${Math.round(100 * idle)}%</b><i>no latest-year detection</i></span>
      </div>
    </article>`;
  }).join('') || '<p class="ops__note">No operators match.</p>';
}
$('opFilter').addEventListener('input', renderOperators);
$('ndOnly').addEventListener('change', renderOperators);

const fail = (where, html) => (err) => { console.error(err); $(where).innerHTML = html; };
loadSummary().catch((e) => console.error(e));
loadSites().catch(fail('siteBody', '<tr><td colspan="7">Site data temporarily unavailable.</td></tr>'));
loadOperators().catch(fail('opCards', '<p class="ops__note">Operator data temporarily unavailable.</p>'));
