# Mission Control Dashboard

## Quick Start

```bash
# Run the full stack
cd mission-control && docker-compose up -d

# Or run just the dev version
npm install
cp .env.example .env   # set DATABASE_URL (see .env.example)
npx prisma migrate deploy   # or: npm run db:migrate (dev)
npm run dev
# App: http://localhost:3000
```

### Directory Scraper — how to try it

1. **Mock mode:** under **How to load the page**, choose **Mock mode** — demo rows, no URL or APIs.
2. **Playwright (default live):** choose **Playwright**, install Chromium with `npx playwright install chromium`, enter a public `https://` URL. Localhost/private IPs are rejected (`URL_BLOCKED`). Name extraction uses JSON-LD / deterministic heuristics, or **two-pass OpenRouter** (locate roster → extract names) when **AI extraction** is enabled and `OPENROUTER_API_KEY` is set.
3. **Firecrawl:** set `FIRECRAWL_API_KEY`, choose **Firecrawl** — Phase 1 uses Firecrawl `/scrape` (markdown + `onlyMainContent`). AI locate/extract and optional **visit company websites** (Playwright) behave the same. Optional `FIRECRAWL_BASE_URL` for self-hosted API.
4. **Serper (company websites):** set `SERPER_API_KEY` from [serper.dev](https://serper.dev), enable **Find company websites (Serper search)**. After names are extracted, each row without a website gets free domain guesses (HTTP check) then one Google search via Serper (about one US dollar per 1,000 searches on typical pricing). Optional `SERPER_BASE_URL` if you self-host the API.
5. **Tests:** `DATABASE_URL="file:./prisma/vitest-directory-scraper.db" npm test`
6. **API:** `POST /api/directory-scraper/jobs` with JSON body (`scrapeFetchMode`: `playwright` | `firecrawl`, `enableAiNameFallback`, `enableSerperWebsiteDiscovery`, etc.); poll `GET /api/directory-scraper/jobs/:id` or `GET ...?full=1`.

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
