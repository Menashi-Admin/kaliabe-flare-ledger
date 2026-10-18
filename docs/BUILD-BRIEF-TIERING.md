# BUILD BRIEF (Addendum) — Tiered Data & Partner CTA (KFL-M 1.6+)

User directive (verbatim intent): "While building, make sure we can tear this out. There
should be a tier of data available just public on the site. For data that drives final
investment decisions etc., make sure there's a call to action pointing them toward
messaging Kaliabe for our methodology and to partner for getting this info in a more
official capacity. As we build, think about the tiered score / tiered service we implement."

This is the freemium/partnership layer that turns the Investable Score into a channel.

## The two tiers (public vs partner) — what is REAL

**TIER 1 — PUBLIC (free, stays on the live site). Everything that is reproducible from
open data and already shipped:**
- Site map (476 GFMR sites), flaring volumes + trend, penalty exposure, national aggregates
- KFL-M 1.6 Investable Score (0-100) + per-component breakdown + the published methodology
- Oxford incident overlay (CC BY), population/power-gap context, siting screen for mini-grids
- The digest CSV (aggregate-level), so anyone can sanity-check the scoring
- This tier is intentionally the *triage screen*: enough to identify good sites, NOT enough
  to close a deal. That is the design. Nothing here is withheld that is already open.

**TIER 2 — PARTNER / OFFICIAL (gated). The datasets that materially change an investment
decision and can only be produced under our methodology or an official data license:**
- Verified, correct-to-name operator/facility registry + gas-flow validation against
  measured (not just satellite-estimated) flare volumes
- Gas composition / calorific value, off-take and PPA price scenario work, tariff + grid
  stress tests per project
- Project-level investment memo modules: build cost, route/transmission, security-adjusted
  de-risking, IRR ranges (labelled estimate)
- Full data-pack export (CSV/Excel/API), white-labelled reports, ongoing monitoring feed
- Requires a partnership conversation (methodology licence + official data access), NOT a
  self-serve signup. Keep it gated on purpose: the moat is our methodology + the official
  datasets we can reach under contract.

## The CTA (the "tear out" / conversion layer)
- On every premium-worthy surface — invest.html site detail, the methodology page, the
  digest page — a clear, house-style call to action in the sidebar/footer:
  "Want the full investment data pack for a screened site? Talk to Kaliabe. We license the
  methodology and can provide verified, official-capacity data for final investment decisions."
- CTA target: Kaliabe inbox (the user's described lane: "messaging Kaliabe for our
  methodology and to partner"). Use the established Kaliabe sending/contact surface
  (contact@kaliabe.ng per the outreach brand rule) plus a mailto form on site. Confirm the
  exact inbox with D O before going live.
- Copy rule: no hype, no "contact us" slop. One honest sentence + the ask. No em/en dashes,
  no curly quotes.

## Tiered service ladder (for our own pricing/partner structure, not yet public pricing)
1. Public (free) — the live site + aggregate digest + methodology. Grows the funnel, builds
   credibility, proves the data.
2. Pro / Data Pack — per-project investment memos + full export + API. License fee.
3. Enterprise / Advisory — sit-in with our methodology, custom models (siting/cost/security
   for a specific concession), diligence support, white-label, ongoing monitoring.
Ladder is a design artifact first; implement the public/partner split now, price the middle
rungs with D O when there are buyers.

## Implementation for THIS build cycle (fold into KFL-M 1.6, keep it small)
- Add the CTA component to invest.html + methodology (a reusable callout block, house style,
  points to the Kaliabe contact). No new back end needed.
- Mark which invest.json fields are public vs partner-gated in the response (e.g.
  `tier: 'public' | 'partner'` per field group) so the same data model serves both surfaces
  later without a rebuild.
- Do NOT put real gated data on the site yet. This cycle only: the CTA + the tier labels in
  the data model + the methodology line saying what partner tier covers. Amount of gated
  content ships when we have a commercial answer.
- House style + honesty rules as the parent brief.

## Definition of done (this addendum)
- invest.html + methodology show the Kaliabe CTA callout; tier field present in /api/invest;
  copy is honest, no hype; exact CTA inbox confirmed with D O; nothing gated is leaking to
  the public surface; still 0 NaN, KFL-M 1.6, all existing pages + Traks intact.

## References
Same repo as KFL-M 1.6 (docs/BUILD-BRIEF-INVEST.md). Outreach brand rule: Nigeria brand =
Kaliabe, contact@kaliabe.ng; Menashi is US execution/credential only. Do not invent a new
inbox without confirming with D O.