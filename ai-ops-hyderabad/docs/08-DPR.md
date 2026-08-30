# 08 — Detailed Project Report (DPR)

**Project:** RecoverOps — Healthcare Revenue-Operations Automation Services
**Location:** Hyderabad, Telangana, India
**Promoter:** *(to be completed)*
**Date of report:** 30 August 2026
**Prepared for:** internal planning, bank/Mudra loan application, MSME scheme applications, and
partner/investor discussion

> ⚠️ Figures marked **VERIFY** must be confirmed with the relevant authority before this document is
> submitted to any bank or government department. See §14.

---

## 1. Executive summary

| | |
|---|---|
| **Nature of business** | Technology services — AI-enabled business-process automation for healthcare SMEs |
| **Constitution** | Proprietorship at inception; conversion to Private Limited on scale or external funding |
| **Registrations** | Udyam (MSME), GST, Shops & Establishments (GHMC), professional tax |
| **Target customers** | Diagnostic centres, polyclinics, dental/derm/IVF/physiotherapy practices and small hospitals in Hyderabad, doing ₹1–15 crore annual revenue |
| **Core offering** | "Recovery OS" — productised automation that recovers revenue lost to appointment no-shows, missed calls, delayed reports and dead follow-ups, delivered in a DPDP- and ABDM-safe architecture |
| **Revenue model** | One-time build fee (₹75,000) + monthly managed retainer (₹18,000–₹55,000) + add-ons + messaging pass-through |
| **Total project cost** | **₹4,45,000** (₹1,45,000 capital + ₹3,00,000 working capital) |
| **Means of finance** | Promoter contribution and/or PM Mudra (Kishore) collateral-free term loan |
| **Break-even** | **4 paying clients — projected Month 4** |
| **Year 1** | Revenue ₹42.6 lakh · EBITDA ₹17.1 lakh (40%) · 24 clients · 4 employees |
| **Year 3** | Revenue ₹5.07 crore · EBITDA ₹1.72 crore (34%) · 150 clients · 26 employees |
| **Employment generated** | 4 by Year 1, 12 by Year 2, 26 by Year 3 |

---

## 2. Promoter and management

*(To be completed by the promoter. A bank or scheme application requires this section.)*

| Field | Detail |
|---|---|
| Name, age, address | |
| Educational qualification | |
| Relevant experience | |
| Existing income / net worth | |
| Category (General / OBC / SC / ST / Women / Minority) | *Determines eligibility for enhanced subsidies under T-IDEA and PMEGP* |

**Management structure at inception:** the promoter performs sales, delivery and client success. The
delivery function is separated at Month 6 (automation engineer), sales at Month 8 (field associate),
and client success at Month 9. All processes are documented as SOPs from client #3, so the business
is not dependent on the promoter for delivery beyond Month 9. See risk R4 in
[07-compliance-and-risk.md](07-compliance-and-risk.md).

---

## 3. The problem and the opportunity

### 3.1 The problem, quantified

Owner-run healthcare establishments in Hyderabad lose a substantial and *measurable* share of booked
revenue to four operational leaks:

| Leak | Evidence |
|---|---|
| **Appointment no-shows** | Indian OPD no-show rates run **up to 30%**. Fifteen missed appointments per week at ₹1,000–₹2,000 (consultation) or ~₹10,000 (diagnostics) equals **₹10–20 lakh per year, per centre** |
| **Missed and after-hours calls** | Front desks are unavailable during OPD peaks; enquiries are lost, not queued |
| **Delayed report delivery** | Delays reduce follow-up conversion and repeat testing |
| **Absent recall** | Advised repeat tests, annual checks and treatment-plan continuations go un-prompted |

Published Indian deployments report no-show rates falling from ~28% to under 16%, and 20–25% of
revenue leakage recovered, within two quarters.

### 3.2 Why these businesses have not solved it

| Barrier | Evidence |
|---|---|
| Nearly half of Indian MSMEs are entirely offline | 53.8% have adopted at least one digital tool (India SME Forum DigiShastra 2025) |
| Intent vastly exceeds action | 57% say AI is vital; **25% actually use it** (Vi Business ReadyForNext 2026) |
| They cannot choose a tool | 52.6% report difficulty selecting digital tools |
| They do not know help exists | Only 2.7% are aware of government digitalisation schemes |
| Even funded projects fail | **95% of GenAI pilots deliver no measurable ROI** — cause: workflow misalignment, not technology (MIT, *The GenAI Divide*, 2025) |

**The gap is implementation, not technology.** MIT's data shows vendor-partnered deployments succeed
4–6× more often than in-house attempts. That is precisely the service this project sells.

### 3.3 Market size

| | Establishments | ACV | Value |
|---|---:|---:|---:|
| Hyderabad healthcare establishments | ~8,400 | — | — |
| **TAM** (35% large enough to pay) | ~2,940 | ₹3.0 L | **₹88 Cr/yr** |
| **SAM** (multi-doctor/multi-branch, ≥600 appts/month, in GHMC) | ~900 | ₹3.3 L | **₹30 Cr/yr** |
| **SOM** (15% of SAM by end of Year 3) | ~150 | ₹3.6 L | **₹5 Cr/yr** |

Hyderabad metro contains ~3.59 lakh Udyam-registered MSMEs (~40% of Telangana's ~8.94 lakh).
Verticals 2 and 3 (pharma/device distributors; goods transport) roughly triple SAM without leaving
the city. Full sourcing and caveats: [01-market-research.md](01-market-research.md).

---

## 4. Products and services

| Tier | Product | Price (₹) |
|---|---|---|
| 0 | **Leak Audit** — 45-min on-site diagnostic producing a signed, rupee-denominated baseline | Free |
| 1 | **Recovery Sprint** — 21-day pilot, one workflow, hard stop, pre-agreed success criteria | Free build; client pays own message costs |
| 2 | **Recovery OS Core Build** — 4 workflows, WhatsApp onboarding, TRAI DLT registration, 25 bilingual templates, one system integration, DPDP consent architecture, staff training, 30-day hypercare | 75,000 one-time |
| 3 | **Managed Retainer** — Essential / Growth / Multi-Branch | 18,000 / 32,000 / 55,000 per month |
| 4 | **Outcome Plan** — 10% of measured recovered revenue (floor ₹12,000, cap ₹50,000/month) | Variable |
| A | **Add-ons** — voice agent, DPDP compliance pack, extra branches, extra integrations, review engine, staff workshops | 8,000–45,000 |

**The four core workflows:**

1. **Slot Guard** — confirmation, reminders, one-tap reschedule, 30-minute no-show recovery, waitlist backfill
2. **Front Desk Overflow** — missed/after-hours call capture, scoped intake, callback scheduling, human fallback
3. **Report & Payment Relay** — report-ready *notification* on WhatsApp, OTP-verified secure link, payment link, follow-up prompt
4. **Recall Engine** — repeat tests, annual checks, treatment-plan continuation, review appointments

Detail: [03-service-catalogue-and-pricing.md](03-service-catalogue-and-pricing.md).

---

## 5. Competitive position

Nine directly comparable agencies were identified in Hyderabad and nationally (PrecisionTech, WACTO,
Botsense, AutoChat, GRYA Digital, GMCSCO, Edesy, Brainguru, CodingClave). **Every one competes on
speed of setup, Meta-partner status and price. None positions on a vertical, a measured business
outcome, or regulatory compliance.**

Fifteen SaaS platforms (AiSensy, Wati, Interakt, Gallabox, Gupshup, Exotel, Yellow.ai, Haptik and
others) are **suppliers, not competitors** — this project resells them. They systematically do not
provide: vertical workflow design, legacy-system integration, Telugu/Urdu configuration, compliance
implementation, process re-engineering, voice agents, staff training, or ongoing optimisation.

**Six-layer differentiation** (detail in [02](02-positioning-and-differentiation.md)):

1. Vertical monopoly — healthcare operations in Hyderabad only, for 12 months
2. The Leak Audit — a free diagnostic that is simultaneously lead magnet, pricing anchor and
   contractual baseline
3. Outcome-linked commercial option — 10% of recovered revenue
4. **Compliance-first architecture** — no patient data on WhatsApp; DPDP, ABDM and TRAI DLT built in
5. Telugu-first bilingual delivery
6. Last-mile ownership — on-site training, printed SOPs, named supervisor, monthly ROI review

### The regulatory tailwind

| Development | Effect |
|---|---|
| **DPDP Rules 2025** notified 14 Nov 2025; full compliance by **13 May 2027**; penalties to ₹250 Cr | Creates a dated, unavoidable buying trigger across the entire client base |
| **ABDM / Digital Health Records Bill 2025** | Sharing patient data over WhatsApp is strongly discouraged — validates our architecture and invalidates competitors' |
| **Meta policy, effective 15 Jan 2026** — general-purpose AI assistants banned on WhatsApp Business API; healthcare bots must be narrowly scoped with human fallback | Disqualifies the "AI chatbot in 48 hours" competitor set in this vertical. Our design already complies. |
| **TRAI DLT registration** | A three-portal bureaucratic process no clinic owner will complete alone — performed as part of onboarding, creating switching cost |
| **MeitY AI Governance Guidelines, Nov 2025** | Voluntary today; alignment is cheap and differentiating |

---

## 6. Technical plan

| Layer | Choice | Rationale |
|---|---|---|
| Orchestration | n8n, self-hosted, India-region VPS | No per-task fees; data residency supports the DPDP position |
| Messaging | WhatsApp Business Platform via an Indian BSP (reseller model at inception) | No capital outlay; Meta Tech Provider status considered after ~30 clients |
| Data | PostgreSQL, India region, encrypted at rest, schema-per-client isolation | Contractual and regulatory requirement |
| AI | Small/fast models for routing, classification and drafting; redact-before-prompt as a hard rule | Cost control and PHI protection |
| Language | Indic-first models/TTS for Telugu; human-reviewed templates | Differentiator versus Hindi/English-first national platforms |
| Voice | Third-party per-minute platform (₹1.50–₹12/min), billed at ₹6/min | No infrastructure investment |
| Secure delivery | Own signed, expiring, OTP-gated, access-logged link service | **The compliance moat, implemented in code** |

**Governing architectural rule:** *WhatsApp carries a notification and a link. Identifiable patient
data never appears in a message body, a log line, or an LLM prompt.*

**Capacity and productisation:** build effort per client falls from 40 hours (client #1) to a target
of **12 hours by client #15** through parameterised workflows and a single per-client configuration
file. This ratio is the primary operating KPI of the business.
Detail: [06-delivery-architecture.md](06-delivery-architecture.md).

---

## 7. Marketing and sales plan

**Funnel:** ~160 conversations → 32 Leak Audits → 3–4 Recovery Sprints (capped by delivery capacity)
→ 2–4 paid clients per month.

| Channel | Role |
|---|---|
| **Field walk-ins** across seven Hyderabad clinical clusters (Somajiguda/Ameerpet, Banjara/Jubilee Hills, Secunderabad, KPHB/Kukatpally, Dilsukhnagar/LB Nagar, Gachibowli/Kondapur, Attapur/Mehdipatnam) | Primary engine, months 1–6; 60 doors/week |
| **Referral loop** — ₹10,000 credit per converted referral | Becomes primary from month 5; target 40% of clients by month 9 |
| **Partner channel** — LIS/HIS vendors, medical equipment dealers, CAs, BSPs | Highest leverage; slowest to start |
| **Associations** — FTCCI, IMA Telangana, AHPI, MSME-DFO Hyderabad, T-Hub/TASK/WE Hub/RICH | Credibility; the DPDP talk opens doors sales pitches cannot |
| **Content** — LinkedIn "Leak Math" series, Telugu short-form video, public Leak Calculator | Compounding inbound; ₹10,000/month cap in Year 1 |

Detail: [05-go-to-market-playbook.md](05-go-to-market-playbook.md).

---

## 8. Manpower plan

| Month | Role | Monthly cost (₹) |
|---|---|---:|
| 0 | Promoter — sales, delivery, support | 40,000 (drawings) |
| 6 | Automation engineer | 45,000 |
| 8 | Field sales associate (Telugu-first) | 25,000 + ₹5,000/close |
| 9 | Client success / operations associate | 28,000 |
| 14 | Second engineer + second sales associate | 80,000 combined |
| 18 | Vertical lead — distribution vertical | 70,000 |

**Employment generated: 4 (Year 1) → 12 (Year 2) → 26 (Year 3).**
Recruitment sources: TASK (Telangana Academy for Skill and Knowledge), local BCA/MCA colleges, and —
the highest-value source — front-desk staff from clinics already automated, who bring domain
knowledge, language fluency and customer empathy that cannot be trained into an engineer.

---

## 9. Project cost and means of finance

### Cost of project

| Item | Amount (₹) |
|---|---:|
| Statutory registrations (proprietorship, Udyam, GST, S&E) | 5,000 |
| Domain, website, Google Workspace | 8,000 |
| WhatsApp BSP onboarding, verification, green tick | 5,000 |
| Cloud infrastructure — n8n VPS, 12 months prepaid | 18,000 |
| Software/tool stack (CRM, monitoring, secret store, design) | 25,000 |
| Legal — MSA, SOW, DPA, NDA drafting | 25,000 |
| Branding, sales collateral, Leak Calculator | 15,000 |
| Professional indemnity insurance | 18,000 |
| Field kit and initial travel float | 8,000 |
| Contingency | 18,000 |
| **Sub-total: capital and pre-operative** | **1,45,000** |
| Working capital — 4 months of fixed costs and drawings | 3,00,000 |
| **Total project cost** | **4,45,000** |

*Assumes an existing laptop. Add ₹60,000 if a computer must be purchased.*

### Means of finance

| Source | Amount (₹) | Notes |
|---|---:|---|
| Promoter contribution | 1,45,000 | Minimum 25–33% is typical for Mudra/PMEGP |
| Term loan / working-capital loan | 3,00,000 | **PM Mudra — Kishore** (₹50,000–₹5,00,000), collateral-free |
| **Total** | **4,45,000** | |

**Schemes to explore** (all **VERIFY** — none is assumed in the base financial case):

| Scheme | Potential benefit |
|---|---|
| PM Mudra — Kishore | Collateral-free term loan up to ₹5 lakh |
| PMEGP | Margin-money subsidy for new micro-enterprises |
| **Telangana Pavala Vaddi** | 3–9% p.a. interest subvention for 5 years |
| **T-IDEA / TG-iPASS** | Capital subsidy 15%, SGST reimbursement, 50% skill-upgradation reimbursement (max ₹2,000/person) — **VERIFY services-sector eligibility with the District Industries Centre; most T-IDEA benefits target manufacturing** |
| CGTMSE | Credit guarantee for collateral-free bank lending |
| T-Hub / WE Hub / RICH | Incubation, mentoring, market access |

---

## 10. Financial projections

Full assumptions, month-by-month Year 1, sensitivity analysis and scenario table:
[09-financial-model.md](09-financial-model.md).

### Profitability statement (Base case)

| | Year 1 | Year 2 | Year 3 |
|---|---:|---:|---:|
| Active clients (exit) | 24 | 70 | 150 |
| **Revenue** | **₹42,59,400** | **₹2,10,72,500** | **₹5,06,92,000** |
| Cost of delivery (COGS) | ₹5,41,520 | ₹30,52,400 | ₹75,90,000 |
| **Gross profit** | ₹37,17,880 | ₹1,80,20,100 | ₹4,31,02,000 |
| Gross margin | 87% | 86% | 85% |
| Personnel (excl. promoter) | ₹5,77,000 | ₹56,70,000 | ₹1,41,56,000 |
| Freelance / contract delivery | ₹1,20,000 | — | — |
| Establishment, tools, infrastructure | ₹5,94,000 | ₹21,60,000 | ₹51,60,000 |
| Marketing and business development | ₹2,40,000 | ₹12,00,000 | ₹30,00,000 |
| Professional fees and insurance | ₹1,20,000 | ₹5,00,000 | ₹12,00,000 |
| Promoter remuneration | ₹3,60,000 | ₹15,00,000 | ₹24,00,000 |
| **EBITDA** | **₹17,06,880** | **₹69,90,100** | **₹1,71,86,000** |
| **EBITDA margin** | **40%** | **33%** | **34%** |

*Depreciation is negligible (no plant or machinery; infrastructure is rented). Interest on a ₹3 lakh
Mudra loan at ~10% is approximately ₹30,000 in Year 1 and is absorbed within contingency. Tax is not
modelled and depends on the constitution chosen.*

### Break-even

| | |
|---|---:|
| Monthly fixed cost + promoter drawings | ₹79,000 |
| Gross contribution per client per month | ₹20,465 |
| **Break-even volume** | **4 clients** |
| **Projected break-even** | **Month 4** |
| **Cash payback on ₹1.45 lakh capital** | **Month 5** |

### Key ratios

| Ratio | Value |
|---|---:|
| Gross margin per client (recurring) | 74% |
| Customer acquisition cost, fully loaded (Year 1) | ₹39,750 |
| Lifetime value (30-month average life) | ₹5,87,000 |
| **LTV : CAC** | **≈ 15 : 1** |
| **CAC payback period** | **Immediate** — the ₹75,000 build fee exceeds CAC |
| Debt-service coverage, Year 1 | > 20× on a ₹3 lakh Mudra loan |

### Scenarios

| | Conservative | Base | Stretch |
|---|---:|---:|---:|
| Clients at Month 12 | 14 | 24 | 36 |
| Year 1 revenue | ₹23.5 L | ₹42.6 L | ₹69.0 L |
| Year 1 EBITDA | ₹5.1 L | ₹17.1 L | ₹34.4 L |
| Break-even | Month 6 | Month 4 | Month 3 |

**The conservative case remains profitable and services the loan comfortably.** Fourteen clients is
0.17% of the Hyderabad healthcare establishment base.

---

## 11. Implementation schedule

| Phase | Period | Milestones |
|---|---|---|
| **Foundation** | Weeks 1–2 | Registrations; bank account; BSP account; TRAI DLT entity; legal templates; 400-row target list; Leak Report and Pilot Agreement drafted |
| **First contact** | Weeks 3–4 | 120 field conversations; 12 Leak Audits; 2 Recovery Sprints signed |
| **First delivery** | Weeks 5–8 | 2 pilots delivered and measured; first 2 paying clients; first case study |
| **Productisation** | Weeks 9–12 | Workflows W1–W4 parameterised; build time below 25 hours; 5 paying clients; break-even crossed |
| **Team** | Months 4–9 | Engineer (M6), sales associate (M8), success associate (M9); 14 clients |
| **Scale vertical 1** | Months 10–12 | 24 clients; ₹5.45 lakh MRR; referral share above 40% |
| **Vertical 2** | Months 13–18 | Pharma and medical-device distributors; GST e-invoice 30-day rule as the wedge |
| **Vertical 3 + city 2** | Months 19–36 | Goods transport (HGTA network); second city; 150 clients |

Week-by-week detail for the first 90 days: [10-90-day-execution-plan.md](10-90-day-execution-plan.md).

---

## 12. Risk analysis

The ten risks with the highest expected impact. Full register (14 risks) with mitigations:
[07-compliance-and-risk.md](07-compliance-and-risk.md).

| Risk | Likelihood | Impact | Principal mitigation |
|---|:--:|:--:|---|
| Meta policy restricts healthcare messaging further | Medium | High | Multi-channel fallback (SMS, RCS, email, voice) built from Month 3 |
| Free 24h service window ends Oct 2026, raising message costs | High | Medium | Already priced in; costs are passed through, not absorbed |
| Data breach with us named as processor | Low | Critical | No PHI on WhatsApp; encryption; isolation; breach runbook; indemnity insurance; DPA liability caps |
| Key-person dependency on the promoter | High | High | SOPs and templatisation from client #3; engineer hired Month 6 |
| Cash-flow squeeze from delayed retainers | Medium | High | 60/40 build terms; auto-debit mandates; contractual pause at day 15 |
| Price war from freelancers | High | Low | Compete on compliance liability and measured outcomes, never on price |
| SaaS incumbent moves down-market | Medium | Medium | Moat is the referral graph and signed baselines, not the templates |
| Client demands PHI over WhatsApp | High | Medium | Refuse in writing, citing regulation. The refusal is the brand. |
| Hiring quality in a competitive Hyderabad AI market | High | Medium | Recruit from TASK and from clinic front-desk staff |
| Subsidy assumptions prove incorrect | Medium | Low | No subsidy included in the base case |

---

## 13. Social and economic impact

*(Relevant to PMEGP, T-IDEA and other scheme applications.)*

- **Direct employment:** 26 jobs by Year 3, primarily for Telangana graduates, sourced through TASK
  and local colleges
- **MSME digitalisation:** 150 Hyderabad healthcare MSMEs moved from manual to automated operations —
  directly advancing the objectives of the **AI-Powered Telangana** strategy and the Telangana AI
  Innovation Hub's applied-AI-in-healthcare pillar
- **Regulatory readiness:** 150 establishments brought into DPDP compliance ahead of the
  13 May 2027 deadline, reducing systemic exposure to a ₹250 crore penalty regime
- **Patient outcome:** measurable reduction in missed appointments and un-completed follow-ups,
  and faster report delivery, at no additional cost to patients
- **Skilling:** front-desk and administrative staff trained in AI-assisted workflows — a
  direct contribution to the state's AI-skilling targets
- **Import substitution of consulting spend:** capability that Hyderabad SMEs would otherwise buy
  from national or offshore vendors, or not buy at all

---

## 14. Verification checklist (close before submission)

- [ ] Promoter details, qualifications and net worth (§2)
- [ ] Written confirmation from the chosen BSP on **October 2026 WhatsApp service-window pricing**
- [ ] **T-IDEA / TG-iPASS eligibility for a services-sector enterprise** — District Industries Centre
      and MSME-DFO Hyderabad
- [ ] Telangana Udyam registration figures — confirm with Ministry of MSME (a reported FY 2024–25
      figure of 175 new registrations is almost certainly a portal artefact and must not be quoted
      unverified)
- [ ] Legal opinion on **data-processor liability under DPDP** for an automation vendor serving clinics
- [ ] Whether target clients are **ABDM-registered facilities**, and the resulting obligations
- [ ] Current cross-border **restricted-jurisdictions list** (affects hosting and LLM region choice)
- [ ] TRAI DLT registration process, timeline and cost — all three telcos
- [ ] Status of the **CCI review** of Meta's January 2026 chatbot policy
- [ ] **GST treatment of pass-through messaging charges** (pure-agent versus supply) — chartered accountant
- [ ] Professional indemnity policy wording — confirm it covers data-processing liability
- [ ] Hyderabad establishment counts — cross-check directory figures against the Telangana Clinical
      Establishments registry
- [ ] Trademark and MCA name availability for the chosen brand

---

## Annexures

| # | Document |
|---|---|
| A | [Market research and vertical selection](01-market-research.md) |
| B | [Positioning and differentiation](02-positioning-and-differentiation.md) |
| C | [Service catalogue and pricing](03-service-catalogue-and-pricing.md) |
| D | [Free pilot playbook](04-free-pilot-playbook.md) |
| E | [Go-to-market playbook](05-go-to-market-playbook.md) |
| F | [Delivery architecture](06-delivery-architecture.md) |
| G | [Compliance and risk register](07-compliance-and-risk.md) |
| H | [Financial model](09-financial-model.md) |
| I | [90-day execution plan](10-90-day-execution-plan.md) |
