import { Router } from 'express';
import * as db from './database';
import { wsManager } from './websocket';
import agentsRoutes from './routes/agents';
import teamsRoutes from './routes/teams';
import commandsRoutes from './routes/commands';
import registryRoutes from './routes/registry';
import orgRoutes from './routes/org';
import workRoutes from './work/routes';

const router = Router();

// Agent/team registry (PostgreSQL-backed)
router.use('/agents', agentsRoutes);
router.use('/org', orgRoutes);
router.use('/teams', teamsRoutes);
router.use('/commands', commandsRoutes);
router.use('/', registryRoutes);

// Work orchestration routes (MVP)
router.use('/', workRoutes);

// Middleware to validate API key
const validateApiKey = async (req: any, res: any, next: any) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  const valid = await db.validateApiKey(apiKey);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};

const requireAgentId = (req: any, res: any, next: any) => {
  const headerValue = req.headers['x-agent-id'];
  const agentId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!agentId) {
    return res.status(400).json({ error: 'X-Agent-ID header required' });
  }
  req.agentId = agentId;
  next();
};

// Get all tasks (with optional filters)
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await db.getTasks(req.query);
    res.json(tasks);
  } catch (err) {
    console.error('Error getting tasks:', err);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

// Get single task with full details
router.get('/tasks/:id', async (req, res) => {
  try {
    const task = await db.getTask(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const [progress, toolCalls, reviews] = await Promise.all([
      db.getProgress(req.params.id),
      db.getToolCalls(req.params.id),
      db.getReviews(req.params.id)
    ]);
    
    res.json({
      ...task,
      progress,
      toolCalls,
      reviews
    });
  } catch (err) {
    console.error('Error getting task:', err);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

// Create new task
router.post('/tasks', validateApiKey, requireAgentId, async (req, res) => {
  try {
    const task = await db.createTask({ ...req.body, agentId: req.agentId });
    
    wsManager.broadcastTaskUpdate(task.id, {
      status: task.status,
      title: task.title,
      agentId: req.agentId
    });
    
    res.status(201).json(task);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Add progress to task
router.post('/tasks/:id/progress', validateApiKey, async (req, res) => {
  try {
    await db.addProgress(req.params.id, req.body);
    await db.updateTaskStatus(req.params.id, 'in_progress');
    
    wsManager.broadcastTaskUpdate(req.params.id, {
      status: 'in_progress',
      lastMessage: req.body.message
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error adding progress:', err);
    res.status(500).json({ error: 'Failed to add progress' });
  }
});

// Add tool call to task
router.post('/tasks/:id/tool-call', validateApiKey, async (req, res) => {
  try {
    await db.addToolCall(req.params.id, req.body);
    await db.touchTask(req.params.id);
    
    wsManager.broadcastTaskUpdate(req.params.id, {
      toolCall: req.body
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error adding tool call:', err);
    res.status(500).json({ error: 'Failed to add tool call' });
  }
});

// Block task for human approval
router.post('/tasks/:id/block', validateApiKey, async (req, res) => {
  try {
    await db.createReview(req.params.id, req.body);
    await db.updateTaskStatus(req.params.id, 'need_review');
    
    wsManager.broadcastTaskUpdate(req.params.id, {
      status: 'need_review',
      review: req.body
    });
    
    res.json({ success: true, reviewId: req.body.reviewId });
  } catch (err) {
    console.error('Error blocking task:', err);
    res.status(500).json({ error: 'Failed to block task' });
  }
});

// Ask question (similar to block but different type)
router.post('/tasks/:id/ask', validateApiKey, async (req, res) => {
  try {
    await db.createReview(req.params.id, req.body);
    await db.updateTaskStatus(req.params.id, 'need_info');
    
    wsManager.broadcastTaskUpdate(req.params.id, {
      status: 'need_info',
      question: req.body
    });
    
    res.json({ success: true, reviewId: req.body.reviewId });
  } catch (err) {
    console.error('Error asking question:', err);
    res.status(500).json({ error: 'Failed to ask question' });
  }
});

// Complete task
router.post('/tasks/:id/complete', validateApiKey, async (req, res) => {
  try {
    await db.updateTaskStatus(req.params.id, 'completed');
    await db.addProgress(req.params.id, {
      message: req.body.message,
      timestamp: req.body.timestamp
    });
    
    wsManager.broadcastTaskUpdate(req.params.id, {
      status: 'completed',
      completedMessage: req.body.message
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error completing task:', err);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

// Fail task
router.post('/tasks/:id/fail', validateApiKey, async (req, res) => {
  try {
    await db.updateTaskStatus(req.params.id, 'failed');
    await db.addProgress(req.params.id, {
      message: `FAILED: ${req.body.error}`,
      timestamp: req.body.timestamp
    });
    
    wsManager.broadcastTaskUpdate(req.params.id, {
      status: 'failed',
      error: req.body.error
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error failing task:', err);
    res.status(500).json({ error: 'Failed to mark task failed' });
  }
});

// Human responds to review
router.post('/tasks/:id/respond', validateApiKey, async (req, res) => {
  try {
    const { reviewId, approved, response } = req.body;
    
    await db.respondToReview(reviewId, { approved, response });
    
    // Get task to find agent
    const task = await db.getTask(req.params.id);
    
    if (task?.agent_id) {
      wsManager.sendReviewResponse(task.agent_id, reviewId, {
        type: approved !== undefined ? 'approval' : 'question',
        approved,
        response
      });
    }
    
    // Update task status
    const newStatus = approved === true ? 'in_progress' : approved === false ? 'need_review' : 'in_progress';
    await db.updateTaskStatus(req.params.id, newStatus);
    
    wsManager.broadcastTaskUpdate(req.params.id, {
      status: newStatus,
      reviewResponse: { reviewId, approved, response }
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error responding to review:', err);
    res.status(500).json({ error: 'Failed to respond' });
  }
});

export default router;
