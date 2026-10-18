# BUILD BRIEF — Investable Score (KFL-M 1.6) with full methodology + tooltips

## Goal
Add a normalized, per-site **Investable Score** to the Flare Tracker that turns the
derived data (live thermal persistence/intensity, population + power-gap, security
incidents, siting viability) into a single investor-readable figure shown alongside a
clear, auditable methodology. User directive: "showcase that theorized score and the
methodology. Have opus stress test. Add a slight mouse-over with explainer of derived
figures so it is understandable."

## What is being scored
Every GFMR flare site (476) gets an Investable Score 0-100, plus a grade band and a
per-component breakdown. Three headline questions exactly as the user framed:
1. Is the flare **consistent** (reliable fuel supply)? -> harsh persistence + intensity terms.
2. Is it **close enough to underpowered population** (real demand)? -> demand + access-gap terms.
3. Is it **secure enough to reassure investors**? -> security-posture terms.
Plus a siting/viability term (onshore, minimum MW) as a gate.

## Components (all normalized 0-100, log-scaled; weights are documented guesses — Opus must stress-test)
- **Consistency & intensity 28%** — derived from the live FIRMS history + GFMR annual volume:
  - detection persistence = fraction of recent nights the site had a VIIRS hit (from `firms_history.json`)
  - latest-year gas volume (normalized); trend (rising vs declining, from `trend_pct`)
  - mean FRP (normalized) as an intensity signal (use FRP, NOT raw bright_ti4 K in the score)
  - the underlying units (bright_ti4 K, FRP MW) stay visible as *inputs* but are normalized out of the score.
- **Population & power-gap 34%** — from `pop_demand.json` + `access_rates.json`:
  - people within 10 km without grid (log scale)
  - rural access proxy (lower = higher score)
  - nearest settlement distance; households servable
- **Security posture 26%** — from `security.json` incidents (Oxford overlay) + ACLED LGA:
  - inverse of incident counts 10/25/50 km; deaths; dominant state exposure; NGO/ACLED LGA trend
- **Siting viability 12%** — reuses the KFL-M 1.5 gates (onshore, >=0.1 MW) as a base; score 0 if a gate fails hard.

## Output surface
- New `/api/invest` route (same Worker pattern as `/api/siting`): returns ranked sites with
  Investable Score, grade band, per-component scores + bases + `label: estimate`, and a
  top-line methodology summary.
- New page `invest.html` in house style: leaderboard, filterable by band, per-site detail
  showing each component's score + the derived inputs that drove it.
- **Tooltip / explainer layer** (user-requested): a hover (mouseover) explainer on every
  derived figure — e.g. hovering "Consistency 82" shows "Share of recent VIIRS nights this
  site was detected flaring, from NASA FIRMS (NOAA-20/21, Suomi NPP)." Every brainteaser
  term (bright_ti4, FRP, access proxy, servable households) gets a plain-language one-liner.
- Methodology write-up: `docs/METHODOLOGY.md` "Investable Score" section + a short block
  on `invest.html` linking to it. Reuse the bald honesty footnote pattern ("a screening
  score for triage, not a feasibility or investment recommendation").

## Honesty & data rules (non-negotiable, track record)
- Every component labelled `estimate` with its basis + source + vintage.
- bright_ti4 (K) and FRP (MW) shown as inputs with tooltips, NOT fed raw into the score —
  they are normalized.
- Zero NaN; missing terms documented and renormalized (weights_used < 1 marks it), same as siting.
- No fabricated values; every figure from the real bundled JSON (firms_history, security,
  pop_demand, access_rates, seed). Do NOT reseed D1 (Prismor blocks remote D1 writes).
- Version bump to **KFL-M 1.6 (2026-10-18)** with a changelog line.

## Opus: stress-test the methodology
This is the explicit ask. Before shipping:
- Check the persistence term against a known-bad case (a site with one warm pixel but no
  real flare) and a known-good case (consistent high-FRP site like the top siting picks).
- Check the security term does not unfairly tank stable-but-tense sites vs genuinely hostile ones.
- Sanity-check normalization doesn't compress all 476 sites into a tiny band (spread check).
- Verify the worker serves /api/invest with 0 NaN and matches an offline run on the committed seed.
- Flag any term where your judgement call could mislead an investor; put it in the write-up.

## Engineering constraints (match established repo pattern)
- Reuse ledger-core.js derivation + the siting mechanism. Keep existing routes/pages working.
- Match house design tokens; no new colors; no em/en dashes; no curly quotes; sentence-case headings.
- Worker reads bundled JSON only. Deploy Pages with Functions attached (last regression was
  deploying ./web/public without functions — deploy the FULL bundle incl. web/functions, to production branch main).
- Costs: zero recurring run cost at inference.

## Definition of done (verify, don't just complete)
- scripts or core precompute -> web/public/data/invest.json; worker /api/invest live (0 NaN,
  spread present, matches offline seed run); invest.html + tooltip layer live on
  flaretracker.kaliabe.ng; methodology documented; KFL-M 1.6 served; commit pushed to main.

## References
- Repo: /home/ubuntu/kaliabe-flare-ledger
- Inputs: web/public/data/live/firms_history.json (bt4, frp per night per site),
  web/public/data/security.json (incidents), web/public/data/pop_demand.json,
  web/public/data/access_rates.json, data/gfmr_nigeria_sites_seed.json
- KFL-M 1.5 /api/siting (worker/src/index.js ~line 818+), script build_siting.py
- House patterns: docs/DEVELOPMENT.md, docs/METHODOLOGY.md, web/public/siting.html
- Traks analytics snippet is already on every page — keep it in place during this build.