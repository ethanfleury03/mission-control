# Agent Teams Registry Migration

## Overview

Mission Control now uses **PostgreSQL** as the single source of truth for agents and teams. The previous JSON-file runtime (`data/agents.json`, `data/teams.json`) is replaced by database tables. JSON remains for import/export and backup snapshots only.

## Migration Steps

### 1. Run Migrations

Migrations run automatically on server startup. They are **multi-instance safe**:
- PostgreSQL advisory lock ensures only one instance runs migrations
- Applied migrations are recorded in `registry_migrations` for idempotency
- Other instances skip when lock is held

To run migrations only (without starting the server):

```bash
cd workspace/mission-control/server
npm run build
node -e "
require('dotenv').config();
const { initDatabase } = require('./dist/database');
const { runRegistryMigrations } = require('./dist/db/migrateRegistry');
initDatabase();
runRegistryMigrations().then(() => process.exit(0));
"
```

### 2. Seed from Existing JSON

**Gated** – only runs when:
- `NODE_ENV !== "production"` OR
- `REGISTRY_SEED_FROM_JSON=true`

If the registry is empty and `data/agents.json` and `data/teams.json` exist, the server will import them. Logs loudly with `[REGISTRY] SEED COMPLETE`.

To manually trigger import via API:

```bash
curl -X POST http://localhost:3001/api/import/agents-teams/file
```

Or import from a payload:

```bash
curl -X POST http://localhost:3001/api/import/agents-teams \
  -H "Content-Type: application/json" \
  -d '{"agents": [...], "teams": [...]}'
```

### 3. Verify

- **Health**: `GET http://localhost:3001/health` → `database: "postgresql"`, `registry: "connected"`
- **Agents**: `GET http://localhost:3001/api/agents`
- **Teams**: `GET http://localhost:3001/api/teams`

## Database Schema

- `registry_agents` – agents with version, metadata, primary_team_id
- `registry_teams` – teams with status (draft|active|paused|archived), primary_manager
- `registry_team_members` – many-to-many with status (invited|active|suspended|removed)
- `registry_team_managers` – manager pool with priority (0=primary, 1..n=failover)
- `registry_tool_policies` – tool permissions (scope: global|team|agent)
- `registry_data_access_policies` – data access (gmail, drive, etc.)
- `registry_agent_versions` / `registry_team_versions` – version snapshots
- `registry_audit_log` – append-only audit trail
- `registry_legacy_id_map` – maps old JSON IDs (e.g. `team-marketing`) to UUIDs
- `registry_migrations` – tracks applied migrations for idempotency

**Audit log immutability**: DB triggers reject UPDATE/DELETE on `registry_audit_log`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/agents | List agents (optional ?teamId=) |
| GET | /api/agents/:id | Get agent |
| POST | /api/agents | Create agent |
| PUT | /api/agents/:id | Update agent (supports version for optimistic locking) |
| DELETE | /api/agents/:id | Soft-deactivate agent |
| GET | /api/teams | List teams |
| GET | /api/teams/:id | Get team with agents |
| POST | /api/teams | Create team |
| PUT | /api/teams/:id | Update team |
| DELETE | /api/teams/:id | Archive team |
| GET | /api/export/agents-teams | Export snapshot |
| POST | /api/import/agents-teams | Import from JSON body |
| POST | /api/import/agents-teams/file | Import from data/ files |
| POST | /api/export/backup | Create timestamped backup in data/backups/ |
| GET | /api/audit | View audit log (?entity_type=, ?entity_id=, ?limit=) |

## Failure Mode

If the database is unreachable:

- Mission Control **hard-fails** for registry operations (no silent fallback to JSON)
- `GET /health` returns `503` with `database: "unavailable"`
- UI should show "DB unavailable" and avoid agent/team edits

## Rollback

To revert to JSON-only (not recommended):

1. Stop the server
2. Restore `data/agents.json` and `data/teams.json` from backup
3. Revert code to use DataManager for runtime
4. Do not drop registry tables if you may re-migrate later

## Acceptance Checklist (run locally)

1. **Seed once**: Start server with empty DB + existing `data/*.json` → seeds exactly once. Restart → no re-import.

2. **Team version bumps**: Create team, add member, change policy → `team.version` increments each time; `team_versions` row created each time.

3. **Optimistic locking**: Attempt concurrent update with stale version → 409, returns latest.

4. **Invalid transition**: Attempt invalid state transition (e.g. archived → active) → 400.

5. **Audit immutability**: Audit rows written for every mutation. Attempt UPDATE/DELETE on `registry_audit_log` → DB rejects.

6. **Production gating**: Set `NODE_ENV=production` → seed does not run unless `REGISTRY_SEED_FROM_JSON=true`.
