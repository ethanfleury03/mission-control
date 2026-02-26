const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 
  'postgresql://localhost:5432/missioncontrol';

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const generateId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

async function seed() {
  console.log('Seeding database...');
  
  // API key
  await pool.query(
    `INSERT INTO api_keys (key, name) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
    ['test-key', 'Test Key']
  );
  
  // Sample integration tasks
  const tasks = [
    {
      title: 'Integrate Lucid Chart',
      desc: 'Build integration with Lucid Chart for diagram generation'
    },
    {
      title: 'Integrate HubSpot',
      desc: 'Connect to HubSpot CRM for contact management'
    },
    {
      title: 'Integrate ZoomInfo',
      desc: 'Build integration with ZoomInfo for lead enrichment'
    }
  ];

  for (const t of tasks) {
    const existing = await pool.query(
      `SELECT id FROM tasks WHERE title = $1 LIMIT 1`,
      [t.title]
    );

    if (existing.rows.length > 0) {
      console.log(`  - Skipping existing: ${t.title}`);
      continue;
    }

    await pool.query(
      `INSERT INTO tasks (id, title, description, status, priority, tags)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        generateId('task'),
        t.title,
        t.desc,
        'pending',
        'high',
        JSON.stringify(['integration'])
      ]
    );
    console.log(`  - ${t.title}`);
  }
  
  console.log('✅ Seeding complete');
  await pool.end();
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
