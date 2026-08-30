# 04 — The Free Pilot Playbook ("Recovery Sprint")

> The user's plan was: **free trial, then charge.** That is exactly right for a business with no
> track record. But an unstructured free trial is the fastest way to go bankrupt while looking busy.
>
> This document is the structure that makes the free trial profitable.

---

## 1. The four rules that keep a free pilot from killing you

| Rule | Why |
|---|---|
| **1. The client pays their own Meta/BSP charges from day one (~₹3,000)** | Filters tyre-kickers, establishes the payment habit, and means the pilot costs us only labour |
| **2. Twenty-one days, hard stop. Automation switches off on day 22 unless a contract is signed.** | Creates a deadline. Open-ended pilots never close. |
| **3. One workflow. Two integrations. No custom UI.** | Caps our cost at ~12 build hours |
| **4. Maximum three pilots running at once** (raise the cap only as delivery headcount grows — see [05](05-go-to-market-playbook.md) §7) | Protects delivery capacity while you are still selling |

**Our cost per pilot: ~₹8,000.** At a 50% conversion rate and an ACV of ₹3.0 lakh, pilot CAC is
~₹16,000 — a **19:1** first-year return. That is the number that justifies giving work away.

---

## 2. Hard qualification gate

Run a pilot **only** if all six are true. If even one fails, sell the paid Core Build or walk away.

- [ ] **≥ 600 appointments/month** (₹ leak large enough to pay for us)
- [ ] **Owner is the decision-maker and will be in the results meeting** — get the date in the diary
      before you start building
- [ ] **A digital appointment record exists** — LIS/HIS, billing software, or even a maintained
      Google Sheet. Paper-only registers are a paid data-hygiene project, not a pilot.
- [ ] **A dedicated business phone number** is available for the WhatsApp Business Account
- [ ] **Named front-desk owner** — one person accountable for the process on their side
- [ ] **Signed Leak Report** establishing the baseline

> The signed baseline is the whole game. Without it, on day 21 you are arguing about whether it
> worked. With it, you are arguing about nothing.

---

## 3. The 21-day timeline

### Day 0 — Pilot Agreement (2 pages, signed)

Contents:
1. **Baseline metrics**, copied from the Leak Report and initialled by the owner
2. **Success criteria**, stated numerically, e.g.
   > *"No-show rate falls from 27% to 20% or below (a ≥25% relative reduction) across at least
   > 400 appointments during the pilot window."*
3. **The commitment clause** — the most important sentence in the business:
   > *"If the success criteria are met, the client will sign the Core Build + Essential Retainer at
   > standard rates within 7 days of the results review. If they are not met, the client owes
   > nothing and may retain all message templates created."*
4. **Scope fence** — one workflow, two integrations, 21 days
5. **Client obligations** — pays Meta/BSP charges, provides appointment data daily, front-desk owner
   attends training
6. **Data Processing Agreement** and DPDP consent language (see
   [07-compliance-and-risk.md](07-compliance-and-risk.md))

Ask for the commitment clause plainly: *"I'm doing this for free, so I need one thing in writing —
if it works, we start. If it doesn't, you owe me nothing. Fair?"* Almost nobody says no. Anyone who
does has just told you they were never going to buy.

### Days 1–3 — Build

| Day | Task |
|---|---|
| 1 | WhatsApp Business Account setup, business verification, TRAI DLT entity + header registration |
| 1 | Submit 6 message templates for Meta approval (do this first — approval is the long pole) |
| 2 | Connect appointment source (API, or a nightly CSV/Sheet export if that is all they have) |
| 2 | Configure **W1 Slot Guard** from the standard template; set Telugu/English variants |
| 3 | End-to-end test with 20 real appointments; on-site front-desk training (45 min); tape the SOP card next to the monitor |

### Days 4–20 — Run

- Automation live: confirmation → 24h reminder → 3h reminder → one-tap reschedule →
  missed-appointment recovery within 30 minutes → waitlist backfill
- **Daily** (first 5 days): check the queue personally, at 9 am and 6 pm. Fix silently. Never let the
  client discover a bug before you do.
- **Weekly WhatsApp update to the owner** — three lines, always in this shape:
  > *"Week 1: 312 appointments, 41 no-shows (13.1% vs 27% baseline). 22 slots recovered.
  > ₹44,000 recovered so far."*
- Collect a receptionist quote on day 12. It is worth more in the results meeting than any chart.

### Day 21 — The results review (30 minutes, on site, owner present)

Bring **one printed page**:

```
RECOVERY SPRINT RESULTS — [Clinic Name]           [dates]

                            Baseline      Pilot        Change
  No-show rate                27.0%       14.8%        −45%
  Appointments recovered          —          63             —
  Realised value/appointment  ₹1,150      ₹1,150            —
  ─────────────────────────────────────────────────────────────
  REVENUE RECOVERED (21 days)              ₹72,450
  ANNUALISED                              ₹12,58,000

  Your cost, going forward:  ₹75,000 once + ₹18,000/month = ₹2,91,000 year 1
  Your net gain (year 1):                                    ₹9,67,000
  Payback:                                                    11 days
```

Then say exactly this, and then be quiet:

> *"We agreed that if we hit the number, we'd start. We hit it. I've brought the agreement — shall we
> start from the 1st?"*

Do not re-pitch. Do not add features. Do not discount. **Silence closes.**

### Day 22 — Switch off, or switch on

If unsigned: turn the automation off, exactly as agreed, without drama or apology. Send one message:
*"Sprint has ended as scheduled. Your templates are yours to keep. Whenever you're ready, we can be
live again in 48 hours."*

Roughly a third of non-converters come back within 90 days — because the empty slots come back
immediately, and now they can feel the difference. **The switch-off is the sales tool.** Never
extend a pilot.

---

## 4. Objection handling

| Objection | Response |
|---|---|
| *"My receptionist can do this."* | "She can. The question is whether she does it at 8 pm on a Sunday for the Monday list. The system doesn't get tired, and it doesn't take leave in Sankranti week." |
| *"₹18,000 a month is too much."* | "Compared to what? It recovered ₹72,000 in 21 days. If it recovers ₹30,000 next month, you're still up ₹12,000 — and the month after that you're up more, because recall compounds." |
| *"I already use [AiSensy / Wati / Interakt]."* | "Good — keep it. Show me last month's Meta bill. Most clinics we audit are sending marketing templates where utility templates would do; that's roughly 7× the price. We usually cut that bill by 40–60%. Our fee often comes out of your existing spend." |
| *"Is patient data safe on WhatsApp?"* | "It isn't, which is why we never put it there. WhatsApp carries a notification. The report sits behind an OTP-verified link on India-hosted infrastructure with an audit trail. From May 2027 the DPDP rules make this non-optional — you're just getting there early." |
| *"Let me think about it."* | "Of course. One thing though — the automation switches off on the 22nd as we agreed. Would you like me to keep it running while you decide, at ₹18,000 for the month, or switch it off and restart later?" *(This converts far more often than it loses.)* |
| *"Can you do it cheaper?"* | "I can do it smaller. We can drop to two workflows at ₹12,000 and add the rest when you see the return. But the monthly rate doesn't move." |
| *"Send me a proposal."* | "It's in my hand — two pages. Let's read it together now, it takes four minutes." |

---

## 5. Metrics to run the pilot engine on

| Metric | Target | Alarm if |
|---|---|---|
| Audits booked per week | 8 | < 4 |
| Audit → pilot conversion | ≥ 40% | < 25% |
| **Pilot → paid conversion** | **≥ 50%** | **< 35%** → qualification is too loose |
| Pilot build hours | ≤ 12 by pilot #6 | > 20 |
| Pilot success-criteria hit rate | ≥ 80% | < 60% → criteria are too aggressive |
| Days from results review to signature | ≤ 7 | > 14 → the commitment clause isn't being asked for |
| Cost per pilot | ≤ ₹8,000 | > ₹12,000 |

If pilot→paid conversion sits below 35%, the problem is **never** the technology. It is one of:
qualification (wrong clients), the commitment clause (not signed on day 0), or the owner (not in the
room on day 21). Fix in that order.

---

## 6. When *not* to run a free pilot

Charge from day one instead when:

- The prospect came through a **referral from a happy client** — they already believe you; a free
  pilot only devalues the work and delays revenue
- The clinic has **multiple branches** — complexity is too high to give away
- The owner asks *"how fast can you start"* before asking *"how much"* — they have already bought
- You already have **6+ live clients with case studies** in the same sub-vertical — the case study
  now does what the pilot used to do

**Retire the free pilot entirely once pilot→paid exceeds 60% for two consecutive months.** At that
point it is no longer reducing risk; it is just a discount. Replace it with a **₹15,000 paid Recovery
Sprint, fully credited against the Core Build** — same structure, same close, zero free work.
