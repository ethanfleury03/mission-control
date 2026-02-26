# @mission-control/sdk

Agent SDK for reporting to Mission Control Dashboard.

## Install

```bash
npm install @mission-control/sdk
```

## Quick Start

```typescript
import { MissionControl } from '@mission-control/sdk';

const mc = new MissionControl({
  apiKey: 'your-api-key',
  agentId: 'sasha-1',
  apiUrl: 'http://localhost:3001'
});

// Start a task
const task = await mc.startTask({
  title: 'Check emails',
  description: 'Process unread emails from shaan@arrsys.com',
  priority: 'high'
});

// Report progress
await mc.progress('Found 3 unread emails');
await mc.progress('Reading...');

// Log tool calls
await mc.toolCall('gog', 
  { command: 'gmail search is:unread' },
  { output: [...], durationMs: 1200 }
);

// Block for human approval
const approved = await mc.block(
  'Need approval to send reply to external domain?',
  { domain: 'example.com', recipient: 'someone@example.com' }
);

if (approved) {
  await mc.complete('Sent reply, task complete');
} else {
  await mc.complete('Skipped external email, task complete');
}
```

## API

### `new MissionControl(config)`

Create a new SDK instance.

**Config:**
- `apiKey` (string): Authentication key
- `agentId` (string): Unique agent identifier
- `apiUrl` (string): Mission Control API URL
- `wsUrl` (string, optional): WebSocket URL (defaults to ws://apiUrl)
- `autoReconnect` (boolean, optional): Reconnect on disconnect (default: true)

### `startTask(config)`

Start tracking a new task.

**Config:**
- `title` (string): Task title
- `description` (string): Task description
- `priority` ('low' | 'medium' | 'high'): Task priority
- `tags` (string[]): Optional tags

### `progress(message, metadata?)`

Report progress on the current task.

### `toolCall(tool, input, result?)`

Log a tool call.

### `block(message, context?)`

Block and wait for human approval. Returns `Promise<boolean>`.

### `ask(message)`

Ask the human a question. Returns `Promise<string>` with the answer.

### `complete(message)`

Mark task as completed.

### `fail(error)`

Mark task as failed.

## Events

The SDK emits events you can listen to:

```typescript
mc.on('taskStarted', (task) => console.log('Started:', task.id));
mc.on('progress', ({ message }) => console.log('Progress:', message));
mc.on('blocked', ({ message }) => console.log('Blocked:', message));
mc.on('completed', ({ message }) => console.log('Done:', message));
mc.on('connected', () => console.log('WebSocket connected'));
mc.on('disconnected', () => console.log('WebSocket disconnected'));
```
