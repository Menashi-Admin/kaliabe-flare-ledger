# ADTC 2027 — Kaliabe Build Brief
## Offline Energy Intelligence for the Hardware Nigeria Has
**Entity:** Kaliabe Technologies Ltd. (execution via Menashi Consulting)
**Status:** DRAFT for steering · **Focus:** Africa Deep Tech Challenge 2027, Africa AI XPrize, Future Africa / Nduzi pilot pipeline
**Prepared:** 2026-10-17

---

## 1. Thesis (one line)

**Verified Nigerian energy intelligence that runs where there is no grid and no signal, on the 8 GB laptop millions of desks already have.**

ADTC 2026 proved the method (small model + dense verified knowledge > big model) and saturated the agriculture lane. No one productized energy/gas-to-power infrastructure offline. That is the white space; we already own the hardest asset: the Flare Tracker data and its honesty machinery.

---

## 2. Why we win (what the 2026 judges funded)

The two 2026 winners (Agritgllm, Kuza AI) were **offline agronomist AI on 8 GB laptops**. The signal is explicit:

1. **Knowledge engineering beats model size.** Small models made dense and trustworthy won over big models.
2. **Verification is the moat.** Every claim traces to a source page; a deterministic checker with no model in it enforces it.
3. **Real hardware, real constraints.** The ADTC profiler measures what the machine actually delivers (latency, throughput, peak memory), not a benchmark.
4. **Safety = refusal that holds to the last word.** Both winners built "refuse when dangerous, and keep refusing."
5. **Localization = business.** Swahili, Pidgin, regional depth are explicitly rewarded ($1,500 Best Localisation award).

**Our differential:** every 2026 finalist was agriculture. The energy/gas-to-power infrastructure lane is open, sits on the unavoidable national agenda, and we already hold the verified dataset + regulator-cited method. We are one localization pass from a working energy product, not a rebuild.

---

## 3. Kaliabe product portfolio (the ideas to build)

### Core product — `Ina` (Yoruba for fire / light / electricity)
**An on-device, source-verified Nigerian energy & industrial-power advisor.**
Runs fully offline on an 8 GB laptop (integrated GPU / CPU-only), no cloud, no signal. Answers questions grounded in the Flare Gas Regulations 2018 (S.I. No. 9 of 2018), the tracker methodology, and decision-brief content — every figure traceable, estimates labelled, dangerous/unsupported asks refused.

**Applications built on the same engine (product surface, not separate models):**

| App | User | Question it answers |
|---|---|---|
| **Regulatory compliance desk** | Operator, NUPRC/extension officer, compliance lead | "What is the penalty tier for this producer? Does Deliver-or-Pay apply here? What are my obligations?" |
| **Flare-to-power feasibility scoper** | Mini-grid developer, cooperative, state energy office | "A site at X flares this much gas. What MW is viable? How many households could it power within 10 km?" |
| **Methane deadline advisor** | Export-oriented gas producer, EU buyer counterparty | "Where do I stand vs the EU Methane Regulation 2030 intensity threshold? What does the 2018 instrument actually require?" |
| **Community energy literacy** | Community members, journalists, students | "Why is this rather flare burning? What could it power? Who owns it?" (Pidgin + one Nigerian language at launch) |
| **Offline training companion** | 3MTT / engineering students, extension officers | "Explain gas flaring, the penalty model, a mini-grid business case" — a local tutor with cited answers. |

All five reuse one engine and one verified corpus. The Feasibility Scoper is the pilot-matchmaking wedge (state ministries, mini-grid developers); Compliance Desk is the revenue wedge (operators whose EU buyer or regulator is asking).

---

## 4. Core build spec — the offline thin client

### Hardware floor (must run here, measured)
- **8 GB RAM**, CPU-only, integrated graphics, no discrete GPU
- Throughput target ≥ **15 tokens/sec** (beyond that, the profiler's score stops rewarding speed)
- Peak resident memory ≤ **3.5-4 GB** so the OS + app still fit in 8 GB
- Fully offline: **no API call, no internet required** at inference

### Model + runtime
- **Base:** a ~700M-3B class model that survives 4-bit on CPU (2026 path: LFM2-700M class, or Gemma/Qwen 1-2B class; pick by measured CPU tokens/sec, not by headline size)
- **Runtime:** `llama.cpp`, exported to **GGUF Q4_K_M** at minimum; adopt Kuza's **mixed-precision + imatrix** recipe (Q4 bulk FFN / Q5 attention) where it measurably preserves factuality at 4-bit
- **Quantization gate:** automated screening (KL divergence + held-out accuracy + CPU throughput) across candidate quants; ship the winner, not the first one that fits

### Knowledge + verification (the moat — reuse the tracker's machinery)
- **Corpus (build a verified knowledge base, cite every page):**
  - Flare Gas (Prevention of Waste and Pollution) Regulations 2018, S.I. No. 9 — both penalty tiers, force majeure, Deliver-or-Pay, exemptions
  - The tracker's `docs/METHODOLOGY.md`, `docs/DATA-SOURCES-REGISTRY.md`, decision-brief content
  - World Bank GFMR vintage notes, EU Methane Regulation Art. 29 timeline (2030 threshold)
- **Deterministic linter, no model in it** — checks every generated quote word-for-word against its source (Agritgllm's method; we already enforce derivation-in-one-place in `ledger-core.js` — extend the same discipline to prose)
- **Judge veto from a different model family** — discards training that can't be proven (they killed 15.5%; expect similar)
- **Safety boundary as a separate trained adapter, averaged in** — knowledge adapter (0.5) + refusal adapter (0.5); test with adversarial prompts until a dose/advice refusal holds to the last word

### Fine-tuning pipeline
- Build "fact bundles" from the corpus, each fact taught from multiple wordings (small models repeat only what they've seen several ways)
- SFT → DPO (on preference pairs incl. refusal behavior) → merge → QAT → imatrix → quantize → screen
- Keep run cost at zero: use the ADTC GPU-credit grant ($250 finalist / $50 semifinalist), our OpenRouter/router capacity, and any self-hosted on-demand GPU for heavy passes (per Menashi build-cost-offload doctrine: subs + cheap router build, frontier for validation only)

### Offline RAG
- Local retrieval over the verified corpus (vector index built at build time or bundle). ADTC asks for RAG over local corpora as a first-class path — use it so answers cite the page.

### Localization (Best Localisation award lane)
- **Pidgin English** at launch (Nigeria's de facto market language) + **one Nigerian language** (target: Igbo or Yoruba — steering decision). Regional/state depth as a differentiator (e.g. Niger Delta states vs. the north).

---

## 5. Reuse from the existing Flare Tracker (we are NOT greenfield)

| Tracker asset | Reuse here |
|---|---|
| `ledger-core.js` shared derivation | Port the gas-wasted → MW → households math as the feasibility engine |
| Two-tier penalty model (2018 S.I. No. 9) | Compliance Desk answer core |
| Methodology + source registry, honesty guarantees | The verified-corpus spine and linter target set |
| Decision-brief content (national/operator/site) | Answer templates for all five applications |
| Satellite live-check (FIRMS) framing | Whole product differentiator: "what is burning now" grounded truth |

The Flare Tracker stays the live, API-backed public product. This brief is its **offline, on-device sibling** — same facts, no signal required.

---

## 6. Funding map (the real prize is the funnel)

ADTC cash is small ($16.5-20k). **The asset is the corridor into the Africa AI XPrize and the partner/residency pipeline.**

| Path | What it is | Value |
|---|---|---|
| **ADTC 2027** (Gate 1 approx. Aug 2027) | Engineering-first, open-source repo + REPORT.md + 2-min video; 3-gate funnel (submission → audit → final defense) | Win/final = XPrize pathway + residency suite (Demo Day, Pilot Matchmaking, legal/patent clinics, ADTC Certified trust-mark) |
| **Africa AI XPrize** | The grand-prize funnel ADTC finalists are fed into | The high-value target; positioning field |
| **Future Africa** (Lagos VC) | Partner + potential investor | Seed capital, network |
| **Nduzi Foundation** | Partner | Pilot/deep-tech funding pathways |
| **MIT Kuo-Shaper Center** | Partner | Credibility + research-grade backing |
| **3MTT (NITDA)** | Community partner | Training-app distribution + govtech channel |
| **Udu / AGH Cloud** | GPU credits | Free training compute |

**Pilot matchmaking (the business, not the prize):** state energy ministries, mini-grid/IPP developers, EU-facing gas producers. The Feasibility Scoper is the pilot wedge; Compliance Desk is the paying wedge.

---

## 7. Sequenced roadmap (build order)

**Phase 0 — Foundation (this quarter):**
- [ ] Confirm corpus: 2018 Regulations full text (clean), methodology, key decision briefs → verified knowledge base v0
- [ ] Pick base model by measured CPU tokens/sec on the 8 GB floor
- [ ] Stand up the deterministic linter + judge veto harness
- [ ] Ship offline thin client v0: Pidgin prompts, hardcoded penalty/feasibility answers, no full fine-tune yet

**Phase 1 — Engine (before ADTC Gate 1):**
- [ ] Fact-bundle generation + SFT (knowledge)
- [ ] Adversarial refusal dataset + DPO
- [ ] Merge → QAT → imatrix → quantize → automated screen
- [ ] Offline RAG over verified corpus
- [ ] Profiler pass on the 8 GB floor; hit ≥15 tok/s, ≤3.5-4 GB peak

**Phase 2 — Applications + localization:**
- [ ] Roll the five applications onto the engine
- [ ] Pidgin + one Nigerian language
- [ ] Feasibility engine wired from `ledger-core.js` math

**Phase 3 — ADTC 2027 entry + XPrize/partners:**
- [ ] Open-source repo + REPORT.md + 2-min demo video (Gate 1)
- [ ] 30-min technical Q&A, audit responsiveness (Gate 2)
- [ ] ≤10-slide pitch deck, live defense (Gate 3)
- [ ] Launch pilot-matchmaking conversations with Future Africa / Nduzi / state energy offices / mini-grid developers

---

## 8. Honesty rules (non-negotiable, ported from the tracker)

1. Every figure traces to a source page. If a number relies on an estimate, say so (like the tracker's `_upper`/`_lower` tiered ranges — no false precision).
2. Refuse what is dangerous or unsupported, and hold the refusal to the last word. No "play doctor" / "play regulator" beyond the trained boundary.
3. No fabricated data to make a chart or answer look complete.
4. Open/CC data only; zero recurring run cost at inference (it runs offline on the user's own machine).
5. Measured on real hardware with the profiler; ship the number the machine actually delivers.

---

## 9. Open decisions (need steering)

- **Brand:** confirm product codename **`Ina`** (fire/light/electricity) vs stick with "Flare Tracker Offline" vs another.
- **Secondary language:** Igbo or Yoruba for localization lane.
- **Base model class:** 700M (fast, extremely tight memory, less capability) vs 1-3B (more capability, tighter on 8 GB) — recommend benchmarking both.
- **Scope:** ship only the Feasibility Scoper + Compliance Desk at ADTC (2 apps), or all five.
- **Corpus depth:** national-only to start, vs include Niger Delta state/regional depth now (recommend: national first, regional at Phase 2).

---

## 10. One-line summary for the pitch

**"Kaliabe builds verified energy intelligence that runs on the laptops and in the power conditions Nigeria actually has — turning the same regulator-cited data we already publish into answers a generator developer, a cooperative, or a compliance officer can act on without a signal."**