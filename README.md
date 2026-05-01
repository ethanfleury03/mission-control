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

### RAG Support Assistant

The RAG tab is a local-first support assistant for Arrow manuals and technical docs. It uses Postgres + pgvector for source documents, pages, chunks, hybrid retrieval traces, answer records, and feedback.

Local setup:

```bash
cp .env.example .env
docker compose up -d postgres
npm run rag:setup
npm run rag:doctor
npm run rag:migrate
npm run dev
```

For local RAG, `.env` must use PostgreSQL, not Prisma's old SQLite dev URL:

```bash
DATABASE_URL="postgresql://mcapp:mcapp@localhost:5432/missioncontrol_app"
```

`npm run rag:doctor` checks the current env, database connection, pgvector extension, required RAG tables, storage directory, provider keys, indexed documents, chunks, embeddings, failed documents, stuck jobs, and eval fixtures. If it reports SQLite, update `.env` and restart `npm run dev`.

Required/important environment variables:

- `DATABASE_URL`: Postgres connection string.
- `OPENAI_API_KEY`: required for production-quality embeddings.
- `OPENROUTER_API_KEY`: required when `RAG_LLM_PROVIDER=openrouter` or `RAG_RERANK_PROVIDER=openrouter`.
- `OPENROUTER_BASE_URL`: default `https://openrouter.ai/api/v1`.
- `RAG_LLM_PROVIDER`: `openrouter` or `openai`.
- `RAG_LLM_MODEL`: answer model string.
- `RAG_QUERY_MODEL`: optional query-parser model, defaults to `RAG_LLM_MODEL`.
- `RAG_METADATA_MODEL`: optional metadata-extractor model, defaults to `RAG_LLM_MODEL`.
- `RAG_EMBEDDING_MODEL`: embedding model, default `text-embedding-3-small`.
- `RAG_RERANK_PROVIDER` / `RAG_RERANK_MODEL`: optional LLM reranker provider/model.
- `RAG_LONG_CONTEXT_MODEL`: optional long-context experiment model.
- `STORAGE_DIR`: local upload storage root, default `.local-storage`.
- `RAG_OCR_ENABLED`: currently flags OCR-needed pages; local OCR execution is not wired yet.
- `RAG_LOCAL_EMBEDDINGS=true`: local hash embeddings for smoke tests only, not support-quality answers.

Using OpenRouter for RAG chat:

```bash
DATABASE_URL="postgresql://mcapp:mcapp@localhost:5432/missioncontrol_app"

# Embeddings remain OpenAI by default.
OPENAI_API_KEY="..."
RAG_EMBEDDING_MODEL="text-embedding-3-small"

# Non-embedding LLM calls use OpenRouter.
OPENROUTER_API_KEY="..."
OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
RAG_LLM_PROVIDER="openrouter"
RAG_LLM_MODEL="openai/gpt-4o-mini"
RAG_QUERY_MODEL="openai/gpt-4o-mini"
RAG_METADATA_MODEL="openai/gpt-4o-mini"
RAG_RERANK_PROVIDER="openrouter"
RAG_RERANK_MODEL="openai/gpt-4o-mini"

# Optional long-context experiment after retrieval.
RAG_LONG_CONTEXT_MODEL="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
```

OpenRouter is used for answer generation, agentic chat, query parsing, metadata extraction, reranking, and optional long-context experiments. Embeddings still require OpenAI by default; ingestion will stop with a clear error if no embedding provider is configured.

Ingest documents from the UI (`RAG > Ingest`) or from the CLI:

```bash
npm run rag:doctor
npm run rag:ingest -- /absolute/path/to/manuals --recursive
```

To sync an existing GCS manual bucket locally first:

```bash
npm run rag:ingest:gcs -- gs://arrow-rag-support-prod-docs
# Follow the printed gsutil rsync command, then:
npm run rag:ingest -- .local-storage/arrow-manuals --recursive
```

Use the `RAG` tab as the admin workspace:

- `Admin Dashboard`: totals, product/doc-type breakdowns, recent jobs, failed jobs, and warnings.
- `Ingest Manuals`: drag/drop or select one or many files, set duplicate behavior, apply metadata presets, and watch per-file lifecycle status.
- `Manual Library`: search, filter, sort, edit metadata, inspect pages/chunks, re-detect metadata, re-index, delete, and test search inside a selected manual.
- `Ingestion Jobs`: view persisted job status, failures, human-readable errors, retry failed jobs, and cancel pending/running jobs where supported.
- `Search Debugger`: inspect parsed query, filters, vector results, keyword results, merged/reranked results, final context, and ask using those results.
- `Feedback / Bad Answers`: review answer ratings and notes.
- `Settings`: read-only view of model/retrieval/chunking settings from environment variables.

RAG APIs include `GET /api/rag/health`, `POST /api/ingest/files`, `GET /api/ingest/jobs`, `GET /api/ingest/jobs/:id`, `POST /api/ingest/jobs/:id/retry-failed`, `POST /api/ingest/jobs/:id/cancel`, `GET /api/documents`, `GET /api/documents/:id`, `PATCH /api/documents/:id/metadata`, `DELETE /api/documents/:id`, `POST /api/documents/:id/reingest`, `POST /api/documents/:id/redetect-metadata`, `GET /api/documents/:id/pages`, `GET /api/documents/:id/chunks`, and `POST /api/search/debug`.

Run the retrieval evaluation harness:

```bash
npm run eval:rag
npm run eval:retrieval
npm run eval:agent
npm run rag:check-citations
```

Reports are written to `eval/rag-report.json` and `eval/rag-report.md`. If `OPENAI_API_KEY` is not set, ingestion is blocked unless `RAG_LOCAL_EMBEDDINGS=true` is explicitly enabled for local smoke tests.

Recommended first test:

1. Start Postgres/pgvector: `docker compose up -d postgres`.
2. Confirm `.env` uses `DATABASE_URL="postgresql://mcapp:mcapp@localhost:5432/missioncontrol_app"`.
3. Run `npm run rag:setup`.
4. Run `npm run rag:doctor`.
5. Ingest 5-10 known manuals first, not the whole archive.
6. Review Manual Library metadata confidence and extraction-quality warnings.
7. Fix low-confidence product/document type metadata in the UI.
8. Check low-text/scanned PDF warnings before trusting retrieval.
9. Run `npm run eval:retrieval`.
10. Ask known-answer questions in Support Chat.
11. Use Search Debugger's expected-document field when the wrong docs are retrieved.
12. Only then bulk ingest all manuals.

Security note: some model providers may process uploaded document text externally for embeddings, reranking, OCR, or answers. Use approved providers and retention settings for confidential manuals. Do not use free OpenRouter/NVIDIA or other free endpoints for confidential Arrow manuals unless explicitly approved; provider terms may allow logging or retention. For production, prefer approved paid/private providers or self-hosted models.

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
