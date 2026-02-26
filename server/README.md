# Mission Control Server

Backend API and WebSocket server for the Mission Control Dashboard.

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode (auto-reload)
npm run dev

# Or build and run
npm run build
npm start
```

Server starts on port 3001 by default.

## Environment Variables

- `PORT` - HTTP server port (default: 3001)

## API Endpoints

### Tasks
- `GET /api/tasks` - List all tasks
- `GET /api/tasks/:id` - Get task with full details
- `POST /api/tasks` - Create new task
- `POST /api/tasks/:id/progress` - Add progress message
- `POST /api/tasks/:id/tool-call` - Log tool call
- `POST /api/tasks/:id/block` - Block for approval
- `POST /api/tasks/:id/ask` - Ask question
- `POST /api/tasks/:id/complete` - Mark complete
- `POST /api/tasks/:id/fail` - Mark failed

### Human Review
- `POST /api/tasks/:id/approve` - Approve blocked action
- `POST /api/tasks/:id/reject` - Reject blocked action
- `POST /api/tasks/:id/respond` - Respond to question
- `POST /api/tasks/:id/comment` - Add comment

### Health
- `GET /health` - Server health check

## WebSocket

Connect to `ws://localhost:3001/ws`

**Query params:**
- `agentId` - For agent connections
- `dashboard=true` - For dashboard connections

## Authentication

API requests require a Bearer token in the Authorization header:

```
Authorization: Bearer your-api-key
```

Generate API keys by inserting into the `api_keys` table in SQLite.

## Data Storage

SQLite database stored at `./data/mission-control.db`

Tables:
- `tasks` - Task records
- `task_progress` - Progress messages
- `tool_calls` - Tool call logs
- `human_reviews` - Human review items
- `api_keys` - API authentication keys
