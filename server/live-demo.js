const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'data', 'mission-control.db'));

const now = new Date().toISOString();
const taskId = 'task_live_' + Date.now();

// Create live demo task
db.run(
  `INSERT INTO tasks (id, title, description, status, agent_id, priority, tags, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    taskId,
    '🚀 LIVE: Mission Control Demo',
    'This task was auto-created by Sasha to demonstrate live dashboard updates. You should see progress messages appearing below.',
    'in_progress',
    'sasha',
    'high',
    JSON.stringify(['demo', 'live', 'openclaw']),
    now,
    now
  ],
  function(err) {
    if (err) {
      console.error('Error:', err);
      db.close();
      return;
    }
    
    console.log(`Created task: ${taskId}`);
    
    // Add initial progress
    db.run(
      `INSERT INTO task_progress (id, task_id, message, metadata, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [`prog_${Date.now()}_1`, taskId, 'Task created and activated by user request', '{}', now],
      function(err) {
        if (err) console.error('Progress error:', err);
        
        // Add a tool call
        db.run(
          `INSERT INTO tool_calls (id, task_id, tool, input, output, timestamp, duration_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `tc_${Date.now()}`, 
            taskId, 
            'autoTask', 
            '{"request": "Show dashboard demo"}', 
            '{"status": "activated"}', 
            now, 
            50
          ],
          function(err) {
            if (err) console.error('Tool call error:', err);
            
            console.log('✅ LIVE TASK ACTIVE');
            console.log(`Task ID: ${taskId}`);
            console.log('Check your dashboard now!');
            db.close();
          }
        );
      }
    );
  }
);
