import { Router } from 'express';
import { CommandParser } from '../services/commandParser';
import { CommandExecutor } from '../services/commandExecutor';
import { RegistryService } from '../registry';
import { RegistryAdapter } from '../services/registryAdapter';

const router = Router();
const commandParser = new CommandParser();
const registry = new RegistryService();
const registryAdapter = new RegistryAdapter(registry);
const commandExecutor = new CommandExecutor(registryAdapter);

// POST /api/commands/parse - Parse natural language command
router.post('/parse', async (req, res) => {
  try {
    const { command } = req.body;
    
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'Command text required' });
    }

    const parsed = await commandParser.parseCommand(command);
    
    res.json(parsed);
  } catch (err: any) {
    console.error('Error parsing command:', err);
    res.status(500).json({ 
      error: err.message || 'Failed to parse command',
      details: err.toString()
    });
  }
});

// POST /api/commands/execute - Execute a parsed command
router.post('/execute', async (req, res) => {
  try {
    const { command } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Parsed command required' });
    }

    const result = await commandExecutor.execute(command);
    
    // Broadcast changes via WebSocket (if available)
    if (result.success && result.changes && req.app.locals.wss) {
      for (const change of result.changes) {
        if (change.entity === 'agent') {
          req.app.locals.wss.broadcast({
            type: 'agents:updated',
            payload: { change }
          });
        } else if (change.entity === 'team') {
          req.app.locals.wss.broadcast({
            type: 'teams:updated',
            payload: { change }
          });
        }
      }
    }
    
    res.json(result);
  } catch (err: any) {
    console.error('Error executing command:', err);
    res.status(500).json({ 
      error: err.message || 'Failed to execute command'
    });
  }
});

// POST /api/commands/run - Parse and execute in one step
router.post('/run', async (req, res) => {
  try {
    const { command } = req.body;
    
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'Command text required' });
    }

    // Parse the command
    const parsed = await commandParser.parseCommand(command);
    
    // Execute it
    const result = await commandExecutor.execute(parsed);
    
    // Broadcast changes via WebSocket (if available)
    if (result.success && result.changes && req.app.locals.wss) {
      for (const change of result.changes) {
        if (change.entity === 'agent') {
          req.app.locals.wss.broadcast({
            type: 'agents:updated',
            payload: { change }
          });
        } else if (change.entity === 'team') {
          req.app.locals.wss.broadcast({
            type: 'teams:updated',
            payload: { change }
          });
        }
      }
    }
    
    res.json({
      parsed,
      result
    });
  } catch (err: any) {
    console.error('Error running command:', err);
    res.status(500).json({ 
      error: err.message || 'Failed to run command',
      details: err.toString()
    });
  }
});

// POST /api/commands/batch - Execute multiple commands
router.post('/batch', async (req, res) => {
  try {
    const { commands } = req.body;
    
    if (!Array.isArray(commands)) {
      return res.status(400).json({ error: 'Commands array required' });
    }

    const result = await commandExecutor.executeMultiple(commands);
    
    // Broadcast changes via WebSocket (if available)
    if (result.success && result.changes && req.app.locals.wss) {
      req.app.locals.wss.broadcast({
        type: 'batch:updated',
        payload: { changes: result.changes }
      });
    }
    
    res.json(result);
  } catch (err: any) {
    console.error('Error executing batch commands:', err);
    res.status(500).json({ 
      error: err.message || 'Failed to execute batch commands'
    });
  }
});

export default router;
