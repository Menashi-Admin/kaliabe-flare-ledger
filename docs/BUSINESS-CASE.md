# Business Case — Who Relies on Carbon Monitoring Metrics

**Kaliabe Flare Ledger · decision-layer thesis**
Status: strategy note · Owner: D O · 2026-10

---

## 1. The commercial insight

Methane and flare data is abundant and fragmented. Satellite operators (GHGSat, Kayrros,
MethaneSAT/EDF, Carbon Mapper), regulators, and academics publish detections; nobody publishes
a **neutral, site-level verdict that a decision-maker can act on and cite**. The gap is not
detection — it is the *trusted interpretation layer*.

The Ledger occupies that layer for Nigeria first: every flare site attributed to an operator,
scored with a verdict, a confidence, and a stated detection floor, on **open data that nobody
can revoke**. That neutrality is the product. Incumbents (Kayrros, GHGSat, Enverus) sell
proprietary monitoring to operators and financiers; the Ledger is the *public record* they
are all implicitly measured against.

---

## 2. The demand map — who depends on this data

Six tiers consume flare / methane metrics. Each has a different decision the data drives.

### Tier 1 — Operators (the emitters) — *upstream oil & gas*
**Who:** Shell, Chevron, TotalEnergies, ExxonMobil, Eni, NNPC/NEPL, SEPLAT, Oando, Renaissance
Africa Energy, Heirs, Aiteo, First E&P — the 40 operators already in the Ledger.
**Why they need it:** OGMP 2.0 membership and reporting, NUPRC penalty exposure, internal
abatement prioritisation, gas-monetisation economics, and ESG disclosure to their own boards.
**Decision driven:** *Where do we spend abatement capex first, and is it cheaper to fix or to
pay the penalty?* Also: reputational — they are now benchmarked publicly.

### Tier 2 — Regulators and government
**Who:** NUPRC, NMDPRA, Ministry of Petroleum Resources; comparable bodies in Iraq, Algeria,
Venezuela.
**Why:** enforcement, penalty assessment, NDC/Paris reporting, licence-renewal leverage, and
domestic gas-supply policy (flared gas is lost revenue).
**Decision driven:** *Who do we sanction, and can we defend the number?* An independent
ledger gives them a defensible basis — and gives everyone else a check on them.

### Tier 3 — Gas buyers and importers (the EU wall) — *the sharpest near-term demand*
**Who:** European utilities and importers (Uniper, EnBW, Engie, SEFE), LNG offtakers, trading
houses; ultimately any supplier selling Nigerian molecules into the EU.
**Why:** the **EU Methane Regulation** requires importers to monitor, report and verify the
methane intensity of imported oil and gas, with a **maximum methane intensity threshold (Art.
29)** phased in for contracts concluded or renewed from **5 August 2030**. Reporting obligations
were pushed back a year (Reuters, Oct 2026) but the direction is locked; MRV-grade supplier
intensity is becoming a condition of market access.
**Decision driven:** *Which supplier do we buy from, and what intensity are we importing?*
This is the first place Nigerian flare intensity becomes a **price and access issue**, not a
compliance footnote. Whoever supplies the trusted supplier-level intensity owns a chokepoint.

### Tier 4 — Capital: lenders, insurers, investors, raters
**Who:** banks under the Equator Principles, Lloyd's syndicates and asset insurers, sovereign
and institutional investors, ESG raters (MSCI, Sustainalytics, CDP), development finance
(World Bank, AfDB, IFC).
**Why:** financed-emissions accounting, asset-level transition risk, insurance underwriting on
physical assets, and portfolio concentration on high-flaring operators.
**Decision driven:** *What is our exposure, and what do we price/lend/insure it at?*
GHGSat and EDF both sell into this tier explicitly — proof the willingness to pay exists.

### Tier 5 — Carbon markets and MRV
**Who:** project developers, Verra (VCS), Gold Standard, Article 6.2 host-country authorities,
credit buyers.
**Why:** flare-gas mitigation methodologies (**Verra M0376**; the standalone Flare Gas
Mitigation methodology was archived in Mar 2026 in favour of M0376) require credible baseline
and reduction quantification. Nigeria is an Art. 6.2 host country.
**Decision driven:** *How many credits can we issue, and will they survive scrutiny?*
The Ledger's per-site series is a ready-made baseline layer.

### Tier 6 — Services and assurance
**Who:** engineering firms, consultancies, satellite analytics, auditors, NGOs.
**Why:** they need the baseline and the public record to do diligence and to sell verification.
**Decision driven:** *What do we tell the client, and what will stand up?*

---

## 3. Why Nigeria first — and why now

- Nigeria is a **top-9 global flarer** (World Bank GFMR), intensity ~12 m³/bbl — about double
  the world average; Niger Delta is the densest cluster.
- The regulator has **teeth**: NUPRC's 2022 Flare Gas Regulations levy **US$2.00 per 1,000 scf**,
  with roughly ₦1.22tn in associated penalties reported 2021–25 — yet **no transparent local
  ledger exists** to check any of it.
- It is the **home market** for Kaliabe — credibility is native, not imported.
- The EU import wall turns this from a moral issue into a **market-access issue** for the same
  operators in the Ledger.

---

## 4. Business models this supports

1. **Public-good spine (free):** the Ledger itself — the neutral record. Distribution and
   credibility engine; costs near zero to run.
2. **Operator Intelligence (paid):** benchmarking, peer percentile, abatement ranking, alerting,
   defensible reporting packs. Sold per operator.
3. **Buyer / financier screening (paid):** supplier and portfolio intensity screening against
   the EU threshold; watchlists and risk scorecards.
4. **Regulatory / MRV licensing (paid):** baseline and verification data feeds for MRV bodies
   and carbon-project developers.
5. **Credential play (strategic):** the Ledger is the public demonstration of Kaliabe's
   capability — the "showcase technology nous" objective — that opens the commercial doors above.

---

## 5. What this means for the product

The Ledger stops being a *map* and becomes a **decision surface**. The next build must add the
overlay and trend layer that turns records into choices: peer benchmarks, penalty exposure
forecasts, abatement economics, compliance gaps, and watchlists — each exportable as a decision
brief. See `docs/FEATURE-SET.md`.

### 5a. Live & opportunity (KFL-M 1.3)

Each flare site now reads as a **generation opportunity**, not just a record:

- **Fuel:** the gas it flared last year as energy (e.g. Oso: ~3,084 GWh/yr, enough for a ~141 MW
  simple-cycle plant, ~870,000 households at 1.2 MWh/yr). Nationally, the 476 sites flared ~66,000 GWh/yr,
  equivalent to ~3,000 MW of generation.
- **Demand:** GRID3 population within 5/10/25/50 km and the nearest named settlement. Combined with the
  state electricity-access proxy, this gives the people within 10 km likely without access (e.g. Agbada:
  ~630,000).
- **Ground truth:** a daily NASA FIRMS check of whether the flare is burning now. Sites the annual archive
  calls "falling" but VIIRS still sees on most nights are flagged for investigation (8 on the first snapshot).
- **De-risking:** ACLED reported-event counts and a 12-month trend for the surrounding LGAs.

Buyers: mini-grid and gas-to-power developers, DFIs and the Nigerian Gas Flare Commercialisation
Programme's bidders (who need a ranked pipeline of sites with fuel *and* customers), and lenders
(the security context). Every figure is a labelled estimate with its assumption. It is not a feasibility study.

**Honest bounds:** the Ledger is derived, open-data, and never an official determination. It
publishes detection floors and confidence; it must never imply NUPRC endorsement. Its power is
neutrality and citation, not authority.

---

## 6. Sources

- EU Commission — methane importers flexibility proposal (Oct 2026); Reuters, *EU delays methane
  rules on oil and gas imports for a year* (14 Oct 2026); CATF — proposed certification criteria
  for the EU Methane Regulation; MIQ — EU crude-oil import requirements.
- Verra — Verified Carbon Standard; *Methodology for Flare Gas Mitigation* (archived Mar 2026);
  Verra/Gold Standard Article 6.2 tooling.
- EDF Business — methane satellite and oil & gas finance; GHGSat — Finance; GARP — satellite-
  detected emissions in climate risk; IEA Methane Tracker 2026; OGCI methane hub.
- World Bank GFMR (flaring volumes, country rankings); NUPRC 2022 Flare Gas Regulations Gazette.
