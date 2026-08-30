# 07 — Compliance & Risk Register

> This is the document that turns a commodity agency into a defensible one — and the document that
> stops an avoidable mistake from ending the business. **Read it before signing the first client.**

⚠️ **This is research, not legal advice.** Every item marked **VERIFY** must be closed with a
qualified Indian lawyer, a chartered accountant, and your chosen BSP before you take money.

---

## 1. DPDP Act 2023 + DPDP Rules 2025

| Item | Detail |
|---|---|
| Act | Digital Personal Data Protection Act, 2023 |
| Rules notified | **14 November 2025** |
| Data Protection Board constituted | 13 November 2025 |
| Consent-manager registration regime | ~13 November 2026 |
| **Full operational compliance** | **13 May 2027** |
| Maximum penalty | **₹250 crore** |
| Sources | [PIB](https://pib.gov.in/PressReleasePage.aspx?PRID=2190655&reg=48&lang=2), [Deloitte India](https://www.deloitte.com/in/en/services/consulting/about/indias-dpdp-rules-2025-leading-digital-privacy-compliance.html), [EY India](https://www.ey.com/en_in/insights/cybersecurity/decoding-the-digital-personal-data-protection-act-2023) |

### Obligations that land on our clients (and on us as their processor)

| Obligation | What we build into every deployment |
|---|---|
| **Explicit, documented, revocable consent** | Consent captured at booking with purpose text; timestamped; stored with the record; revocation honoured within one cycle |
| **Multilingual privacy notice** | Telugu, Hindi, English — plain language, purpose, retention period, rights, grievance route |
| **Data-principal rights** (access, correction, erasure, nomination) | A request route the clinic can actually operate + an audit log we can query |
| **Breach notification** | Runbook: notify the Data Protection Board and affected individuals; templates pre-drafted; we are contractually obliged to notify the client without delay |
| **Retention & deletion** | Configured per client (default 365 days), enforced automatically, logged |
| **Security safeguards** | Encryption at rest and in transit, access control, per-client isolation, tested backups |
| **Processor contracts** | Signed DPA with every client; back-to-back terms with BSP and every sub-processor |
| **Children's data** | Verifiable parental consent — critical if we ever touch paediatrics or coaching centres |
| **Human intervention on automated decisions** | A human fallback path in every flow |

### Our own position

We are a **Data Processor** acting for the clinic (the Data Fiduciary). That means:
- A signed DPA is mandatory **before** any patient data is touched
- We must maintain processing records and sub-processor disclosure
- We must not process outside the client's documented instructions
- Cross-border transfer is currently permitted unless the government restricts a jurisdiction
  (**VERIFY** the current restricted list before choosing any non-India hosting or LLM region)

**This is also the sales pitch.** SME clinics will not implement any of the above alone. We sell it
as the DPDP Compliance Pack (₹35,000 + ₹5,000/month) and we build it into every deployment anyway.

---

## 2. Healthcare-specific rules (ABDM + Digital Health Records Bill 2025)

- **ABDM** requires ABDM-compliant platforms for health-data exchange; ABHA-linked data may be shared
  only with explicit, revocable, time-bound patient consent.
- **Digital Health Records (Mandatory Use) Bill, 2025** mandates digital health records, prohibits
  unauthorised use of ABHA IDs, and confirms patient rights to access, control and revoke.
- **Critical finding:** sharing patient health data via WhatsApp is **strongly discouraged and
  potentially non-compliant** — WhatsApp does not meet ABDM's technical, consent and security
  standards. ([Conventus Law, *Digital Health Laws India 2025*](https://conventuslaw.com/report/digital-health-laws-and-regulations-india-2025/))

### The resulting architectural rule (non-negotiable)

> **WhatsApp carries a notification. Never the data.**
> Report values, diagnoses, prescriptions and attachments live behind an OTP-verified, expiring,
> access-logged link on India-resident infrastructure.

**VERIFY:** whether any of our target clients are ABDM-registered health facilities, and if so what
additional consent-artefact obligations apply. Engage a health-tech lawyer before the tenth client.

---

## 3. Meta / WhatsApp platform policy — the January 2026 change

**Effective 15 January 2026**, Meta's WhatsApp Business API terms bar third-party AI chatbots whose
primary function is general-purpose AI assistance. Only Meta AI may serve as a general assistant.

| Domain | Not allowed | Still allowed |
|---|---|---|
| **Healthcare** | Open-ended symptom checking, general health advice, mental-health support bots | Narrowly scoped customer service: appointment booking and reminders, report-ready notifications, claim status — **with human fallback** |
| **Financial services** | Investment advice, open-ended banking/insurance consultation | Routine updates, transactional notifications, customer service |

Sources: [Indian Express](https://indianexpress.com/article/technology/artificial-intelligence/whatsapp-ban-ai-chatbot-rivals-chatgpt-perplexity-10317285/),
[TechCrunch](https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/),
[MediaNama](https://www.medianama.com/2025/10/223-whatsapp-bans-external-ai-providers-business-api/)

**Implication — and it is a favourable one.** Our entire Recovery OS is *already* narrowly scoped
transactional automation with human fallback. Competitors selling "AI assistant for your clinic" are
now, in this vertical, selling something non-compliant. **Make this a slide in every pitch.**

**VERIFY:** the CCI is reviewing this policy as potentially anti-competitive. Monitor for amendments
or carve-outs; do not build a business line that depends on the ban persisting.

---

## 4. TRAI DLT registration

Every business sending commercial SMS, WhatsApp or voice must register on the telcos' DLT platforms —
registering the **entity**, the **headers/sender IDs**, and every **template**. DND scrubbing and
explicit opt-in are mandatory.

The 2025 TRAI amendment sharpened the transactional-vs-promotional distinction, capped outbound call
volumes, and raised penalties (up to two-year telecom disconnection for serious breaches).

**This is pure moat.** It is a multi-step bureaucratic process across three telco portals that no
clinic owner will ever complete themselves. We do it as part of onboarding, which creates immediate
switching cost and genuine gratitude.

---

## 5. Voice-agent compliance (for the add-on)

- Bots must **disclose that they are bots** at the start of the interaction
- Calls must be recorded and auditable
- Calling window **07:00–19:00** for regulated-entity outbound
- 1600-series numbers for transactional, 140-series for promotional
- Consent logged and DND-scrubbed before any outbound call

**VERIFY** with your telephony provider which of these apply to a healthcare clinic (much of the
strictest guidance is RBI-driven and aimed at lenders). Design to the stricter standard regardless —
it costs nothing and protects the client.

---

## 6. MeitY India AI Governance Guidelines (November 2025)

India's first comprehensive responsible-AI framework, under the IndiaAI Mission. Seven principles:
Trust, People First, Innovation over Restraint, Fairness & Equity, Accountability, Understandable by
Design, and Safety/Resilience/Sustainability.

**Currently voluntary**, but sectoral regulators may make elements mandatory. Requirements for
deployers: transparency and explainability, human oversight, non-discriminatory outputs, risk
inventories; Significant Data Fiduciaries face algorithmic-audit obligations.

Cheap to comply with, and it makes an excellent one-page annexe in every proposal: *"Our deployment
is aligned to the MeitY AI Governance Guidelines."* Almost no competitor will say that.

---

## 7. Business compliance for us

| Item | When | Approx. cost |
|---|---|---|
| Proprietorship registration (convert to Pvt Ltd only when raising or hiring seriously) | Month 0 | ₹2,000 |
| **Udyam (MSME) registration** | Month 0 | Free |
| **GST registration** — mandatory above ₹20 lakh for services | Month 0 (register early; clients want input credit) | ₹1,000 |
| Shops & Establishments (GHMC) | Month 1 | ₹2,000 |
| Current account + UPI/e-NACH mandate setup | Month 0 | ₹0 |
| Professional tax (Telangana) | Month 1 | Nominal |
| MSA / SOW / **DPA** / NDA drafted by a lawyer | Month 0 | ₹25,000 |
| Professional indemnity insurance | Month 1 | ₹15,000–₹25,000/yr |
| TDS / payroll compliance | On first hire | Via CA retainer |

---

## 8. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|:--:|:--:|---|
| R1 | **Meta policy shifts again** and restricts more healthcare messaging | Medium | **High** | Never single-channel. Build SMS, RCS, email and voice fallbacks into Recovery OS from month 3. Track policy monthly. |
| R2 | **Oct 2026: free 24h service window ends**, raising client message costs | **High** | Medium | Already priced into the model. Get it in writing from the BSP. Re-engineer flows toward utility templates. Turn it into a consulting moment: *"here's how we cut your bill."* |
| R3 | **A data breach at a client**, with us named as processor | Low | **Critical** | No PHI on WhatsApp; encryption; per-client isolation; tested backups; breach runbook; professional indemnity insurance; DPA caps liability |
| R4 | **Key-person risk** — founder is sales, delivery and support | **High** | **High** | Templatise from client #3. Engineer hired by month 6. Everything documented as an SOP, not as knowledge. |
| R5 | **Client concentration** | Medium | Medium | No client above 15% of revenue after month 9 |
| R6 | **A BSP raises prices or terminates** | Medium | Medium | Stay abstracted — never hard-code one BSP. Maintain a second BSP account from month 4. |
| R7 | **Price war from freelancers at ₹5,000/month** | **High** | Low | We do not compete on price. Compliance liability and measured outcomes are not something a freelancer can offer. Let them have the clients who choose on price; they are the churn. |
| R8 | **A SaaS incumbent moves down-market with a healthcare template** | Medium | Medium | Our moat is the referral graph and the signed baselines, not the templates. Deepen local presence; consider becoming their implementation partner. |
| R9 | **A pilot fails to hit its success criteria** | Medium | Low | Criteria are set conservatively; qualification gate excludes low-volume clinics; a failed pilot costs ~₹8,000 and often converts later anyway |
| R10 | **LLM cost inflation** | Low | Low | LLMs are a small share of COGS; models are getting cheaper; keep routing model-agnostic |
| R11 | **Cash-flow squeeze from delayed retainers** | Medium | **High** | 60/40 build payments; auto-debit mandates; pause automations at day 15 after notice; push annual prepay |
| R12 | **A client demands PHI over WhatsApp because "everyone does it"** | **High** | Medium | Refuse, in writing, with the regulation cited. This refusal is the brand. Losing that client is cheaper than the alternative. |
| R13 | **Telangana subsidy assumptions prove wrong** | Medium | Low | No subsidy is included in the base financial model. Treat any grant as upside. |
| R14 | **Hiring quality in a hot Hyderabad AI market** | **High** | Medium | Recruit from TASK and from clinic front-desk staff — domain knowledge beats framework knowledge and costs less |

---

## 9. VERIFY before you commit — the open-questions checklist

- [ ] Written confirmation from your BSP on the **October 2026 free-service-window change** and the
      resulting per-message rates
- [ ] Legal opinion on **processor liability** under DPDP for an automation vendor serving clinics
- [ ] Whether target clients are **ABDM-registered facilities**, and what that adds
- [ ] Current **restricted-jurisdictions list** for cross-border transfer (affects hosting and LLM region)
- [ ] **T-IDEA / TG-iPASS eligibility for a services business** — confirm with the District
      Industries Centre and MSME-DFO Hyderabad
- [ ] TRAI DLT process, timelines and costs — confirm with all three telcos
- [ ] Whether the CCI review changes **Meta's January 2026 policy**
- [ ] Professional indemnity policy wording — does it actually cover data-processing liability?
- [ ] Telangana Udyam registration data anomaly, before quoting it in any funding application
- [ ] GST treatment of **pass-through messaging charges** (pure agent vs. supply) — ask your CA;
      getting this wrong is an easy and expensive mistake
