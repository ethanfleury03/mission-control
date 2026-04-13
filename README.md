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
```

### Directory Scraper — how to try it

1. **Mock mode (no Playwright):** open **Directory Scraper** in the hub sidebar, enable **Mock mode**, click **Start scrape**. You should see sample rows, filters, and CSV export without a real URL.
2. **Live scrape:** install Chromium once with `npx playwright install chromium`, then disable mock mode and enter a public `https://` directory URL. Localhost and private IPs are rejected (`URL_BLOCKED`).
3. **Tests:** `DATABASE_URL="file:./prisma/vitest-directory-scraper.db" npm test`
4. **API:** `POST /api/directory-scraper/jobs` with JSON body; poll `GET /api/directory-scraper/jobs/:id` (paged by default) or `GET ...?full=1` for the full result set.

**Migrations:** The first directory-scraper migration file creates **only** `directory_scrape_*` tables (org chart tables live in the same Prisma schema but are not recreated by that migration). If your dev DB was created from an older migration that mixed org + scraper DDL, you may see a Prisma checksum warning — use `prisma migrate resolve` or reset the dev database. Job metadata uses `metaJson` on `directory_scrape_jobs` (see migration `20260414120000_directory_job_meta` if present, or `prisma db push`).

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
