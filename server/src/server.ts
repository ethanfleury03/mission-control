import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { initDatabaseAndConnect, createTables, seedInitialData, getDb } from './database';
import { runRegistryMigrations } from './db/migrateRegistry';
import { seedRegistryFromJsonIfEmpty } from './registry/seedFromJson';
import { seedOrgFromStaticIfEmpty } from './org/seedFromStatic';
import { seedPoliciesIfEmpty } from './db/seedPolicies';
import apiRoutes from './routes';
import workBoardRoutes from './routes/work';
import { wsManager } from './websocket';
import { startDispatcher, stopDispatcher, getDispatcher } from './work/dispatcher';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// === Data Source Report State ===
let dataSourceReport: DataSourceReport | null = null;

interface DataSourceReport {
  timestamp: string;
  database: {
    driver: string;
    type: string;
    host: string | null;
    database: string | null;
    reachable: boolean;
    error?: string;
  };
  migrations: {
    appliedCount: number;
    latestMigrationId: string | null;
    status: 'success' | 'failed' | 'skipped';
  };
  registry: {
    tablesPresent: boolean;
    tableList: string[];
    counts: {
      teams: number;
      agents: number;
      toolPolicies: number;
      dataAccessPolicies: number;
      teamMembers: number;
    };
  };
  org: {
    tablesPresent: boolean;
    counts: {
      people: number;
      departments: number;
      events: number;
      snapshots: number;
    };
  };
  work: {
    tablesPresent: boolean;
    tableList: string[];
    counts: {
      workItems: number;
      workEvents: number;
      approvals: number;
      exceptions: number;
    };
  };
}

// === Helper Functions ===

function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username}:****@${parsed.hostname}:${parsed.port}${parsed.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

function parseDatabaseUrl(url: string): { host: string | null; database: string | null } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      database: parsed.pathname.replace(/^\//, '') || null
    };
  } catch {
    return { host: null, database: null };
  }
}

async function checkDatabaseConnection(): Promise<{ reachable: boolean; error?: string }> {
  try {
    const pool = getDb();
    await pool.query('SELECT 1');
    return { reachable: true };
  } catch (err: any) {
    return { reachable: false, error: err.message };
  }
}

async function listRegistryTables(): Promise<string[]> {
  try {
    const pool = getDb();
    const result = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'registry_%'
      ORDER BY tablename
    `);
    return result.rows.map((r: any) => r.tablename);
  } catch {
    return [];
  }
}

async function getRegistryCounts(): Promise<DataSourceReport['registry']['counts']> {
  try {
    const pool = getDb();
    const [
      teamsRes,
      agentsRes,
      toolPoliciesRes,
      dataAccessRes,
      teamMembersRes
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int as count FROM registry_teams'),
      pool.query('SELECT COUNT(*)::int as count FROM registry_agents'),
      pool.query('SELECT COUNT(*)::int as count FROM registry_tool_policies'),
      pool.query('SELECT COUNT(*)::int as count FROM registry_data_access_policies'),
      pool.query('SELECT COUNT(*)::int as count FROM registry_team_members WHERE status != \'removed\'')
    ]);

    return {
      teams: teamsRes.rows[0]?.count || 0,
      agents: agentsRes.rows[0]?.count || 0,
      toolPolicies: toolPoliciesRes.rows[0]?.count || 0,
      dataAccessPolicies: dataAccessRes.rows[0]?.count || 0,
      teamMembers: teamMembersRes.rows[0]?.count || 0
    };
  } catch {
    return { teams: 0, agents: 0, toolPolicies: 0, dataAccessPolicies: 0, teamMembers: 0 };
  }
}

async function getOrgCounts(): Promise<DataSourceReport['org']['counts']> {
  try {
    const pool = getDb();
    const [peopleRes, deptRes, eventsRes, snapRes] = await Promise.all([
      pool.query('SELECT COUNT(*)::int as count FROM org_people'),
      pool.query('SELECT COUNT(*)::int as count FROM org_departments'),
      pool.query('SELECT COUNT(*)::int as count FROM org_events'),
      pool.query('SELECT COUNT(*)::int as count FROM org_snapshots')
    ]);
    return {
      people: peopleRes.rows[0]?.count || 0,
      departments: deptRes.rows[0]?.count || 0,
      events: eventsRes.rows[0]?.count || 0,
      snapshots: snapRes.rows[0]?.count || 0
    };
  } catch {
    return { people: 0, departments: 0, events: 0, snapshots: 0 };
  }
}

async function listWorkTables(): Promise<string[]> {
  try {
    const pool = getDb();
    const result = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND (tablename LIKE 'work_%' OR tablename IN ('approvals', 'exceptions'))
      ORDER BY tablename
    `);
    return result.rows.map((r: any) => r.tablename);
  } catch {
    return [];
  }
}

async function getWorkCounts(): Promise<DataSourceReport['work']['counts']> {
  try {
    const pool = getDb();
    const [itemsRes, eventsRes, approvalsRes, exceptionsRes] = await Promise.all([
      pool.query('SELECT COUNT(*)::int as count FROM work_items'),
      pool.query('SELECT COUNT(*)::int as count FROM work_events'),
      pool.query('SELECT COUNT(*)::int as count FROM approvals'),
      pool.query('SELECT COUNT(*)::int as count FROM exceptions')
    ]);
    return {
      workItems: itemsRes.rows[0]?.count || 0,
      workEvents: eventsRes.rows[0]?.count || 0,
      approvals: approvalsRes.rows[0]?.count || 0,
      exceptions: exceptionsRes.rows[0]?.count || 0
    };
  } catch {
    return { workItems: 0, workEvents: 0, approvals: 0, exceptions: 0 };
  }
}

async function getMigrationInfo(): Promise<{ count: number; latest: string | null }> {
  try {
    const pool = getDb();
    const result = await pool.query(
      'SELECT name FROM registry_migrations ORDER BY applied_at DESC LIMIT 1'
    );
    const countResult = await pool.query(
      'SELECT COUNT(*)::int as count FROM registry_migrations'
    );
    return {
      count: countResult.rows[0]?.count || 0,
      latest: result.rows[0]?.name || null
    };
  } catch {
    return { count: 0, latest: null };
  }
}

async function generateDataSourceReport(): Promise<DataSourceReport> {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/missioncontrol';
  const { host, database } = parseDatabaseUrl(dbUrl);
  
  const connectionStatus = await checkDatabaseConnection();
  const registryTables = connectionStatus.reachable ? await listRegistryTables() : [];
  const registryCounts = connectionStatus.reachable ? await getRegistryCounts() : 
    { teams: 0, agents: 0, toolPolicies: 0, dataAccessPolicies: 0, teamMembers: 0 };
  const orgCounts = connectionStatus.reachable ? await getOrgCounts() : 
    { people: 0, departments: 0, events: 0, snapshots: 0 };
  const workTables = connectionStatus.reachable ? await listWorkTables() : [];
  const workCounts = connectionStatus.reachable ? await getWorkCounts() : 
    { workItems: 0, workEvents: 0, approvals: 0, exceptions: 0 };
  const migrationInfo = connectionStatus.reachable ? await getMigrationInfo() : { count: 0, latest: null };

  return {
    timestamp: new Date().toISOString(),
    database: {
      driver: 'pg',
      type: 'postgres',
      host: host,
      database: database,
      reachable: connectionStatus.reachable,
      error: connectionStatus.error
    },
    migrations: {
      appliedCount: migrationInfo.count,
      latestMigrationId: migrationInfo.latest,
      status: connectionStatus.reachable ? 'success' : 'failed'
    },
    registry: {
      tablesPresent: registryTables.length > 5,
      tableList: registryTables,
      counts: registryCounts
    },
    org: {
      tablesPresent: orgCounts.people >= 0,
      counts: orgCounts
    },
    work: {
      tablesPresent: workTables.length > 0,
      tableList: workTables,
      counts: workCounts
    }
  };
}

function printDataSourceReport(report: DataSourceReport): void {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              MISSION CONTROL DATA SOURCE REPORT                ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║ Timestamp: ${report.timestamp.padEnd(49)}║`);
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║ DATABASE                                                        ║`);
  console.log(`║   Driver: ${report.database.driver.padEnd(51)}║`);
  console.log(`║   Type: ${report.database.type.padEnd(53)}║`);
  console.log(`║   Host: ${(report.database.host || 'N/A').padEnd(53)}║`);
  console.log(`║   Database: ${(report.database.database || 'N/A').padEnd(49)}║`);
  console.log(`║   Status: ${(report.database.reachable ? 'CONNECTED' : 'FAILED').padEnd(51)}║`);
  if (report.database.error) {
    console.log(`║   Error: ${report.database.error.substring(0, 52).padEnd(52)}║`);
  }
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║ MIGRATIONS                                                      ║`);
  console.log(`║   Applied: ${String(report.migrations.appliedCount).padEnd(50)}║`);
  console.log(`║   Latest: ${(report.migrations.latestMigrationId || 'none').padEnd(51)}║`);
  console.log(`║   Status: ${report.migrations.status.padEnd(51)}║`);
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║ REGISTRY                                                        ║`);
  console.log(`║   Tables Present: ${String(report.registry.tablesPresent).padEnd(42)}║`);
  console.log(`║   Tables: ${report.registry.tableList.join(', ').substring(0, 51).padEnd(51)}║`);
  console.log(`║                                                                 ║`);
  console.log(`║   Counts:                                                       ║`);
  console.log(`║     Teams: ${String(report.registry.counts.teams).padEnd(49)}║`);
  console.log(`║     Agents: ${String(report.registry.counts.agents).padEnd(48)}║`);
  console.log(`║     Tool Policies: ${String(report.registry.counts.toolPolicies).padEnd(42)}║`);
  console.log(`║     Data Access Policies: ${String(report.registry.counts.dataAccessPolicies).padEnd(35)}║`);
  console.log(`║     Team Members: ${String(report.registry.counts.teamMembers).padEnd(43)}║`);
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║ ORG CHART                                                       ║`);
  console.log(`║   Tables Present: ${String(report.org.tablesPresent).padEnd(42)}║`);
  console.log(`║   People: ${String(report.org.counts.people).padEnd(49)}║`);
  console.log(`║   Departments: ${String(report.org.counts.departments).padEnd(46)}║`);
  console.log(`║   Events: ${String(report.org.counts.events).padEnd(49)}║`);
  console.log(`║   Snapshots: ${String(report.org.counts.snapshots).padEnd(47)}║`);
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║ WORK ORCHESTRATION (MVP)                                        ║`);
  console.log(`║   Tables Present: ${String(report.work.tablesPresent).padEnd(42)}║`);
  console.log(`║   Tables: ${report.work.tableList.join(', ').substring(0, 51).padEnd(51)}║`);
  console.log(`║                                                                 ║`);
  console.log(`║   Counts:                                                       ║`);
  console.log(`║     Work Items: ${String(report.work.counts.workItems).padEnd(44)}║`);
  console.log(`║     Work Events: ${String(report.work.counts.workEvents).padEnd(43)}║`);
  console.log(`║     Approvals: ${String(report.work.counts.approvals).padEnd(45)}║`);
  console.log(`║     Exceptions: ${String(report.work.counts.exceptions).padEnd(44)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

// === Middleware ===
app.use(cors());
app.use(express.json());

// === Health Endpoints ===

app.get('/health', async (req, res) => {
  try {
    const db = getDb();
    await db.query('SELECT 1');
    res.json({
      status: 'ok',
      database: 'postgresql',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'error',
      database: 'unavailable',
      error: err.message || 'DB connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/health/details', async (req, res) => {
  const report = await generateDataSourceReport();
  res.json(report);
});

// Admin seed endpoint (dev-only or when REGISTRY_SEED_FROM_JSON=true)
app.post('/admin/seed', async (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const seedEnabled = process.env.REGISTRY_SEED_FROM_JSON === 'true';
  if (isProduction && !seedEnabled) {
    return res.status(403).json({ error: 'Seed disabled in production. Set REGISTRY_SEED_FROM_JSON=true to enable.' });
  }
  try {
    await seedRegistryFromJsonIfEmpty();
    await seedOrgFromStaticIfEmpty();
    await seedPoliciesIfEmpty();
    const report = await generateDataSourceReport();
    res.json({ ok: true, message: 'Seed completed', report });
  } catch (err: any) {
    console.error('Admin seed failed:', err);
    res.status(500).json({ error: err.message || 'Seed failed' });
  }
});

// Dispatcher status endpoint
app.get('/dispatcher/status', (req, res) => {
  const dispatcher = getDispatcher();
  res.json(dispatcher.getStatus());
});

// === API Routes ===
app.use('/api', apiRoutes);

// Work Kanban board (no auth for now; gateway proxies /mission-control/work/*)
app.use('/work', workBoardRoutes);

// === 404 Handler (must return JSON, not HTML) ===
app.use((req, res, next) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

// === Error Handling ===
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Create HTTP server
const server = http.createServer(app);

// === Startup ===
async function start() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  MISSION CONTROL SERVER STARTING');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  PORT: ${PORT}`);
  console.log(`  HOST: ${HOST}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  DATABASE_URL: ${maskDatabaseUrl(process.env.DATABASE_URL || 'postgresql://localhost:5432/missioncontrol')}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Fail fast: DATABASE_URL required and must be Postgres
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.trim() === '') {
    console.error('FATAL: DATABASE_URL is required. No silent fallback to SQLite or JSON.');
    process.exit(1);
  }
  if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
    console.error('FATAL: DATABASE_URL must start with postgres:// or postgresql://');
    process.exit(1);
  }

  // Initialize PostgreSQL and verify connectivity
  try {
    await initDatabaseAndConnect();
    console.log('✓ Database pool initialized and connected');
  } catch (err: any) {
    console.error('FATAL: Failed to initialize database:', err.message);
    process.exit(1);
  }

  const connectionStatus = await checkDatabaseConnection();
  if (!connectionStatus.reachable) {
    console.error('FATAL: PostgreSQL connection failed:', connectionStatus.error);
    if (process.env.REQUIRE_POSTGRES === 'true') {
      console.error('REQUIRE_POSTGRES=true, exiting.');
      process.exit(1);
    }
  }

  // Create base tables (tasks, progress, etc.)
  try {
    await createTables();
    console.log('✓ Base tables created/verified');
  } catch (err: any) {
    console.error('FATAL: Failed to create base tables:', err.message);
    process.exit(1);
  }

  // Run registry migrations
  let migrationsOk = true;
  try {
    await runRegistryMigrations();
    console.log('✓ Registry migrations completed');
  } catch (err: any) {
    console.error('FATAL: Registry migrations failed:', err.message);
    migrationsOk = false;
    process.exit(1);
  }

  // Seed from JSON if registry empty (gated in seedFromJson: dev only or REGISTRY_SEED_FROM_JSON=true)
  try {
    await seedRegistryFromJsonIfEmpty();
    console.log('✓ Seed check completed');
  } catch (err: any) {
    console.warn('⚠ Seed from JSON failed:', err.message);
  }

  // Seed org chart from static data if empty
  try {
    await seedOrgFromStaticIfEmpty();
    console.log('✓ Org seed check completed');
  } catch (err: any) {
    console.warn('⚠ Org seed failed:', err.message);
  }

  // Seed policies if empty
  try {
    await seedPoliciesIfEmpty();
    console.log('✓ Policy seed check completed');
  } catch (err: any) {
    console.warn('⚠ Policy seed failed:', err.message);
  }

  // Seed initial data
  try {
    await seedInitialData();
    console.log('✓ Initial data seeded');
  } catch (err: any) {
    console.warn('⚠ Initial data seed failed:', err.message);
  }

  // Generate and print Data Source Report
  dataSourceReport = await generateDataSourceReport();
  printDataSourceReport(dataSourceReport);

  // Verify registry tables exist
  if (migrationsOk && dataSourceReport.registry.tablesPresent === false) {
    console.error('FATAL: Registry tables not found after migrations');
    process.exit(1);
  }

  // Initialize WebSocket
  wsManager.initialize(server);
  app.locals.wss = wsManager;

  // Start work dispatcher (MVP: runs in-process)
  console.log('Starting work dispatcher...');
  startDispatcher({ pollIntervalMs: 2000, claimBatchSize: 3 });
  console.log('✓ Work dispatcher started');

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('\nSIGTERM received, shutting down gracefully...');
    stopDispatcher();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  // Start server
  server.listen(PORT, HOST, () => {
    console.log(`✓ Mission Control Server running at http://${HOST}:${PORT}`);
    console.log(`  Health:     http://${HOST}:${PORT}/health`);
    console.log(`  Details:    http://${HOST}:${PORT}/health/details`);
    console.log(`  Dispatcher: http://${HOST}:${PORT}/dispatcher/status`);
    console.log(`  API Base:   http://${HOST}:${PORT}/api`);
    console.log(`  WebSocket:  ws://${HOST}:${PORT}/ws`);
    console.log('\n═══════════════════════════════════════════════════════════════');
  });
}

start();
