"""Source registry + validator for the Kaliabe Flare Ledger (KFL-M 1.3).

For every external source the ledger depends on, this script:
  * fetches it (HTTP GET, following redirects) and records reachability,
  * computes a SHA-256 checksum of the fetched bytes,
  * records the version / vintage it can establish (from the bytes or a
    metadata API where one exists; otherwise the vintage we pinned, marked as such),
  * records the licence (machine-read where a metadata API exposes it,
    otherwise the declared licence, marked "declared"),
  * compares the checksum with the copy we verified by hand, where pinned,

then writes docs/DATA-SOURCES-REGISTRY.md.

Exit status: 1 if any source is unreachable (so a stale or vanished source is
visible, not silent); 0 otherwise. A checksum drift is reported as CHANGED but
does not fail the run: changed bytes need a human to re-verify, which is what
the registry entry asks for.

Nothing is fabricated: anything we cannot establish is written as
"unverified" with the reason.

Usage: python3 scripts/validate_sources.py [--no-write]
"""
import datetime as dt
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs/DATA-SOURCES-REGISTRY.md')
UA = 'Mozilla/5.0 (KaliabeFlareLedger source validator; +https://kaliabe-flare-web.pages.dev/data.html)'
TIMEOUT = 90

WB = 'https://thedocs.worldbank.org/en/doc/b34e0c054bb3fe3695e70154c28eef3f-0400072026'

# id, name, url, used_for, declared licence, pinned sha256 (the copy verified by hand) or None, check fn name
SOURCES = [
    dict(id='gfmr-sites', name='World Bank GFMR — Flare Volume Estimates by Individual Flare Location 2012–2025 (xlsx)',
         url=f'{WB}/related/Flare-Volume-Estimates-by-individual-Flare-Location-2012-2025.xlsx',
         used_for='flare sites + annual volumes (the seed)', licence='Free with attribution (World Bank; declared)',
         pinned='8b6052d23c09584d5964d6549026961b5ee8529b9b882edb4073fd6e9bc40354',
         pinned_note='the workbook the 2026-10-16 seed was built from', check='xlsx'),
    dict(id='gfmr-tracker', name='World Bank — Global Gas Flaring Tracker, 23 June 2026 (PDF)',
         url=f'{WB}/original/Global-Gas-FlaringTracker-June-23-2026.pdf',
         used_for='emissions ratios (167 bcm → 429 MtCO₂e incl. 50 MtCO₂e methane); vintage of the seed',
         licence='Free with attribution (World Bank; declared)',
         pinned='91b5997afe154d8efaa1f0ebe9463e224c6df8ca26c023f0f82601acda9ab6bf',
         pinned_note='copy read on 2026-10-17', check='tracker'),
    dict(id='gfmr-page', name='World Bank — Global Gas Flaring Data page',
         url='https://www.worldbank.org/en/programs/gasflaringreduction/global-flaring-data',
         used_for='discovery: which release is current', licence='World Bank terms of use (declared)',
         pinned=None, check='gfmr_page'),
    dict(id='gfmr-method', name='World Bank — Gas Flaring Estimates: methodology for determining flare gas volumes from satellite data (PDF)',
         url='https://documents1.worldbank.org/curated/en/757441622577804574/pdf/World-Bank-s-Global-Gas-Flaring-Reduction-Partnership-Gas-Flaring-Estimates-Methodology-for-Determining-the-Gas-Flare-Volumes-from-Satellite-Data.pdf',
         used_for='volume calibration method (pre-2026 description)', licence='World Bank terms of use (declared)',
         pinned=None, check='pdf'),
    dict(id='viirs-vnf', name='NOAA VIIRS Nightfire (EOG, Payne Institute, Colorado School of Mines) — product page',
         url='https://eogdata.mines.edu/products/vnf/',
         used_for='upstream of GFMR (detection layer); raw files need an EOG login and are not ingested',
         licence='Open (EOG terms; declared)', pinned=None, check='html'),
    dict(id='flare-regs-2018', name='Flare Gas (Prevention of Waste and Pollution) Regulations, 2018 — S.I. No. 9 of 2018, Official Gazette No. 88 Vol. 105 (PDF, NUPRC NGFCP copy)',
         url='https://ngfcp.nuprc.gov.ng/wp-content/uploads/2022/09/FGN-Official-Gazette-on-Flare-Gas-v2.0-002.pdf',
         used_for='penalty basis, Reg. 13 tiers ($2.00 ≥10,000 bbl/d; $0.50 <10,000 bbl/d) and exemptions',
         licence='Public government gazette (declared)',
         pinned='503f957a78d0c6343e0f151432670025c9cb22c453192ee7975ce8d50167a1b9',
         pinned_note='copy OCR-verified on 2026-10-17 (S.I. No. 9 of 2018; Gazette No. 88 Vol. 105, 9 July 2018; Reg. 13(1)–(3))',
         check='gazette'),
    dict(id='gb-adm1', name='geoBoundaries gbOpen NGA ADM1 (GRID3) — metadata API',
         url='https://www.geoboundaries.org/api/current/gbOpen/NGA/ADM1/',
         used_for='state layer; the Niger Delta nine-state boundary', licence=None, pinned=None, check='geob'),
    dict(id='gb-adm1-file', name='geoBoundaries gbOpen NGA ADM1 simplified GeoJSON (commit 9469f09)',
         url='https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1_simplified.geojson',
         used_for='input to scripts/fetch_layers.py → web/public/layers/nga-states.geojson', licence='CC BY 4.0 (per the metadata API)',
         pinned=None, check='geojson'),
    dict(id='gb-adm2', name='geoBoundaries gbOpen NGA ADM2 (GRID3) — metadata API',
         url='https://www.geoboundaries.org/api/current/gbOpen/NGA/ADM2/',
         used_for='LGA layer', licence=None, pinned=None, check='geob'),
    dict(id='usgs-pipelines', name='USGS Africa oil & gas pipelines (AFR_Infra_OG_Pipelines) — ArcGIS item metadata',
         url='https://www.arcgis.com/sharing/rest/content/items/c2d2e59693b449cfbb370a3c2d6c3889?f=json',
         used_for='pipeline overlay', licence=None, pinned=None, check='arcgis'),
    dict(id='osm-tiles', name='OpenStreetMap standard tiles (runtime basemap)',
         url='https://tile.openstreetmap.org/6/33/31.png',
         used_for='basemap in the browser (runtime dependency, no data ingested)', licence='ODbL; tiles under the OSMF tile usage policy (declared)',
         pinned=None, check='bytes'),
    dict(id='leaflet', name='Leaflet 1.9.4 via unpkg (runtime library)',
         url='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
         used_for='slippy map (runtime dependency)', licence='BSD-2-Clause (declared)',
         pinned=None, check='bytes'),
    # ---- KFL-M 1.3 enrichment sources
    dict(id='grid3-pop', name='GRID3 NGA Population v3.0 — gridded population, 100 m (zip via WorldPop WOPR)',
         url='https://wopr.worldpop.org/download/611',
         used_for='pop5km / pop10km / pop25km / pop50km and settlement populations (scripts/pop_demand.py)',
         licence='CC BY 4.0 (declared; GRID3 / WorldPop)',
         pinned='12a45438c233bbfa52d120001eca20660cff86e715a91b3cfd66c94fc31aee42',
         pinned_note='zip downloaded 2026-10-17; GeoTIFF sha256 b9d72f2d…c31aee42 → b9d72f2d7f538c69daca8ce68008bfdc07aa848b1885544af4ae77428ffbbe5e; national sum 237,527,782', check='grid3zip'),
    dict(id='grid3-pop-svc', name='GRID3 NGA Population v3.0 — ArcGIS tile service metadata',
         url='https://tiles.arcgis.com/tiles/BU6Aadhn6tbBEdyk/arcgis/rest/services/NGA_gridded_population_v3_tile_package/MapServer/0?f=json',
         used_for='discovery / cross-check of the population release', licence='CC BY 4.0 (declared)', pinned=None, check='arcgis_layer'),
    dict(id='grid3-settle', name='GRID3 NGA Settlement Points (settlement names) — ArcGIS feature service',
         url='https://services3.arcgis.com/BU6Aadhn6tbBEdyk/arcgis/rest/services/Settlements_in_Nigeria/FeatureServer/0?f=json',
         used_for='nearest_settlement and main_centre_25km names', licence='CC BY 4.0 (per the ArcGIS item, grid3-settle-item)', pinned=None, check='arcgis_fs'),
    dict(id='grid3-settle-item', name='GRID3 NGA Settlement Names — ArcGIS item (licence)',
         url='https://www.arcgis.com/sharing/rest/content/items/73d8522d1c4d4c75be6c10fa790c685c?f=json',
         used_for='licence of the settlement points', licence=None, pinned=None, check='arcgis'),
    dict(id='wdi-access', name='World Bank WDI — Access to electricity, % of population (EG.ELC.ACCS.ZS, NGA)',
         url='https://api.worldbank.org/v2/country/NGA/indicator/EG.ELC.ACCS.ZS?format=json&per_page=5&mrv=3',
         used_for='national access context (with .UR / .RU and SP.POP.TOTL; scripts/fetch_access_rates.py)',
         licence='CC BY 4.0 (declared; World Bank open data)', pinned=None, check='wdi'),
    dict(id='ndhs-2024', name='Nigeria DHS 2023-24 — population with electricity by state (The DHS Program API, HC_ELEC_P_ELC)',
         url='https://api.dhsprogram.com/rest/dhs/data?indicatorIds=HC_ELEC_P_ELC&surveyIds=NG2024DHS&breakdown=subnational&f=json&perpage=200',
         used_for='state access rates → the derived state rural access proxy',
         licence='DHS Program terms: public aggregate indicators, cite NPC & ICF (declared)', pinned=None, check='dhs'),
    dict(id='firms-viirs', name='NASA FIRMS — VIIRS 375 m NRT active fire, NOAA-20, Northern & Central Africa 24h CSV',
         url='https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Northern_and_Central_Africa_24h.csv',
         used_for='live thermal check + last-24h layer (scripts/live_thermal.py; also the Suomi NPP and NOAA-21 files)',
         licence='NASA Earth Science open data policy; acknowledgement requested (declared)', pinned=None, check='firms'),
    dict(id='acled-hdx', name='ACLED Nigeria conflict events — HDX package (monthly events by LGA)',
         url='https://data.humdata.org/api/3/action/package_show?id=nigeria-acled-conflict-data',
         used_for='security context: LGA events, fatalities and 12-month trend (scripts/ingest_acled.py)', licence=None, pinned=None, check='hdx'),
    dict(id='acled-api', name='ACLED API (point events) — requires a myACLED account',
         url='https://acleddata.com/api/acled/read',
         used_for='per-site radius counts sec_events_10/25/50km — PENDING CREDENTIALS (reachability only)',
         licence='ACLED Terms of Use & Attribution Policy (declared)', pinned=None, check='acled_api'),
    dict(id='cod-ab-nga', name='OCHA COD-AB Nigeria administrative boundaries — HDX package',
         url='https://data.humdata.org/api/3/action/package_show?id=cod-ab-nga',
         used_for='LGA polygons with P-codes for the ACLED join and the security layer', licence=None, pinned=None, check='hdx'),
    dict(id='gsa-solar', name='Global Solar Atlas 2 point service (World Bank / ESMAP, Solargis data), long-term averages',
         url='https://api.globalsolaratlas.info/data/lta?loc=4.81560,7.04980',
         used_for='solar term of the mini-grid siting score: GHI and PV output per site (scripts/build_siting.py)',
         licence='CC BY 4.0 (World Bank; declared)', pinned=None, check='gsa'),
]

LOCAL = [
    ('worker/src/niger-delta.json', 'Niger Delta classification (scripts/classify_niger_delta.py)'),
    ('web/public/layers/nga-states.geojson', 'states layer (simplified, rounded)'),
    ('web/public/layers/nga-lgas.geojson', 'LGA layer (simplified, rounded)'),
    ('web/public/layers/nga-pipelines.geojson', 'pipelines layer (clipped)'),
    ('data/gfmr_nigeria_sites_seed.json', 'Nigeria seed (476 sites)'),
    ('web/public/data/pop_demand.json', 'population + settlements per site (scripts/pop_demand.py)'),
    ('web/public/data/access_rates.json', 'electricity access, national + state (scripts/fetch_access_rates.py)'),
    ('web/public/data/security.json', 'ACLED LGA security context per site (scripts/ingest_acled.py)'),
    ('web/public/layers/security-lga.geojson', 'security layer: LGAs within 50 km of a site'),
    ('web/public/data/siting.json', 'solar resource per site for the siting score (scripts/build_siting.py)'),
    ('web/public/data/live/live_thermal.json', 'live FIRMS summary (changes daily; checksum is a snapshot)'),
]


def fetch(url, src=None):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    last = None
    for _ in range(2):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT if not src or src['check'] != 'grid3zip' else 900) as r:
                return r.status, r.headers.get('content-type', ''), r.read(), r.geturl()
        except urllib.error.HTTPError as e:
            # An endpoint that answers 401/403 without credentials is reachable; the check decides.
            if src and src['check'] == 'acled_api' and e.code in (401, 403):
                return e.code, e.headers.get('content-type', ''), e.read(), url
            last = e
        except Exception as e:  # noqa: BLE001 — record any failure verbatim
            last = e
    raise last


def pdf_text(data, first=None, last=None):
    if not shutil.which('pdftotext'):
        return None
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, 'f.pdf')
        open(p, 'wb').write(data)
        args = ['pdftotext']
        if first:
            args += ['-f', str(first), '-l', str(last or first)]
        subprocess.run(args + [p, os.path.join(d, 'f.txt')], capture_output=True, timeout=120)
        try:
            return open(os.path.join(d, 'f.txt'), errors='ignore').read()
        except FileNotFoundError:
            return None


def check(src, data, ctype):
    """Return (version/vintage string, licence string or None, notes list)."""
    kind, notes = src['check'], []
    if kind == 'xlsx':
        try:
            z = zipfile.ZipFile(io.BytesIO(data))
            core = z.read('docProps/core.xml').decode('utf-8', 'ignore')
            created = re.search(r'<dcterms:created[^>]*>([^<]+)<', core)
            modified = re.search(r'<dcterms:modified[^>]*>([^<]+)<', core)
            ver = f"2012–2025 series, June 2026 release (URL path 0400072026); workbook created {created.group(1) if created else '?'}, modified {modified.group(1) if modified else '?'}"
            if 'xl/worksheets/sheet1.xml' in z.namelist() or any(n.startswith('xl/worksheets/') for n in z.namelist()):
                notes.append('valid xlsx (OOXML) container')
            return ver, None, notes
        except Exception as e:  # noqa: BLE001
            return f'unverified: not a readable xlsx ({e})', None, notes
    if kind == 'tracker':
        t = pdf_text(data)
        if t is None:
            return 'unverified: pdftotext not available to read the PDF', None, notes
        found = {k: (k in t) for k in ['167 bcm', '429', '50 MMtCO2e', 'three satellites']}
        notes.append('figures found in text: ' + ', '.join(f"{k}={'yes' if v else 'NO'}" for k, v in found.items()))
        return ('Global Gas Flaring Tracker, June 2026 (data year 2025)' if all(found.values())
                else 'unverified: expected figures not all found in the PDF text'), None, notes
    if kind == 'gfmr_page':
        h = data.decode('utf-8', 'ignore')
        links = sorted(set(re.findall(r'https?://[^"\s]+Flare-Volume-Estimates-by-individual-Flare-Location[^"\s]*\.xlsx', h)))
        cur = [u for u in links if '2012-2025' in u]
        newer = [u for u in links if re.search(r'2012-20(2[6-9]|3\d)', u)]
        notes.append(f'flare-location workbooks linked: {len(links)}')
        if newer:
            notes.append('NEWER RELEASE LINKED: ' + ', '.join(newer) + ' — the seed is stale')
        return ('page links the 2012–2025 workbook (current seed)' if cur else 'unverified: 2012–2025 workbook link not found on the page') + \
            ('; a newer release is linked' if newer else ''), None, notes
    if kind == 'gazette':
        t = pdf_text(data) or ''
        if len(t.strip()) < 200:
            notes.append('scanned image PDF: no machine-readable text; content is vouched for by the pinned checksum of the OCR-verified copy')
        return 'S.I. No. 9 of 2018 (made 5 July 2018; Gazette No. 88, Vol. 105, 9 July 2018) — established by OCR of the pinned copy', None, notes
    if kind == 'geob':
        try:
            m = json.loads(data)
            ver = f"{m.get('boundaryType')} · source {m.get('boundarySource')} · year represented {m.get('boundaryYearRepresented')} · build {m.get('buildDate')} · {m.get('admUnitCount')} units · download pinned to {re.search(r'raw/([0-9a-f]+)/', m.get('gjDownloadURL', '') or '').group(1) if re.search(r'raw/([0-9a-f]+)/', m.get('gjDownloadURL', '') or '') else '?'}"
            return ver, f"{m.get('boundaryLicense')} (machine-read from the API)", notes
        except Exception as e:  # noqa: BLE001
            return f'unverified: metadata not parseable ({e})', None, notes
    if kind == 'geojson':
        try:
            g = json.loads(data)
            return f"{len(g.get('features', []))} features at pinned commit 9469f09", None, notes
        except Exception as e:  # noqa: BLE001
            return f'unverified: not GeoJSON ({e})', None, notes
    if kind == 'arcgis':
        try:
            m = json.loads(data)
            mod = dt.datetime.fromtimestamp(m['modified'] / 1000, dt.timezone.utc).date().isoformat() if m.get('modified') else '?'
            lic = (m.get('licenseInfo') or '').strip()
            lic = re.sub('<[^>]+>', '', lic)[:160]
            pre = 'USGS public domain — ' if src['id'] == 'usgs-pipelines' else ''
            return f"item '{m.get('title')}', last modified {mod}", (f'{pre}item licence text: “{lic.strip()}…” (machine-read)' if lic else None), notes
        except Exception as e:  # noqa: BLE001
            return f'unverified: metadata not parseable ({e})', None, notes
    if kind == 'grid3zip':
        try:
            z = zipfile.ZipFile(io.BytesIO(data))
            tifs = [i for i in z.infolist() if i.filename.endswith('.tif')]
            return (f"{', '.join(i.filename.split('/')[-1] for i in tifs)} (zip entry dated {'-'.join(map(str, tifs[0].date_time[:3]))}, "
                    f"{tifs[0].file_size:,} B)" if tifs else 'unverified: no GeoTIFF in the zip'), None, notes
        except Exception as e:  # noqa: BLE001
            return f'unverified: not a readable zip ({e})', None, notes
    if kind == 'arcgis_layer':
        try:
            m = json.loads(data)
            return f"layer '{m.get('name')}' ({m.get('type')})", None, notes
        except Exception as e:  # noqa: BLE001
            return f'unverified: metadata not parseable ({e})', None, notes
    if kind == 'arcgis_fs':
        try:
            m = json.loads(data)
            ed = (m.get('editingInfo') or {}).get('dataLastEditDate')
            ed = dt.datetime.fromtimestamp(ed / 1000, dt.timezone.utc).date().isoformat() if ed else '?'
            if (m.get('copyrightText') or '').strip():
                notes.append('copyright: ' + m['copyrightText'].strip()[:160])
            return f"layer '{m.get('name')}', data last edited {ed}", None, notes
        except Exception as e:  # noqa: BLE001
            return f'unverified: metadata not parseable ({e})', None, notes
    if kind == 'wdi':
        try:
            m = json.loads(data)
            rows = [r for r in m[1] if r['value'] is not None]
            return f"WDI last updated {m[0].get('lastupdated')}; latest {rows[0]['date']} = {rows[0]['value']}%", 'CC BY 4.0 (World Bank open data; declared)', notes
        except Exception as e:  # noqa: BLE001
            return f'unverified: WDI response not parseable ({e})', None, notes
    if kind == 'dhs':
        try:
            d = json.loads(data)['Data']
            st = [x for x in d if x['CharacteristicLabel'].startswith('..')]
            riv = next((x['Value'] for x in st if 'Rivers' in x['CharacteristicLabel']), '?')
            return f"NG2024DHS, {len(st)} state values (Rivers {riv}%)", None, notes
        except Exception as e:  # noqa: BLE001
            return f'unverified: DHS response not parseable ({e})', None, notes
    if kind == 'firms':
        lines = data.decode('utf-8', 'ignore').splitlines()
        if not lines or not lines[0].startswith('latitude,longitude,bright_ti4'):
            return 'unverified: not a FIRMS VIIRS CSV', None, notes
        dates = sorted({ln.split(',')[5] for ln in lines[1:] if ln.count(',') >= 12})
        notes.append('near-real-time file: bytes change on every pass, so no checksum is pinned')
        return f"VIIRS C2 NRT, {len(lines) - 1:,} detections, acq dates {dates[0] if dates else '?'} … {dates[-1] if dates else '?'}", None, notes
    if kind == 'hdx':
        try:
            m = json.loads(data)['result']
            notes.append('resources: ' + '; '.join(r['name'] for r in m['resources'])[:300])
            return f"'{m['title']}', last modified {m.get('last_modified', '?')[:10]}", f"{m.get('license_title')} (machine-read from HDX)", notes
        except Exception as e:  # noqa: BLE001
            return f'unverified: HDX response not parseable ({e})', None, notes
    if kind == 'acled_api':
        notes.append('PENDING CREDENTIALS: needs a myACLED account (OAuth). The sample in data/samples/ is SYNTHETIC and only exercises the code path.')
        return 'endpoint reachable; not pulled — no myACLED account on this box', None, notes
    if kind == 'gsa':
        try:
            lay = json.loads(data)['annual']['metadata']['layers']['GHI']
            return f"GHI layer {lay.get('version')}, updated {lay.get('updated')}, period to {lay.get('period', {}).get('to')}", None, notes
        except Exception as e:  # noqa: BLE001
            return f'unverified: not the Atlas JSON ({e})', None, notes
    if kind == 'pdf':
        return ('PDF' if data[:4] == b'%PDF' else 'unverified: response is not a PDF') + ' (no version field to read)', None, notes
    if kind == 'html':
        title = re.search(r'<title>([^<]*)</title>', data.decode('utf-8', 'ignore'), re.I)
        return f"page title: {title.group(1).strip() if title else '?'} (no version field to read)", None, notes
    return f'{ctype or "bytes"}; no version field to read', None, notes


def main():
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    rows, failed = [], 0
    for src in SOURCES:
        rec = dict(src)
        try:
            status, ctype, data, final = fetch(src['url'], src)
            rec.update(reachable=200 <= status < 400 or (src['check'] == 'acled_api' and status in (401, 403)), status=status, ctype=ctype.split(';')[0], size=len(data),
                       sha256=hashlib.sha256(data).hexdigest(), final=final)
            ver, lic, notes = check(src, data, ctype)
            rec['version'] = ver
            rec['licence_out'] = lic or (src['licence'] or 'unverified: no licence field available')
            rec['notes'] = notes
            if src.get('pinned'):
                rec['pin'] = 'MATCH' if rec['sha256'] == src['pinned'] else 'CHANGED — re-verify by hand'
        except Exception as e:  # noqa: BLE001
            rec.update(reachable=False, status=getattr(e, 'code', None), error=f'{type(e).__name__}: {e}',
                       version='unverified: source unreachable', licence_out=src['licence'] or 'unverified', notes=[])
        if not rec['reachable']:
            failed += 1
        rows.append(rec)
        flag = 'OK ' if rec['reachable'] else 'FAIL'
        pin = f" pin={rec['pin']}" if rec.get('pin') else ''
        print(f"[{flag}] {src['id']:16} {rec.get('status')} {rec.get('size', 0):>10} B sha256={rec.get('sha256', '-')[:16]}{pin}")
        print(f"       version: {rec['version']}")
        for n in rec['notes']:
            print(f'       note: {n}')
        if rec.get('error'):
            print(f"       error: {rec['error']}")

    local = []
    for path, what in LOCAL:
        p = os.path.join(ROOT, path)
        if os.path.exists(p):
            local.append((path, what, os.path.getsize(p), hashlib.sha256(open(p, 'rb').read()).hexdigest()))

    md = [
        '# Data sources registry',
        '',
        f'Generated by `scripts/validate_sources.py` on **{now.isoformat()}** · method KFL-M 1.3.',
        f'Result: **{len(rows) - failed}/{len(rows)} reachable**' + (f' — **{failed} UNREACHABLE** (the script exited non-zero)' if failed else '') + '.',
        '',
        'Each entry records reachability, the version or vintage we could establish, a SHA-256 checksum of the fetched bytes, and the licence.',
        '“Declared” licences come from the source’s published terms as we recorded them; “machine-read” ones were read from a metadata API on this run.',
        'Where a checksum is pinned, it is the copy we verified by hand. **CHANGED** means the bytes differ and a person needs to re-verify the content.',
        '',
        '| Source | Reachable | Version / vintage | SHA-256 (fetched bytes) | Pinned copy | Licence |',
        '|---|---|---|---|---|---|',
    ]
    for r in rows:
        reach = f"yes ({r['status']}, {r['size']:,} B)" if r['reachable'] else f"**NO** ({r.get('error', r.get('status'))})"
        md.append(f"| [{r['name']}]({r['url']}) | {reach} | {r['version']} | `{r.get('sha256', '—')}` | {r.get('pin', '—')} | {r['licence_out']} |")
    md += ['', '## Notes', '']
    for r in rows:
        extra = list(r['notes'])
        if r.get('pinned_note'):
            extra.append('pinned copy: ' + r['pinned_note'])
        md.append(f"- **{r['id']}** — used for: {r['used_for']}." + (' ' + ' '.join(n.rstrip('.') + '.' for n in extra) if extra else ''))
    md += ['', '## Local derived artefacts', '', '| File | What | Bytes | SHA-256 |', '|---|---|---|---|']
    md += [f'| `{p}` | {w} | {s:,} | `{h}` |' for p, w, s, h in local]
    md += ['', '## Status flags', '',
           '- **ACLED — requires myACLED account; LGA aggregates (real, via HDX) ingested; point-event bulk pull pending credentials.** '
           'The per-site radius fields `sec_events_10km/25km/50km` are null with `sec_point_status = pending`. '
           '`data/samples/acled_point_sample_SYNTHETIC.csv` is invented test data for `scripts/ingest_acled.py --self-test` only — never shipped.',
           '- **State rural access** — no published rural-by-state figure exists (WDI, NDHS). The proxy is derived: NDHS 2024 state population-with-electricity × national rural/total ratio; national rural rate as fallback.',
           '- **NASA FIRMS** — near-real-time; refreshed daily by `.github/workflows/live-thermal.yml`; the local `live_thermal.json` checksum below is a snapshot.',
           '']
    md += ['', 'Not ingested (studied only): Kayrros, GHGSat, Enverus — proprietary terms. Raw VIIRS Nightfire per-night files need an EOG login and are not fetched.', '']

    if '--no-write' not in sys.argv:
        with open(OUT, 'w') as f:
            f.write('\n'.join(md))
        print('wrote', os.path.relpath(OUT, ROOT))
    print(f'{len(rows) - failed}/{len(rows)} sources reachable')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
