/**
 * Express app for Mission Control API.
 * Used by integration tests (work Kanban). Server uses its own app in server.ts.
 */
import express from 'express';
import cors from 'cors';
import { getDb } from './database';
import workBoardRoutes from './routes/work';

export const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    const db = getDb();
    await db.query('SELECT 1');
    res.json({
      status: 'ok',
      database: 'postgresql',
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'DB connection failed';
    res.status(503).json({
      status: 'error',
      database: 'unavailable',
      error: msg,
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/work', workBoardRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
