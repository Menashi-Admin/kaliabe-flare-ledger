# KFL-M 1.7 — Quiet flare + news cross-check

A build in two halves: a daily news feed (GitHub Action, free tier) whose
headlines are matched to ledger flare sites, and a quiet-anomaly detector that
flags sites whose thermal signature drops out of the NASA FIRMS window — the
combination making a story a *cross-check* on a site finding rather than noise.

## Why

A recorded flare that goes silent in the satellite record is ambiguous on its
own: it can be cloud or a missed pass, a deliberate cut in flaring (good), or
the site's gas supply being interrupted — an outage, a pipeline explosion, a
shutdown. The FIRMS silence is a *flag*, not a verdict. A news headline that
names the operator is exactly the corroboration that separates "outage /
incident" from "cloud gap" from "environmental win". The pair is much stronger
than either alone.

Trigger incident: the Soku gas pipeline fire (~2026-10-17) that threatened the
NLNG Bonny plant. Site s_3731 (NLNG, Bonny) shows a 5/5-year GFMR record with
~14.7M m3 in 2025 but zero FIRMS detections across the whole window — a
record-quiet signal that is exactly the kind of thing an investor would want
explained before relying on the record.

## What was built

1. **News feed** — `scripts/news_feed.py` (stdlib only), run daily by
   `.github/workflows/news-feed.yml` (07:15 UTC, after the 06:30 thermal pull).
   Sources are keyless: Google News RSS (en-NG locale, 5 energy queries) plus
   Punch / Vanguard / The Guardian NG outlet feeds. It normalises each item
   (title, source, url, published UTC), drops >3-day-old items, dedupes, and
   matches headline + source text against whole-word aliases of the seed's
   operator and field names. Writes `web/public/data/news/feed.json`. Holds no
   article body; the licence note says verify via the outlet before
   republication. SweetCrudeReports 403s automation so it is intentionally not
   a direct source — Google News RSS still surfaces it.

2. **Quiet detector** — in `worker/src/index.js`, `quietFor(site, live, win)`.
   Two rules, both "possibly" not verdicts:
   - **transition**: the site was detected earlier in the window, then silent
     for ≥4 (QUIET_GAP_NIGHTS) calendar nights;
   - **dark**: the archive shows a flare (GFMR latest-year volume ≥10M m3,
     QUIET_MIN_VOL) with no detection at all in the window.
   A site is only surfaceable this way if the archive volume is real (≥10M m3),
   so the flag cannot latch onto a non-plant.

3. **News cross-check** — `NEWS_JOIN` builds a site_id -> headlines index once
   at module scope from the bundled feed. `news_corroborates` is true only when
   the site went quiet AND the archive shows a real flare AND a headline names
   its operator. The caveat is stated in every quiet item: cloud, missed passes
   and deliberate cuts also cause quiet; a deliberate cut is good news.

4. **API surface** (all additive — nothing changed or removed):
   - `/api/news` — { meta, quiet_sites[], quiet_note, feed[] }. quiet_sites
     sorted by latest-year volume; each carries quiet_since / quiet_nights /
     quiet_rule, and its matched news; feed[] items carry resolved matched_sites
     (with operator/field/state).
   - `/api/invest` — every site row gains `quiet_since`, `quiet_nights`,
     `quiet_rule`, `news` (matched headlines, or null), `news_corroborates`;
     plus a top-level `news_cross_check` summary block.
   - `/api/live` meta gains the news feed meta.

5. **Version** — METHOD_VERSION -> KFL-M 1.7 (2026-10-18); METHOD_CHANGES
   documents the addition. Reproducible offline: `node scripts/build_invest.mjs`
   re-runs the worker on the seed and writes `web/public/data/invest.json`.

## The news feed is bundled + live-refreshed

Like the live-thermal file, `news/feed.json` is committed by the daily GitHub
Action and read two ways: bundled at deploy time (fallback) and re-fetched from
the public repo (raw.githubusercontent.com) every 15 min with the newer
retrieved timestamp winning — so a refresh needs no redeploy and no secret.

## Data honesty

- News holds only headline/source/url/published + matched site ids — no article
  body, and the licence note is explicit that sources retain copyright.
- Whole-word match on operator/field-name against headline+source means a
  non-plant can't latch onto a flare site (Soku > Bonny pipeline explosion did
  NOT match the NLNG sites; only headlines that actually say "NLNG"/"Nigeria
  LNG" do).
- `news_corroborates` is always "corroborates, not confirms". The quiet rules
  and the cloud/deliberate-cut caveat are written into the API and the page.
- Every quiet site meets the archive-volume floor, so the flag always has a real
  flare behind it.

## Verification

Offline reproduction (`scripts/build_invest.mjs`) is deterministic:
  - 476 sites, 0 non-finite numbers; score bands exactly as 1.6
    (A20 B75 C56 D7 gated318) — the add is purely additive.
  - quiet sites 43 (8-night window bias: FIRMS history is new; the false-"dark"
    share collapses as the window grows to its 30-night design).
  - news-corrobated 1 today — s_3731 NLNG (Bonny), the trigger case, matched to
    13 headlines and flagged quiet while the 3 still-burning NLNG sites are
    correctly not flagged.
Live: deploy worker + Pages (bundle with functions/), then probe /api/news,
/api/invest, /api/live for the new fields and correct MIME types.