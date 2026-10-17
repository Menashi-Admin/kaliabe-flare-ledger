# Build record — data-source + threshold tuning (KFL-M 1.2) and the launch blog

Pass led by Claude Code (Opus, subscription), 2026-10-17. Brief: `docs/BUILD-BRIEF-TUNING.md`.

## Corrected citation
**Flare Gas (Prevention of Waste and Pollution) Regulations, 2018**: S.I. No. 9 of 2018, Federal Republic of
Nigeria Official Gazette No. 88, Vol. 105, 9 July 2018 (made 5 July 2018 under s.9 Petroleum Act and s.5
Associated Gas Reinjection Act).

- **Reg. 13(1):** US$2.00 per 28.317 scm (1,000 scf) where ≥10,000 bbl/d is produced.
- **Reg. 13(2):** US$0.50 per 28.317 scm (1,000 scf) where <10,000 bbl/d is produced.
- **Exemptions:** force majeure; Deliver-or-Pay volumes (Reg. 13(3)).

The citation and the Reg. 13 text were checked by OCR of the NUPRC-hosted scanned gazette. Its checksum is
pinned in `docs/DATA-SOURCES-REGISTRY.md`.

## What changed
- **Two-tier penalty everywhere.** The API, drawer, national section, operator cards, league table, site
  table, year player, scenario, brief and CSV all show the $2.00 and $0.50 tiers.
  - The flat `penalty_usd_latest` field is removed, replaced by `_upper` and `_lower`.
  - No midpoint is published. The assumption is stated, and the exemptions are shown as "not deducted".
- **GFMR vintage.** The seed is the June 2026 release (tracker of 23 June 2026, three satellites, restated
  2012–2025 series). The workbook's global 2025 total is 166.6 bcm against the tracker's 167 bcm. The vintage
  is labelled in `meta.vintage`, on the site and in every brief.
- **Emissions constants.** 429/167 = 2.569 MtCO₂e per bcm and 50/167 = 0.2994 MtCO₂e unburned methane per bcm
  (June 2026 tracker, data year 2025). Methane is now reported as CH₄ mass: 1.8/167 = 0.01078 Mt per bcm. The
  old 389/151 and 46/151 figures are kept in a comment.
- **Niger Delta.** The flag now comes from point-in-polygon against the nine-state union from the ADM1 layer.
  - Result: 405 Niger Delta, 70 offshore (labelled with nearest state and km), 1 outside.
  - 69 sites changed flag: 27 offshore fields moved out, 42 in-state sites moved in.
  - Oso is now "Offshore, beyond the state boundary — nearest state Rivers (Niger Delta), 18.3 km".
- **Thresholds.** One named set, `THRESHOLDS` in `ledger-core.js`, exposed as `meta.thresholds` and rendered
  on the methodology page.
- **Source validator.** `scripts/validate_sources.py` writes `docs/DATA-SOURCES-REGISTRY.md` and exits
  non-zero if any source is unreachable.
- **Blog.** `/blog/` (minimal index) and `/blog/why-this-page-exists/`, built by `scripts/build_blog.py`;
  "Writing" link in the nav and footer.

## New threshold defaults
| Threshold | Default |
|---|---|
| Rising | 3-yr change ≥ 25% (options 25/50/100) **and** ≥ 0.5 million m³ added |
| Small-base flag | base < 1 million m³ |
| Trend significance | stable within ±5%; a direction needs ≥ 0.5 million m³/yr between the window means and ≥ 2 detected years in each window; otherwise "not significant" |
| 3-/5-yr change significance | ≥ 0.5 million m³ and beyond ±5%; otherwise shown muted, "n.s." |
| Peer percentiles | volume peer set = members with a latest-year detection (249/476 sites); improvement peer set = members with a detected base year (364/476); the rest n/a; peer-set size printed |
| Top decile | ≥ the 48th-largest latest-year volume of all 476 sites; cut-off 39.13 million m³ (2025), shown in the UI |
| Scenario | 5% steps; outputs rounded to 3 significant figures; always labelled with its assumption |

Effect on trend labels: 72 rising / 126 falling / 10 stable / 213 not significant / 34 new / 21 inactive.
Under 1.1 it was 98 rising and 313 falling.

## Live
- Site: https://kaliabe-flare-web.pages.dev
- Blog: https://kaliabe-flare-web.pages.dev/blog/why-this-page-exists/
- API: https://kaliabe-flare.menashiconsulting.workers.dev (proxied at `/api/*`)
- Site brief with scenario: https://kaliabe-flare-web.pages.dev/api/brief?scope=site&id=s_3987&cut=35

## Verification
- **Live HTTP:** 39/39 checks pass. These cover the citation on all pages, both tiers in the API and
  briefs, the Niger Delta changes for offshore examples, the blog (200, heading hierarchy), every layer
  (200) and no NaN in any response.
- **Source validator:** 12/12 sources reachable; pinned checksums match.
- **Headless Chrome (production):** blog desktop and mobile (no overflow), flare drawer, scenario slider,
  brief, watchlist and league table. 0 console errors, 0 failed requests.

## Not completed
- **Remote D1 reseed.** It is blocked by the Prismor `db-modification` policy and is destructive anyway.
  The Worker reads the classification from the bundled `worker/src/niger-delta.json`, so the stale D1
  `in_niger_delta` column is no longer read. `worker/seed.sql` is regenerated for the next reseed.
- **The brief's "2025 tracker" label.** The brief attributed 167 bcm / 429 / 50 to the 2025 tracker. They
  are from the **June 2026** tracker (data year 2025), and are labelled as such.
- **Blog statistics.** The blog's statistical claims (e.g. "In 2024 our flaring rose 12 percent") are
  rendered as written and were not re-verified in this pass.
