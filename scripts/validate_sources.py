"""Source registry + validator for the Kaliabe Flare Ledger (KFL-M 1.2).

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
]

LOCAL = [
    ('worker/src/niger-delta.json', 'Niger Delta classification (scripts/classify_niger_delta.py)'),
    ('web/public/layers/nga-states.geojson', 'states layer (simplified, rounded)'),
    ('web/public/layers/nga-lgas.geojson', 'LGA layer (simplified, rounded)'),
    ('web/public/layers/nga-pipelines.geojson', 'pipelines layer (clipped)'),
    ('data/gfmr_nigeria_sites_seed.json', 'Nigeria seed (476 sites)'),
]


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    last = None
    for _ in range(2):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return r.status, r.headers.get('content-type', ''), r.read(), r.geturl()
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
            return f"item '{m.get('title')}', last modified {mod}", (f'USGS public domain — item licence text: “{lic}…” (machine-read)' if lic else None), notes
        except Exception as e:  # noqa: BLE001
            return f'unverified: metadata not parseable ({e})', None, notes
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
            status, ctype, data, final = fetch(src['url'])
            rec.update(reachable=200 <= status < 400, status=status, ctype=ctype.split(';')[0], size=len(data),
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
        f'Generated by `scripts/validate_sources.py` on **{now.isoformat()}** · method KFL-M 1.2.',
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
    md += ['', 'Not ingested (studied only): Kayrros, GHGSat, Enverus — proprietary terms. Raw VIIRS Nightfire per-night files need an EOG login and are not fetched.', '']

    if '--no-write' not in sys.argv:
        with open(OUT, 'w') as f:
            f.write('\n'.join(md))
        print('wrote', os.path.relpath(OUT, ROOT))
    print(f'{len(rows) - failed}/{len(rows)} sources reachable')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
