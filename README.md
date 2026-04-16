# Mission Control Dashboard

## Quick Start

```bash
# Run the full stack
cd mission-control && docker-compose up -d

# Or run just the dev version
npm install
cp .env.example .env
# Option A — shared Turso DB (recommended for a team): set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (see below). Then:
npx prisma generate
npm run dev
# App: http://localhost:3002
# Option B — local SQLite only: leave Turso vars unset, set DATABASE_URL (see .env.example), then:
npm run db:push && npm run db:seed
npm run dev
```

### Turso (hosted SQLite, one DB for every machine)

Prisma CLI (`db push`, `migrate dev`) still uses **`DATABASE_URL`** pointing at a **local** `dev.db` to generate and verify SQL. The running Next.js app uses **`TURSO_DATABASE_URL`** + **`TURSO_AUTH_TOKEN`** when those are set, via the LibSQL driver adapter in `lib/prisma.ts`. If `TURSO_DATABASE_URL` is unset, the app falls back to normal Prisma SQLite against `DATABASE_URL` (local file, CI, Vitest).

**One-time (per developer):** [Turso](https://turso.tech) account and CLI (`brew install tursodatabase/tap/turso`), then `turso auth login`, `turso db create mission-control`, `turso db show mission-control` (copy URL), `turso db tokens create mission-control` (copy token). Put URL and token in `.env` as `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

**Applying schema to Turso:** Prisma cannot run `migrate deploy` directly against Turso the way it does for a file URL. Workflow:

1. Update the Prisma schema, then run **`npm run db:push`** (or `npm run db:migrate` in dev) against **local** `DATABASE_URL` so your `dev.db` matches and migration SQL under `prisma/migrations/` is what you expect.
2. Apply each migration file to the remote database (replace `mission-control` with your DB name):

```bash
turso db shell mission-control < prisma/migrations/20260413155415_first/migration.sql
turso db shell mission-control < prisma/migrations/20260413144813_directory_scraper/migration.sql
turso db shell mission-control < prisma/migrations/20260413170000_name_extraction_meta/migration.sql
turso db shell mission-control < prisma/migrations/20260414120000_directory_job_meta/migration.sql
turso db shell mission-control < prisma/migrations/20260414190000_website_discovery_meta/migration.sql
turso db shell mission-control < prisma/migrations/20260415120000_lead_gen_tables/migration.sql
```

3. **Seed** demo markets (idempotent): `npm run db:seed` (with Turso vars in `.env` so Prisma hits the hosted DB).

For **future schema changes**, generate SQL locally with `npm run db:migrate` (or add a migration and `db push`), then run `turso db shell mission-control < prisma/migrations/<new_folder>/migration.sql`.

**New machine with an already-populated Turso DB:** `git pull`, `npm install`, copy `.env` with `TURSO_*` set, `npx prisma generate`, `npm run dev` — no local `db:push` or seed required unless you want local-only data.

### Lead Generation database

- **With Turso:** markets and companies live in the **hosted** database; everyone shares the same data when using the same `TURSO_*` credentials.
- **Without Turso:** data lives in your local **`DATABASE_URL`** file (e.g. `prisma/dev.db`), which is not in git — a fresh clone starts empty until `db:push` and explicit imports or local seeding.
- **Local demo data** is defined in code (`lib/lead-generation/mock-data.ts`) and written only by **`npm run db:seed`** when you want fixture data locally.
- If Market Databases shows **0 markets**, either create one in the UI or run `npm run db:push && npm run db:seed` for a local fixture dataset.

### Directory Scraper — how to try it

1. **Playwright (default live):** choose **Playwright**, install Chromium with `npx playwright install chromium`, enter a public `https://` URL. Localhost/private IPs are rejected (`URL_BLOCKED`). Name extraction uses JSON-LD / deterministic heuristics, or **two-pass OpenRouter** (locate roster → extract names) when **AI extraction** is enabled and `OPENROUTER_API_KEY` is set.
2. **Firecrawl:** set `FIRECRAWL_API_KEY`, choose **Firecrawl** — Phase 1 uses Firecrawl `/scrape` (markdown + `onlyMainContent`). AI locate/extract and optional **visit company websites** (Playwright) behave the same. Optional `FIRECRAWL_BASE_URL` for self-hosted API.
3. **Serper (company websites):** set `SERPER_API_KEY` from [serper.dev](https://serper.dev), enable **Find company websites (Serper search)**. After names are extracted, each row without a website gets free domain guesses (HTTP check) then one Google search via Serper (about one US dollar per 1,000 searches on typical pricing). Optional `SERPER_BASE_URL` if you self-host the API.
4. **Worker:** run `npm run worker:directory-scraper` so queued jobs are picked up and processed in the background.
5. **Tests:** `DATABASE_URL="file:./prisma/vitest-directory-scraper.db" npm test`
6. **API:** `POST /api/directory-scraper/jobs` with JSON body (`scrapeFetchMode`: `playwright` | `firecrawl`, `enableAiNameFallback`, `enableSerperWebsiteDiscovery`, etc.); stream progress from `GET /api/directory-scraper/jobs/:id/events` or poll `GET /api/directory-scraper/jobs/:id`.

**Migrations:** The first directory-scraper migration file creates **only** `directory_scrape_*` tables (org chart tables live in the same Prisma schema but are not recreated by that migration). If your dev DB was created from an older migration that mixed org + scraper DDL, you may see a Prisma checksum warning — use `prisma migrate resolve` or reset the dev database. Job metadata uses `metaJson` on `directory_scrape_jobs` (see migration `20260414120000_directory_job_meta` if present, or `prisma db push`). Per-row name-extraction debug is stored in `nameExtractionMetaJson` on `directory_scrape_results` (migration `20260413170000_name_extraction_meta`). Website discovery audit uses `websiteDiscoveryMetaJson` (migration `20260414190000_website_discovery_meta`).

## Components

### Task Detail Popup Panel
- Opens when clicking any task card on the Kanban board
- Shows: full task description, tool call history, human review queue, action buttons
- Auto-refresh on agent activity

### Human Review UX
- **Ask Question**: Agent can block and ask for clarification
- **Approve/Reject**: One-click decisions on agent proposals
- **Progress Feed**: Real-time activity log per task
- **Escalation**: "Need human with..." routing

## API Contract

### WebSocket Events (Agent → Dashboard)
```json
{
  "type": "task.update",
  "taskId": "task_123",
  "agentId": "agent_456",
  "status": "need_review",
  "message": "Need approval to send email to external domain",
  "toolCalls": [...],
  "timestamp": "2026-02-08T04:20:00Z"
}
```

### REST Endpoints
- `GET /api/tasks` - List all tasks with filtering
- `GET /api/tasks/:id` - Task detail with full history
- `POST /api/tasks/:id/approve` - Human approves blocked action
- `POST /api/tasks/:id/reject` - Human rejects blocked action
- `POST /api/tasks/:id/comment` - Human asks question or adds context

## Status Values
- `pending` - Waiting for agent pickup
- `in_progress` - Agent working
- `need_review` - Blocked, needs human decision
- `need_info` - Agent asking question
- `completed` - Done
- `failed` - Agent error/abort
