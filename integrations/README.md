# Mission Control Agent Integration

## Quick Setup

1. **Copy integration files to your agent:**
   ```bash
   cp integrations/agent.ts /path/to/your/agent/
   ```

2. **Set environment variables:**
   ```bash
   export MC_API_URL=http://localhost:3001
   export MC_API_KEY=test-key
   export MC_AGENT_ID=sasha
   ```

3. **Import and use in your agent code:**
   ```typescript
   import { autoTask, progress, complete } from './agent';
   
   async function onUserRequest(request: string, user: string) {
     // Creates task automatically
     const mc = await autoTask(request, { user });
     
     // Your work here...
     await progress('Starting...');
     const result = await doWork();
     
     // Mark done
     await complete('Done!');
     return result;
   }
   ```

## Integration Modes

### Mode 1: Auto-Task Per Request (Recommended)
Every user request becomes a tracked task:
```typescript
const mc = await autoTask(userMessage, { user: username, channel });
// ... do work with mc.progress(), mc.toolCall() ...
await mc.complete('Finished');
```

### Mode 2: Wrap Tools (Zero-effort tracking)
```typescript
import { wrapTool } from './agent';
import { web_search, exec } from './tools';

const trackedSearch = wrapTool('web_search', web_search);
const trackedExec = wrapTool('exec', exec);

// Now every call is auto-logged
await trackedSearch({ query: '...' });
```

### Mode 3: Manual Control
```typescript
import { initMissionControl } from './agent';

const mc = initMissionControl({
  apiUrl: 'http://localhost:3001',
  apiKey: 'test-key'
});

await mc.startTask({ title: 'Custom Task', description: '...' });
await mc.progress('Step 1...');
await mc.toolCall('myTool', input, result);
await mc.complete('Done');
```

## Where to Integrate in OpenClaw

Add to your agent's **message handler entry point** — the function that receives user messages and decides what to do.

For a typical OpenClaw setup, this would be:
- Where you parse the incoming Discord/Telegram message
- Before calling any tools
- Wrap the entire execution in try/catch with complete/fail

## Testing

1. Start Mission Control server: `cd server && npm run dev`
2. Send a request to your agent
3. Check dashboard: http://localhost:3001 (or API: curl http://localhost:3001/api/tasks)
4. You should see the task appear with live updates
