# 09 — Financial Model

All figures in INR, excluding GST. **These are models, not promises.** Every assumption is stated so
it can be argued with, replaced, and re-run.

---

## 1. Capital requirement

### One-time setup (Month 0)

| Item | Amount |
|---|---:|
| Proprietorship + Udyam + GST + Shops & Establishments registration | 5,000 |
| Domain, website, Google Workspace (2 seats, annual) | 8,000 |
| WhatsApp BSP onboarding + business verification + green tick | 5,000 |
| n8n self-hosted VPS, India region, 12 months prepaid | 18,000 |
| Initial tool stack (CRM, monitoring, design, secret store) | 25,000 |
| **Legal: MSA + SOW + DPA + NDA drafted by a lawyer** | 25,000 |
| Branding, sales collateral, Leak Calculator page, demo assets | 15,000 |
| Professional indemnity insurance (year 1 premium) | 18,000 |
| Field kit (printing, travel float, phone plan) | 8,000 |
| Contingency | 18,000 |
| **Total setup** | **1,45,000** |

*Assumes a laptop is already owned. Add ₹60,000 if not.*

### Working-capital buffer

Months 1–3 generate no revenue. Fixed opex ₹39,000/month + founder drawings ₹40,000/month
= ₹79,000/month × ~4 months = **₹3,00,000**.

> ### Total capital required: **₹4,45,000**

**Funding options:** self-funded; **PM Mudra — Kishore** (collateral-free, up to ₹5 lakh);
**PMEGP**; Telangana **Pavala Vaddi** interest subvention (3–9% on term loans).
**No subsidy is assumed in the base case** — treat any grant as upside
(and see the T-IDEA eligibility caveat in [07](07-compliance-and-risk.md)).

---

## 2. Unit economics — one client, one month

### Revenue

| Line | Amount |
|---|---:|
| Managed retainer (Essential) | 18,000 |
| Add-ons, blended across the base (voice, extra branch, compliance, reviews) | 3,500 |
| Messaging & platform, billed at cost + 20% | 6,000 |
| **Monthly revenue per client** | **27,500** |

### Cost of delivery

| Line | Amount |
|---|---:|
| Meta messages — utility 4,800 @ ₹0.125 | 600 |
| Meta messages — marketing 1,500 @ ₹0.87 | 1,305 |
| Meta messages — service 2,000 @ ₹0.29 *(assumes the free 24h window ends Oct 2026)* | 580 |
| BSP platform fee | 1,500 |
| LLM inference | 700 |
| Infrastructure share | 150 |
| Support labour (2 hrs @ ₹500 loaded, steady state) | 1,000 |
| Voice minutes (blended across base) | 1,200 |
| **Monthly COGS per client** | **7,035** |

| | |
|---|---:|
| **Gross contribution / client / month** | **₹20,465** |
| **Gross margin** | **74%** |

### One-time build

| | Amount |
|---|---:|
| Build fee | 75,000 |
| Delivery cost at 12 hours × ₹800 loaded (steady state) | (9,600) |
| **Gross profit per build** | **₹65,400** |

*Client #1 costs 40 hours (₹32,000) — gross profit ₹43,000. Still positive from day one. The
templatisation ramp in [06](06-delivery-architecture.md) is what turns ₹43,000 into ₹65,400.*

### Lifetime value

| Assumption | Value |
|---|---:|
| Average client life | 30 months (2.8% monthly churn) |
| Recurring gross profit | 30 × ₹20,465 = ₹6,13,950 |
| *less* delivery/success overhead allocation (~15%) | (₹92,000) |
| Build gross profit | ₹65,400 |
| **LTV** | **≈ ₹5,87,000** |

### Customer acquisition cost (fully loaded, Year 1)

| Line | Amount |
|---|---:|
| Marketing & content | 2,40,000 |
| Field sales associate (from M8) | 1,50,000 |
| Founder selling time (50% of drawings) | 1,80,000 |
| Free pilots: 55 pilots × ₹8,000 direct cost | 4,40,000 |
| **Total** | **10,10,000** |
| ÷ 24 clients acquired | |
| **CAC ≈ ₹42,000** | |

*The 55-pilot figure is the sum of the monthly "pilots started" column in
[05-go-to-market-playbook.md](05-go-to-market-playbook.md) §7 (2·3·3·3·4·4·5·5·6·6·7·7). At a 50%
pilot-to-paid rate that would yield 27 clients; we plan for 24 to leave room for pilots that run
across a month boundary and for two that are abandoned mid-way.*

| Metric | Value |
|---|---:|
| **LTV : CAC** | **≈ 14 : 1** |
| **CAC payback** | **Immediate** — the ₹75,000 build fee alone exceeds CAC |

The second number is the important one. **This business recovers its acquisition cost before it
sends its first retainer invoice.** That is why it can be started with ₹4.45 lakh.

---

## 3. Break-even

| Line | Amount |
|---|---:|
| Fixed monthly opex (months 1–6) | 39,000 |
| Founder drawings | 40,000 |
| **Monthly nut** | **79,000** |
| ÷ gross contribution per client (₹20,465) | |
| **Operating break-even** | **4 clients** |

**Projected: Month 4.** Cash break-even (full recovery of the ₹1.45 lakh setup): **Month 5**.

Fixed opex, months 1–6:

| Item | Monthly |
|---|---:|
| VPS + backups | 1,500 |
| LLM API (base load) | 6,000 |
| BSP platform (own account) | 3,000 |
| CRM + Workspace + tools | 2,400 |
| CA retainer (accounts, GST) | 3,000 |
| Phone, internet, field travel | 8,000 |
| Marketing & content | 10,000 |
| Contingency | 5,100 |
| **Total** | **39,000** |

Rising to ~₹60,000/month from Month 7 (second BSP account, monitoring, higher LLM load).

---

## 4. Year 1 — month by month (Base case)

**How to read this table.** The monthly `Costs` column is the monthly nut (₹79,000 in months 1–6,
rising with each hire) **plus** cost of delivery on live clients **plus** the direct cost of free
pilots running that month (~₹8,000 each). That is why Month 2 shows ₹87,000 rather than ₹79,000 —
there are still no clients, but the first free pilot is running.

| M | Active clients | New | Setup rev | Retainer + add-ons | Total rev | Costs | Monthly P&L | Cumulative |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 0 | 0 | 0 | 0 | 79,000 | (79,000) | (79,000) |
| 2 | 0 | 0 | 0 | 0 | 0 | 87,000 | (87,000) | (1,66,000) |
| 3 | 2 | 2 | 70,000 | 45,400 | 1,15,400 | 96,000 | 19,400 | (1,46,600) |
| 4 | 3 | 1 | 35,000 | 68,100 | 1,03,100 | 1,00,000 | 3,100 | (1,43,500) |
| 5 | 5 | 2 | 70,000 | 1,13,500 | 1,83,500 | 1,12,000 | 71,500 | (72,000) |
| 6 | 7 | 2 | 1,50,000 | 1,58,900 | 3,08,900 | 1,68,000 | 1,40,900 | 68,900 |
| 7 | 9 | 2 | 1,50,000 | 2,04,300 | 3,54,300 | 1,95,000 | 1,59,300 | 2,28,200 |
| 8 | 11 | 2 | 1,50,000 | 2,49,700 | 3,99,700 | 2,42,000 | 1,57,700 | 3,85,900 |
| 9 | 14 | 3 | 2,25,000 | 3,17,800 | 5,42,800 | 2,88,000 | 2,54,800 | 6,40,700 |
| 10 | 17 | 3 | 2,25,000 | 3,85,900 | 6,10,900 | 3,10,000 | 3,00,900 | 9,41,600 |
| 11 | 20 | 3 | 2,25,000 | 4,54,000 | 6,79,000 | 3,32,000 | 3,47,000 | 12,88,600 |
| 12 | 24 | 4 | 3,00,000 | 5,44,800 | 8,44,800 | 3,65,000 | 4,79,800 | **17,68,400** |

Small differences from the annual roll-up below are rounding in the monthly phasing.

**Year 1 summary**

| | |
|---|---:|
| Gross new clients | 24 |
| Active clients at exit | 24 |
| Client-months delivered | 112 |
| Setup fee revenue (6 design partners @ ₹35k, 18 @ ₹75k) | 15,60,000 |
| Retainer revenue (112 client-months × ₹20,000 blended) | 22,40,000 |
| Messaging & platform re-billing, **shown net** (112 × ₹1,200) | 1,34,400 |
| Add-ons (one-time + recurring) | 3,25,000 |
| **Total revenue** | **42,59,400** |
| Fixed opex | 5,94,000 |
| COGS | 5,41,520 |
| Automation engineer (from M6) | 3,15,000 |
| Ops/success associate (from M9) | 1,12,000 |
| Field sales associate (from M8) | 1,50,000 |
| Freelance / contract delivery | 1,20,000 |
| Marketing & content, *over and above* the ₹10,000/month baseline already inside fixed opex | 2,40,000 |
| Professional fees (CA, legal, insurance) | 1,20,000 |
| Founder drawings | 3,60,000 |
| **Total costs** | **25,52,520** |
| **EBITDA** | **₹17,06,880** |
| **EBITDA margin** | **40%** |
| **Exit MRR** | **₹5,44,800** (ARR run-rate ₹65.4 lakh) |

### Two notes on how this is presented

**1. The ₹20,000 blended retainer.** The unit-economics table in §2 prices a single *Essential*
client at ₹18,000. The ₹20,000 used here is the Year-1 blend across the base: most clients sit on
Essential (₹18,000), a minority upgrade to Growth (₹32,000), and two multi-branch labs sit on
Scale (₹55,000). Year-1 average monthly revenue per client therefore comes to ₹22,700 against the
mature ₹27,500 in §2 — clients ramp into add-ons and message volume over their first two quarters,
so the first year is deliberately modelled below steady state.

**2. Messaging is credited net but costed gross — on purpose.** Messaging, BSP and infrastructure
are re-billed to clients at cost + ~20%. Revenue above credits only the **margin** on that
re-billing (₹1,200/client-month), while COGS carries the **full** pass-through cost
(₹5,41,520). Strictly, gross re-billing of ~₹6,72,000 should appear in revenue, which would lift
Year-1 EBITDA to roughly **₹22.5 lakh (47%)**. We keep the conservative presentation and hold the
difference as an unstated cushion against message-volume overruns and against the October 2026
service-window change — both outside our control. **Do not add the two effects together: the
₹17.1 lakh figure is the one to plan and borrow against.**

---

## 5. Three-year projection (Base case)

| | Year 1 | Year 2 | Year 3 |
|---|---:|---:|---:|
| Active clients (exit) | 24 | 70 | 150 |
| New clients in year | 24 | 58 | 92 |
| Client-months delivered | 112 | 587 | 1,380 |
| Avg monthly revenue per client | ₹22,700 | ₹27,500 | ₹30,400 |
| **Revenue** | **₹42.6 L** | **₹2.11 Cr** | **₹5.07 Cr** |
| **Total costs** | ₹25.5 L | ₹1.41 Cr | ₹3.35 Cr |
| **EBITDA** | **₹17.1 L** | **₹69.9 L** | **₹1.72 Cr** |
| EBITDA margin | 40% | 33% | 34% |
| Headcount (exit, incl. founder) | 4 | 12 | 26 |
| Verticals live | 1 | 2 | 3 |
| Cities | 1 | 1 | 2 |
| Exit MRR | ₹5.45 L | ₹19.25 L | ₹45.6 L |

**Why the margin dips in Year 2 and holds in Year 3:** Year 2 absorbs the cost of building a real
team, an office and a second vertical while ARPU is still rising. Year 3 recovers it through
templatisation (build hours per client at 8–10) and higher-tier retainers.

### Year 2 cost detail

| Line | Amount |
|---|---:|
| Team (avg 8 heads through the year) | 48,00,000 |
| Sales commissions (58 × ₹15,000) | 8,70,000 |
| Office (12–15 seats) | 7,20,000 |
| Fixed opex & tools | 14,40,000 |
| COGS (587 × ₹5,200) | 30,52,400 |
| Marketing | 12,00,000 |
| Professional fees & insurance | 5,00,000 |
| Founder | 15,00,000 |
| **Total** | **1,40,82,400** |

### Year 3 cost detail

| Line | Amount |
|---|---:|
| Team (avg 20 heads) | 1,25,00,000 |
| Sales commissions (92 × ₹18,000) | 16,56,000 |
| Office (2 cities) | 21,60,000 |
| Fixed opex & tools | 30,00,000 |
| COGS (1,380 × ₹5,500) | 75,90,000 |
| Marketing | 30,00,000 |
| Professional fees & insurance | 12,00,000 |
| Founder | 24,00,000 |
| **Total** | **3,35,06,000** |

---

## 6. Scenarios

| | **Conservative** | **Base** | **Stretch** |
|---|---:|---:|---:|
| Clients at M12 | 14 | 24 | 36 |
| Pilot → paid conversion | 35% | 50% | 65% |
| Avg retainer | ₹18,000 | ₹20,000 | ₹21,000 |
| Monthly churn | 4% | 2.8% | 2% |
| **Year 1 revenue** | **₹23.5 L** | **₹42.6 L** | **₹69.0 L** |
| **Year 1 EBITDA** | **₹5.1 L** | **₹17.1 L** | **₹34.4 L** |
| Break-even month | M6 | M4 | M3 |
| Exit MRR | ₹2.98 L | ₹5.45 L | ₹8.17 L |

**The conservative case still works.** Fourteen clients — out of ~8,400 healthcare establishments in
Hyderabad, a 0.17% share — produce a profitable business on ₹4.45 lakh of capital. That asymmetry is
the whole argument for this venture.

### Sensitivity: what actually moves the outcome

| Variable | −20% | Base | +20% | Sensitivity |
|---|---:|---:|---:|:--|
| Clients acquired | ₹31.9 L rev | ₹42.6 L | ₹53.3 L | **Highest** |
| Retainer price | ₹38.1 L | ₹42.6 L | ₹47.1 L | High |
| Build fee | ₹39.5 L | ₹42.6 L | ₹45.7 L | Medium |
| Messaging cost | +₹1.1 L EBITDA | — | −₹1.1 L EBITDA | **Low** (it's a pass-through) |
| Churn | +₹2.4 L EBITDA | — | −₹2.4 L EBITDA | Medium |

**Conclusion: the business is acquisition-limited, not cost-limited.** Every rupee of management
attention belongs in the funnel — audits booked per week — and not in cost optimisation. The
messaging-cost row is deliberately included to show that Meta's October 2026 pricing change, which
will panic the competition, barely touches us because we pass it through.

---

## 7. Market sizing

| | Establishments | Realistic ACV | Value |
|---|---:|---:|---:|
| **TAM** — all Hyderabad healthcare establishments (2,210 diagnostic centres + ~4,000 clinics + 1,500 dental + 687 hospitals) | ~8,400 | — | — |
| Of which large enough to pay (est. 35%) | ~2,940 | ₹3.0 L | **₹88 Cr/yr** |
| **SAM** — multi-doctor / multi-branch, ≥600 appointments/month, within GHMC | ~900 | ₹3.3 L | **₹30 Cr/yr** |
| **SOM** — 15% of SAM by end of Year 3 | 135–150 | ₹3.6 L | **₹5 Cr/yr** |

Adding verticals 2 (pharma & device distributors) and 3 (goods transport) roughly triples SAM without
leaving the city. Establishment counts are directory-derived — see the caveats in
[01-market-research.md](01-market-research.md).

---

## 8. Cash-flow discipline

The five rules that decide whether this business survives its first year:

1. **60/40 on build fees** — 60% on signature, 40% on go-live. Never start work on a promise.
2. **Auto-debit mandates (UPI / e-NACH) for every retainer, set up at signature.** Chasing ₹18,000
   invoices will cost more founder-hours than the invoice is worth.
3. **Push annual prepay at 10% off.** Every annual contract is 12 months of working capital today.
4. **Pass through messaging costs; never absorb them.** This is what makes Meta's pricing changes
   somebody else's problem.
5. **Pause automations at day 15 of non-payment**, after a written 7-day notice, per the MSA. Enforce
   it once, early. After that it never needs enforcing.

---

## 9. Exit and long-term optionality

Not required for the plan to work — but worth knowing the shape of the ceiling.

| Path | Description | Indicative value |
|---|---|---|
| **Cash business** | Run at 150–300 clients, 30–35% margin, founder-owned | ₹1.7–3.5 Cr/yr EBITDA |
| **Vertical SaaS pivot** | Productise Recovery OS into self-serve for small clinics; services fund the R&D | Higher multiple, needs capital |
| **Acquisition** | Sale to a larger systems integrator, a healthtech platform, or a BSP wanting an implementation arm | Typically 1–1.5× revenue or 4–6× EBITDA for Indian services businesses |
| **Franchise the playbook** | License the Recovery OS + Leak Audit method to operators in Vijayawada, Vizag, Coimbatore, Indore | Capital-light geographic scale |

The single asset that determines which of these is available is the same one that drives Year 1:
**the templatised, documented, transferable delivery system.** Build it from client #3, not from
client #30.
