# Executive summary, architecture, pilot, compliance, stack

## Executive summary

Arrow Systems’ website positions the company as a provider of **digital label printers, packaging printers, print-and-cut systems, and finishing equipment**, marketed primarily to **brand owners bringing production in-house** and **label converters** needing agility for short-run/high-mix demand. The homepage emphasizes **on-demand efficiency**, **no SKU minimums**, and performance signals such as **up to 150 feet/min** and **up to 1600×1600 dpi**, alongside **Nestlé Guidance–compliant water-based pigment inks** and a “worldwide locations”/“worldwide presence” message.

A lead-generation AI tailored to Arrow Systems should therefore treat **“print on demand + compliance-ready inks + variable data/security printing + integrated finishing”** as the core fit drivers. The tool should:

1. Ingest and structure **arrsys.com** into a **product/industry/trigger knowledge base**.
2. Use **licensed** B2B firmographic/technographic/intention data sources (no web scraping of third-party sites) to assemble candidate company lists.
3. Score and rank prospects with **transparent, auditable rules** grounded in Arrow Systems’ stated industries and capabilities.
4. Improve via **active learning** from sales outcomes.

### Country-specific emphasis (arrsys.com signals only)

- **Canada:** Experience Center in **Burlington**; Canadian distributor (**Total Solutions Inc.**) at same address; strong local execution narrative.
- **India:** Regulatory/compliance narrative around food packaging inks: **BIS** and **FSSAI** “officially banned” toluene with effective date **July 1, 2021** — compliance trigger for **water-based inks** and food packaging converters/brands.
- **Mexico:** Latin America “untapped potential”; **Brazil and Mexico** called early adopters for flexible packaging modernization.
- **Italy:** Limited direct localized signals; historical “Vitrum 2013 Milan Italy” post; treat as **EU-style** label & packaging market using Europe partnership messaging (short runs, speed, sustainability).

## Reference architecture

```mermaid
flowchart LR
  A[arrsys.com crawler\n(domain-restricted)] --> B[HTML/PDF parser\nspec & claim extractor]
  B --> C[Knowledge store\nProduct + Industry + Trigger ontology]
  C --> D[Embedding / retrieval index\nfor matching + explanations]

  E[Licensed B2B data APIs\nfirmographic/technographic] --> F[Candidate company pool]
  F --> G[Rule-based matcher\nindustry + capability gating]
  C --> G
  G --> H[Scoring model\nweighted + segment-specific]
  H --> I[Ranked lead list + rationale]

  I --> J[CRM / marketing automation]
  J --> K[Sales outcomes + feedback]
  K --> H
  K --> C
```

## Pilot scope and KPIs

**Recommended pilot**

- One **print category** plus one **adjacent finisher bundle** — e.g. water-based label printing for regulated/high-mix segments + finishing integration (EZCut / Nova / laser finishing), reflecting “in-house end-to-end” workflows on-site.
- **Canada + one additional country** (India or Mexico) to validate multilingual/channel assumptions.

**KPIs**

- Data quality: % leads with required fields; dedupe rate; bounce rate (if emailing).
- Precision proxies: % accepted by sales; meeting conversion; demo/sample request rate.
- Revenue proxies: quote rate, pipeline, win rate, time-to-first-meeting.
- Model: lift vs baseline; calibration stability across countries.

**Indicative build phases (sequencing, not calendar estimates)**

1. arrsys.com ingestion + ontology/spec extraction.
2. Candidate data integration + first scoring model + CSV/CRM export.
3. Sales feedback loop + weight tuning + explanation templates.
4. Expand countries, segment playbooks, production hardening.

**Cost bands (directional)**

- **Low:** OSS pipeline + one firmographic provider + pilot CRM export.
- **Medium:** multiple providers + automated feedback + dashboards.
- **High:** full multi-country rollout + MLOps + intent data + multi-CRM.

## Privacy, compliance, ethics

arrsys.com privacy policy describes visitor info, cookies, remarketing, and disclosures to employees/contractors/affiliates (possibly cross-border). It does **not** provide country-by-country outbound lead-gen instructions.

Implementation stance:

- Treat outreach data as **regulated personal data** where applicable (including B2B).
- **Licensed sources** with contract terms allowing prospecting.
- **Purpose limitation**, opt-out, suppression lists, minimal retention.
- Explanations should **not** reveal sensitive inferred attributes; keep rationales to business-relevant fit (industry, packaging, compliance) consistent with arrsys.com messaging.

**Country practical focus**

- **Canada:** consent/opt-out rigor; bilingual readiness if multi-province; governance for cross-border access.
- **India:** compliance narratives (e.g. toluene ban) tied only to what arrsys.com states; avoid fear-based messaging.
- **Italy:** conservative cadences; explainable, contestable scoring.
- **Mexico:** Spanish collateral where available (e.g. Spanish brochure on Hybrid Pro M); same opt-out/minimal retention.

## Recommended tech stack and integrations

- **Ingestion:** domain-restricted crawler + HTML/PDF parsing.
- **Storage:** relational DB for structured specs + vector index for retrieval/explanations.
- **Modeling:** rules engine for gating + ML ranking for prioritization.
- **Delivery:** CRM sync, CSV, dashboard, feedback capture.

**Integration examples (verify contracts):** Salesforce or HubSpot; enrichment (e.g. D&B, ZoomInfo, PDL as needed); email hygiene (e.g. NeverBounce-style validation).

**Feasible enrichment categories**

- Licensed business data (firmographics, hierarchies, industry classification).
- Email validation / deliverability APIs.
- Licensed technographics (print/packaging stack — no crawling company sites).
- Government procurement / public-sector sourcing for gov/military segment.
- **Internal-first:** quote requests, demos, samples, events, newsletter signups.
