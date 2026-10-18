// KCC 1.0: Kaliabe Commodity Cost Tracker quote engine. A separate surface from the
// Flare Tracker (KFL-M). Deterministic from bundled JSON: same inputs, same quote,
// reproducible by anyone from data/commodities.json + web/public/data/kcc/*.json.
// Parameters live in model.json (built by scripts/build_route_table.py); nothing is hidden here.
import COMMODITIES from '../../data/commodities.json';
import PLACES from '../../web/public/data/kcc/places.json';
import ROUTES from '../../web/public/data/kcc/routes.json';
import MODEL from '../../web/public/data/kcc/model.json';

export const KCC_VERSION = 'KCC 1.0';
export const KCC_CHANGES = 'KCC 1.0: first release of the Kaliabe Commodity Cost Tracker (/api/kcc/quote, kcc.html). Owned rate model (docs/METHODOLOGY-KCC.md), 13-commodity table, 30-place grid with an OSRM road-km table, NIPOST resolver layer (cache schema and fallback built; live NIPOST not reached). Separate from KFL-M: no Flare Tracker field, route or version changed.';
export const KCC_NOTE = 'Negotiation-planning ranges, not quotes. Every figure is an estimate built from open sources and stated assumptions; actual haulier prices vary with season, fuel, security, queues and counterparty.';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const byId = Object.fromEntries(PLACES.places.map((p) => [p.id, p]));
const idx = Object.fromEntries(ROUTES.ids.map((id, i) => [id, i]));
const POSTCODE = /^[A-Za-z]{2}[\s-]?\d{2}[\s-]?[A-Za-z0-9]{3}[\s-]?[A-Za-z]{2}[\s-]?\d{2}$/;
const rad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dp = rad(b.lat - a.lat), dl = rad(b.lon - a.lon);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dl / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

function nearest(pt) {
  let best = null;
  for (const p of PLACES.places) { const d = haversine(pt, p); if (!best || d < best.d) best = { p, d }; }
  return best;
}

export function resolvePlace(q) {
  const raw = String(q || '').trim();
  if (!raw) return { error: 'missing place' };
  if (POSTCODE.test(raw)) {
    return { error: 'postcode_not_in_bundle', detail: 'NIPOST postcodes resolve through data/nipost-cache/ at build time; this bundle holds no postcode entries yet (no NIPOST key was available when it was built). Give a place name and state instead.' };
  }
  const ll = raw.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (ll) {
    const pt = { lat: +ll[1], lon: +ll[2] };
    if (pt.lat < 4 || pt.lat > 14 || pt.lon < 2.5 || pt.lon > 15) return { error: 'outside_nigeria_bounds' };
    const n = nearest(pt);
    return { place: { id: null, name: `${pt.lat},${pt.lon}`, ...pt, state: n.p.state, zone: n.p.zone, kind: 'point', proxy_of: n.p.id }, how: `coordinates; state and zone borrowed from nearest bundled place ${n.p.name} (${Math.round(n.d)} km away): a proxy` };
  }
  const key = norm(raw);
  if (byId[raw]) return { place: byId[raw], how: 'id' };
  const parts = raw.split(',').map(norm);
  const name = parts[0], st = parts[1];
  const hits = PLACES.places.filter((p) => norm(p.name) === name || norm(p.id) === key);
  const ok = st ? hits.filter((p) => norm(p.state) === st) : hits;
  if (ok.length === 1) return { place: ok[0], how: 'bundled place grid' };
  if (!ok.length) return { error: 'unknown_place', detail: `Not in the bundled grid. Use one of the listed places or give "lat,lon".` };
  return { error: 'ambiguous_place', detail: 'Add the state after a comma.' };
}

const T = (t) => [t.low, t.central, t.high];
const prov = (t, extra = {}) => ({ low: t.low, central: t.central, high: t.high, unit: t.unit, source: t.source, vintage: t.vintage, assumed: t.assumed, ...extra });

function corridor(a, b, km) {
  const M = MODEL.corridor_factor, res = [];
  if (MODEL.niger_delta_states.includes(a.state) && MODEL.niger_delta_states.includes(b.state) && km < 250) res.push(['niger_delta_feeder', M.niger_delta_feeder]);
  if (a.kind === 'port' || b.kind === 'port') res.push(['port_hinterland', M.port_hinterland]);
  if (MODEL.north_zones.includes(a.zone) || MODEL.north_zones.includes(b.zone)) res.push(['north_long_haul', M.north_long_haul]);
  if (!res.length) res.push(['inland_default', M.inland_default]);
  res.sort((x, y) => y[1].central - x[1].central);
  return res[0];
}

function roadCond(a, b) {
  const R = MODEL.road_condition_proxy;
  const pick = (z) => R[z] || R.default;
  const x = pick(a.zone), y = pick(b.zone);
  return x.central >= y.central ? x : y;
}

const r0 = (v) => Math.round(v);
const r2 = (v) => Math.round(v * 100) / 100;

export function listMeta() {
  return {
    version: KCC_VERSION, note: KCC_NOTE,
    commodities: COMMODITIES.commodities.map((c) => ({ id: c.id, name: c.name })),
    places: PLACES.places.map((p) => ({ id: p.id, name: p.name, state: p.state, zone: p.zone, kind: p.kind })),
    inputs: 'from/to: place id, "Name, State", or "lat,lon". NIPOST postcodes are accepted by the resolver at build time only; see /methodology.',
  };
}

export function quote({ from, to, commodity, fx }) {
  const c = COMMODITIES.commodities.find((x) => x.id === commodity || norm(x.name) === norm(commodity));
  if (!c) return { status: 400, body: { error: 'unknown_commodity', commodities: COMMODITIES.commodities.map((x) => x.id) } };
  const A = resolvePlace(from), B = resolvePlace(to);
  if (A.error) return { status: A.error === 'postcode_not_in_bundle' ? 422 : 400, body: { error: A.error, which: 'from', detail: A.detail } };
  if (B.error) return { status: B.error === 'postcode_not_in_bundle' ? 422 : 400, body: { error: B.error, which: 'to', detail: B.detail } };
  const a = A.place, b = B.place;
  if (a.id && a.id === b.id) return { status: 400, body: { error: 'same_place' } };

  // distance
  const routedKm = a.id && b.id ? ROUTES.km[idx[a.id]][idx[b.id]] : null;
  const straight = haversine(a, b);
  let km, method, methodLabel;
  if (routedKm) {
    km = { low: routedKm * MODEL.routed_distance_band.low, central: routedKm, high: routedKm * MODEL.routed_distance_band.high };
    method = 'osrm_road';
    methodLabel = `Road distance from the OSRM public route table (OpenStreetMap data, ODbL), built ${ROUTES.built}; band reflects route choice and detours`;
  } else {
    const w = MODEL.winding_factor;
    km = { low: straight * w.low, central: straight * w.central, high: straight * w.high };
    method = 'haversine_winding';
    methodLabel = `Straight-line (Haversine) ${r0(straight)} km x winding factor ${w.low} / ${w.central} / ${w.high}, derived from our own OSRM table; no routed distance available for this pair`;
  }
  const effKm = Object.fromEntries(Object.entries(km).map(([k, v]) => [k, Math.max(v, MODEL.min_effective_km.value)]));

  const hc = COMMODITIES.handling_classes[c.handling_class];
  const [cname, cf] = corridor(a, b, km.central);
  const rc = roadCond(a, b);
  const rb = MODEL.rate_band_multiplier, anchor = MODEL.rate_anchor_usd_per_km.value;
  const pay = c.typical_truckload_t, vf = hc.vehicle_factor, hd = hc.handling_usd_per_tonne;

  const rate = { low: anchor * rb.low * vf.low, central: anchor * rb.central * vf.central, high: anchor * rb.high * vf.high };
  const haul = {
    low: (rate.low * effKm.low * cf.low * rc.low) / pay.high,
    central: (rate.central * effKm.central * cf.central * rc.central) / pay.central,
    high: (rate.high * effKm.high * cf.high * rc.high) / pay.low,
  };
  const total = { low: haul.low + hd.low, central: haul.central + hd.central, high: haul.high + hd.high };
  const rateFx = fx > 0 ? { value: fx, source: 'user-supplied ?fx=', vintage: 'request time', assumed: true } : MODEL.fx_ngn_per_usd;
  const unitKg = c.typical_unit.unit_mass_kg.value;
  const perTruck = { low: total.low * pay.central, central: total.central * pay.central, high: total.high * pay.central };

  const est = (obj, unit, f = r0) => ({ low: f(obj.low), central: f(obj.central), high: f(obj.high), unit });
  const srcRate = 'KCC rate model ' + KCC_VERSION + ' (docs/METHODOLOGY-KCC.md): ((anchor x band x vehicle factor) x km x corridor x road condition / payload) + handling. All inputs listed under components.';

  return { status: 200, body: {
    version: KCC_VERSION,
    note: KCC_NOTE,
    request: { from: a.name + (a.state ? ', ' + a.state : ''), to: b.name + (b.state ? ', ' + b.state : ''), commodity: c.id },
    resolved: { from: { ...pick(a), how: A.how }, to: { ...pick(b), how: B.how } },
    estimate: {
      per_tonne_usd: { ...est(total, 'USD per tonne'), source: srcRate, vintage: MODEL.built, assumed: true },
      per_tonne_ngn: { ...est({ low: total.low * rateFx.value, central: total.central * rateFx.value, high: total.high * rateFx.value }, 'NGN per tonne', (v) => Math.round(v / 100) * 100), source: `USD band x FX ${rateFx.value} NGN/USD (${rateFx.source})`, vintage: rateFx.vintage, assumed: true },
      per_truckload_usd: { ...est(perTruck, `USD per truckload (central payload ${pay.central} t)`), source: srcRate, vintage: MODEL.built, assumed: true },
      per_typical_unit_usd: { ...est({ low: total.low * unitKg / 1000, central: total.central * unitKg / 1000, high: total.high * unitKg / 1000 }, `USD per ${c.typical_unit.label}`, r2), source: srcRate, vintage: MODEL.built, assumed: true },
    },
    distance: { km: est(km, 'road km', (v) => Math.round(v)), method, method_label: methodLabel, straight_line_km: r0(straight), effective_km_floor: MODEL.min_effective_km.value, source: method === 'osrm_road' ? ROUTES.method : MODEL.winding_factor.source, vintage: ROUTES.built, assumed: method !== 'osrm_road' },
    components: [
      { name: 'Truck-km rate (anchor x band x vehicle factor)', ...prov({ ...rate, unit: 'USD per truck-km', source: `anchor ${anchor} USD/km: ${MODEL.rate_anchor_usd_per_km.source}; band ${rb.source}; vehicle factor: ${vf.source}`, vintage: MODEL.rate_anchor_usd_per_km.vintage, assumed: true }), anchor_verified: MODEL.rate_anchor_usd_per_km.verified },
      { name: 'Corridor factor: ' + cname.replace(/_/g, ' '), ...prov(cf) },
      { name: 'Road-condition factor (proxy)', ...prov(rc) },
      { name: 'Truckload (payload, t)', ...prov(pay), note: 'high payload pairs with the low estimate' },
      { name: 'Handling (loading and offloading), ' + c.handling_class.replace(/_/g, ' '), ...prov(hd) },
      { name: 'Density', ...prov(c.density_kg_m3), note: 'shown for reference; the model prices by tonne, not by volume' },
    ],
    haul_only_usd_per_tonne: est(haul, 'USD per tonne'),
    table_reference: { route_key: (a.id && b.id) ? `${a.id}>${b.id}` : null, route_table: '/data/kcc/routes.json', model: '/data/kcc/model.json', commodity_table: '/data/commodities.json (repo) ; commodity id ' + c.id, methodology: 'docs/METHODOLOGY-KCC.md' },
    commodity_note: c.note,
    fx: rateFx,
  } };
}

function pick(p) { return { id: p.id, name: p.name, state: p.state, zone: p.zone, kind: p.kind, lat: p.lat, lon: p.lon }; }
