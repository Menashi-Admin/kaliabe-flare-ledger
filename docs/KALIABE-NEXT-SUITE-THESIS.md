# Kaliabe Next-Suite Thesis — from 35 Friction Scans (Jul→Oct 2026)

Source: 35 competitive-friction scans (3-day cron, 2026-07-07 → 2026-10-19).
Aggregated by 4 fact-gatherers; this is the synthesized thesis for build options.

---

## 1. What the data says (the frictions, distilled)

The 35 scans are strikingly consistent across ~3.5 months. Three threads dominate
every era:

### A. Fraud / security — the persistent #1 friction
- Top category in 8 of 9 July windows; ~70% of signals on Jul 25/28; sustained
  through Oct (fraud/enforcement re-dominates 10-16 and 10-19).
- Escalating vector ladder: card/data breach (Providus 281,500 accts) → AI/
  deepfake/social-engineering → crypto cross-border scams (EFCC ₦162bn, US $97.1M)
  → insider/institutional fraud → ATM jackpotting → account-takeover.
- **TAM anchor:** ₦25.85bn fraud-loss leak-through (down from ₦52.26bn YoY but
  still leaking). CBN refunded ₦19.12bn + $329.3m and flagged 13,117 fraud-linked BVNs.

### B. Counterfeit / fake-receipt / impersonation fraud ecosystem (Sep–Oct)
- Slipcraft fake transfer receipts · fake OPay transfer-alert apps · fraudulent
  FRSC government portals · N1bn undetected cross-border fraud · Bitget hot-wallet
  hack ($351.6m). A coherent *"verify the claim is real"* market.
- Prembly launched FraudLens (a fintech-fraud tracker) — validates the category.

### C. Regulatory enforcement & compliance pressure (every month)
- **CBN data-localisation directive — 1 Jan 2027 deadline** (local hosting of
  financial data). Stress-testing directive, BVN/watch-list, automated-AML baseline,
  bank-holdco supervision, forex-domiciliary clampdown, fintech onboarding throttling.
- NDPC matured from signaling to enforcement (CAC, NIPSS, UNILAG/Lotus probes;
  N12bn budget, 27,000 jobs, EFCC-recovered HQ, 17 nations studying the model).
- NGX ₦540m penalties on 34 companies · SEC terrorism-financier asset freezes ·
  tax-digitalization (FIRS/Imara most-tagged initiative every window).
- "Debited, no cash" POS/refund failures · NIBSS rail downtime · MTN outages —
  payments-reliability trust is a steady secondary friction.

### Recurring structural observations
- **No central fraud data pool** → each fintech fights blind (Prembly/MTN Fraud
  Intelligence Summit = industry admitted siloed defense fails).
- Fintech funding winter → insolvency (Gigbanc, Chimoney) → orphaned disputes.
- Power/grid instability is a chronic separate thread (manufacturing/digital ops).
- Scan-health: Techpoint Africa + The Cable persistently 403 (infra fragility).

---

## 2. What we already own at Kaliabe (the asset base to extend)

The Flare Tracker + ledger suite is live at flaretracker.kaliabe.ng and has
proven a specific product architecture Kaliabe can reuse:

1. **Owned-data scoring engine** — satellite thermal data + GFMR volumes → every
   flare scored 0–100 (KFL-M 1.6/1.7), no NaN, reproducible offline.
2. **News cross-check / corroboration layer** — a scheduled GitHub Actions feed
   (Google News RSS + curated outlets) joins headlines to site findings; flags
   "record quiet" anomalies and tells outage vs sensor-gap vs environmental win
   apart (KFL-M 1.7 /api/news). *This is literally "external data validates a claim."*
3. **Honesty ledger** — every figure carries source + vintage + assumed flag;
   estimates labelled; no absolute claims. This IS the trust product.
4. **Tiered data / partner model** — Tier 1 public-free, Tier 2 partner-gated,
   CTA → contact. A monetization rail already built.
5. **KCC commodity cost tracker** — a second owned-data engine (rates, OSRM
   distances, honest bands) live at /kcc. Proves the pattern generalizes beyond flares.
6. **Free-tier infra discipline** — GitHub Actions, no paid secrets, public-repo
   cron pattern. Repeatable, cheap, owns the data.

**Specialties to apply:** application development; AI/LLM training and tooling;
satellite/thermal data; market intelligence; compliance framing (AWS Well-Architected,
D O's AWS Security + AI Practitioner).

---

## 3. Thesis (the connection)

> **The Flare Tracker proved Kaliabe can build an owned-data, honesty-led,
> cross-checked, tiered-monetization intelligence product. Nigeria's #1
> persistent friction — fraud, counterfeit receipts, and regulatory-compliance
> enforcement — is the same product problem: a market drowning in unverifiable
> claims with no trusted, independent layer to confirm "is this real / are you
> compliant." The next Kaliabe suite is a family of verification-and-trust
> applications that reuse the Flare Tracker architecture (owned data + cross-check
> + honesty ledger + tiered gating) pointed at Nigeria's financial/regulatory
> trust vacuum.**

Not "another detection tool" (OPay owns the anti-fraud PR narrative) — the
scans repeatedly say the open lane is **verification / remediation / trust
infrastructure**: the layer that confirms a receipt is real, a payment settled,
a service is reliable, a company is compliant — *after* the AI flags the fraud.

---

## 4. Candidate build options (for Opus stress-test)

Ranked by (friction fit × Kaliabe-asset reuse × monetization speed):

### Option A — VerifyReceipt: payment-confirmation / receipt verification API
- **Friction:** counterfeit-receipt ecosystem (Slipcraft fake transfers, fake OPay
  apps, fake FRSC portals, fake transfer-alert fraud). Quantified N1bn undetected,
  +35% bank scams (BioCatch).
- **Reuse:** news cross-check pattern inverted — instead of "headlines validate a
  flare site," "a payment claim is validated against a trusted confirmation ledger."
  Honesty ledger + tiered API (free verify / paid partner API).
- **Monetization:** API calls / partner tiers / fraud-dispute evidence as a service.
- **Build:** verification endpoint + confirmation fingerprinting + cross-check
  against bank/NIBSS/PSP rails (where accessible) + alert feed.

### Option B — Nigeria Digital-Service Reliability & Fraud-Intel Tracker
- **Friction:** "debited no cash" POS failures, NIBSS downtime, MTN outages,
  ProvidusUnity glitches, FirstBank app outage — plus the fraud-data-sharing gap
  (no central pool; Prembly/MTN summit admits it).
- **Reuse:** the Flare Tracker pattern maps almost 1:1 — a live reliability/
  trust scoreboard of Nigerian financial/digital services, with a fraud-intel
  news cross-check feed (the /api/news architecture) as the "record quiet" layer.
- **Monetization:** partner-gated (Tier 2) reliability scores for enterprise
  procurement/compliance; public free tier for visibility. Position as independent
  verification — the neutral auditor, exactly the lane the scans flag.
- **Build:** scheduled GHA ingest of outage/fraud signals → reliability scoring →
  fraud cross-check feed → tiered API + scoreboard page.

### Option C — Compliance-Evidence Ledger (CBN data-localisation + NDPC readiness)
- **Friction:** CBN 1-Jan-2027 data-localisation deadline, NDPC enforcement
  maturing, NGX/SEC reporting penalties — an urgent, dated compliance burden.
- **Reuse:** honesty ledger (source+vintage+assumed) becomes an *evidence ledger*;
  KCC's "every figure sourced" = "every control evidenced"; tiered audit access.
- **Monetization:** compliance-readiness assessments + ongoing evidence hosting
  for banks/fintechs racing the 2027 deadline.
- **Build:** evidence/control register + readiness scorecard + regulator-ready
  export + advisory wrap.

### Option D — Owned-data "verify the claim" API family (meta-option)
- Generalize A/B/C into one trust-verification API surface (verify receipt /
  verify reliability / verify compliance) so Kaliabe owns the neutral
  verification layer across sectors, with the fraud-intel feed as the shared spine.

---

## 5. Guardrails (baked in, from the scans + our house rules)
- **No leased data:** own the source + methodology (user's standing rule). All
  feeds from owned/free-keyless sources (Google News RSS pattern), committed to repo.
- **Honesty:** no invented figures; every verification carries source+vintage+
  assumed; "is this real" answers must show *why* (evidence trail, not a bare verdict).
- **Monetization path is explicit from day one** (tiered API / partner gate / CTA),
  not "build then figure out the business."
- **Position from the verification/remediation lane**, not prevention (OPay owns PR).
- **Free-tier infra discipline** throughout (GitHub Actions, no paid secrets).

---

## 6. What I need from Opus stress-test
For each option (especially the 3 concrete A/B/C):
1. Kill it or keep it — on friction fit, Kaliabe asset reuse, and time-to-monetize.
2. **Data-ownership reality check** — can each be built with owned/keyless sources,
   or does it silently require a leased/paid API we don't have? Call out any.
3. **Monetization credibility** — who actually pays, and are the TAM figures real?
4. **Competitive/moat** — why won't Prembly (FraudLens), NIBSS, or a bank copy it?
5. **Honesty-bounds** — where would "verification" overclaim (e.g. can't confirm
   a payment without rail access)? What must stay a flag, not a verdict?
6. **Build order** — given the free-tier infra pattern, what's the smallest
   highest-signal first app, and what does the roadmap look like?
7. Recommend 1–2 to build first and a PRD for each.
