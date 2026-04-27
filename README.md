# Mission Control Dashboard

## Quick Start

```bash
# Run the full stack
cd mission-control && docker-compose up -d

# Or run just the dev version
npm install
cp .env.example .env
# Point DATABASE_URL at a local or shared Postgres database. Then:
npx prisma generate
npm run db:migrate && npm run db:seed
npm run dev
# App: http://localhost:3002
```

If you see **Module not found: Can't resolve 'next-auth'** (or similar), run **`npm install`** from the repo root and try again. `npm run dev` runs a short **predev** check that errors with the same fix if `node_modules` is incomplete. To skip that check: **`npm run dev:raw`**.

### Postgres app database

Mission Control’s Next.js app data plane uses Prisma with PostgreSQL. In production, `mc-web` and `mc-scraper` read `DATABASE_URL` from the GCP Secret Manager secret `mc-app-db-url` and connect to Cloud SQL. Local development should use a local or shared Postgres database.

Schema workflow:

1. Update `prisma/schema.prisma`.
2. Create a migration with `npm run db:migrate`.
3. Apply production migrations with `npx prisma migrate deploy` or let `deploy/gcp/bootstrap.sh` run `deploy/gcp/apply-prisma-schema.sh`.
4. Seed demo markets when needed with `npm run db:seed`.

### Lead Generation database

- Markets and companies live in the configured Postgres **`DATABASE_URL`**.
- **Local demo data** is defined in code (`lib/lead-generation/mock-data.ts`) and written only by **`npm run db:seed`** when you want fixture data locally.
- If Market Databases shows **0 markets**, either create one in the UI or run `npm run db:migrate && npm run db:seed` for a local fixture dataset.

### Directory Scraper — how to try it

1. **Playwright (default live):** choose **Playwright**, install Chromium with `npx playwright install chromium`, enter a public `https://` URL. Localhost/private IPs are rejected (`URL_BLOCKED`). Name extraction uses JSON-LD / deterministic heuristics, or **two-pass OpenRouter** (locate roster → extract names) when **AI extraction** is enabled and `OPENROUTER_API_KEY` is set.
2. **Firecrawl:** set `FIRECRAWL_API_KEY`, choose **Firecrawl** — Phase 1 uses Firecrawl `/scrape` (markdown + `onlyMainContent`). AI locate/extract and optional **visit company websites** (Playwright) behave the same. Optional `FIRECRAWL_BASE_URL` for self-hosted API.
3. **Serper (company websites):** set `SERPER_API_KEY` from [serper.dev](https://serper.dev), enable **Find company websites (Serper search)**. After names are extracted, each row without a website gets free domain guesses (HTTP check) then one Google search via Serper (about one US dollar per 1,000 searches on typical pricing). Optional `SERPER_BASE_URL` if you self-host the API.
4. **Worker:** run `npm run worker:directory-scraper` so queued jobs are picked up and processed in the background.
5. **Tests:** `TEST_DATABASE_URL="postgresql://mcapp:mcapp@localhost:5432/missioncontrol_app_test" npm test`
6. **API:** `POST /api/directory-scraper/jobs` with JSON body (`scrapeFetchMode`: `playwright` | `firecrawl`, `enableAiNameFallback`, `enableSerperWebsiteDiscovery`, etc.); stream progress from `GET /api/directory-scraper/jobs/:id/events` or poll `GET /api/directory-scraper/jobs/:id`.

**Migrations:** Prisma migrations under `prisma/migrations/` target Postgres. The current baseline creates all app tables, including org, auth, directory scraper, lead generation, geo intelligence, phone, manuals, and image generation tables.

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
