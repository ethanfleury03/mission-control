const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'data', 'mission-control.db'));

const now = new Date().toISOString();

const newTasks = [
  {
    id: 'task_lucid',
    title: 'Integrate Lucid Chart',
    description: 'Build integration with Lucid Chart for diagram generation and visualization',
    status: 'pending',
    priority: 'high',
    tags: JSON.stringify(['integration', 'lucidchart', 'diagrams'])
  },
  {
    id: 'task_hubspot',
    title: 'Integrate HubSpot',
    description: 'Connect to HubSpot CRM for contact management, deals, and marketing automation',
    status: 'pending',
    priority: 'high',
    tags: JSON.stringify(['integration', 'hubspot', 'crm'])
  },
  {
    id: 'task_zoominfo',
    title: 'Integrate ZoomInfo',
    description: 'Build integration with ZoomInfo for lead enrichment and contact data',
    status: 'pending',
    priority: 'high',
    tags: JSON.stringify(['integration', 'zoominfo', 'leads', 'data'])
  }
];

newTasks.forEach(t => {
  db.run(
    `INSERT OR REPLACE INTO tasks (id, title, description, status, agent_id, priority, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [t.id, t.title, t.description, t.status, 'manual', t.priority, t.tags, now, now],
    (err) => {
      if (err) console.error(`Error inserting ${t.id}:`, err);
      else console.log(`Created task: ${t.title}`);
    }
  );
});

db.close(() => {
  console.log('Done! 3 integration tasks created.');
});
