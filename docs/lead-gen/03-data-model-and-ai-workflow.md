# Lead data model, AI workflow, scoring, active learning

## Two-layer model

1. **Company Account** — firmographics, operations, footprint, buying signals.
2. **Buying Committee** — role-based contacts and channel permissions, from **licensed** sources only.

## Required lead fields (qualification)

| Field group | Field | Why it matters | Scoring use |
|-------------|--------|----------------|-------------|
| Identity | Legal name; website/domain; HQ country; regions | Dedupe; territory | Hard filters; dedupe keys |
| Industry fit | Primary/secondary industry; product categories | Mirrors served industries | Heavy weight vs taxonomy |
| Packaging & labeling | In-house vs outsourced; packaging line; SKUs; compliance/VDP | Short-run, in-house, variable data narrative | High weight |
| Technical fit | Substrates; max web width; finishing needs | Maps to narrow/wide, print+cut, finishing | Rules → product family |
| Compliance & risk | Food/pharma ink; GHS; anti-counterfeit | Swiss/Nestlé/GHS/security messaging | Boost regulated categories |
| Facility readiness | Power; air; environmental | Industrial system requirements | Red flag / downgrade if unknown |
| Commercial | Employees; revenue; growth; capex proxy | Prioritize cycle and tier | Segment-dependent weight |
| Engagement | Quote/sample; exhibition; compliance content | Mirrors demo/sampling strategy | Strong boost |

## Enrichment (licensed)

- Firmographics: headcount, revenue band, manufacturing vs services, sub-industry.
- Technographics (licensed): label press type, finishing, packaging stack.
- Operations: SKU growth, multi-site, regulatory exposure, traceability.
- Buying committee: ops/packaging, QA/compliance, procurement, plant manager, marketing/brand.

## Minimum qualified lead (configurable by territory)

- **Industry fit:** at least one served segment (F&B labels, pharma/nutra, industrial/chemical/GHS, flexible packaging, corrugated, aviation placards, building materials decor).
- **Use-case fit:** at least one of short-run/high-mix, VDP/QR/serialization, in-house labeling intent, reduce outsourcing cost/lead time, on-demand prototyping.
- **Technical feasibility:** substrate/width/facility do not contradict proposed system class (narrow vs wide; industrial power/air for heavy hybrid class).

---

## AI workflow overview

1. **arrsys.com knowledge extraction** (only permitted content source for product/industry claims).
2. **Candidate generation** from licensed B2B APIs/datasets.
3. **Fit scoring + ranking + learning loop** from sales feedback.

### Scraping/parsing arrsys.com

**Inputs:** product listings, detail pages, industry pages, blog, forms (Request Quote, Become a Dealer), policy pages.

**Approach:** domain-restricted crawler from entry points (Products, Industries, Blog, Contact, forms, Privacy).

**Extract:** product names/families; numeric specs (dpi, width, speed, inks); compliance phrases; substrate lists; facility constraints; personas/triggers (in-house, short-run, no MOQ, VDP, anti-counterfeiting).

### Ontology

- **Industry taxonomy** (Industries + homepage clusters).
- **Use-case taxonomy** (short-run labels, flex pouches, corrugated direct-to-package, aviation, chemical GHS, security, building decor).
- **Compliance taxonomy** (Nestlé Guidance phrasing, Swiss Ordinance, GHS, FAA, government procurement).
- **Product capability vectors** (narrow vs wide web, water-based vs UV, inline primer/varnish, print-and-cut, finishing types, VDP/security).

### Matching and scoring

**Stage A — Industry gating (hard filter)**  
Reject outside served-industry envelope (largest precision lever for “big lists”).

**Stage B — Capability matching (rules-first)**

- Flexible packaging films + wide format → wide-web water-based class signals.
- High-mix labels + varnish/primer/premium finish → hybrid class.
- Corrugated direct-to-package → OverJet class.
- Security/traceability → VDP/security bundle.
- End-to-end workflow → print-and-cut + finishing stack.

**Stage C — Fit scoring (weighted, 0–100)**

| Component | Max points |
|-----------|------------|
| Industry fit | 30 |
| Use-case fit (short-run, in-house, high-mix, VDP) | 25 |
| Compliance intensity | 15 |
| Technical feasibility (substrate, width, facility) | 15 |
| Commercial readiness | 10 |
| Channel accessibility (dealer, events, language) | 5 |

**Stage D — Explanation (LLM as writer, not judge)**  
Short rationale citing which arrsys.com fit drivers fired (auditable, sales-friendly).

### Active learning

**Track:** contacted → meeting → demo/sample → quote → closed won/lost + loss reason.

**Use feedback to:** recalibrate weights by segment/country; improve bundle recommendations (printer-only vs printer+finisher vs print-and-cut); identify missing enrichment attributes for next cycle.
