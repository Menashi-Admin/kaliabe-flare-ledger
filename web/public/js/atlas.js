/* Kaliabe Atlas — the ledger's own overlay layer system, drawn on Leaflet.
 *
 * Owns: custom layer panel (toggles, legends, counts, sources), basemap switch,
 * flare symbolisation (area ∝ volume, colour by verdict), the per-flare detail
 * drawer (series sparkline, verdict, penalty, emissions, sources), and the
 * client-side spatial context (state / LGA point-in-polygon, nearest pipeline).
 * No third-party overlay plugins; Leaflet supplies only the slippy map.
 */
(function (global) {
  'use strict';

  const C = { ink: '#1c1a16', soft: '#5c5749', accent: '#b5761e', off: '#9a927d', paper: '#f5f1e8' };

  // ---------------------------------------------------------------- format
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
  const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const clean = (s) => String(s == null ? '' : s).trim();

  // -------------------------------------------------------------- geometry
  // Equirectangular km projection around the query latitude — accurate to well
  // under 1% at Nigeria's latitudes over the tens-of-km distances we report.
  function proj(lat0) {
    const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180), ky = 110.574;
    return (lon, lat) => [lon * kx, lat * ky];
  }
  function bboxOf(coords, b = [Infinity, Infinity, -Infinity, -Infinity]) {
    if (typeof coords[0] === 'number') {
      if (coords[0] < b[0]) b[0] = coords[0]; if (coords[1] < b[1]) b[1] = coords[1];
      if (coords[0] > b[2]) b[2] = coords[0]; if (coords[1] > b[3]) b[3] = coords[1];
      return b;
    }
    for (const c of coords) bboxOf(c, b);
    return b;
  }
  function ringHas(ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const polyHas = (rings, x, y) => ringHas(rings[0], x, y) && !rings.slice(1).some((h) => ringHas(h, x, y));
  function geomHas(g, x, y) {
    if (g.type === 'Polygon') return polyHas(g.coordinates, x, y);
    if (g.type === 'MultiPolygon') return g.coordinates.some((p) => polyHas(p, x, y));
    return false;
  }
  function linesOf(g) {
    switch (g.type) {
      case 'LineString': return [g.coordinates];
      case 'MultiLineString': return g.coordinates;
      case 'Polygon': return g.coordinates;
      case 'MultiPolygon': return g.coordinates.flat();
      default: return [];
    }
  }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function distKm(entry, lon, lat) {
    const P = proj(lat), [px, py] = P(lon, lat);
    let best = Infinity;
    for (const line of entry.lines) {
      let [ax, ay] = P(line[0][0], line[0][1]);
      for (let i = 1; i < line.length; i++) {
        const [bx, by] = P(line[i][0], line[i][1]);
        const d = segDist(px, py, ax, ay, bx, by);
        if (d < best) best = d;
        ax = bx; ay = by;
      }
    }
    return best;
  }
  const indexOf = (gj) => gj.features.map((f) => ({ f, bbox: bboxOf(f.geometry.coordinates), lines: linesOf(f.geometry) }));
  function locate(index, lon, lat) {
    for (const e of index) {
      const b = e.bbox;
      if (lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3] && geomHas(e.f.geometry, lon, lat)) return e;
    }
    return null;
  }
  function nearest(index, lon, lat) {
    let best = null;
    for (const e of index) {
      const d = distKm(e, lon, lat);
      if (!best || d < best.km) best = { e, km: d };
    }
    return best;
  }

  // ------------------------------------------------------------- symbology
  const radius = (v) => (v > 0 ? Math.min(26, 2.6 + Math.sqrt(v) * 0.95) : 3); // area ∝ volume
  const PIPE = {
    'Oil': { dashArray: null, label: 'Oil' },
    'Gas/Condensate': { dashArray: '5 3', label: 'Gas / condensate' },
    'Refined Product': { dashArray: '1 3', label: 'Refined product' },
  };
  const pipeStyle = (p) => ({ color: C.ink, weight: 1.3, opacity: 0.62, dashArray: (PIPE[p.DsgAttr01] || {}).dashArray, lineCap: 'round' });
  function pipeName(p) {
    const o = clean(p.DsgAttr02), d = clean(p.DsgAttr03);
    if (o && d) return `${o} → ${d}`;
    return o || d || 'Unnamed segment';
  }

  // ------------------------------------------------------------- sparkline
  // Hand-rolled SVG bars; brackets mark the trend's baseline and recent windows.
  function sparkline(series) {
    const W = 320, H = 98, top = 16, base = 64, n = series.length;
    if (!n) return '';
    const vals = series.map((s) => s.million_m3 || 0);
    const max = Math.max(...vals) || 1;
    const bw = W / n;
    const bars = series.map((s, i) => {
      const v = s.million_m3 || 0, x = i * bw + 1.5, w = Math.max(1, bw - 3);
      const last = i === n - 1;
      const tip = `<title>${s.year} · ${num(v, 2)} million m³</title>`;
      if (v <= 0) return `<g><rect x="${x}" y="${base - 1}" width="${w}" height="1" fill="${C.off}"/><rect x="${x}" y="${top}" width="${w}" height="${base - top}" fill="transparent">${tip}</rect></g>`;
      const h = Math.max(1.5, (v / max) * (base - top));
      return `<rect x="${x}" y="${base - h}" width="${w}" height="${h}" fill="${last ? C.accent : C.ink}" fill-opacity="${last ? 1 : 0.72}">${tip}</rect>`;
    }).join('');
    let brackets = '';
    if (n >= 4) {
      const k = 3, e0 = Math.max(0, n - k - 5);
      const br = (a, b, col, lbl) => {
        const x1 = a * bw + 1.5, x2 = b * bw - 1.5;
        return `<path d="M${x1} 70v3H${x2}v-3" fill="none" stroke="${col}" stroke-width="1"/><text x="${(x1 + x2) / 2}" y="83" text-anchor="middle" fill="${col}">${lbl}</text>`;
      };
      brackets = br(e0, n - k, C.off, 'baseline') + br(n - k, n, C.accent, 'recent');
    }
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Flared volume by year, ${series[0].year}–${series[n - 1].year}">
      <text x="0" y="9" fill="${C.soft}">peak ${num(max, 1)}</text>
      <line x1="0" x2="${W}" y1="${base + 0.5}" y2="${base + 0.5}" stroke="${C.ink}" stroke-opacity=".25"/>
      ${bars}${brackets}
      <text x="0" y="${H - 2}" fill="${C.soft}">${series[0].year}</text>
      <text x="${W}" y="${H - 2}" text-anchor="end" fill="${C.soft}">${series[n - 1].year}</text>
    </svg>`;
  }

  // ----------------------------------------------------------------- atlas
  function create(root, opts = {}) {
    const layerBase = opts.layerBase || './layers/';
    root.classList.add('atlas');
    root.innerHTML = `
      <div class="atlas__map" role="application" aria-label="Niger Delta flare site map"></div>
      <aside class="layers" aria-label="Map layers">
        <button class="layers__head" type="button" aria-expanded="true">
          <span class="layers__title">Layers</span><span class="layers__fold" aria-hidden="true"></span>
        </button>
        <div class="layers__body">
          <ul class="layers__list"></ul>
          <div class="basemap" role="radiogroup" aria-label="Basemap">
            <span class="basemap__label">Base</span>
          </div>
        </div>
      </aside>
      <aside class="drawer" aria-hidden="true" aria-labelledby="drawerTitle" tabindex="-1"></aside>`;
    const mapEl = root.querySelector('.atlas__map');
    const panel = root.querySelector('.layers');
    const list = root.querySelector('.layers__list');
    const drawer = root.querySelector('.drawer');

    const map = L.map(mapEl, { scrollWheelZoom: false, zoomControl: false, attributionControl: true, minZoom: 5, maxZoom: 16 })
      .setView([5.4, 6.4], 8);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix(false);
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());

    // Panes = explicit z-order for our overlay stack.
    [['lgas', 405], ['states', 410], ['pipes', 420], ['context', 430], ['flares', 450], ['halo', 460]]
      .forEach(([n, z]) => { map.createPane(n).style.zIndex = z; });
    map.getPane('context').style.pointerEvents = 'none';
    map.getPane('halo').style.pointerEvents = 'none';
    map.getPane('lgas').style.pointerEvents = 'none';
    map.getPane('states').style.pointerEvents = 'none';

    // ---- basemaps (OSM tiles; "Paper" is our own tonal treatment of them)
    const osm = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    const BASES = [
      { id: 'osm', label: 'OSM', layer: osm() },
      { id: 'paper', label: 'Paper', layer: osm() },
      { id: 'none', label: 'None', layer: null },
    ];
    let base = null;
    function setBase(id) {
      BASES.forEach((b) => b.layer && map.hasLayer(b.layer) && map.removeLayer(b.layer));
      base = BASES.find((b) => b.id === id) || BASES[0];
      if (base.layer) base.layer.addTo(map).bringToBack();
      root.dataset.base = base.id;
      panel.querySelectorAll('.basemap__opt').forEach((o) => o.setAttribute('aria-checked', String(o.dataset.base === base.id)));
    }
    const bm = panel.querySelector('.basemap');
    BASES.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'basemap__opt'; btn.dataset.base = b.id;
      btn.setAttribute('role', 'radio'); btn.textContent = b.label;
      btn.addEventListener('click', () => setBase(b.id));
      bm.appendChild(btn);
    });
    setBase('osm');

    // ---- layer registry
    const flareRenderer = L.svg({ pane: 'flares', padding: 0.4 });
    const lgaRenderer = L.canvas({ pane: 'lgas', padding: 0.4 });
    const state = {
      sites: [], byId: new Map(), meta: {}, selected: null,
      verdictOn: { verified_flare: true, unverified: true },
      idx: { states: null, lgas: null, pipes: null }, failed: {},
      geo: { states: null, lgas: null, pipes: null },
    };
    const layers = {
      flares: { group: L.layerGroup(), on: true },
      pipes: { group: L.layerGroup(), on: true },
      states: { group: L.layerGroup(), on: true },
      lgas: { group: L.layerGroup(), on: false },
    };
    const ctx = L.layerGroup().addTo(map);   // selection context (pipeline / LGA highlight)
    const halo = L.layerGroup().addTo(map);

    const DEFS = [
      { id: 'flares', name: 'Flare sites', src: 'World Bank GFMR · NOAA VIIRS Nightfire', lic: 'Free with attribution' },
      { id: 'pipes', name: 'Oil & gas pipelines', src: 'USGS Africa O&G infrastructure', lic: 'Public domain', file: 'nga-pipelines.geojson' },
      { id: 'states', name: 'States', src: 'geoBoundaries ADM1 · GRID3', lic: 'CC BY 4.0', file: 'nga-states.geojson' },
      { id: 'lgas', name: 'Local Government Areas', src: 'geoBoundaries ADM2 · GRID3', lic: 'CC BY 4.0', file: 'nga-lgas.geojson' },
    ];
    const swatch = {
      flares: `<svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="${C.accent}"/></svg>`,
      pipes: `<svg viewBox="0 0 14 14"><path d="M1 10 13 4" stroke="${C.ink}" stroke-width="1.4"/></svg>`,
      states: `<svg viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="${C.ink}" stroke-opacity=".6"/></svg>`,
      lgas: `<svg viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke="${C.soft}" stroke-dasharray="2 2"/></svg>`,
    };
    for (const d of DEFS) {
      const li = document.createElement('li');
      li.className = 'layer'; li.dataset.layer = d.id;
      li.innerHTML = `
        <label class="layer__row">
          <input type="checkbox" ${layers[d.id].on ? 'checked' : ''} />
          <span class="layer__sw" aria-hidden="true">${swatch[d.id]}</span>
          <span class="layer__name">${d.name}</span>
          <span class="layer__count" data-count>…</span>
        </label>
        <div class="layer__legend" data-legend></div>
        <p class="layer__src">${d.src} · ${d.lic}</p>`;
      li.querySelector('input').addEventListener('change', (e) => toggle(d.id, e.target.checked));
      list.appendChild(li);
    }
    const row = (id) => list.querySelector(`[data-layer="${id}"]`);
    const setCount = (id, txt) => { row(id).querySelector('[data-count]').textContent = txt; };

    panel.querySelector('.layers__head').addEventListener('click', (e) => {
      const open = panel.classList.toggle('is-folded') === false;
      e.currentTarget.setAttribute('aria-expanded', String(open));
    });
    if (matchMedia('(max-width: 720px)').matches) {
      panel.classList.add('is-folded');
      panel.querySelector('.layers__head').setAttribute('aria-expanded', 'false');
    }
    L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel);
    L.DomEvent.disableClickPropagation(drawer); L.DomEvent.disableScrollPropagation(drawer);

    async function ensure(id) {
      if (id === 'flares' || state.geo[id]) return state.geo[id];
      if (state.geo[id + '_p']) return state.geo[id + '_p'];
      const def = DEFS.find((d) => d.id === id);
      setCount(id, '…');
      const p = fetch(layerBase + def.file).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((gj) => {
        state.geo[id] = gj;
        state.idx[id] = indexOf(gj);
        build(id, gj);
        setCount(id, num(gj.features.length, 0));
        return gj;
      }).catch((err) => { state.failed[id] = true; setCount(id, 'n/a'); row(id).classList.add('is-error'); console.warn('layer', id, err); });
      state.geo[id + '_p'] = p;
      return p;
    }

    function build(id, gj) {
      const g = layers[id].group;
      if (id === 'states') {
        L.geoJSON(gj, { pane: 'states', interactive: false, style: { color: C.ink, weight: 0.9, opacity: 0.5, fill: false } }).addTo(g);
      } else if (id === 'lgas') {
        L.geoJSON(gj, { pane: 'lgas', renderer: lgaRenderer, interactive: false, style: { color: C.soft, weight: 0.5, opacity: 0.45, dashArray: '2 3', fill: false } }).addTo(g);
      } else if (id === 'pipes') {
        L.geoJSON(gj, {
          pane: 'pipes',
          style: (f) => pipeStyle(f.properties),
          onEachFeature: (f, lyr) => {
            const p = f.properties;
            lyr.bindTooltip(`<b>${esc(pipeName(p))}</b><br>${esc((PIPE[p.DsgAttr01] || {}).label || p.DsgAttr01 || 'Pipeline')}${p.DsgAttr04 ? ` · ${esc(p.DsgAttr04)} km long` : ''}`, { className: 'kfl-tip', sticky: true, direction: 'top', offset: [0, -6] });
            lyr.on('mouseover', () => lyr.setStyle({ opacity: 1, weight: 2.4 }));
            lyr.on('mouseout', () => lyr.setStyle(pipeStyle(p)));
          },
        }).addTo(g);
        const counts = {};
        gj.features.forEach((f) => { counts[f.properties.DsgAttr01] = (counts[f.properties.DsgAttr01] || 0) + 1; });
        row('pipes').querySelector('[data-legend]').innerHTML = Object.entries(PIPE).map(([k, v]) =>
          `<span class="lg"><svg viewBox="0 0 22 8"><path d="M1 4H21" stroke="${C.ink}" stroke-width="1.4" ${v.dashArray ? `stroke-dasharray="${v.dashArray}"` : ''} stroke-linecap="round"/></svg>${v.label}<em>${counts[k] || 0}</em></span>`).join('');
      }
    }

    function toggle(id, on) {
      layers[id].on = on;
      if (on) { ensure(id); layers[id].group.addTo(map); } else map.removeLayer(layers[id].group);
      row(id).classList.toggle('is-off', !on);
    }
    Object.keys(layers).forEach((id) => { if (layers[id].on) layers[id].group.addTo(map); else row(id).classList.add('is-off'); });

    // ---- flares
    const markers = new Map();
    function drawFlares() {
      const g = layers.flares.group;
      g.clearLayers(); markers.clear();
      // Largest first so small flares stay on top and clickable.
      const sorted = [...state.sites].sort((a, b) => (b.latest_year_vol_million_m3 || 0) - (a.latest_year_vol_million_m3 || 0));
      for (const s of sorted) {
        if (!state.verdictOn[s.verdict]) continue;
        const v = s.latest_year_vol_million_m3 || 0, on = s.verdict === 'verified_flare';
        const m = L.circleMarker([s.lat, s.lon], {
          renderer: flareRenderer, radius: radius(v), bubblingMouseEvents: false,
          color: on ? C.paper : C.off, weight: on ? 0.8 : 1.2, opacity: 1,
          fillColor: on ? C.accent : C.paper, fillOpacity: on ? 0.82 : 0.9,
        });
        m.bindTooltip(`<b>${esc(s.field_name || s.site_id)}</b> · ${esc(s.operator)}<br>${s.latest_year}: ${on ? num(v, 1) + ' million m³' : 'below detection floor'}`, { className: 'kfl-tip', direction: 'top', offset: [0, -radius(v)] });
        m.on('click', () => select(s.site_id));
        m.addTo(g);
        markers.set(s.site_id, m);
      }
    }
    function flareLegend() {
      const nOn = state.sites.filter((s) => s.verdict === 'verified_flare').length;
      const nOff = state.sites.length - nOn;
      const sizes = [10, 100, 400];
      const lg = row('flares').querySelector('[data-legend]');
      lg.innerHTML = `
        <button type="button" class="lg lg--btn" data-v="verified_flare" aria-pressed="${state.verdictOn.verified_flare}">
          <svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="${C.accent}"/></svg>Verified flare<em>${nOn}</em></button>
        <button type="button" class="lg lg--btn" data-v="unverified" aria-pressed="${state.verdictOn.unverified}">
          <svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="3.2" fill="${C.paper}" stroke="${C.off}" stroke-width="1.2"/></svg>Below floor<em>${nOff}</em></button>
        <span class="lg lg--size" title="Circle area is proportional to latest-year flared volume">
          ${sizes.map((v) => { const r = radius(v); return `<svg viewBox="0 0 ${2 * r + 2} ${2 * r + 2}" width="${2 * r + 2}" height="${2 * r + 2}"><circle cx="${r + 1}" cy="${r + 1}" r="${r}" fill="none" stroke="${C.ink}" stroke-opacity=".55"/></svg>`; }).join('')}
          <span>${sizes.join(' · ')} million m³</span></span>`;
      lg.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
        state.verdictOn[b.dataset.v] = !state.verdictOn[b.dataset.v];
        b.setAttribute('aria-pressed', String(state.verdictOn[b.dataset.v]));
        drawFlares();
      }));
      setCount('flares', num(state.sites.length, 0));
    }

    // ---- selection + drawer
    function context(s) {
      const out = { state: null, stateNearest: null, lga: null, lgaNearest: null, pipe: null, pipesWithin10: 0 };
      if (state.idx.states) {
        const hit = locate(state.idx.states, s.lon, s.lat);
        if (hit) out.state = hit.f;
        else { const n = nearest(state.idx.states, s.lon, s.lat); if (n) out.stateNearest = { f: n.e.f, km: n.km }; }
      }
      if (state.idx.lgas) {
        const hit = locate(state.idx.lgas, s.lon, s.lat);
        if (hit) out.lga = hit.f;
        else { const n = nearest(state.idx.lgas, s.lon, s.lat); if (n) out.lgaNearest = { f: n.e.f, km: n.km }; }
      }
      if (state.idx.pipes) {
        let best = null;
        for (const e of state.idx.pipes) {
          const km = distKm(e, s.lon, s.lat);
          if (km <= 10) out.pipesWithin10++;
          if (!best || km < best.km) best = { f: e.f, km };
        }
        out.pipe = best;
      }
      return out;
    }

    const kmTxt = (km) => (km < 1 ? `${num(km * 1000, 0)} m` : `${num(km, km < 10 ? 1 : 0)} km`);

    function renderDrawer(s) {
      const m = state.meta || {};
      const on = s.verdict === 'verified_flare';
      const series = s.year_series || [];
      const detYears = series.filter((y) => y.million_m3 > 0).length;
      const v = s.latest_year_vol_million_m3 || 0;
      const mmscfd = (v * 35.3146667) / 365;
      const tl = s.trend_label || 'stable';
      const arrow = { rising: '↑', falling: '↓', new: '↑', inactive: '·', stable: '→' }[tl] || '→';
      const tcls = tl === 'rising' || tl === 'new' ? 'trend-up' : tl === 'falling' ? 'trend-down' : '';
      const fx = m.ngn_per_usd_indicative || 1550;
      const c = context(s);
      const lat = `${num(Math.abs(s.lat), 5)}° ${s.lat >= 0 ? 'N' : 'S'}`, lon = `${num(Math.abs(s.lon), 5)}° ${s.lon >= 0 ? 'E' : 'W'}`;

      const stateTxt = c.state ? esc(c.state.properties.shapeName)
        : c.stateNearest ? `Outside state boundaries <span class="kv__sub">nearest: ${esc(c.stateNearest.f.properties.shapeName)}, ${kmTxt(c.stateNearest.km)}</span>`
          : state.idx.states ? '—' : state.failed.states ? 'Layer unavailable' : '<span class="kv__sub">loading…</span>';
      const lgaTxt = c.lga ? esc(c.lga.properties.shapeName)
        : c.lgaNearest ? `Outside LGA boundaries <span class="kv__sub">nearest: ${esc(c.lgaNearest.f.properties.shapeName)}, ${kmTxt(c.lgaNearest.km)}</span>`
          : state.idx.lgas ? '—' : state.failed.lgas ? 'Layer unavailable' : '<span class="kv__sub">loading…</span>';
      let pipeHtml = '<div><dt>Nearest pipeline</dt><dd><span class="kv__sub">loading…</span></dd></div>';
      if (c.pipe) {
        const p = c.pipe.f.properties;
        pipeHtml = `
          <div><dt>Nearest pipeline</dt><dd>${esc(pipeName(p))}</dd></div>
          <div><dt>Commodity</dt><dd>${esc((PIPE[p.DsgAttr01] || {}).label || p.DsgAttr01 || '—')}${p.DsgAttr04 ? ` <span class="kv__sub">segment ${esc(p.DsgAttr04)} km long</span>` : ''}</dd></div>
          <div><dt>Distance</dt><dd>${kmTxt(c.pipe.km)}</dd></div>
          <div><dt>Within 10 km</dt><dd>${c.pipesWithin10} pipeline segment${c.pipesWithin10 === 1 ? '' : 's'}</dd></div>`;
      } else if (state.idx.pipes || state.failed.pipes) {
        pipeHtml = `<div><dt>Nearest pipeline</dt><dd>${state.failed.pipes ? 'Layer unavailable' : '—'}</dd></div>`;
      }

      drawer.innerHTML = `
        <header class="drawer__head">
          <p class="drawer__kicker">Flare site <span class="mono">${esc(s.site_id)}</span></p>
          <button class="drawer__close" type="button" aria-label="Close site record">×</button>
        </header>
        <h3 class="drawer__title" id="drawerTitle">${esc(s.field_name || s.site_id)}</h3>
        <p class="drawer__op">${esc(s.operator)}</p>
        <p class="drawer__verdict">
          <span class="verdict ${on ? 'verdict--on' : 'verdict--off'}">${on ? 'Verified flare' : 'Unverified · below floor'}</span>
          <span class="drawer__conf">${Math.round((s.confidence || 0) * 100)}% confidence<sup>5</sup></span>
        </p>

        <div class="fig">
          <p class="fig__label">${s.latest_year} flared volume<sup>1</sup></p>
          <p class="fig__value">${num(v, 1)}<span> million m³</span></p>
          <p class="fig__sub">${num(s.latest_year_bcm, 3)} bcm · ${num(mmscfd, 1)} MMscfd</p>
        </div>
        ${sparkline(series)}
        <p class="drawer__trend"><span class="${tcls}">${arrow} ${titleCase(tl)}${s.trend_pct != null ? ' ' + pct(s.trend_pct) : ''}</span><sup>2</sup>
          <span class="kv__sub">${esc(s.trend_basis || m.trend_method || '')}</span></p>

        <dl class="facts">
          <div><dt>Penalty estimate<sup>3</sup></dt><dd>${money(s.penalty_usd_latest, 'US$')}</dd><dd class="kv__sub">≈ ${money(s.penalty_ngn_latest, '₦')} indicative</dd></div>
          <div><dt>CO₂e<sup>4</sup></dt><dd>${num(s.co2e_tonnes_latest, 0)} t</dd><dd class="kv__sub">${s.latest_year}</dd></div>
          <div><dt>Methane-equiv.<sup>4</sup></dt><dd>${num(s.methane_tonnes_equivalent_latest, 0)} t</dd><dd class="kv__sub">CH₄, ${s.latest_year}</dd></div>
        </dl>
        <p class="drawer__floor"><b>Detection floor<sup>5</sup></b>${esc(s.detection_floor)}</p>

        <h4 class="drawer__h">Site</h4>
        <dl class="kv">
          <div><dt>Field type</dt><dd>${esc(s.field_type && s.field_type !== 'NA' ? s.field_type : 'Not stated')}</dd></div>
          <div><dt>Location</dt><dd>${esc(titleCase(s.location || '—'))}</dd></div>
          <div><dt>Niger Delta</dt><dd>${s.in_niger_delta ? 'Yes' : 'No'} <span class="kv__sub">study box 4.5–8.5° E, 4.5–7.0° N</span></dd></div>
          <div><dt>Coordinates</dt><dd class="mono">${lat}, ${lon}</dd></div>
          <div><dt>Record</dt><dd>${series.length ? `${series[0].year}–${series[series.length - 1].year}` : '—'} <span class="kv__sub">${detYears} of ${series.length} yrs detected</span></dd></div>
        </dl>

        <h4 class="drawer__h">Administrative context<sup>6</sup></h4>
        <dl class="kv">
          <div><dt>State</dt><dd>${stateTxt}</dd></div>
          <div><dt>LGA</dt><dd>${lgaTxt}</dd></div>
        </dl>

        <h4 class="drawer__h">Nearby infrastructure<sup>7</sup></h4>
        <dl class="kv">${pipeHtml}</dl>

        <ol class="drawer__src">
          <li>World Bank GFMR, flare volume estimates by individual flare location 2012–2025; NOAA VIIRS Nightfire (EOG, Payne Institute). Values in million m³; bcm = million m³ ÷ 1,000.</li>
          <li>Kaliabe derivation from (1): ${esc(m.trend_method || 'mean of last 3 yrs vs preceding up to 5 yrs')}.</li>
          <li>NUPRC Flare Gas (Prevention of Waste and Pollution) Regulations 2022: US$${m.penalty_usd_per_1000scf || 2}.00 per 1,000 scf (${m.m3_per_1000scf || 28.317} m³), on the ${s.latest_year} volume. ₦ at an indicative ${num(fx, 0)}/US$. A derived estimate, not an NUPRC assessment.</li>
          <li>GFMR 2025 global ratios: 151 bcm ≈ 389 Mt CO₂e incl. 46 Mt CH₄. Order-of-magnitude.</li>
          <li>Kaliabe verdict method; see <a href="methodology.html">methodology</a>.</li>
          <li>geoBoundaries gbOpen NGA ADM1/ADM2 (GRID3), CC BY 4.0. Point-in-polygon computed in your browser.</li>
          <li>USGS Africa oil &amp; gas infrastructure (attributes: Cross-border Information / African Energy), public domain. Nearest-line distance computed in your browser.</li>
        </ol>`;
      drawer.querySelector('.drawer__close').addEventListener('click', close);

      // Selection context on the map.
      ctx.clearLayers();
      if (c.pipe) L.geoJSON(c.pipe.f, { pane: 'context', interactive: false, style: { color: C.accent, weight: 3.2, opacity: 0.95, lineCap: 'round' } }).addTo(ctx);
      const admin = c.lga || c.state;
      if (admin) L.geoJSON(admin, { pane: 'context', interactive: false, style: { color: C.ink, weight: 1.4, opacity: 0.7, fillColor: C.accent, fillOpacity: 0.05 } }).addTo(ctx);
    }

    function select(id, { pan = true } = {}) {
      const s = state.byId.get(id);
      if (!s) return;
      state.selected = id;
      renderDrawer(s);
      root.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      drawer.scrollTop = 0;
      halo.clearLayers();
      const r = radius(s.latest_year_vol_million_m3 || 0);
      L.circleMarker([s.lat, s.lon], { pane: 'halo', interactive: false, radius: r + 5, color: C.ink, weight: 1.4, fill: false }).addTo(halo);
      L.circleMarker([s.lat, s.lon], { pane: 'halo', interactive: false, radius: r + 9, color: C.ink, weight: 0.6, opacity: 0.5, fill: false }).addTo(halo);
      if (pan) {
        // Keep the site inside the map area left uncovered by panel + drawer;
        // if it falls outside, centre it there.
        const mobile = matchMedia('(max-width: 720px)').matches;
        if (map.getZoom() < 9) map.setView([s.lat, s.lon], 9, { animate: false });
        const size = map.getSize();
        const free = mobile
          ? { x0: 16, y0: 64, x1: size.x - 16, y1: size.y - drawer.offsetHeight - 16 }
          : { x0: 264, y0: 24, x1: size.x - drawer.offsetWidth - 24, y1: size.y - 24 };
        const pt = map.latLngToContainerPoint([s.lat, s.lon]);
        if (pt.x < free.x0 || pt.x > free.x1 || pt.y < free.y0 || pt.y > free.y1) {
          map.panBy([pt.x - (free.x0 + free.x1) / 2, pt.y - (free.y0 + free.y1) / 2], { animate: !mobile });
        }
      }
      // Context layers may still be loading; re-render once they land.
      Promise.all([ensure('states'), ensure('pipes'), ensure('lgas')]).then(() => { if (state.selected === id) renderDrawer(s); });
      if (opts.onSelect) opts.onSelect(s);
    }

    function close() {
      state.selected = null;
      root.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      halo.clearLayers(); ctx.clearLayers();
      if (opts.onClose) opts.onClose();
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.selected) close(); });
    map.on('click', () => state.selected && close());

    // ---- public API
    function setSites(sites, meta) {
      state.sites = sites; state.meta = meta || {};
      state.byId = new Map(sites.map((s) => [s.site_id, s]));
      drawFlares(); flareLegend();
      // Frame the Delta and its offshore fields; the lone inland site (Obi Ayima,
      // ~10°N) stays on the map but would otherwise halve the opening zoom.
      const framed = sites.filter((s) => s.lat < 8);
      const b = L.latLngBounds((framed.length ? framed : sites).map((s) => [s.lat, s.lon]));
      const mobile = matchMedia('(max-width: 720px)').matches;
      if (b.isValid()) map.fitBounds(b, { animate: false, paddingTopLeft: [mobile ? 16 : 260, mobile ? 64 : 16], paddingBottomRight: [16, 16] });
    }
    // Eager: states + pipelines (small). LGAs fetched once the page is idle.
    ensure('states'); ensure('pipes');
    (global.requestIdleCallback || ((f) => setTimeout(f, 1200)))(() => ensure('lgas'));

    return { map, setSites, select, close, get selected() { return state.selected; } };
  }

  global.KaliabeAtlas = { create, sparkline, util: { num, money, pct, esc } };
})(window);
