Both bugs are fixed, the new interactive map is live, and every live check passes. It's committed on `main` as **`850bac8`** (not pushed).

## Bugs fixed (before → after, checked live)

| # | Bug | Before | After |
|---|---|---|---|
| 1 | **Trend.** `computeTrend` read `s.m3`, which doesn't exist | All 476 sites `trend_pct: null`, `"stable"` | 0 NaN. 313 falling / 98 rising / 34 new / 21 inactive / 10 stable. Oso −29.3%, matching an independent recalculation |
| 2 | **CSV link** | Pages `/api/digest.csv` returned `text/html` (the site's own page) | New Pages Function proxies `/api/*` to the Worker on the same site. Now `text/csv` download, 6,664 rows |
| 3 | `/api/sites` ran one database query per site | 18.5 s | 0.5 s through the site, 0.16 s direct |
| 4 | CSV `bcm` column 1000× too small | Oso 2012: 0.00041573 | 0.41573. Column renamed `flaring_vol_million_m3` |
| 5 | `active_sites_latest` counted sites with zero volume | 476 | 249 |
| 6 | Confidence counted years with no detection as coverage | every operated site ~0.93 | based on detected years only |
| 7 | Other front-end faults | map framing used a broken calculation; hero said "megawatt-hours"; operator filter lost when the Niger Delta toggle changed; operator-card numbers styled as labels; error responses leaked internals | all fixed |

The penalty and unit maths are unchanged and re-checked: Oso is 308.37 million m³ ÷ 28.317 m³ × US$2 per 1,000 scf = US$21,779,967.54, and 0.3084 bcm.

**One step was blocked.** The security hook stopped my update to the stored `bcm` column in the live database, so that column still holds the old values. Nothing displays them now: the Worker calculates bcm itself, and the regenerated `seed.sql` has correct values for the next reseed.

## Live URLs and results
- Site: https://kaliabe-flare-web.pages.dev
- Worker: https://kaliabe-flare.menashiconsulting.workers.dev
- CSV: https://kaliabe-flare-web.pages.dev/api/digest.csv

All 23 live HTTP checks passed:
- the site loads;
- every page and script returns 200;
- the three layer files return 200 (states 37, LGAs 774, pipelines 154 features);
- `/api/sites` comes through the proxy with numeric trends and 14 years per site;
- the CSV is real CSV with correct units.

A headless Chrome run on production clicked a real flare: the panel opened with all fields, nearest state, LGA and pipeline, and there were no console errors. A mobile run with a link to Oso opened its record too.

## The map overlay (`web/public/js/atlas.js`, our own code on Leaflet)
- **Layers panel:** each layer has a toggle, legend, count and source/licence line:
  - Flare sites (476) — circle area matches volume; ochre fill = verified, hollow = below detection; the legend items also filter by verdict.
  - Oil & gas pipelines (154) — line style by commodity.
  - States (37).
  - LGAs (774) — loaded once the page is idle, off by default.
- **Basemap:** OSM (default), Paper (a muted treatment of the OSM tiles), or None.
- **Click a flare:** a side panel opens (a bottom sheet on mobile) with:
  - operator, field, type, onshore/offshore, Niger Delta flag, coordinates;
  - latest volume in million m³, bcm and MMscfd;
  - a hand-drawn bar chart of every year, with the trend's comparison windows marked;
  - trend, verdict, confidence, detection floor;
  - penalty in US$ and ₦, CO₂e, methane-equivalent;
  - numbered sources for every figure.
- **Nearby context, worked out in the browser:** the state and LGA the flare falls in (or the nearest one, for offshore sites), and the nearest pipeline with commodity, distance and the number of pipelines within 10 km. The selected flare's pipeline and area are highlighted on the map.
- **Other behaviour:** site data loads once and is indexed for instant clicks. Each site has a shareable link (`#site=<id>`), and clicking a row in the table opens that site on the map.

## Notes
- **Pipeline field.** USGS field `DsgAttr04` is the segment length in km, not the diameter (it matches the mapped line length within about 1%). My first version labelled it as diameter; that's corrected and documented.
- **Layer files.** I rounded coordinates to about 1 m and dropped unused fields, so the LGA file went from 3.4 MB to 1.6 MB. The shapes are otherwise unchanged.
- **Niger Delta flag.** It still uses the seed's rectangle (4.5–8.5°E, 4.5–7.0°N), so offshore fields like Oso show "No". The panel states this rule.
- **Build-cost log.** `docs/BUILD-COST.md` now records that Claude Code (Opus, subscription) led this pass and absorbed all the code generation, with OpenRouter only writing the brief.
