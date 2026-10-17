# BUILD BRIEF — Data-source + threshold fine-tuning, and the launch blog page

You are Opus leading this build via Claude Code. Repo: `/home/ubuntu/kaliabe-flare-ledger`.
Read `README.md`, `ARCHITECTURE.md`, `docs/METHODOLOGY.md`, `docs/DATA-LICENCES.md`,
`docs/FEATURE-SET.md`, `web/public/js/ledger-core.js`, `web/public/js/atlas.js`,
`worker/src/index.js` first.

Constraints: native Ubuntu; fresh shells (`source ~/.bashrc` or `~/.npm-global/bin` for npx/wrangler).
Only touch this repo. Native Ubuntu, not WSL. Deploy and verify live with real checks.
Build costs: heavy generation goes to the Claude Code / Codex subscriptions; keep OpenRouter minimal.

## PART 1 — CRITICAL DATA FIX: the penalty basis is wrong on the site

We have been citing "NUPRC 2022 Flare Gas Regulations". That is **incorrect**. The governing
instrument is:

> **Flare Gas (Prevention of Waste and Pollution) Regulations, 2018**
> S.I. No. 9 of 2018 — Federal Republic of Nigeria Official Gazette No. 88, Vol. 105, 9 July 2018
> (made 5 July 2018 under s.9 Petroleum Act and s.5 Associated Gas Reinjection Act)

Regulation 13 sets a **tiered** flare payment on the volume of gas flared, by production rate:

- **Reg. 13(1)** — where **10,000 barrels or more of oil per day** is produced in an OML or field
  designated a Marginal Field: **US$2.00 per 28.317 standard cubic metres (1,000 scf)**
- **Reg. 13(2)** — where **less than 10,000 barrels of oil per day** is produced: **US$0.50 per
  28.317 scm (1,000 scf)**

Both apply "irrespective of whether the flaring is Routine or Non-Routine". Reg. 13(3) excludes an
agreed volume of flare gas committed to a Permit Holder under a **Deliver or Pay Agreement** from
the date the flare reduction project starts commercial operations. Reg. 13(1)–(2) also exclude
flaring caused by **act of war, community disturbance, insurrection, storm, flood, earthquake or
other natural phenomenon beyond the producer's reasonable control** (force majeure).

**Required changes:**
1. Correct the citation everywhere (worker, site, methodology, data pages, README, briefs):
   **2018 Regulations, S.I. No. 9 of 2018**, not 2022.
2. We do **not** hold per-field oil production rates, so we cannot determine which tier applies to
   each site. Therefore **stop presenting a single flat $2.00 figure as "the" penalty.** Present a
   **range with the tier shown explicitly**:
   - headline: penalty at the **$2.00 tier (upper bound, ≥10,000 bbl/d)** and at the **$0.50 tier
     (lower bound, <10,000 bbl/d)**, and the **midpoint is NOT to be used**
   - state the assumption plainly: "we do not hold production rates; the regulation sets $2.00
     (≥10,000 bbl/d) or $0.50 (<10,000 bbl/d)"
   - keep all existing conversion constants exact: 1,000 scf = 28.317 m³; do not invent new ones
3. Show the two exemptions in the method: force majeure, and Deliver-or-Pay volumes.
4. Bump the method version to **KFL-M 1.2** and record the change in the methodology and the
   brief's method stamp.

## PART 2 — Other data-source fine-tuning

**2a. GFMR vintage and constants.** Our seed runs 2012–2025. The World Bank's June 2026 Global Gas
Flaring Tracker introduced an improved methodology (three satellites rather than one, revised
calibration). Confirm which vintage our seed reflects and **label the vintage explicitly** in the
API, the site and every brief. Update the emissions conversion constants to the latest published
figures and label their vintage: the 2025 tracker reports 167 bcm global → **429 MtCO₂e, including
50 Mt as methane**. Recompute the per-bcm constants from those figures and state the source year.
Keep the older figures in a comment for traceability.

**2b. The Niger Delta flag is wrong.** It currently uses a rectangle (4.5–8.5°E, 4.5–7.0°N), which
misclassifies offshore fields such as Oso. Replace it with a real boundary: the union of the
**Niger Delta states** (Abia, Akwa Ibom, Bayelsa, Cross River, Delta, Edo, Imo, Ondo, Rivers)
derived from the ADM1 layer we already ship, and classify a site by point-in-polygon. Keep the
"offshore / beyond the boundary" case honest and labelled rather than silently bucketed.

**2c. Source registry + validator.** Add `scripts/validate_sources.py` which, for every source we
depend on, checks reachability, records the version/vintage, a checksum of the fetched bytes, and
the licence, and writes `docs/DATA-SOURCES-REGISTRY.md`. It must exit non-zero if a source is
unreachable so a stale source is visible rather than silent. Do not fabricate a source entry: if
something cannot be verified, record it as unverified with the reason.

## PART 3 — Threshold fine-tuning (make the filters defensible)

All thresholds must live in one place (`ledger-core.js`) as a documented, named set, and be
explained on the methodology page. Tune as follows:

1. **Rising list — kill small-base noise.** Currently a site going from 0.56 to 285 million m³
   shows +50,770 percent. Require **both** a minimum percentage **and** a minimum absolute volume
   added before a site qualifies as "rising". Defaults: ≥25% and ≥0.5 million m³ added; keep the
   25/50/100% options but apply the absolute floor to all of them. Show both figures in the row.
2. **Trend significance.** Do not label a change as rising or falling when it is within detection
   noise. Define a significance rule (for example, a minimum absolute change and a minimum number
   of detected years in both comparison windows) and label non-significant changes as such
   instead of a direction.
3. **Peer set and percentiles.** State the peer-set size wherever a percentile appears, and make
   the rule explicit: sites with no usable base year are excluded from the calculation and shown
   as "n/a" rather than counted as zero.
4. **Top decile.** Define it explicitly (latest-year volume, decile of the full site set) and show
   the cut-off value in the UI so the boundary is not a mystery.
5. **Scenario slider.** Round the displayed scenario output sensibly and never let a scenario
   figure appear without the "scenario" label and its assumption.
6. Document every threshold and its default in `docs/METHODOLOGY.md` and on the site's methodology
   page, including why the absolute floor exists.

## PART 4 — The launch blog page

`blog/why-this-page-exists.md` is written. Publish it on the site as a real page:
- `web/public/blog/why-this-page-exists.html` (or `web/public/blog/why-this-page-exists/index.html`),
  styled consistently with the rest of the site (same masthead, footer, cream/paper, ink, one
  accent; restraint and negative space; readable measure; mobile-usable).
- Add a **Writing / Blog** link to the primary nav and a link in the footer.
- Render the article faithfully with proper heading hierarchy, a byline and date, and links to the
  methodology and data pages.
- Do not add analytics, fonts, or any new dependency that adds recurring cost.
- If you create a blog index, keep it minimal.

## PART 5 — Deploy and verify (show the evidence)

- Deploy Worker and Pages.
- Verify live with real HTTP checks and report the raw results: the corrected citation appears on
  the site; the two-tier penalty range is returned by the API and shown in a brief; the Niger Delta
  classification changed for the offshore examples; the blog page returns 200 and renders; every
  layer still returns 200; no response contains NaN.
- Run `scripts/validate_sources.py` and paste its output.
- Headless browser pass if available: open the blog, open a flare, move the scenario slider, open
  a brief; report console errors. If the browser is unavailable, say so plainly.
- Commit to `main`.

## PART 6 — Docs

- Update `docs/METHODOLOGY.md`, `docs/DATA-LICENCES.md`, `docs/FEATURE-SET.md` (tick what shipped),
  and append to `docs/BUILD-COST.md` (this pass led by Claude Code / Opus subscription).

## Final output
Print a factual summary: what changed, the corrected citation, the new threshold defaults, live
URLs, verification evidence, commit hash, and anything you could not complete. Say so plainly
rather than faking it.
