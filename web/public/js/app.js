// Kaliabe Flare Ledger — frontend
// API base: worker URL (override with ?api=... for local/dev)
const API = new URLSearchParams(location.search).get('api') ||
  'https://kaliabe-flare.menashiconsulting.workers.dev';

const $ = (id) => document.getElementById(id);
const CSV_LINK = `${API}/api/digest.csv`;
const fmtM = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }));
const fmtUsd = (v) => (v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }));
const fmtBcm = (v) => (v == null ? '—' : Number(v).toFixed(3) + ' bcm');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadSummary() {
  const r = await fetch(`${API}/api/summary`);
  const d = await r.json();
  $('statSites').textContent = fmtM(d.sites);
  $('statND').textContent = fmtM(d.niger_delta_sites);
  $('statVol').textContent = d.latest_total_bcm ? fmtBcm(d.latest_total_bcm) : (fmtM(d.latest_total_vol_million_m3) + ' mill. m³');
  $('statYear').textContent = d.latest_year || '—';
}

let map, markers = [];
function initMap() {
  map = L.map('mapEl', { scrollWheelZoom: false }).setView([6.0, 6.5], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
}

function circleColor(v) { return v > 0 ? '#2e5d34' : '#9a927d'; }

async function loadMarkers() {
  const r = await fetch(`${API}/api/sites/trend`);
  const d = await r.json();
  const groups = { on: L.featureGroup().addTo(map), off: L.featureGroup().addTo(map) };
  for (const m of d.markers) {
    const vol = m.million_m3 || 0;
    const on = vol > 0;
    const radius = Math.min(22, 4 + Math.log1p(vol) * 2.2);
    const c = L.circleMarker([m.lat, m.lon], {
      radius: Math.max(3, radius),
      color: '#fff', weight: 1,
      fillColor: circleColor(vol), fillOpacity: 0.85,
    });
    c.bindPopup(
      `<div class="site-pop"><h4>${esc(m.operator || 'Unattributed')}</h4>` +
      `<p>${m.year} flare volume: <b>${fmtM(vol)} mill. m³</b>${m.bcm ? ' · ' + fmtBcm(m.bcm) : ''}</p>` +
      `<p>Status: <b>${on ? 'Active flare verified' : 'Unverified / below floor'}</b></p></div>`
    );
    c.addTo(groups[on ? 'on' : 'off']);
    markers.push({ ...m, on });
  }
  map.fitBounds(Object.values(groups).reduce((b, g) => (g.leaflet && b.extend(g.getBounds())) || b, L.latLngBounds([])));
}

async function loadOperators(ndOnly) {
  const r = await fetch(`${API}/api/operators`);
  const d = await r.json();
  const ops = (d.operators || []).filter((o) => !ndOnly || o.niger_delta_sites > 0);
  $('opCards').innerHTML = ops.map((o) => `
    <article class="card">
      <div class="card__head">
        <h3 class="card__name">${esc(o.operator)}</h3>
        <span class="card__badge">${o.active_sites}/${o.sites} active</span>
      </div>
      <div class="card__rows">
        <span><b>Flare sites</b><b>${o.sites}</b></span>
        <span><b>Niger Delta</b><b>${o.niger_delta_sites}</b></span>
        <span><b>Latest vol.</b><b>${fmtM(o.total_vol_m3_latest)} mill. m³</b></span>
        <span><b>≈ ${fmtBcm(o.total_vol_bcm_latest)}</b><b></b></span>
        <span><b>Penalty (est. US$)</b><b>${fmtUsd(o.penalty_usd_latest)}</b></span>
        <span><b>Compliance</b><b class="${o.active_sites / Math.max(1, o.sites) < 0.5 ? 'trend-up' : 'trend-down'}">${Math.round(100 * (1 - o.active_sites / Math.max(1, o.sites)))}% idle</b></span>
      </div>
    </article>`).join('');
}

async function loadSites() {
  const r = await fetch(`${API}/api/sites`);
  const d = await r.json();
  const rows = (d.sites || []).slice(0, 200);
  $('siteBody').innerHTML = rows.map((s) => {
    const on = s.verdict === 'verified_flare';
    const tUp = s.trend_pct > 5, tDown = s.trend_pct < -5;
    return `<tr>
      <td><b>${esc(s.field_name || s.site_id)}</b><br><span class="site-sub">${esc(s.operator)}</span></td>
      <td>${esc(s.operator)}</td>
      <td><span class="verdict ${on ? 'verdict--on' : 'verdict--off'}">${on ? 'Verified flare' : 'Unverified'}</span></td>
      <td>${fmtM(s.latest_year_vol_million_m3)}</td>
      <td class="${tUp ? 'trend-up' : tDown ? 'trend-down' : ''}">${tUp ? '↑' : tDown ? '↓' : '—'} ${s.trend_label || ''}</td>
      <td>${s.confidence ? Math.round(s.confidence * 100) + '%' : '—'}</td>
      <td>${fmtUsd(s.penalty_usd_latest)}</td>
    </tr>`;
  }).join('');
}

function bindFilters() {
  const dl = document.querySelector('a[download]');
  if (dl) dl.href = CSV_LINK;
  $('opFilter').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#opCards .card').forEach((card) => {
      card.style.display = card.querySelector('.card__name').textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  $('ndOnly').addEventListener('change', (e) => loadOperators(e.target.checked));
}

initMap();
loadSummary();
loadMarkers();
loadOperators(false);
loadSites();
bindFilters();