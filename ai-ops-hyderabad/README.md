# RecoverOps — AI Operations Consultancy for Hyderabad SMEs

> Working name. A vertical-first, compliance-first AI automation consultancy that starts with
> Hyderabad's diagnostic labs and multi-doctor clinics, sells a **rupee-denominated outcome**
> (recovered revenue), and scales by reselling the same productised build 50+ times.

**Status:** Pre-launch. This folder is the complete research, plan, and Detailed Project Report (DPR).

---

## Why this, and why now

| Signal | Evidence |
|---|---|
| Half of Indian MSMEs are still offline | 53.8% have adopted at least one digital tool → 46.2% have none ([India SME Forum DigiShastra 2025](https://indiasmeforum.org/digishaastra/assets/docs/Final-META-Report-Card-2025.pdf)) |
| Intent far exceeds action | 57% of MSMEs say AI is vital; only 25% use it daily (Vi Business ReadyForNext 2026) |
| Almost everyone building AI is failing | 95% of GenAI pilots produce zero measurable ROI — the cause is workflow integration, not model quality ([MIT, *The GenAI Divide*, 2025](https://www.computing.co.uk/news/2025/ai/mit-report-95pc-corporate-generative-ai-pilots-fail)) |
| A compliance cliff is 9 months out | DPDP Rules notified 14 Nov 2025; **full compliance due 13 May 2027**; penalties to ₹250 Cr |
| Meta just killed the generic "AI chatbot" pitch | From 15 Jan 2026, general-purpose AI assistants are banned on WhatsApp Business API — only narrowly-scoped, human-fallback bots survive |
| Hyderabad has the density | ~3.59 lakh Udyam MSMEs in the metro; 2,210 diagnostic centres, ~4,000 clinics, 1,500 dental clinics, 687 hospitals |

The market is saturated with **demos**. It is wide open on **outcomes and compliance**.

---

## The one-line positioning

> **"We recover the revenue your front desk is losing — and we do it in a way that survives a DPDP audit."**

Not "we build AI chatbots." Every one of the nine Hyderabad competitors we found sells that.

---

## Read in this order

| # | Document | What it answers |
|---|---|---|
| 1 | [Market research & vertical selection](docs/01-market-research.md) | Who is *not* in the AI world yet, and which vertical to attack first |
| 2 | [Positioning & differentiation](docs/02-positioning-and-differentiation.md) | How to be unique when 9 agencies in Hyderabad already sell this |
| 3 | [Service catalogue & pricing](docs/03-service-catalogue-and-pricing.md) | Exactly what we sell and what it costs |
| 4 | [Free pilot playbook](docs/04-free-pilot-playbook.md) | The free trial → paid conversion machine |
| 5 | [Go-to-market playbook](docs/05-go-to-market-playbook.md) | How to find and close the first 25 clients |
| 6 | [Delivery architecture](docs/06-delivery-architecture.md) | The tech stack and the reusable "Recovery OS" |
| 7 | [Compliance & risk register](docs/07-compliance-and-risk.md) | DPDP, ABDM, TRAI DLT, Meta policy, and what can kill us |
| 8 | **[Detailed Project Report (DPR)](docs/08-DPR.md)** | The formal document for banks, subsidies and partners |
| 9 | [Financial model](docs/09-financial-model.md) | Unit economics, 3-year P&L, break-even, scenarios |
| 10 | [90-day execution plan](docs/10-90-day-execution-plan.md) | What to do starting Monday |

---

## The numbers in one table (Base case)

| | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Active clients (exit) | 24 | 70 | 150 |
| Revenue | ₹42.6 L | ₹2.11 Cr | ₹5.07 Cr |
| EBITDA | ₹17.1 L | ₹69.9 L | ₹1.72 Cr |
| EBITDA margin | 40% | 33% | 34% |
| Exit MRR | ₹5.45 L | ₹19.25 L | ₹45.6 L |
| Headcount (exit) | 4 | 12 | 26 |

- **Seed capital required: ₹4.45 lakh** (₹1.45 L setup + ₹3.00 L working-capital buffer)
- **Operating break-even: 4 paying clients** — projected Month 4
- **Cash payback: Month 5**

Full assumptions, sensitivities and a conservative case are in [docs/09-financial-model.md](docs/09-financial-model.md).

---

## How to move this into its own repository

This folder is deliberately self-contained. To lift it out:

```bash
# from a clone of this repo
git subtree split --prefix=ai-ops-hyderabad -b recoverops
# then, in a new empty repo you have created on GitHub:
git push <new-remote> recoverops:main
```

Alternatively, copy the `ai-ops-hyderabad/` directory into a fresh `git init`.

> **Note:** the agent that produced this work cannot create or push to repositories other than
> `Udaykyama/newproject01`, so the material is delivered here in a portable form.

**Do the split before either track is shown to anyone.** The repository it currently sits in is
`ci-ledger`, an unrelated CI product. A software product and a consultancy DPR in one repository
makes both look unserious to a diligence reader, and the two businesses have nothing in common
beyond their author: this one is fast revenue and low leverage, that one is slow revenue and
high leverage. Founder time is the scarce resource, so one of them is primary and the other is
either funding it or paused — not both at once.

---

## Honesty notes

Everything in these documents is either **sourced** (with a link) or **explicitly labelled as an
estimate**. Financial projections are models, not promises. The items in
[docs/07-compliance-and-risk.md](docs/07-compliance-and-risk.md) under *"Verify before you commit"*
are genuine open questions that must be closed with a lawyer, a chartered accountant, and your
chosen WhatsApp Business Solution Provider before you sign your first client contract.
