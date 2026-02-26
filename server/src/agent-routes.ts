import { Router } from 'express';
import { Pool } from 'pg';

const router = Router();

// Helper to get DB from app locals
const getDb = (req: any): Pool => req.app.locals.db;

// GET /api/agents - List all agents
router.get('/agents', async (req, res) => {
  try {
    const db = getDb(req);
    const result = await db.query('SELECT * FROM agents ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching agents:', err);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// GET /api/agents/:id - Get specific agent
router.get('/agents/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const agentResult = await db.query('SELECT * FROM agents WHERE id = $1', [req.params.id]);
    
    if (!agentResult.rows[0]) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const agent = agentResult.rows[0];
    
    // Get current task
    const taskResult = await db.query(
      'SELECT * FROM agent_tasks WHERE agent_id = $1 AND status = $2 ORDER BY assigned_at DESC LIMIT 1',
      [req.params.id, 'in_progress']
    );
    
    // Get task queue
    const queueResult = await db.query(
      'SELECT * FROM agent_tasks WHERE agent_id = $1 AND status = $2 ORDER BY assigned_at ASC',
      [req.params.id, 'pending']
    );
    
    // Get chat history (last 20)
    const chatResult = await db.query(
      'SELECT * FROM agent_chat WHERE agent_id = $1 ORDER BY timestamp DESC LIMIT 20',
      [req.params.id]
    );
    
    res.json({
      ...agent,
      currentTask: taskResult.rows[0] || null,
      taskQueue: queueResult.rows,
      chatHistory: chatResult.rows.reverse()
    });
  } catch (err) {
    console.error('Error fetching agent:', err);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

// POST /api/agents/:id/assign - Assign task to agent
router.post('/agents/:id/assign', async (req, res) => {
  try {
    const db = getDb(req);
    const { name, description, priority = 'medium' } = req.body;
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await db.query(
      `INSERT INTO agent_tasks (id, agent_id, name, description, status, priority, progress, assigned_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [taskId, req.params.id, name, description, 'pending', priority, 0, new Date().toISOString()]
    );
    
    // Update agent status to working if idle
    await db.query(
      `UPDATE agents SET status = 'working' WHERE id = $1 AND status = 'idle'`,
      [req.params.id]
    );
    
    res.json({ success: true, taskId });
  } catch (err) {
    console.error('Error assigning task:', err);
    res.status(500).json({ error: 'Failed to assign task' });
  }
});

// POST /api/agents/:id/chat - Send message to agent
router.post('/agents/:id/chat', async (req, res) => {
  try {
    const db = getDb(req);
    const { message } = req.body;
    const msgId = `msg_${Date.now()}`;
    
    await db.query(
      `INSERT INTO agent_chat (id, agent_id, "from", message, timestamp)
       VALUES ($1, $2, $3, $4, $5)`,
      [msgId, req.params.id, 'user', message, new Date().toISOString()]
    );
    
    // TODO: Forward message to actual agent session via sessions_send
    
    res.json({ success: true, messageId: msgId });
  } catch (err) {
    console.error('Error sending chat:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /api/agents/:id/pause - Pause agent
router.post('/agents/:id/pause', async (req, res) => {
  try {
    const db = getDb(req);
    await db.query(
      `UPDATE agents SET status = 'paused' WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error pausing agent:', err);
    res.status(500).json({ error: 'Failed to pause agent' });
  }
});

// POST /api/agents/:id/resume - Resume agent
router.post('/agents/:id/resume', async (req, res) => {
  try {
    const db = getDb(req);
    await db.query(
      `UPDATE agents SET status = 'working' WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error resuming agent:', err);
    res.status(500).json({ error: 'Failed to resume agent' });
  }
});

// POST /api/agents/:id/restart - Restart agent
router.post('/agents/:id/restart', async (req, res) => {
  try {
    const db = getDb(req);
    
    // TODO: Kill existing session via sessions API
    
    await db.query(
      `UPDATE agents SET status = 'idle', current_task = NULL, session_id = NULL WHERE id = $1`,
      [req.params.id]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error restarting agent:', err);
    res.status(500).json({ error: 'Failed to restart agent' });
  }
});

// POST /api/agents/:id/instructions - Update agent instructions
router.post('/agents/:id/instructions', async (req, res) => {
  try {
    const db = getDb(req);
    const { instructions } = req.body;
    
    await db.query(
      `UPDATE agents SET instructions = $1 WHERE id = $2`,
      [instructions, req.params.id]
    );
    
    // TODO: Forward to active session if running
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating instructions:', err);
    res.status(500).json({ error: 'Failed to update instructions' });
  }
});

// POST /api/agents/spawn - Spawn new agent session
router.post('/agents/spawn', async (req, res) => {
  try {
    const { task, role, priority = 'medium', instructions, timeout = 3600 } = req.body;
    
    // TODO: Integrate with sessions_spawn
    // const session = await sessions_spawn({
    //   task,
    //   agentId: `${role}-${Date.now()}`,
    //   label: `${role}-agent`,
    //   runTimeoutSeconds: timeout
    // });
    
    res.json({ 
      success: true, 
      agentId: `${role}_${Date.now()}`,
      message: 'Agent spawn initiated (sessions integration pending)'
    });
  } catch (err) {
    console.error('Error spawning agent:', err);
    res.status(500).json({ error: 'Failed to spawn agent' });
  }
});

// Agent progress update (called by agents via SDK)
router.post('/agents/:id/progress', async (req, res) => {
  try {
    const db = getDb(req);
    const { taskId, progress, message } = req.body;
    
    await db.query(
      `UPDATE agent_tasks SET progress = $1, updated_at = $2 WHERE id = $3`,
      [progress, new Date().toISOString(), taskId]
    );
    
    if (message) {
      await db.query(
        `INSERT INTO agent_chat (id, agent_id, "from", message, timestamp)
         VALUES ($1, $2, $3, $4, $5)`,
        [`prog_${Date.now()}`, req.params.id, 'agent', message, new Date().toISOString()]
      );
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating progress:', err);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

export default router;
