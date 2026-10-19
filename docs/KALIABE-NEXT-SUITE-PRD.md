# Kaliabe Next Suite — Stress-Test Verdict + PRDs

Date: 2026-10-19 · Reviewer: adversarial pass on `KALIABE-NEXT-SUITE-THESIS.md`
Convention: **[thesis]** = figure taken from the thesis, not independently verified. **[est]** = my estimate or general knowledge, label-worthy. Nothing here is a sourced fact unless it says so.

---

## 0. Bottom line (read this if nothing else)

| Option | Verdict | One-line reason |
|---|---|---|
| A VerifyReceipt (as written) | **KILL as framed** / keep a tiny, honest sliver | The headline promise ("confirm the payment is real") requires rail/bank access we don't have and can't get. What remains is a commodity sanity-checker. |
| B Reliability & Fraud-Intel Tracker | **KEEP, but re-scoped** into an *incident ledger* | Only option that is 1:1 reusable, fully keyless, and shippable in days. Weakest direct monetization, strongest as the data spine + audience engine. |
| C Compliance-Evidence Ledger | **KEEP as an advisory wedge, KILL as a software product (for now)** | The only option with a hard date and a buyer, but the "evidence" is client data, not owned data, and the product is a workflow that incumbents (Big4, GRC vendors, local DCs) already sell. |
| D Meta verify-API family | **KILL (premature abstraction)** | Three unrelated data sources do not make one API. It is a slide, not a product. Let it emerge from B's spine after two real consumers exist. |

**Build first:** (1) **B-re-scoped: "Kaliabe Trust Incident Ledger"** (outages + fraud advisories + enforcement actions, entity-tagged, dedup'd, honesty-labelled). (2) **C-lite: "Localisation Readiness"** — a free public timeline + self-assessment fed by the same ledger, as a lead funnel into paid advisory, *not* an evidence-hosting SaaS.
**Defer A** to a client-side "receipt sanity check" only if B produces an audience and a scam-typology feed worth attaching it to.

The thesis' strongest claim — "open lane is verification, not detection" — is directionally right but **overstated for what a no-rail, no-secrets, free-tier shop can actually verify**. Verification of payments is a rail-holder's job. Kaliabe's honest lane is *corroboration of public claims and incidents*, which is exactly what the Flare Tracker already does. Stay there.

---

## 1. The TAM / numbers reality check (applies to every option)

Reading the figures as a skeptical buyer would:

- **₦25.85bn fraud-loss "leak-through" [thesis]** — this is a *loss* number, not a *market*. Losses are not spend on solutions. Realistically only a small slice of any loss figure becomes a security/verification budget, and that budget is held by banks and processors who build or buy from Prembly/Smile/Seerbit-class vendors or from NIBSS, not from a new independent. The YoY drop (₦52.26bn → ₦25.85bn, about −50% [computed from thesis figures]) also cuts against "escalating crisis" as a sales story: the industry's own numbers say it's improving.
- **₦1bn "undetected cross-border fraud" [thesis]** — about USD 0.7m at ₦1,500/$ **[est; FX assumed — check]**. That's a rounding error as a TAM, and "undetected" is the wrong thing to sell against: by definition nobody knows where it is.
- **+35% bank scams (BioCatch) [thesis]** — a growth rate, not a size; vendor-published (BioCatch sells fraud detection), vintage and geography unverified. Don't put it on a slide without opening the source.
- **₦540m penalties on 34 companies (NGX) [thesis]** — about ₦16m per company **[computed]**. That is far too small to motivate software spend on its own. NDPC/CBN penalties are the real drivers; cite those, not this.
- **₦19.12bn + $329.3m refunded by CBN [thesis]** — this is the one number that implies real money moving through dispute processes. Useful for the dispute-evidence angle, still not a TAM.
- **Honest TAM position:** there is no defensible bottom-up TAM in the thesis. Right unit is *paying accounts*, and for a one-person/small shop that is **single-digit to low-double-digit B2B accounts in year 1** at ₦-denominated prices **[est]**. Anything bigger is consulting-speak until we have 3 signed pilots.

**Rule for the roadmap:** no slide, README or pitch may quote TAM until a named buyer has said a price.

---

## 2. Option A — VerifyReceipt

### 2.1 Kill or keep
**Kill as framed.**
- *Friction fit:* real (fake transfer screenshots, fake alert apps are an everyday merchant problem).
- *Asset reuse:* oversold. The thesis says "news cross-check inverted: validate a payment claim against a trusted confirmation ledger." **There is no confirmation ledger.** The Flare cross-check joins *public headlines* to *public site records*; a receipt has no public counterpart to join to. The architecture transfers; the data does not.
- *Time-to-monetize:* slow. API products need distribution into POS/merchant software, and trust to be called in a dispute.

### 2.2 Data-ownership reality check
Hidden paid/leased/permissioned dependency, named explicitly:
- **Settlement confirmation = NIBSS (NIP transaction status query) or the receiving bank/PSP API.** Both need a licensed institutional relationship, credentials (secrets), and often fees. Kaliabe has none, and the repo rule is "no secrets." **This is the core feature and it is not buildable on our stack.**
- Receipt-template fingerprinting needs a corpus of real and fake receipts per bank/app. Collecting that = user uploads of PII-heavy images (names, account numbers) → NDPA obligations, storage, retention. Not "free-tier GitHub" territory.
- What *is* keyless and owned: public rule checks — NUBAN check-digit validity and CBN bank-code list (both public algorithms/lists **[est: confirm current spec]**), date/time plausibility (transfer timestamp vs. submitted time, weekends, future dates), session-ID/reference format per rail, duplicate-submission detection (hash of the user's own submissions).

### 2.3 Monetization credibility
Who pays: merchants/SMEs (low ARPU, high churn, will not integrate an API for ₦ pennies); POS/ecommerce platforms (the only real API buyers — and they can get this from their acquirer/bank for free). Dispute-evidence-as-a-service requires standing with banks; courts and banks accept bank-issued statements, not a third party's "plausibility" report.

### 2.4 Moat
None. NUBAN validation is a 30-line function. The valuable thing — an authoritative "did this settle" — is exactly what NIBSS/banks/OPay/Moniepoint already hold and can expose in their own apps with a few lines. If this works, they ship it as a feature (OPay and Moniepoint already show in-app transaction status; a merchant's single best defence is "check your own bank app/alert, not the screenshot" **[est/common guidance]**).

### 2.5 Honesty bounds
| Claimable (a **flag**) | Overclaimable (a **verdict** — never say) |
|---|---|
| "Account number fails/passes NUBAN checksum for the stated bank code" | "Payment is real / has settled" |
| "Timestamp is in the future / inconsistent with submitted time" | "This receipt is genuine / authentic" |
| "Reference format does not match the pattern for that rail" | "This receipt is fake" (absence of a flag ≠ authentic; presence ≠ proof of forgery) |
| "This exact image/reference was submitted before to this tool" | "Fraud detected" / "Safe to release goods" |
| "Cannot confirm settlement without your bank/PSP — check your account balance/alert" (always shown) | Any green "VERIFIED" badge |

Hard line: **only the beneficiary's bank/PSP can say a payment settled.** Output must always end with that sentence. A tool that emits a green "verified" for a pass will get a merchant robbed and Kaliabe sued/shamed.

### 2.6 What survives
A **client-side, no-upload "Receipt Sanity Check"** page (checksum + format + plausibility + "how to actually verify" guide), no API, no storage. Value = PR/lead-gen and a trust-brand asset, not revenue. Build only after B exists.

---

## 3. Option B — Reliability & Fraud-Intel Tracker

### 3.1 Kill or keep
**Keep, re-scoped.** The thesis' version bundles two different products (a *reliability scoreboard* and a *fraud-intel feed*). Re-scope:
- Drop "reliability **scores**" as a headline. We cannot measure service reliability from the user's side (see 3.2). Honest product = **an incident ledger**: dated, sourced, entity-tagged records of outages, failed-transaction complaints, fraud advisories, breaches and enforcement actions, with "record quiet" days made explicit — which is literally how `/api/news` already treats flare sites.
- *Friction fit:* high and recurring (reliability and fraud are the top two persistent scan threads).
- *Asset reuse:* ~80% — `scripts/news_feed.py` + `news-feed.yml` + committed JSON + Worker reader are the template. New code: entity taxonomy, incident typing, dedup.
- *Time-to-monetize:* slow directly; fast as an **audience and credibility engine** that feeds C and any later paid tier.

### 3.2 Data-ownership reality check
Buildable with keyless sources:
- Google News RSS (en-NG) + curated outlet RSS (already in repo pattern). Public regulator/agency pages: CBN circulars, NDPC, SEC, NGX, EFCC press, NCC, FRSC advisories (HTML/RSS scraping, no key). Public bank/telco status pages and official social posts only where a public feed exists.
- **Active probes from GitHub Actions** (HTTP reachability, TLS, latency to bank/PSP public sites) are possible keylessly but **measure US/EU datacentre-to-website, not Nigerian-user-to-app**. Most bank apps' real failures live behind authenticated APIs we cannot see. Label any probe as "public website reachability from a non-Nigerian datacentre — not app or transaction uptime," or don't ship it.

Hidden dependencies (name them, don't pretend):
- **X/Twitter** — where Nigerians actually report "debited, no cash" and outages — requires paid API; **not available**. Do not claim social-signal coverage.
- **DownDetector-style crowd data, app-store review streams** — proprietary or scraped against ToS; fragile. Excluded.
- **NIBSS/CBN downtime statistics** — official only when published; not an API we can call.
- **Known scan fragility** [thesis]: Techpoint Africa and The Cable return 403 persistently → coverage bias; the ledger must show source coverage per week.
- Entity tagging / incident typing is an NLP step. Do it with rules first (deterministic, offline, reproducible, same as the flare matcher). Using an LLM API would add a secret and a cost; if used later, keep it as an *assist* with human-reviewable output, not the ledger of record.

### 3.3 Monetization credibility
Honest: **weak direct monetization at launch.** Candidate payers and my doubt level:
- Fintech/bank *risk, compliance and vendor-management teams* wanting a dated incident history of peers/vendors (real need, small budgets, will ask for "scores" we can't honestly give).
- Insurers/lenders/VCs doing diligence on fintech counterparties (plausible, bespoke, low volume).
- Media/NGOs/researchers (free; reputational value).
- Procurement scoring (the thesis' pitch) — **doubtful**; procurement buys SLAs and references, not a third-party blog scoreboard.
Realistic paid product: a **partner-tier export** (CSV/API, entity watch alerts, weekly digest) — priced as a subscription **[est: small, ₦-denominated, low five figures USD/yr at best from ~5–10 accounts]**. Treat it as a way to find the 3 buyers for C, not a business on its own.

### 3.4 Moat
- Prembly FraudLens **[thesis: "launched"; I haven't verified its scope]** presumably sells detection/KYC to institutions with their data. They have no incentive to publish a *neutral public* ledger that names fintechs (their customers).
- NIBSS and banks won't publish a candid peer-comparison; OPay won't publish others' outages.
- **That is the real moat: neutrality plus a long dated history.** Incident data can't be backfilled once news ages out of RSS windows; a ledger started now has a head start in 6–12 months. It is not a technical moat — anyone can copy the scraper — so the defensible parts are (a) the accumulated, committed history, (b) the honesty-labelled methodology, (c) being the cited source. A commodity widget if we just show "status: up/down."
- Risks: defamation/right-of-reply exposure (naming fintechs); an unsourced "reliability score" invites legal threats. Mitigate: link every record to its source, state "reported by," and offer a corrections path.

### 3.5 Honesty bounds
| Claimable | Overclaimable |
|---|---|
| "Outlet X reported an outage affecting Y on date D" (with link, retrieved-at) | "Y had N hours of downtime" / uptime % |
| "N reported incidents for entity in last 90d, from M sources" | "Y is more reliable than Z" (reporting volume ≠ reliability; bigger brands get more coverage) |
| "No reported incident found in coverage window (sources listed)" — i.e. record quiet | "No incident occurred" |
| "Regulator/agency announced X" | "Fraud rate rising/falling" without a denominator |
| Probe: "public website responded in T ms from datacentre D" | "App/transaction service healthy" |
Every row carries `source`, `retrieved_at`, `event_date`, `confidence: reported|corroborated(≥2 independent outlets)`, `assumed` flag — same ledger fields as the flare/KCC ledger.

---

## 4. Option C — Compliance-Evidence Ledger

### 4.1 Kill or keep
**Keep as advisory wedge; kill as SaaS for now.**
- *Friction fit:* highest urgency — CBN data-localisation deadline 1 Jan 2027 **[thesis]**, i.e. ~10 weeks from today **[computed]**. NDPC enforcement is live **[thesis]**.
- *Asset reuse:* modest. The honesty ledger's *fields* map to evidence records, but the Flare ledger's value is that **Kaliabe owns and independently derives the data**. In C the evidence is supplied by the client and attested by the client. We add formatting, not truth.
- *Time-to-monetize:* **fastest of the three** — a dated deadline and existing budgets — but via consulting, not product. That matches how Tiger Dojo/Menashi already sells.

### 4.2 Data-ownership reality check
- Regulatory texts and circulars: public, keyless, ours to index. ✔
- Evidence (hosting location attestations, DPAs, architecture diagrams, DPIA outputs): **client-owned and sensitive.** Hosting it on GitHub Pages/Cloudflare free tier is both a security failure and — ironically — **a data-localisation problem** if it contains anything regulated; the free-tier stack we are proud of is US-hosted. Hence the evidence-hosting product *cannot* run on our current infra. It would need local/in-country hosting, access control, audit logging, backups: real cost and real liability.
- **Verify before selling:** I have only the thesis' one-line description of the CBN directive. Scope (which entities, which data classes, what "local" means, whether cross-border processing with local copies is allowed) must be read from the primary circular. Selling readiness against a directive we haven't read is the fastest way to lose credibility.

### 4.3 Monetization credibility
- Payers: smaller fintechs, MFBs, PSPs, and local startups with Nigerian bank customers that haven't resolved their cloud region. Large banks already have Big4/in-house GRC and data centres; they won't buy from a three-person shop.
- Competition: Big4 and local advisories, GRC platforms (Vanta/Drata-style, mostly not localised), local data-centre/cloud vendors who bundle "localisation readiness" to sell hosting (they have the strongest incentive and a hosting product to attach).
- Credible offer: **fixed-fee readiness assessment (AWS Well-Architected-aligned, regions/residency mapping, gap list)** — sells on the founder's AWS credentials. Recurring "evidence hosting" is the part that doesn't survive scrutiny today.

### 4.4 Moat
Weak as product (workflow tooling is copyable; GRC incumbents exist). Defensible bits: local credibility, a maintained, plain-language, source-cited regulatory timeline (the ledger from B), and speed to the deadline.

### 4.5 Honesty bounds
| Claimable | Overclaimable |
|---|---|
| "Based on information you supplied, N of M controls have evidence on file; gaps: …" | "You are compliant / ready for CBN/NDPC" |
| "Control mapped to circular §X (link, retrieved-at)" | "This satisfies the regulator's requirement" (only the regulator, or counsel, can say that) |
| "Readiness score is a self-attested checklist ratio" | Any score presented as an audit result or certification |
Scorecards must say: *not legal advice, not an audit, not regulator-endorsed.*

---

## 5. Option D — Meta API family
**Kill.** A shared "verify" surface needs a shared noun; receipts (a transaction), services (an entity over time) and compliance (an org's controls) share none. It also repeats the thesis' central overreach — branding corroboration as verification. The *real* shared asset is the **entity + incident + source spine** that falls out of B. Build that; let an API fall out of it once two paying consumers (e.g. C's timeline and a partner export) exist.

---

## 6. Build order

1. **Weeks 0–2: Trust Incident Ledger MVP (B re-scoped)** — see PRD-1. Ship public page + JSON.
2. **Weeks 2–4: Localisation Readiness (C-lite)** — see PRD-2. Primary-source read of the CBN directive first; publish timeline + self-assessment; start outreach. Target: 3 discovery calls, 1 paid assessment before 1 Jan 2027.
3. **Weeks 4–10: Run B for coverage and quality** — measure source coverage, dedup precision, false-attribution rate; publish methodology (`METHODOLOGY-TRUST.md`); add entity watch/weekly digest (partner tier stub, CTA only).
4. **Q1 2027 gate:** build the paid partner export **only if** ≥3 named orgs asked for it. Else keep as free credibility asset.
5. **Optional, post-gate: A-sliver** — client-side receipt sanity check, linked from the ledger's fake-receipt/scam-typology entries. No API, no upload.
6. **Never (until a rail relationship exists):** anything labelled "verify payment."

---

## PRD-1 — Kaliabe Trust Incident Ledger (B re-scoped)

**Goal.** A public, honesty-labelled, entity-tagged ledger of reported Nigerian fintech/telecom/payments incidents (outages, failed-transaction clusters, fraud advisories, breaches) and regulatory/enforcement actions, built the same way as the flare news cross-check. Success = cited by journalists/risk teams and gives Kaliabe a dated history others can't backfill.

**Users.** (1) Risk/compliance/vendor-management analysts at fintechs and banks; (2) journalists/researchers; (3) SMEs and the public (read-only); (4) Kaliabe itself — it is the lead engine for PRD-2.

**Data source + ownership.** All keyless, committed to repo, no secrets: Google News RSS en-NG (query set per entity and per incident type), curated outlet RSS (extend `news_feed.py` outlet list), public regulator/agency pages (CBN, NDPC, SEC, NGX, NCC, EFCC, FRSC). Ownership: we own the *extraction, dedup, entity tagging, typing and history*; headlines/snippets are third-party text — store title, outlet, URL, date, minimal snippet only (check `DATA-LICENCES.md` posture), never full articles. Explicitly excluded (no free access): X/Twitter, crowd-outage sites, authenticated bank/PSP APIs.

**Core loops.**
1. Daily GHA cron (clone of `news-feed.yml`; offset after existing jobs) → `scripts/trust_feed.py` → committed `web/public/data/trust/ledger.json` (+ per-entity shards if size demands).
2. Rule-based pipeline: fetch → normalize → dedup (url canonical + title fuzzy + date window) → entity match (alias table: OPay, Moniepoint, PalmPay, Kuda, Providus, FirstBank, NIBSS, MTN, Airtel, …) → incident typing (outage / failed-debit / breach / scam-advisory / enforcement / other) → confidence (`reported` vs `corroborated` = ≥2 independent outlets).
3. Worker route `/api/trust` (read committed file from raw.githubusercontent, same as `/api/news`) + static page: entity cards, 90-day timeline, "record quiet" markers, source-coverage panel, corrections link.
4. Weekly digest page (static, auto-generated). Optional email later via partner tier.

**Honest claim-bounds.** Per §3.5. Fields on every record: `source`, `url`, `retrieved_at`, `event_date`, `confidence`, `typing_method: rule|manual`, `assumed`. Banned copy: "uptime", "reliability score", "safe", "verified". Entity pages show counts with a standing caveat that coverage volume tracks brand size. Right-of-reply: corrections email + visible "disputed" flag.

**Free-tier infra.** GitHub Actions (cron + commit), Cloudflare Worker + existing D1 only if needed (start with static JSON; avoid D1 until query needs exist), Pages hosting. No secrets. Respect GHA minutes: one ~5–10 min job/day **[est]**. Repo-growth guard: shard by month, prune snippets, not history.

**Monetization / CTA.** Tier 1 free public page + JSON. Tier 2 (stub from day one, CTA → contact, as in KFL tiering): entity watch alerts, CSV/API export, weekly digest, bespoke peer-incident briefs. Real revenue path is cross-sell into PRD-2 advisory; don't price Tier 2 until asked.

**MVP scope.** ~15 entities, 6 incident types, 5–8 sources, daily job, one page, one API route, methodology doc, corrections path, source-coverage panel. Acceptance: reproducible offline from committed raw cache (same standard as scoring engine), no NaN/empty-entity crashes, dedup spot-check ≥ 90% on a 100-record manual sample **[target, not a result]**.

**Risks.** Defamation/mislabelling (mitigate: link-only facts, reported-by wording, corrections); source 403s/RSS drift (coverage panel, outlet rotation); bias toward big brands (stated); thin monetization (accepted; it's a funnel); GHA ToS/rate limits on Google News (backoff, cache); repo bloat.

---

## PRD-2 — Localisation Readiness (C-lite)

**Goal.** Capture the one dated, funded compliance urgency (CBN data localisation, 1 Jan 2027 **[thesis — verify against circular]**) with a free, source-cited readiness page that converts to a paid, fixed-fee assessment. Not an evidence-hosting product.

**Users.** CTO/CISO/compliance leads at small–mid fintechs, MFBs, PSPs, and startups processing Nigerian financial data; secondarily consultants/lawyers.

**Data source + ownership.** (1) The CBN circular and related NDPC/NDPA texts — public, indexed by us with citations (retrieved-at, section refs). (2) Regulatory/enforcement events from PRD-1's ledger (type=enforcement). (3) The user's self-assessment answers — **processed client-side in the browser, not stored by us** (no PII, no evidence files, no server). We own the control map and methodology; we do **not** own or host client evidence.

**Core loops.**
1. Read the page: plain-language timeline + "what the directive says / what we couldn't determine" (explicit unknowns list).
2. Self-assess: ~20–30 yes/no/unsure questions (where is data stored, which cloud regions, subprocessors, backups/DR location, cross-border flows, DPA/DPIA status) → local-only gap list mapped to cited clauses; downloadable PDF/markdown of their own answers.
3. CTA: "book a readiness assessment" → contact (Tier 2 pattern). Paid engagement: fixed-fee architecture/residency review (AWS Well-Architected-aligned), gap register, remediation plan.
4. Page auto-updates the "regulatory movement" strip from PRD-1.

**Honest claim-bounds.** Per §4.5. Output wording: "gaps identified from your answers"; score = answered-controls ratio, labelled *self-attested checklist, not an audit*. No "compliant/ready/certified" language; footer: not legal advice; confirm scope with counsel/CBN. Directive facts shown with source, retrieved-at, and `assumed` where interpretation is ours.

**Free-tier infra.** Static page + client-side JS on existing Pages/Worker; ledger strip from committed JSON; zero server storage; no secrets. (Any future evidence hosting must be in-country — explicitly out of scope.)

**Monetization / CTA.** Fixed-fee assessment (price set after first 3 calls **[unpriced by design]**); follow-on remediation advisory; referral/partnership with an in-country hosting provider (disclose any commercial relationship on the page). Target: 3 discovery calls and 1 paid assessment before 1 Jan 2027 **[goal]**; if zero calls by mid-Nov, stop and don't build further.

**MVP scope.** One page, one questionnaire, one cited control map, one export, CTA form (mailto/Cloudflare form without secrets), methodology note. Before any build: read the primary circular end to end and record scope, definitions and exemptions in `docs/METHODOLOGY-LOCALISATION.md`.

**Risks.** Misreading the directive (mitigate: primary-source-first, unknowns list); positioning as audit (wording lock); incumbents with hosting to sell (we are the neutral assessor — disclose referral ties); deadline slip or extension changes urgency (page tracks status); small-team credibility (lead with AWS credentials + the visible honesty method, name no unverified clients).

---

## 7. What would change my mind
- A bank/PSP offers read-only settlement-status access under an MoU → A becomes viable (as a partner-integrated flag, still not a Kaliabe verdict).
- ≥3 organisations ask for the partner export within a quarter → productise PRD-1 Tier 2.
- The CBN circular is narrower than the thesis implies (few entities affected) → shrink PRD-2 to a blog post.
