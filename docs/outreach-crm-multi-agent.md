# Multi-Agent Outreach CRM

Mission Control's Outreach CRM tab now normalizes the four Arrow outreach agents into one read-only command center:

- Sasha: `sasha@arrsys.com`, `Sasha-Outreach`
- Mark: `markodell@arrsys.com`, `Mark-Outreach`
- Aaron: `aaron@arrsys.com`, `Aaron-Outreach`
- Jordan: `jordan@arrsys.com`, `Jordan-Outreach`

The dashboard reads local OpenClaw state from `OUTREACH_CRM_WORKSPACE_ROOT` and `OUTREACH_CRM_AGENTS_PATH` when present, then falls back to the existing cached Sasha snapshot path. Rendering the dashboard does not send email or mutate HubSpot.

## Data Refresh Jobs

Wire the live system with these scheduled jobs:

- Dashboard snapshot refresh: every 5 to 10 minutes. Refresh the outreach state artifacts and call the existing Outreach CRM deep-sync/action path in read-only mode.
- Reply monitor: every 10 minutes. Classify replies, stop bounced/unsubscribed/not-interested contacts, and record human-review items for the dashboard.
- Follow-up scheduler: 1 to 2 times per day. Enqueue eligible 3-day, 5-day, and 30-day follow-ups while honoring the 50/day per-agent cap and 65-second global pacing.
- Daily Discord report: once per business day. Fetch `GET /api/outreach-crm/daily-report` and post the returned plain text to Discord channel `1469037035103981703`.

Keep the dashboard as an observability surface: action buttons should only call guarded backend workflows, and no auto-send behavior should be added to page rendering.
