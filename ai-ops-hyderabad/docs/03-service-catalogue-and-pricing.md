# 03 — Service Catalogue & Pricing

All prices in INR, exclusive of GST (18%) and exclusive of Meta/BSP message charges, which are
passed through at cost + 20%.

---

## 1. The pricing ladder

| Tier | Product | Price | Purpose |
|---|---|---|---|
| **0** | **Leak Audit** | **Free** (45 min, on-site) | Lead magnet, qualification, baseline, pricing anchor |
| **1** | **Recovery Sprint** (21-day pilot) | **Free build**, client pays own Meta/BSP costs (~₹3,000) | Proof, not revenue |
| **2** | **Recovery OS — Core Build** | **₹75,000** one-time | Deployment of 3–4 workflows |
| **3** | **Managed Retainer** | **₹18,000 / ₹32,000 / ₹55,000** per month | The actual business |
| **4** | **Outcome Plan** (alternative to 2+3) | **10% of recovered revenue**, floor ₹12,000, cap ₹50,000/month | For owners who refuse fixed fees |
| **A** | Add-ons | ₹8,000–₹45,000 | Expansion revenue |

**Target blended ACV: ₹3.0–3.5 lakh per client per year.**

---

## 2. Tier 0 — The Leak Audit (free)

**Duration:** 45 minutes on site. **Delivered by:** founder (later, a trained associate).

**What we collect** (the standard 12 questions):

| # | Question | Feeds |
|---|---|---|
| 1 | Appointments booked last month | Volume |
| 2 | Appointments actually attended | No-show rate |
| 3 | Average realised value per visit | ₹ per slot |
| 4 | Calls received per day / calls missed per day | Missed-call leak |
| 5 | Who answers the phone, and when are they unavailable | Coverage gap |
| 6 | How reminders are sent today (manual? none? personal WhatsApp?) | Current state |
| 7 | Time from test completion to report delivered | Turnaround leak |
| 8 | % of patients who return for advised follow-up / repeat test | Recall leak |
| 9 | Google rating + review count | Reputation leak |
| 10 | Systems in use (LIS/HIS/billing, Tally, spreadsheets, nothing) | Integration scope |
| 11 | Number of branches, staff at front desk | Sizing |
| 12 | Who signs the cheque, and are they in the room | Qualification |

**Deliverable: the one-page Leak Report** — emailed within 24 hours and, critically, **signed by the
owner as an agreed baseline**.

```
LEAK REPORT — [Clinic Name], [Area], Hyderabad          Baseline month: [Month YYYY]

  A. No-show leak          [N] missed × ₹[V]              = ₹ ____ /month
  B. Missed-call leak      [C] missed calls × [conv%] × ₹[V] = ₹ ____ /month
  C. Recall leak           [P] patients not returned × ₹[V]  = ₹ ____ /month
  D. Report-delay leak     [D] delayed × [drop%] × ₹[V]      = ₹ ____ /month
  ─────────────────────────────────────────────────────────────────────
  TOTAL MONTHLY LEAK                                      = ₹ ____
  ANNUALISED                                              = ₹ ____

  Recoverable in 90 days (conservative, 35% of A+B):      = ₹ ____ /month

  Baseline agreed by: ______________________  Date: __________
```

**Rules:** never sell during the audit. The audit ends with *"I'll send you the numbers tomorrow"*
and nothing else. The Leak Report sells for you.

**Reference data for the model** (use these until you have your own):
- Indian OPD no-show rates run **up to 30%**
- 15 missed appointments/week at ₹1,000–₹2,000 (consult) or ~₹10,000 (diagnostics)
  = **₹10–20 lakh/year per centre**
- Published Indian deployments: no-shows **28% → under 16%**; leakage cut **20–25%** in two quarters

---

## 3. Tier 1 — The Recovery Sprint (21-day free pilot)

Full mechanics in [04-free-pilot-playbook.md](04-free-pilot-playbook.md). Summary:

| | |
|---|---|
| **Duration** | 21 days, hard stop |
| **Scope** | **One** workflow only — no-show recovery. Max 2 integrations. No custom UI. |
| **Our cost** | ~₹8,000 (12 build hours + infra) |
| **Client pays** | Their own Meta/BSP charges (~₹3,000) — this is the filter and the payment habit |
| **Success criteria** | Pre-agreed in writing, e.g. "no-show rate falls ≥ 25% relative to baseline" |
| **Day 22** | Automation is switched **off** unless a contract is signed |
| **Target conversion** | ≥ 50% |
| **Max concurrent** | 3 |

---

## 4. Tier 2 — Recovery OS Core Build (₹75,000 one-time)

Four productised workflows, configured — never rebuilt.

| # | Workflow | What it does |
|---|---|---|
| **W1** | **Slot Guard** | Booking confirmation → 24h reminder → 3h reminder → one-tap reschedule → missed-appointment recovery within 30 min → waitlist backfill of the vacated slot |
| **W2** | **Front Desk Overflow** | Missed/after-hours calls captured; Telugu/Hindi/English intake; qualified and routed; callback scheduled; nothing goes unanswered |
| **W3** | **Report & Payment Relay** | *Report-ready* **notification** on WhatsApp (never the report itself) → OTP-verified secure link → payment link → advised follow-up prompt |
| **W4** | **Recall Engine** | Rules-based reminders for repeat tests, annual health checks, treatment-plan next steps, vaccination and review schedules |

**Also included in the ₹75,000:**
- WhatsApp Business Platform onboarding, business verification, green-tick application
- **TRAI DLT registration** on all three telco portals (entity, headers, templates)
- Up to 25 message templates, drafted bilingually and submitted for Meta approval
- Integration with **one** existing system (LIS/HIS, billing software, Tally, or Google Sheets)
- DPDP consent capture, retention policy, opt-out handling, signed Data Processing Agreement
- On-site staff training (2 sessions) + a printed one-page front-desk SOP
- 30 days of hypercare with a named supervisor

**Delivery time:** 10–14 working days. **Our build cost:** 40 hours at client #1, falling to a target
of **12 hours by client #15** through templatisation. *This ratio is the single most important
operating KPI in the business.*

**Design-partner pricing:** first 6 clients at **₹35,000**, in exchange for a written case study,
a named testimonial, and three warm introductions. Print the ₹75,000 on the invoice and show the
discount as a line item — never quote ₹35,000 as the price.

---

## 5. Tier 3 — Managed Retainer

| | **Essential** | **Growth** | **Multi-Branch** |
|---|---|---|---|
| **Price/month** | **₹18,000** | **₹32,000** | **₹55,000** |
| Workflows live | Up to 4 | Up to 8 | Up to 12 |
| Monitoring & incident response | Business hours | Extended + priority | Priority + named owner |
| Optimisation cycle | Monthly | Fortnightly | Weekly |
| ROI review with owner | Monthly, 20 min | Monthly, 45 min | Monthly, on-site |
| Template changes included | 3/month | 8/month | Unlimited fair-use |
| AI voice agent | ✗ (add-on) | ✓ 500 min included | ✓ 2,000 min included |
| Branches covered | 1 | Up to 3 | Up to 8 |
| Compliance pack | Basic | Full + annual review | Full + quarterly audit |
| Support channel | WhatsApp group | WhatsApp + phone | Dedicated + escalation SLA |

**Contract:** 6-month minimum, monthly billing, 30-day notice thereafter. Annual prepay = 10% off
(this is your working-capital engine — push it hard).

**Benchmark check:** the market pays ₹12,000 (starter) / ₹25,000 (growth) / ₹50,000 (scale) for
generic n8n retainers. We sit slightly above because we carry compliance liability and report in
rupees recovered, not hours consumed.

---

## 6. Tier 4 — The Outcome Plan

For the owner who says *"I don't pay for software, I pay for results."*

| | |
|---|---|
| **Build fee** | ₹0 |
| **Monthly fee** | **10% of measured recovered revenue** |
| **Floor** | ₹12,000/month (covers our COGS) |
| **Cap** | ₹50,000/month (protects the client, and caps our support load) |
| **Measurement** | Recovered = (baseline no-show rate − current no-show rate) × slots × realised value, computed from *their* billing export, reconciled monthly |
| **Term** | 12 months, then converts to Growth retainer at prevailing rates |

**Only offer this when:** the baseline is signed, the client exports billing data reliably, and
monthly volume exceeds 1,000 appointments. Otherwise the measurement dispute will cost more than the
revenue.

Expect ~30% uptake. The other 70% choose fixed pricing *because* you offered this — it is the single
most persuasive trust signal available to a new agency with no track record.

---

## 7. Add-ons (expansion revenue)

| Add-on | Price | Notes |
|---|---|---|
| **AI Voice Agent** (Telugu/Hindi/English) | ₹15,000 setup + ₹6/min billed | Our cost ₹1.50–₹12/min depending on stack; margin managed by routing |
| **DPDP Compliance Pack** | ₹35,000 one-time + ₹5,000/month | Data map, consent registry, privacy notices in 3 languages, retention policy, breach runbook, DPA, annual review |
| **Additional branch** | ₹8,000/month | Marginal cost ≈ ₹1,500 |
| **Additional integration** (Tally, LIS, HIS, ERP) | ₹25,000 one-time | |
| **Google Review Engine** | ₹12,000 setup + ₹4,000/month | Post-visit sentiment gate → 4–5★ to Google, 1–3★ to owner privately |
| **Insurance/TPA claim-status bot** | ₹30,000 setup | Narrowly scoped, permitted under Meta's Jan-2026 terms |
| **Staff AI training workshop** | ₹18,000 per half-day | Potentially eligible for T-IDEA skill-upgradation reimbursement — **verify with DIC** |
| **Front-desk analytics dashboard** | ₹5,000/month | Missed calls, response times, slot utilisation |

**Target: 1.4 add-ons per client by month 9.**

---

## 8. Pass-through: messaging and platform

Never absorb Meta charges. Never mark them up invisibly. Bill them as a transparent line item at
**cost + 20%**, and show the client the raw Meta invoice on request.

**Typical mid-sized lab, ~1,200 appointments/month:**

| Line | Volume | Rate | Cost |
|---|---|---|---|
| Utility templates (confirm, remind, report-ready, payment) | 4,800 | ₹0.125 | ₹600 |
| Marketing templates (recall, campaigns) | 1,500 | ₹0.87 | ₹1,305 |
| Service replies *(assumes free window ends Oct 2026)* | 2,000 | ₹0.29 | ₹580 |
| BSP platform fee | — | — | ₹1,500 |
| LLM inference | — | — | ₹700 |
| Infrastructure share | — | — | ₹150 |
| **Total COGS** | | | **₹4,835** |
| **Billed to client** | | | **₹6,000** |
| **Contribution** | | | **₹1,165** |

> ⚠️ Confirm the October 2026 end of the free 24-hour service window with your BSP **in writing**
> before signing any fixed-price messaging commitment.

**A quiet superpower:** because marketing templates cost ~7× utility templates, a well-designed flow
can cut a client's Meta bill by 40–60%. On a client spending ₹12,000/month on badly-built broadcasts,
**our retainer is free out of the savings.** Lead with this whenever a prospect already has a
WhatsApp tool.

---

## 9. Discounting policy

| Situation | Allowed |
|---|---|
| Design partner (first 6) | Build ₹75,000 → ₹35,000, in exchange for case study + testimonial + 3 intros |
| Annual prepay | 10% off retainer |
| Multi-branch (3+) | Use Multi-Branch tier, not ad-hoc discounts |
| Association member (FTCCI etc.) | 10% off build only, never the retainer |
| Referral from an existing client | ₹10,000 credit to **the referrer**, no discount to the new client |
| Anything else | **No.** Reduce scope instead of price. |

**Never discount the retainer.** Retainer price is the valuation of the business. Cut workflows,
cut branches, cut the voice agent — never cut the monthly number.

---

## 10. Payment terms

- Build fee: **60% on signature, 40% on go-live**. Non-negotiable — this funds the delivery.
- Retainer: monthly in advance, auto-debit via UPI mandate / e-NACH. Set this up on day one; chasing
  ₹18,000 invoices will consume more of your life than the money is worth.
- Messaging pass-through: billed in arrears with the Meta statement attached.
- Late payment: automations pause at day 15 after a written 7-day notice. Write it into the MSA and
  actually enforce it once, early, so it never has to be enforced again.
