# 10 — The First 90 Days

> One rule above all others: **do not build anything in week 1.** Book audits.
> The most common way this business fails is a founder spending eight weeks perfecting n8n workflows
> for customers who do not exist.

---

## Week 1 — Legal, tools, and a target list

| # | Task | Output |
|---|---|---|
| 1 | Register proprietorship; apply for **Udyam** (free) and **GST** | Registration certificates |
| 2 | Open a current account; set up UPI and an e-NACH mandate facility | Payment rails live |
| 3 | Engage a lawyer to draft **MSA, SOW, DPA, NDA** (~₹25,000) | Signed templates |
| 4 | Engage a CA on retainer (~₹3,000/month) | GST and books handled |
| 5 | Open a BSP account (AiSensy / Gallabox / Interakt) — **ask in writing about the Oct 2026 service-window change** | BSP account + written answer |
| 6 | Begin **TRAI DLT entity registration** on all three telco portals (start now — it is slow) | DLT entity ID pending |
| 7 | Provision the India-region VPS; install self-hosted n8n; enable nightly encrypted backups | Infrastructure live |
| 8 | **Build the 400-row target list** — Google Maps + JustDial + Practo by cluster; score by the priority table in [05](05-go-to-market-playbook.md) | Prioritised list |
| 9 | Write the **Leak Report template** and fill in one anonymised sample | The only leave-behind you carry |
| 10 | Write the **2-page Pilot Agreement**, including the commitment clause | Signed template |

**Do not:** build workflows, design a logo, or write a website beyond a single page with the Leak
Calculator and a booking link.

---

## Week 2 — First 40 doors

| Day | Activity |
|---|---|
| Mon | Finalise the walk-in script; print 100 sample Leak Reports; brief a designer on the report layout |
| Tue | **Somajiguda / Ameerpet** — 20 doors |
| Wed | **Secunderabad / Tarnaka** — 20 doors |
| Thu | Follow-up calls to everyone who said "come back"; book audits |
| Fri | Run your first 2 Leak Audits |
| Sat | **KPHB / Kukatpally** — 15 doors; write up audit findings |

**Targets:** 55 conversations · 6 audits booked · 2 audits completed.

**Expect this to be uncomfortable.** The first 20 doors are the hardest thing in the plan. The
script works; the volume is what makes it work.

---

## Weeks 3–4 — Audits, and the first two Sprints

**Targets:** 120 cumulative conversations · **12 Leak Audits completed** · **2 Recovery Sprints
signed**.

Only start a Sprint when all six qualification gates are met (see
[04-free-pilot-playbook.md](04-free-pilot-playbook.md)):
≥600 appointments/month · owner is the decision-maker and will attend the day-21 review · a digital
appointment record exists · a business phone number is available · a named front-desk owner ·
a signed Leak Report baseline.

**Then, and only then, build.** Sprint #1 build (target ≤ 20 hours):
1. WhatsApp Business Account, verification, DLT header and templates
2. Submit six templates for Meta approval on day 1 — approval is the long pole
3. Connect the appointment source (API, or a nightly Sheet/CSV export)
4. Configure **W1 Slot Guard**, bilingual
5. End-to-end test on 20 real appointments
6. On-site front-desk training; tape the printed SOP card next to the monitor

**Document every step as you build it.** That document becomes the SOP, and the SOP is what lets you
hire in Month 6.

---

## Weeks 5–6 — Run the Sprints, keep knocking

- Check the queue **personally, twice a day**, for the first five days of each pilot. Fix problems
  before the client sees them.
- Send the weekly three-line WhatsApp update to each owner. Never skip it.
- Keep walking: 40 doors/week. **This is where most founders stop, and it is why most fail.**
  Delivery feels productive; only the funnel compounds.
- Collect a receptionist quote by day 12 of each pilot.

**Targets:** 200 cumulative conversations · 20 audits · 3 Sprints running.

---

## Weeks 7–8 — First closes

- **Day 21 of Sprint #1: the results review.** One printed page. Ask the closing question. Be quiet.
- Sign the Core Build + Essential Retainer. Design-partner price ₹35,000 (shown as a discount off
  ₹75,000), in exchange for a written case study, a named testimonial, and three warm introductions.
- Collect **60% of the build fee on signature** and set up the auto-debit mandate the same day.
- Any Sprint that does not sign: switch off on day 22, exactly as agreed, without drama.

**Targets:** **2 paying clients** · ₹42,000 MRR · first case study written.

---

## Weeks 9–10 — Productise

The moment you have two paying clients doing the same thing, stop building bespoke.

- Extract W1–W4 into **parameterised n8n sub-workflows**
- Create the **per-client YAML/Sheet config** (see [06](06-delivery-architecture.md))
- Get the shared template library approved by Meta **once**, then clone per client
- Automate the **monthly ROI report** — this is the retention product; never send it manually
- Publish case study #1 on LinkedIn, in Telugu and English

**Target: build time below 25 hours.**

---

## Weeks 11–12 — Compound

- **Ask for referrals** from client #1, at the moment their first ROI report shows a positive number.
  Two names, not "anyone you know."
- Open the **partner channel**: two LIS/HIS vendors, one medical-equipment dealer.
- **Join FTCCI.** Offer a free session: *"What the May 2027 DPDP deadline means for your patient
  data."* Sell nothing in the room.
- Keep walking: 40 doors/week.

**Targets by Day 90:** **5 paying clients · ₹1.05 lakh MRR · break-even crossed · 2 case studies ·
3 partner conversations live.**

---

## The five numbers on the wall

Write these where you will see them every morning. Nothing else matters in the first 90 days.

| # | Metric | Weekly target |
|---|---|---:|
| 1 | Doors knocked | **60** |
| 2 | Leak Audits completed | **6** |
| 3 | Sprints running | **3** |
| 4 | Build hours per client (must fall every week) | **↓** |
| 5 | MRR | **↑** |

---

## The seven ways this fails, and how to not

| Failure mode | Prevention |
|---|---|
| **Building before selling** | No workflow is built until a signed Pilot Agreement exists |
| **Pilots that never end** | 21 days, hard stop, switch off on day 22. No exceptions, ever. |
| **No signed baseline** | Then there is no proof, no invoice, and no argument you can win |
| **Owner absent from the day-21 review** | Get the date in the diary *before* you start building |
| **Bespoke work for every client** | No custom workflow until three clients ask for the same thing |
| **Discounting the retainer** | Cut scope, never price. The retainer is the valuation of the business. |
| **Stopping the field work once delivery gets busy** | 40 doors/week is a floor, not a target. Book it in the calendar like a client meeting. |

---

## Day 91 — the review

Ask three questions, honestly:

1. **Is pilot → paid above 50%?**
   If not, the problem is qualification or the commitment clause — never the technology.
2. **Are build hours below 25?**
   If not, you have a job, not a business. Stop selling for one week and templatise.
3. **Is at least one client referring?**
   If not, delivery is not yet good enough to talk about. Fix delivery before spending on marketing.

Fix whichever answer is "no" before scaling anything. Then go back to
[05-go-to-market-playbook.md](05-go-to-market-playbook.md) §7 and run the twelve-month plan.
