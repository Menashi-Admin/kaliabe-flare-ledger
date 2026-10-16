# BUILD BRIEF — Decision Layer Wave 1

You are Opus leading this build via Claude Code. Repo: `/home/ubuntu/kaliabe-flare-ledger`
(Cloudflare Worker `kaliabe-flare` + D1 + Pages `kaliabe-flare-web`).

Read: `README.md`, `ARCHITECTURE.md`, `docs/BUSINESS-CASE.md`, `docs/FEATURE-SET.md` first.
Constraints: native Ubuntu; each shell is fresh (`source ~/.bashrc` or use `~/.npm-global/bin`).
Only touch this repo. Deploy and verify live with real checks before claiming success.

## Goal
Turn the Ledger from a map into a **decision surface** by shipping the Wave-1 feature set from
`docs/FEATURE-SET.md`. Every feature must be an overlay or trend on the existing open-data spine —
no new proprietary data. Every figure keeps its source + uncertainty.

## Ship these (Wave 1)

**A1 — Year player.** A timeline control under the map (2012→2025). Scrubbing a year re-renders
flare markers for that year; a play/pause animates it. Recompute totals for the selected year.
Must be smooth (prefetched data, indexed by year — do not refetch per frame).

**A2 — Trend lines.** For any operator (and for the national aggregate) render a real multi-year
volume trend line (hand-rolled SVG, no chart library) with 3-year and 5-year change figures.
Clicking an operator card opens its trend.

**B1 — Peer percentile.** For each operator, compute and display percentile rank vs the national
set on latest-year flared volume (and on trend direction). Show it on the operator card and in the
detail drawer ("larger than N% of operators", "improving faster than N%").

**B2 — League table.** A sortable table view: operator, sites, latest volume, cumulative volume
(2012–2025), 3-yr change %, penalty exposure current + cumulative, percentile. Sortable by any
numeric column. Add a small "League table" section (or a view toggle next to Operator compliance).

**C1 — Penalty exposure.** Per operator and nationally, show **current** penalty, **cumulative**
(2012–2025) penalty at the NUPRC rate, and a simple **forecast** (extrapolate the last 3 years'
trend, clearly labelled as a projection, not a fact). Reuse the existing US$2.00/1,000 scf basis
and the existing conversion constants — do not invent new ones.

**C5 — Scenario slider.** In the flare detail drawer (and operator card), a slider: "reduce flaring
by X%" which instantly recomputes volume, CO₂e, methane-equivalent and penalty for the selection.
Clearly label the output as a scenario.

**E2 — Watchlist / alerts.** A view listing: sites that are **rising** (3-yr change > threshold),
sites **newly detected** (first year within the last 2), and sites in the **top decile by volume**.
Derived purely from the API data, computed client-side. Each row links to that site on the map.

**F1 — Exportable decision brief.** A button that generates a **self-contained HTML/print brief**
(and a CSV) for the current selection — site, operator, or national. Contents: headline figures,
trend, percentile, penalty exposure with forecast (labelled), scenario assumptions if set, source
list, method version, and a data-vintage date. Print-friendly CSS so it saves to PDF cleanly.

**Also:** create `docs/METHODOLOGY.md` — the in-repo public method + confidence document (the
README and ARCHITECTURE both link to it). Mirror the site's methodology page: what VIIRS measures,
the radiance→flow calibration and its uncertainty, how verdicts and confidence are computed, the
detection floor, the penalty basis and conversion constants, the Niger-Delta rectangle caveat, and
the honesty constraints. Cite sources.

## Engineering requirements
- Keep derivation in the Worker where it is genuinely shared (add API fields rather than duplicate
  math in JS), but trend/percentile/scenario computation may be client-side off `/api/sites`.
- Do not regress existing performance (`/api/sites` currently ~0.5s). If you add server fields,
  keep it to a single pass.
- No chart library. Hand-rolled SVG. No new runtime dependencies that add recurring cost.
- Keep the existing design language (cream/paper, ink, one accent; restraint; negative space).
  Mobile-usable.
- Accessibility: the timeline and sliders must be keyboard-operable; tables have proper headers.

## Deploy + verify (show the evidence)
- Deploy Worker and Pages.
- Verify live with real HTTP checks: each new API field present and non-NaN; the site loads; a
  brief export returns real content; every layer still 200.
- Do a headless browser pass if available (clicking a flare, moving the year player, exporting a
  brief) and report console errors — or say plainly that the browser pass was unavailable.
- Commit to `main` with a clear message.

## Update docs
- Append to `docs/BUILD-COST.md` (this pass led by Claude Code / Opus subscription).
- Tick off the Wave-1 items in `docs/FEATURE-SET.md` as shipped, and note anything deferred.

## Final output
Print a factual summary: features shipped, live URLs, verification evidence, commit hash, and any
feature you could not complete (say so plainly — do not fake it).
