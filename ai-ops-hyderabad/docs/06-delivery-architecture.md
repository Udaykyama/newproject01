# 06 — Delivery Architecture ("Recovery OS")

> The commercial promise is *"build once, resell 50 times."* That only works if the architecture is
> designed for **configuration, not construction**. This document is what makes the unit economics
> in [09-financial-model.md](09-financial-model.md) real.

---

## 1. The governing principle

> ### No patient data ever travels on WhatsApp.
> WhatsApp carries a **notification and a link**. Everything identifiable sits behind an
> OTP-verified page on India-resident infrastructure, with a consent and access audit trail.

This is not caution for its own sake. Under ABDM guidance and the DPDP Rules 2025, pushing patient
health data through WhatsApp is at best strongly discouraged and at worst non-compliant — and since
15 January 2026, Meta's terms also bar general-purpose AI assistants and require healthcare bots to
be narrowly scoped with human fallback.

Competitors who WhatsApp report PDFs are handing their clients a liability. **Our architecture is our
sales pitch.**

---

## 2. Reference architecture

```
                         ┌──────────────────────────────────┐
   Patient / caller ────►│  WhatsApp Business Platform      │
                         │  (via Indian BSP)                │
                         │  notifications + links only      │
                         └───────────────┬──────────────────┘
                                         │  webhook
                         ┌───────────────▼──────────────────┐
                         │  n8n (self-hosted, India region) │
                         │  ─ orchestration & routing       │
                         │  ─ per-client config, one shared │
                         │    template library              │
                         └──┬────────┬──────────┬───────────┘
                            │        │          │
              ┌─────────────▼─┐  ┌───▼──────┐  ┌▼─────────────────┐
              │ PostgreSQL    │  │ LLM API  │  │ Client system    │
              │ India region  │  │ routing, │  │ LIS/HIS/billing/ │
              │ encrypted     │  │ drafting,│  │ Tally/Sheets     │
              │ per-client    │  │ language │  │ (read-mostly)    │
              │ isolation     │  └──────────┘  └──────────────────┘
              └───────┬───────┘
                      │
       ┌──────────────▼───────────────┐        ┌────────────────────┐
       │ Secure link service          │        │ Voice agent        │
       │ OTP-verified, expiring,      │        │ Telugu/Hindi/Eng   │
       │ access-logged                │        │ overflow + recall  │
       │ ← the ONLY place PHI appears │        └────────────────────┘
       └──────────────────────────────┘
```

---

## 3. Stack choices and why

| Layer | Choice | Rationale |
|---|---|---|
| **Orchestration** | **n8n, self-hosted** on an India-region VPS | Zero per-operation cost (Zapier/Make bill per task and destroy margin at scale); full data control, which is the DPDP argument; market rate for self-hosted n8n setup is ~₹35,000, so it is also a billable line item |
| **Messaging** | WhatsApp Business Platform via an Indian BSP (AiSensy / Gallabox / Interakt) | Start as a reseller — no capital, no Meta compliance burden. Apply for Meta Tech Provider status only after ~30 clients. |
| **Database** | PostgreSQL, India region, encrypted at rest, schema-per-client | Isolation is a contractual promise and a DPDP requirement |
| **LLM** | Small/fast models for routing, classification and drafting | Cost control. **Never** send identifiable patient data to a model. Redact-then-prompt as a hard rule. |
| **Indian languages** | Indic-first models/TTS for Telugu; human-reviewed templates | National platforms are Hindi/English-first; Telugu quality is a differentiator |
| **Voice** | Third-party voice-agent platform, per-minute | Market ₹1.50–₹12/min; bill at ₹6/min and manage the routing mix. Do **not** build voice infrastructure. |
| **Secure links** | Own lightweight service: signed, expiring, OTP-gated, access-logged | This is the compliance moat in code. Roughly 3 days to build once. |
| **Client CRM** | Zoho Bigin or HubSpot free | ₹0–₹1,000/month; do not over-invest |
| **Monitoring** | n8n execution logs + uptime monitor + a daily digest to the delivery team | Catch failures before the client does |

**Deliberately avoided in year 1:** Kubernetes, a custom front-end application, a multi-tenant SaaS
platform, and any enterprise licence. Every one of those converts a ₹1.45 lakh business into a
₹15 lakh business with no additional revenue.

---

## 4. The four core workflows

### W1 — Slot Guard (the wedge; this is what the free pilot ships)

```
Booking created
   └─► Confirmation (utility template, bilingual)
   └─► T−24h reminder  ─┐
   └─► T−3h  reminder  ─┴─► one-tap: CONFIRM / RESCHEDULE / CANCEL
   └─► T+30min if not arrived ─► recovery message + reschedule link
   └─► Slot released ─► waitlist backfill offer to next 3 matching patients
```
**Measured:** no-show rate, slots recovered, ₹ recovered. These three numbers drive the monthly ROI
report and, on the Outcome Plan, the invoice.

### W2 — Front Desk Overflow
Missed, busy and after-hours calls are captured; the voice agent or WhatsApp flow performs a
**scoped** intake (name, purpose, preferred slot — never symptoms or clinical detail); a callback is
scheduled and the front desk gets a prioritised queue each morning. Human fallback is offered in the
first turn, as Meta's terms require.

### W3 — Report & Payment Relay
Report ready in the LIS → **notification only** on WhatsApp → OTP-verified secure link → optional
payment link → advised follow-up prompt. No result values, no diagnosis, no prescription, no
attachment in the message body — ever.

### W4 — Recall Engine
Rules-based, per speciality: repeat tests, annual health checks, treatment-plan next steps, review
appointments, vaccination schedules. Every message carries an opt-out; every opt-out is honoured
within one cycle and logged.

**Add-on workflows** (expansion revenue): review generation with a sentiment gate, insurance/TPA
claim status, corporate health-camp scheduling, referral-doctor reporting, inventory reorder alerts.

---

## 5. Templatisation — the profit lever

**Build hours per client must fall from 40 to 12.** This is the difference between a job and a
business.

| Client # | Target build hours | What changed |
|---:|---:|---|
| 1–2 | 40 | Everything built from scratch; document as you go |
| 3–5 | 30 | W1–W4 extracted into parameterised n8n sub-workflows |
| 6–10 | 20 | Template library approved by Meta once, cloned per client |
| 11–15 | **12** | Single YAML/Sheet config per client; integration adapters reused |
| 16+ | 8–10 | Only genuinely novel integrations consume time |

**The mechanism — one config file per client:**

```yaml
client:
  name: "…"
  branches: [ … ]
  languages: [ te, en ]
  timezone: Asia/Kolkata
source:
  type: lis_api | billing_csv | google_sheet
  credentials_ref: vault://client-id
workflows:
  slot_guard:      { enabled: true,  reminders_at: [24h, 3h], recovery_after: 30m, waitlist: true }
  overflow:        { enabled: true,  hours: "09:00-20:00", fallback_to_human: true }
  report_relay:    { enabled: true,  link_ttl_hours: 72, otp: true }
  recall:          { enabled: false }
compliance:
  consent_source: booking_form
  retention_days: 365
  dlt_entity_id: "…"
```

**Rules:**
- No client gets a bespoke workflow until three clients have asked for the same thing. Then it
  becomes a product, priced as an add-on.
- Every fix is made in the shared template, then rolled out — never patched per client.
- One hour every Saturday on templatisation. Non-negotiable.

---

## 6. Integration adapters (build in this order)

| Adapter | When | Notes |
|---|---|---|
| Google Sheets / CSV drop | Day 1 | The universal fallback; works for the least digital clients |
| Generic REST + webhook | Day 1 | Covers modern LIS/HIS |
| Common Indian clinic-software exports | Month 2–4 | Build one per repeated request; each becomes a partner conversation |
| Tally / Busy | Month 4 | Essential for vertical 2 (distributors); billing reconciliation |
| Razorpay / PayU / UPI collect | Month 2 | Payment links in W3 |
| Google Business Profile | Month 3 | Review engine |

---

## 7. Non-negotiable engineering standards

| Standard | Rule |
|---|---|
| **PHI isolation** | Identifiable health data never enters a WhatsApp message body, a log line, or an LLM prompt. Redact before prompt, always. |
| **Consent gate** | No outbound marketing/recall message without a logged, timestamped, revocable consent record |
| **Opt-out** | Present in every non-transactional message; honoured within one cycle; suppression list is global per client |
| **Idempotency** | Every workflow safely re-runnable. Duplicate reminders to patients are the fastest way to lose a clinic. |
| **Rate limiting & quiet hours** | No sends 21:00–08:00 IST. Cap per-recipient sends per day. |
| **Secrets** | Client credentials in a secret store, never in n8n nodes, never in the repo |
| **Backups** | Nightly, encrypted, 30-day retention, restore tested monthly |
| **Audit log** | Who accessed what, when — required for DPDP data-principal requests and breach reporting |
| **Kill switch** | One toggle per client, per workflow. You will need it during an incident, and during a payment dispute. |
| **Cost guardrails** | Per-client monthly message-spend cap with an alert at 80%. An overspend incident will cost you the client. |

---

## 8. The monthly ROI report (automate this on day one)

One page, auto-generated, sent on the 1st before the client asks:

```
[Clinic] — Recovery Report, [Month]

  Appointments                       1,284
  No-show rate            14.2%  (baseline 27.0%)   ▼ 47%
  Slots recovered                      164
  ─────────────────────────────────────────────────
  REVENUE RECOVERED                ₹1,88,600
  Your fee                            ₹18,000
  Messaging (at cost +20%)             ₹6,000
  NET GAIN                          ₹1,64,600     ROI 6.9×

  Calls answered outside hours          212
  Reports delivered < 2 hrs             94%
  Google reviews added                   31
  Meta spend vs. pre-RecoverOps       −52%
```

**This report is the retention product.** Churn in this business is not caused by bad automation —
it is caused by clients forgetting the automation is working. Never let them forget.

---

## 9. Support model

| Tier | Response | Handled by |
|---|---|---|
| P1 — messages not sending / patient-facing error | 1 hour, business hours | Engineer |
| P2 — a workflow misbehaving | Same day | Engineer |
| P3 — template or content change | 2 business days | Ops associate |
| P4 — new workflow request | Next optimisation cycle, or quoted as an add-on | Founder |

Every client sits in a WhatsApp group with the founder and the assigned engineer. It is not elegant,
but it is what SME owners in India actually use, and response speed is a large part of what they are
paying for.
