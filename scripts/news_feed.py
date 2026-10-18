"""Flare news cross-check feed (KFL-M 1.7).

Pulls a rotating news feed from free sources (Google News RSS searches keyed on
plant/operator/place names, caught direct from a couple of Nigerian energy
outlets), normalises each item, and matches items to ledger sites by operator
and place-name. Writes web/public/data/news/feed.json.

Source of truth for matching is data/gfmr_nigeria_sites_seed.json (the same seed
the site and score read), so an item that names a plant/operator resolves to the
same site_id the rest of the ledger uses. Nothing here reaches for a paid API:
Google News RSS and outlet RSS are both keyless. Where a story names no ledger
site, it is still retained with matched_sites: [] so the feed is a general
energy-news stream, not just flare-site stories.

Holds *no* news text: only title, source, url, published (UTC), and the matched
site ids. The Worker joins it onto /api/invest and /api/news. Site matching is
conservative (whole-word aliases) so a non-plant match cannot latch onto a flare
site by accident.

Stdlib only. Usage: python3 scripts/news_feed.py [--days 3]
"""
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, 'data/gfmr_nigeria_sites_seed.json')
OUT_DIR = os.path.join(ROOT, 'web/public/data/news')
OUT = os.path.join(OUT_DIR, 'feed.json')
UA = 'Mozilla/5.0 (KaliabeFlareLedger news_feed; +https://kaliabe-flare-web.pages.dev)'

# Google News RSS queries are the primary source: keyed on large plant/operator
# and prominent place names so the feed tightens around relevant headlines but
# still catches the wider energy-environment stream. en-NG locale.
G_CX = {
    'deadline': 12,          # hours of recency required before a query string is dropped
    'per_query_items': 30,
    'max_items': 400,
}

# Direct outlet feeds (keyless). SweetCrudeReports 403s automation so it is
# intentionally absent — Google News RSS still surfaces it.
OUTLETS = [
    ('Punch', 'https://punchng.com/feed/'),
    ('Vanguard', 'https://www.vanguardngr.com/feed/'),
    ('The Guardian NG', 'https://guardian.ng/feed/'),
]
# Outlet feeds are general news (sports, crime, politics), so only items that
# match the energy sector pass into the flare cross-check feed. Google News RSS
# queries are already targeted; this gate keeps the whole feed on-topic.
ENERGY = ['gas', 'oil', 'flare', 'energy', 'pipeline', 'lng', 'nnpc', 'petrol', 'fuel',
          'refiner', 'crude', 'power', 'electric', 'niger delta', 'hydrocarbon', 'lpg',
          'akpo', 'egbema', 'bonny', 'renewable', 'seafarers', 'marine', 'plant shutdown']

UA_CTX = None  # set lazily (kept importable without network)


def fetch(url, attempts=3):
    global UA_CTX
    if UA_CTX is None:
        import ssl
        UA_CTX = ssl.create_default_context()
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=40, context=UA_CTX) as r:
                return r.read().decode('utf-8', 'replace')
        except OSError as e:
            if i == attempts - 1:
                raise
            time.sleep(10 * (i + 1))


def rss_items(xml):
    """Yield {title, source, url, published_utc} from an RSS/Atom body."""
    body = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', xml, flags=re.S)
    for m in re.finditer(r'<item>(.*?)</item>', body, re.S):
        blk = m.group(1)
        t = re.search(r'<title>(.*?)</title>', blk, re.S)
        u = re.search(r'<link>(.*?)</link>', blk, re.S)
        pd = re.search(r'<pubDate>(.*?)</pubDate>', blk, re.S)
        src = re.search(r'<source[^>]*>(.*?)</source>', blk, re.S)
        if not (t and u):
            continue
        yield {
            'title': html.unescape(t.group(1)).strip(),
            'url': html.unescape(u.group(1)).strip(),
            'published': parse_date(pd.group(1)) if pd else None,
            'source': html.unescape(src.group(1)).strip() if src else '',
        }


def parse_date(s):
    for fmt in ('%a, %d %b %Y %H:%M:%S %z', '%a, %d %b %Y %H:%M %z', '%a, %d %b %Y %H:%M:%S GMT'):
        try:
            return dt.datetime.strptime(s.strip(), fmt).astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')
        except ValueError:
            continue
    return None


def build_aliases(seed):
    """Map leaf site terms -> set of site_ids, whole-word insensitive."""
    aliases = {}
    for s in seed:
        op = (s.get('operator') or '').strip().lower()
        fn = (s.get('field_name') or '').strip().lower()
        if len(op) >= 4:
            aliases.setdefault(op, set()).add(s['site_id'])
        if len(fn) >= 4:
            aliases.setdefault(fn, set()).add(s['site_id'])
    # Drop noisy generic aliases that would over-match.
    for noisy in {'lng limited', 'oil', 'gas', 'production', 'development', 'company', 'nigeria', 'field'}:
        aliases.pop(noisy, None)
    return aliases


def match(text, aliases):
    """Return sorted site_ids whose alias appears as a whole word in text."""
    low = ' ' + text.lower() + ' '
    hit = set()
    for alias, ids in aliases.items():
        if re.search(r'\b' + re.escape(alias) + r'\b', low):
            hit |= ids
    return sorted(hit)


def main():
    seed = json.load(open(SEED))
    aliases = build_aliases(seed)
    days = 3
    if '--days' in sys.argv:
        days = int(sys.argv[sys.argv.index('--days') + 1])

    queries = [
        'Nigeria gas flare', 'Nigeria LNG', 'Niger Delta gas', 'Bonny Island',
        'IOC oil and gas Nigeria', 'NNPC gas',
    ]
    items = {}
    err = []
    for q in queries:
        url = 'https://news.google.com/rss/search?q=' + urllib.parse.quote(q) + '&hl=en-NG&gl=NG&ceid=NG:en'
        try:
            xml = fetch(url)
            for it in rss_items(xml):
                items.setdefault(it['url'], it)
        except OSError as e:
            err.append(f'google:{q} {type(e).__name__}')
    for name, url in OUTLETS:
        try:
            xml = fetch(url)
            n = 0
            for it in rss_items(xml):
                if n >= 30:
                    break
                items.setdefault(it['url'], it)
                n += 1
        except OSError as e:
            err.append(f'{name} {type(e).__name__}')

    # Recency window + dedupe by normalised title. Only energy-sector items pass
    # so the cross-check feed stays on-topic even though outlet feeds are noisy.
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)
    feed = []
    seen_t = set()
    for it in items.values():
        pd = it['published']
        if pd and pd < cutoff.strftime('%Y-%m-%dT%H:%MZ'):
            continue
        hay = it['title'] + ' ' + (it['source'] or '')
        if not any(w in hay.lower() for w in ENERGY):
            continue
        key = re.sub(r'[^a-z0-9]+', '', it['title'].lower())[:60]
        if key in seen_t:
            continue
        seen_t.add(key)
        title = it['title']
        feed.append({
            'title': title, 'source': it['source'],
            'url': it['url'], 'published': pd,
            'matched_sites': match(hay, aliases),
            'keywords': [q for q in queries if any(w in (title + ' ' + (it['source'] or '')).lower() for w in q.lower().split())][:3],
        })
    feed.sort(key=lambda x: x['published'] or '', reverse=True)
    feed = feed[:G_CX['max_items']]

    os.makedirs(OUT_DIR, exist_ok=True)
    out = {
        'meta': {
            'build': 'KFL-M 1.7 news cross-check',
            'sources': ['Google News RSS (keyless, en-NG)', 'Punch', 'Vanguard', 'The Guardian NG'],
            'licence_note': 'Headlines and links only; no article body. Sources retain copyright; verify via the linked outlet before republication.',
            'matched_by': 'whole-word alias on seed operator/field-name against title+source; match is corroboration, not attribution.',
            'retrieved': dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
            'window_days': days,
            'items': len(feed),
            'matched_site_items': sum(1 for f in feed if f['matched_sites']),
            'errors': err,
        },
        'feed': feed,
    }
    json.dump(out, open(OUT, 'w'), separators=(',', ':'))
    print(f'news feed: {len(feed)} items ({sum(1 for f in feed if f["matched_sites"])} matched to flare sites) '
          f'{err and ("; errors: " + "; ".join(err)) or ""} ({dt.datetime.now(dt.timezone.utc):%H:%MZ})', file=sys.stderr)
    return out


if __name__ == '__main__':
    import time
    main()