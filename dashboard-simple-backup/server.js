const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3456;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// In-memory agent registry (in production, use database)
let agents = {
  'sales-agent': {
    id: 'sales-agent',
    name: 'Sales Agent',
    role: 'Lead Qualification & Outreach',
    status: 'ready',
    currentTask: null,
    emoji: '💼',
    capabilities: ['Email', 'Calendar', 'Research'],
    sessionKey: null,
    startedAt: null
  },
  'support-agent': {
    id: 'support-agent',
    name: 'Support Agent',
    role: 'Customer Support & Tickets',
    status: 'ready',
    currentTask: null,
    emoji: '🎧',
    capabilities: ['Email', 'Discord', 'Escalation'],
    sessionKey: null,
    startedAt: null
  },
  'research-agent': {
    id: 'research-agent',
    name: 'Research Agent',
    role: 'Market Research & Analysis',
    status: 'ready',
    currentTask: null,
    emoji: '🔬',
    capabilities: ['Web Search', 'Analysis', 'Reports'],
    sessionKey: null,
    startedAt: null
  },
  'ops-agent': {
    id: 'ops-agent',
    name: 'Ops Agent',
    role: 'Operations & Coordination',
    status: 'ready',
    currentTask: null,
    emoji: '⚙️',
    capabilities: ['Monitoring', 'Approvals', 'Reports'],
    sessionKey: null,
    startedAt: null
  }
};

let activities = [];

// WebSocket connections for real-time updates
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected to Mission Control');
  
  // Send current state
  ws.send(JSON.stringify({
    type: 'init',
    agents: Object.values(agents),
    activities: activities.slice(0, 20)
  }));
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected');
  });
});

// Broadcast updates to all connected clients
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Add activity log
function addActivity(title, icon = '📝', agentId = null) {
  const activity = {
    id: Date.now(),
    title,
    icon,
    agentId,
    time: new Date().toISOString()
  };
  activities.unshift(activity);
  if (activities.length > 100) activities.pop();
  
  broadcast({ type: 'activity', activity });
  return activity;
}

// API Routes

// Get all agents
app.get('/api/agents', (req, res) => {
  res.json(Object.values(agents));
});

// Get specific agent
app.get('/api/agents/:id', (req, res) => {
  const agent = agents[req.params.id];
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// Spawn agent with task
app.post('/api/agents/:id/spawn', async (req, res) => {
  const { id } = req.params;
  const { task, timeout = 1800 } = req.body;
  
  const agent = agents[id];
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (agent.status === 'busy') return res.status(400).json({ error: 'Agent is busy' });
  
  // Update agent status
  agent.status = 'busy';
  agent.currentTask = task;
  agent.startedAt = new Date().toISOString();
  
  addActivity(`Task assigned to ${agent.name}`, '🚀', id);
  broadcast({ type: 'agent-update', agent });
  
  // In real implementation, call OpenClaw sessions_spawn
  // For now, simulate the spawn
  console.log(`[SPAWN] Agent: ${id}, Task: ${task}`);
  
  // Simulate spawning via OpenClaw CLI (would be actual API call)
  /*
  const spawnResult = await fetch('http://localhost:8080/api/sessions/spawn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: id,
      task,
      label: `${id}-${Date.now()}`,
      runTimeoutSeconds: timeout
    })
  });
  const result = await spawnResult.json();
  agent.sessionKey = result.sessionKey;
  */
  
  res.json({
    success: true,
    agent: agent,
    message: `Agent ${agent.name} is now working on the task`
  });
  
  // Simulate task completion for demo (remove in production)
  setTimeout(() => {
    agent.status = 'ready';
    agent.currentTask = null;
    agent.sessionKey = null;
    agent.startedAt = null;
    addActivity(`${agent.name} completed task`, '✅', id);
    broadcast({ type: 'agent-update', agent });
  }, 30000); // 30 seconds for demo
});

// Kill agent session
app.post('/api/agents/:id/kill', (req, res) => {
  const { id } = req.params;
  const agent = agents[id];
  
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (agent.status !== 'busy') return res.status(400).json({ error: 'Agent is not busy' });
  
  agent.status = 'ready';
  agent.currentTask = null;
  agent.sessionKey = null;
  agent.startedAt = null;
  
  addActivity(`${agent.name} task terminated`, '🛑', id);
  broadcast({ type: 'agent-update', agent });
  
  res.json({ success: true, agent });
});

// Get activities
app.get('/api/activities', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(activities.slice(0, limit));
});

// Get system status
app.get('/api/status', (req, res) => {
  const activeAgents = Object.values(agents).filter(a => a.status !== 'offline').length;
  const busyAgents = Object.values(agents).filter(a => a.status === 'busy').length;
  
  res.json({
    online: true,
    activeAgents,
    busyAgents,
    totalAgents: Object.keys(agents).length,
    uptime: process.uptime()
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🎯 Mission Control server running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down Mission Control...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
