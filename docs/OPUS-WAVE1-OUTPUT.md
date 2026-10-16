All eight Wave-1 features and `docs/METHODOLOGY.md` are built, deployed and verified live. The work is committed to `main` as **`610fb98`** (not pushed).

## Features shipped
- **A1 Year player.** A timeline under the map runs 2012→2025, with a play/pause button and a slider that works from the keyboard (arrows, Home, End). Site data is loaded once and indexed by year, so moving the year only restyles the existing markers; nothing is fetched or redrawn per frame. Totals for the shown year: volume, sites detected, penalty, CO₂e. Penalties before 2022 are labelled notional.
- **A2 Trend lines.** Hand-drawn SVG line charts with 3-yr and 5-yr change and a dashed line labelled "projection". There is one national chart, which marks the player's year. Clicking any operator card or league-table row opens that operator's panel with its own trend.
- **B1 Peer percentile.** "Larger than N%" (by latest volume) and "improving faster than N%" (by 3-yr change) for every site and operator. They appear on cards, in the site panel, in the operator panel and in the brief.
- **B2 League table.** A Cards / League table toggle. Every column sorts, the headers work from the keyboard, and the table has proper header markup.
- **C1 Penalty exposure.** Current, cumulative 2012–2025 and a 3-year projection, for each site, each operator and nationally. The US$2.00/1,000 scf rate and the existing conversion constants are reused unchanged; Oso's penalty is still exactly US$21,779,967.54.
- **C5 Scenario slider.** "Reduce flaring by X%" in the site panel, the operator panel and the national section. It recomputes volume, CO₂e, methane-equivalent and penalty instantly, is labelled as a scenario, and carries into the brief link.
- **E2 Watchlist.** Three lists:
  - **Rising:** threshold of 25, 50 or 100%; 89 sites at the default 50%.
  - **Newly detected:** 25 sites.
  - **Top decile by volume:** 50 sites.

  Every row opens that site on the map.
- **F1 Decision brief.** `/api/brief?scope=national|operator|site&id=…&cut=…&format=html|csv`. The HTML is self-contained and prints to PDF; the CSV comes from the same rows. Each brief is stamped with the method version (KFL-M 1.1) and the data vintage.

## Live URLs
- Site: https://kaliabe-flare-web.pages.dev
- API: https://kaliabe-flare.menashiconsulting.workers.dev
- Example brief: https://kaliabe-flare-web.pages.dev/api/brief?scope=operator&id=Shell&cut=30

## Verification
- **HTTP checks: 41 of 41 passed** against both the Worker and the site.
  - Every page and script returns 200, and the three map layers return 200 with 37, 774 and 154 features.
  - Every new field is present on all 476 sites and is a real number. The only blanks are 112 sites whose 3-year base year had no detection; there the change and improvement rank show as "n/a" by design.
  - No response contains NaN.
  - The national, operator and site briefs return real content, the CSV brief returns 45 rows, and an unknown site id returns 404.
  - The CSV digest still has 6,664 rows.
- **Speed:** `/api/sites` takes 0.05–0.4 s through the site, against about 0.5 s before. The response grew from 558 KB to 774 KB uncompressed, which is **68 KB** compressed.
- **Headless Chrome pass on production: no console errors and no failed requests.** It covered:
  - moving the year player by keyboard and play/pause;
  - clicking a real flare (Oso) and moving its scenario slider to 30%;
  - opening its brief in a new tab and printing it to a 2-page A4 PDF;
  - the operator panel, league-table sorting by mouse and keyboard, and watchlist rows;
  - a mobile layout with no sideways scrolling.

## Decisions you may want to revisit
- **Rising watchlist order.** Some changes are huge because the base year was tiny; Egbema West went from 0.56 to 285 million m³, which is +50,770%. I didn't filter these out. Instead the list is sorted by volume added and shows both the absolute change and the percentage.
- **Shared maths file.** The conversion maths, the scenario calculation and the chart live in one file, `web/public/js/ledger-core.js`. Both the website and the Worker (for the brief) use it, so the site and the brief can't disagree.
- **Penalty rate caveat.** `docs/METHODOLOGY.md` says the Ledger applies the US$2.00 rate to every producer, although the regulations set different charges by producer category. Small-producer figures are therefore upper bounds. Check this against the Gazette before citing a specific producer.

## Not completed (also noted in `docs/FEATURE-SET.md`)
- **Per-state trend lines.** Sites are only matched to states in the browser, one site at a time, so a state roll-up has to come first (feature B3, Wave 2).
- **Threshold-crossing alerts in the watchlist.** There are no thresholds to cross until the EU methane check (D1) exists. The rising, newly detected and top-decile lists are live.
- **A downloadable PDF file.** The brief is print-to-PDF HTML rather than a generated PDF, to avoid adding a PDF service or any running cost.
- **Old database column.** The stored `bcm` column flagged last pass is still stale. Nothing reads it, and this pass didn't touch it.

The untracked `.prismor/` folder and the empty `docs/OPUS-WAVE1-OUTPUT.md` were left out of the commit.
