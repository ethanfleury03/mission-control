const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'data', 'mission-control.db'));

const taskId = process.argv[2] || 'task_live_1770529015425';

const updates = [
  { msg: 'Connecting to database...', delay: 1000 },
  { msg: 'Loading task configuration...', delay: 2000 },
  { msg: 'Initializing dashboard components...', delay: 3500 },
  { msg: 'Progress feed connected ✓', delay: 5000 },
  { msg: 'Tool call logger ready ✓', delay: 6000 },
  { msg: 'WebSocket connection established ✓', delay: 7500 },
  { msg: 'Demo complete! Task will complete in 3... 2... 1...', delay: 9000 }
];

console.log(`Adding live updates to ${taskId}...`);

updates.forEach(({ msg, delay }) => {
  setTimeout(() => {
    const id = `prog_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = new Date().toISOString();
    
    db.run(
      `INSERT INTO task_progress (id, task_id, message, metadata, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [id, taskId, msg, '{}', now],
      (err) => {
        if (err) console.error('Error:', err);
        else console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
      }
    );
    
    // Add a tool call for some of them
    if (delay % 2000 === 0) {
      const tcId = `tc_${Date.now()}`;
      db.run(
        `INSERT INTO tool_calls (id, task_id, tool, input, output, timestamp, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tcId, taskId, 'system', `{"action": "${msg}"}`, '{"status": "ok"}', now, Math.floor(Math.random() * 500) + 50]
      );
    }
  }, delay);
});

// Complete the task after all updates
setTimeout(() => {
  const now = new Date().toISOString();
  
  db.run(
    `UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?`,
    ['completed', now, taskId],
    (err) => {
      if (err) console.error('Error completing:', err);
      else {
        console.log('✅ Task completed!');
        db.run(
          `INSERT INTO task_progress (id, task_id, message, metadata, timestamp)
           VALUES (?, ?, ?, ?, ?)`,
          [`prog_${Date.now()}_done`, taskId, 'Demo completed successfully! Check the Completed column.', '{}', now],
          () => db.close()
        );
      }
    }
  );
}, 10000);
