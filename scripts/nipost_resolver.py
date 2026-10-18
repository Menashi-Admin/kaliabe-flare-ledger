"""KCC 1.0: place resolver. NIPOST postcode first, place name + state fallback.

Order of resolution for one place:
  1. A NIPOST postcode, if given AND NIPOST_API_KEY is set in the environment:
       GET /v1/lookup?code=..&level=1   (free, no credits; validity only)
       GET /v1/reference/states, /v1/reference/lgas?state=..  (free)
     The postcode itself encodes state (AA) and LGA (99), so state and LGA names
     come from the free reference lists. Locality and zone (administrative
     address) are Lookup L2, which spends credits: only requested with
     allow_credits=True (default False). Coordinates are Lookup L5 only, so
     they come from step 2 either way.
  2. Place name + state: OpenStreetMap Nominatim (ODbL) for coordinates.

Status of this module in the build that created it: the NIPOST branch was
WRITTEN FROM THE PUBLISHED DOCS (docs.postcode.gov.ng, fetched 2026-10-18) and
was NOT executed against the live API, because no NIPOST API key is available
on this machine and every endpoint requires one (the unauthenticated call
returns auth_required). Every cache entry records which path produced it.

Cache: data/nipost-cache/<slug>.json, one file per resolved place or postcode.
Schema: data/nipost-cache/SCHEMA.md.
"""
import json, os, re, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CACHE = os.path.join(ROOT, 'data', 'nipost-cache')
NIPOST = 'https://api.postcode.gov.ng'
NOMINATIM = 'https://nominatim.openstreetmap.org/search'
UA = 'kaliabe-kcc/1.0 (contact@kaliabe.ng)'

ZONES = {
  'North Central': ['Benue', 'Kogi', 'Kwara', 'Nasarawa', 'Niger', 'Plateau', 'Federal Capital Territory'],
  'North East': ['Adamawa', 'Bauchi', 'Borno', 'Gombe', 'Taraba', 'Yobe'],
  'North West': ['Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Sokoto', 'Zamfara'],
  'South East': ['Abia', 'Anambra', 'Ebonyi', 'Enugu', 'Imo'],
  'South South': ['Akwa Ibom', 'Bayelsa', 'Cross River', 'Delta', 'Edo', 'Rivers'],
  'South West': ['Ekiti', 'Lagos', 'Ogun', 'Ondo', 'Osun', 'Oyo'],
}
STATE_ZONE = {s: z for z, ss in ZONES.items() for s in ss}


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def _get(url, headers=None, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent': UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def _cache_path(key):
    return os.path.join(CACHE, slug(key) + '.json')


def cached(key):
    p = _cache_path(key)
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return None


def _store(key, rec):
    os.makedirs(CACHE, exist_ok=True)
    with open(_cache_path(key), 'w') as f:
        json.dump(rec, f, indent=2, ensure_ascii=False)
        f.write('\n')


def nipost_postcode(code, allow_credits=False):
    """Resolve a postcode via NIPOST. Returns (record_part, status). Untested against the live API."""
    key = os.environ.get('NIPOST_API_KEY')
    if not key:
        return None, 'not_attempted_no_api_key'
    h = {'X-API-Key': key}
    compact = re.sub(r'[^A-Za-z0-9]', '', code).upper()
    try:
        lk = _get(f'{NIPOST}/v1/lookup?code={compact}&level=1', h)
        data = lk.get('data', {})
        out = {'postcode': data.get('postcode', compact), 'valid': data.get('valid')}
        st = _get(f'{NIPOST}/v1/reference/states', h).get('data', [])
        out['state_code'] = compact[:2]
        out['lga_code'] = compact[2:4]
        out['reference_lists'] = 'states list fetched; map code to name by the response field names at runtime'
        out['states_raw_count'] = len(st) if isinstance(st, list) else None
        if allow_credits:
            l2 = _get(f'{NIPOST}/v1/lookup?code={compact}&level=2', h).get('data', {})
            out['administrative_address'] = l2.get('administrative_address')
        return out, 'ok'
    except Exception as e:  # network, auth, 4xx/5xx: fall back, never invent
        return None, 'failed: ' + type(e).__name__ + ' ' + str(e)[:120]


def osm_lookup(name, state):
    q = urllib.parse.urlencode({'q': f'{name}, {state}, Nigeria', 'format': 'json', 'limit': 1, 'countrycodes': 'ng'})
    rows = _get(f'{NOMINATIM}?{q}')
    time.sleep(1.1)  # Nominatim usage policy: max 1 request per second
    if not rows:
        return None
    r = rows[0]
    return {'lat': round(float(r['lat']), 4), 'lon': round(float(r['lon']), 4), 'osm_ref': f"{r['osm_type']}/{r['osm_id']}", 'display_name': r['display_name'], 'licence': 'OpenStreetMap contributors, ODbL 1.0'}


def resolve(name, state, postcode=None, allow_credits=False, refresh=False):
    """Return a cache record for the place; fetch and cache if absent."""
    key = postcode or f'{name}-{state}'
    if not refresh:
        c = cached(key)
        if c:
            return c
    now = time.strftime('%Y-%m-%d', time.gmtime())
    rec = {'schema': 'kcc-place-cache/1', 'query': {'name': name, 'state': state, 'postcode': postcode},
           'resolved_at': now, 'nipost': {'status': 'not_attempted_no_postcode' if not postcode else None}}
    if postcode:
        part, status = nipost_postcode(postcode, allow_credits)
        rec['nipost'] = {'status': status, **(part or {})}
    geo = osm_lookup(name, state)
    if geo:
        rec['coords'] = {**geo, 'resolver': 'osm-nominatim', 'method': 'place-name fallback (NIPOST L5 coordinates not available)'}
    else:
        rec['coords'] = None
    rec['zone'] = {'value': STATE_ZONE.get(state), 'resolver': 'derived from state by KCC (six geopolitical zones), not from NIPOST', 'assumed': False}
    _store(key, rec)
    return rec
