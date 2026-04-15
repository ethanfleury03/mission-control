# HubSpot handoff — Mission Control vs CRM of record

## Split of responsibilities

| Area | Mission Control (Lead Gen) | HubSpot |
|------|---------------------------|---------|
| **Goal** | Discover and triage many candidate companies/leads | Contacts, companies, deals, workflows |
| **Volume** | Scrapers, imports, market databases | Reps work qualified records |
| **Contact data** | Name, email, phone, website, source URL, market | Full contact profile, activities, sequences |
| **Signals & fit** | Optional demo/scaffold only — not authoritative | Signals, scoring, playbooks, reporting |
| **Push** | “Good enough to try” → create/update contact | Dedupe by email, enrichment, sales motion |

## Lifecycle

1. **Ingest** — Directory Scraper, CSV, or future sources → rows in a **market** (lead database).
2. **Triage** — Lightweight pipeline stage (`discovered` → `triaged_ok` / `triaged_hold` / `rejected`).
3. **Push** — When minimum fields exist (e.g. email, or phone + website), **Push to HubSpot** creates or updates a **contact** and stores `hubspotContactId`.
4. **Continue in HubSpot** — Signals, fit assessment, and outreach live there.

## Configuration

- Server env: `HUBSPOT_ACCESS_TOKEN` (private app token recommended for MVP).
- Optional: `HUBSPOT_PORTAL_ID` for building contact URLs in the UI.
- Optional: `DISABLE_HUBSPOT_PUSH=1` to block pushes in dev.

## Custom properties (recommended in HubSpot)

Create custom contact properties so pushed leads are traceable:

- `mission_control_account_id` — internal `LeadGenAccount.id`
- `mission_control_market` — market name or slug
- `lead_source_detail` — e.g. directory listing URL

Map these in `lib/hubspot/map-lead-to-contact.ts` (code) to match your portal property **internal names**.

## Idempotency

Re-push with the same email updates the existing HubSpot contact (search by email, then PATCH) when `hubspotContactId` is already stored.
