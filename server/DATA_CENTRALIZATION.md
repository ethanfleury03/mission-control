# Mission Control Data Centralization

All Mission Control data lives in **PostgreSQL** as the single source of truth. No SQLite in production.

## Architecture

- **PostgreSQL** – Tasks, progress, tool calls, reviews, registry (teams, agents, policies), **org chart**
- **Redis** – Event streaming (optional)
- **JSON** – Export/import, backups only (admin gated)

## Running Migrations

Migrations run automatically on server startup with advisory locking (multi-instance safe).

1. Ensure `DATABASE_URL` is set to a Postgres connection string:
   ```bash
   export DATABASE_URL=postgresql://user:pass@host:5432/missioncontrol
   ```

2. Start the server:
   ```bash
   npm run start
   ```

3. Migrations are applied before the server listens. Check the Data Source Report in the console.

## Org Chart Migration

Org chart data is seeded from static data on first run. If `org_people` is empty, the server seeds Shaan, Ethan, Cody from `app/lib/orgChartData.ts`.

To re-seed (e.g. after schema change):

1. Truncate org tables:
   ```sql
   TRUNCATE org_people, org_events, org_snapshots;
   TRUNCATE org_departments CASCADE;
   ```

2. Restart the server. The seed will run automatically (idempotent, advisory-locked).

## Org Chart API

- **Express**: `GET/POST /api/org/context`, `GET/POST/PATCH/DELETE /api/org/events`, `GET/POST/DELETE /api/org/snapshot`
- **Next.js**: Proxies to Express when `API_URL` is set. Otherwise falls back to static data (dev only).

## Health Checks

- `GET /health` – Quick DB ping
- `GET /health/details` – Full report: DB reachable, migrations applied, registry tables, org tables, counts

## Regression Tests

Run `npx jest src/__tests__/no-sqlite.test.ts` to ensure no SQLite imports in production codepaths.

## Production Requirements

- `DATABASE_URL` must be set and start with `postgres://` or `postgresql://`
- Server fails fast if `DATABASE_URL` is missing or not Postgres
- No silent fallback to SQLite or JSON
