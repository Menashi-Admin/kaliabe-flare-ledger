"""Render blog/*.md into the site's Writing section (web/public/blog/).

Each post becomes web/public/blog/<slug>/index.html, using the same masthead,
footer and stylesheet as the rest of the site. No new runtime dependency: the
pages are static HTML, and Python-Markdown is used only at build time.

Post conventions (blog/why-this-page-exists.md):
  line 1      "# Title"                      -> <h1>
  next line   "*Kicker*"                     -> kicker above the title
  "---"       first rule ends the front matter; the last rule starts the end
              block (sign-off paragraph + "**Label:** [text](url)" link lines)

Usage: python3 scripts/build_blog.py
"""
import html
import os
import re

import markdown

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'blog')
OUT = os.path.join(ROOT, 'web/public/blog')

# Byline and date per post. The date is the day the post was committed.
POSTS = {
    'why-this-page-exists': {'author': 'Kaliabe', 'date': '2026-10-17', 'date_text': '17 October 2026',
                             'summary': 'Why we built a public, open-data flare ledger for the Niger Delta, and what it refuses to do.'},
}

HEAD = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{title} — Kaliabe Flare Ledger</title>
<meta name="description" content="{desc}" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22%3E%3Ccircle cx=%228%22 cy=%228%22 r=%226%22 fill=%22%23b5761e%22/%3E%3C/svg%3E" />
<link rel="stylesheet" href="/css/base.css" />
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <div class="wrap masthead__inner">
    <div class="brand"><span class="brand__mark" aria-hidden="true"></span><span class="brand__name"><a href="/" style="color:inherit;text-decoration:none">Kaliabe Flare Ledger</a></span></div>
    <nav class="nav" aria-label="Primary">
      <a href="/index.html#map" class="nav__link">Map</a>
      <a href="/index.html#operators" class="nav__link">Operators</a>
      <a href="/methodology.html" class="nav__link">Methodology</a>
      <a href="/data.html" class="nav__link">Data</a>
      <a href="/blog/" class="nav__link" aria-current="page">Writing</a>
    </nav>
  </div>
</header>
'''

FOOT = '''<footer class="foot"><div class="wrap foot__inner">
  <p>Built by Kaliabe · open data · honest uncertainty.</p>
  <p class="foot__links"><a href="/methodology.html">Methodology</a> · <a href="/data.html">Data &amp; licences</a> · <a href="/blog/">Writing</a></p>
</div></footer>
</body>
</html>
'''


def md(text):
    return markdown.markdown(text, extensions=['smarty'], output_format='html5')


def render_post(slug, meta):
    src = open(os.path.join(SRC, slug + '.md'), encoding='utf-8').read().strip()
    lines = src.split('\n')
    title = re.sub(r'^#\s+', '', lines[0]).strip()
    kicker = lines[2].strip().strip('*') if len(lines) > 2 else ''
    parts = re.split(r'\n---\n', src)
    body_md = '\n---\n'.join(parts[1:-1]).strip()      # between the first and last rule
    end_md = parts[-1].strip()

    # End block: sign-off paragraph(s), then one "**Label:** [text](url)" per line.
    links, sign = [], []
    for ln in end_md.split('\n'):
        m = re.match(r'^\*\*(.+?):\*\*\s*\[(.+?)\]\((.+?)\)\s*$', ln.strip())
        if m:
            links.append(m.groups())
        else:
            sign.append(ln)
    sign_html = md('\n'.join(sign).strip())
    links_html = ''.join(
        f'<li><span>{html.escape(lbl)}:</span> <a href="{html.escape(url)}">{html.escape(txt)}</a></li>'
        for lbl, txt, url in links)

    page = HEAD.format(title=html.escape(title), desc=html.escape(meta['summary'])) + f'''
<main id="main" class="article">
  <article class="article__inner">
    <header>
      <p class="article__kicker">{html.escape(kicker)}</p>
      <h1>{html.escape(title)}</h1>
      <p class="article__byline">By {html.escape(meta['author'])} · <time datetime="{meta['date']}">{meta['date_text']}</time></p>
    </header>
    <div class="article__body">
{md(body_md)}
      <hr />
      <div class="article__end">{sign_html}</div>
      <ul class="article__links">{links_html}</ul>
    </div>
  </article>
</main>

''' + FOOT
    d = os.path.join(OUT, slug)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(page)
    return title


def main():
    items = []
    for slug, meta in POSTS.items():
        title = render_post(slug, meta)
        items.append(f'<li><a href="/blog/{slug}/">{html.escape(title)}</a>'
                     f'<p><time datetime="{meta["date"]}">{meta["date_text"]}</time> · {html.escape(meta["summary"])}</p></li>')
        print('wrote', f'web/public/blog/{slug}/index.html')
    index = HEAD.format(title='Writing', desc='Notes from Kaliabe on the Flare Ledger.') + f'''
<main id="main" class="article">
  <div class="article__inner">
    <p class="article__kicker">Kaliabe · writing</p>
    <h1>Writing</h1>
    <p class="article__byline">Notes on the Flare Ledger: why it exists, and how it works.</p>
    <ul class="postlist">{''.join(items)}</ul>
  </div>
</main>

''' + FOOT
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(index)
    print('wrote web/public/blog/index.html')


if __name__ == '__main__':
    main()
