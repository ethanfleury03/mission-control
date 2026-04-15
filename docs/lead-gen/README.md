# Arrow Systems — AI lead generation research

Internal starter material for building a tailored lead-generation system aligned with **arrsys.com** positioning (digital label and packaging printing, finishing, compliance narratives) across **Canada, India, Italy, and Mexico**.

**Contents**

| File | Description |
|------|-------------|
| [01-executive-summary-and-architecture.md](./01-executive-summary-and-architecture.md) | Executive summary, reference architecture (Mermaid), pilot scope, KPIs, privacy/compliance stance, tech stack |
| [02-arrsys-audit-and-countries.md](./02-arrsys-audit-and-countries.md) | Product/industry audit, ICP constraints, country-specific notes |
| [03-data-model-and-ai-workflow.md](./03-data-model-and-ai-workflow.md) | Lead data model, enrichment, scoring stages, active learning |
| [04-synthetic-lead-examples.md](./04-synthetic-lead-examples.md) | Hypothetical qualified-lead tables (not real companies) |
| [05-hubspot-handoff.md](./05-hubspot-handoff.md) | Discovery vs CRM: Mission Control triage, HubSpot as system of record for contacts |

**Constraints captured in this research**

- **Content source for product fit:** primarily **arrsys.com** (crawler/knowledge base).
- **Candidate lists / contacts:** **licensed** B2B data only — no scraping of third-party sites for lead assembly.
- **Scoring:** rules-first, auditable; LLM as explainer, not sole judge.

This folder is reference input for a future internal app; licensing and local law for outreach must be verified before production use.
