/**
 * Work Kanban API Routes
 * Real persisted Kanban board - no mock data, no seeding.
 */

import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../database';

const router = Router();
const KanbanStatus = z.enum(['queue', 'ongoing', 'need_human', 'completed']);

const CreateItemSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  status: KanbanStatus.optional(),
  priority: z.number().int().optional(),
  agentId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateItemSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  status: KanbanStatus.optional(),
  priority: z.number().int().optional(),
  agentId: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const MoveItemSchema = z.object({
  status: KanbanStatus,
});

const CreateFromMessageSchema = z.object({
  messageId: z.string().min(1),
  text: z.string().min(1).max(5000),
  author: z.string().optional(),
  channelId: z.string().optional(),
  contextKey: z.string().optional(),
  priority: z.number().int().optional(),
});

const IngestDiscordSchema = z.object({
  messageId: z.string().min(1),
  text: z.string().min(1).max(5000),
  author: z.string().optional(),
  channelId: z.string().optional(),
  contextKey: z.string().optional(),
});

function extractTaskFromDiscordText(text: string): { title: string; priority: number } | null {
  const trimmed = text.trim();
  const m1 = trimmed.match(/^#task\s+(.+)$/i);
  const m2 = trimmed.match(/(?:^|\s)task:\s*(.+)$/i);
  const payload = (m1?.[1] || m2?.[1] || '').trim();
  if (!payload) return null;

  let priority = 0;
  let title = payload;
  if (/\s#high\b/i.test(payload)) priority = 2;
  if (/\s#low\b/i.test(payload)) priority = -1;
  title = title.replace(/\s#(?:high|medium|low)\b/gi, '').trim();
  if (!title) return null;

  return { title, priority };
}

function sendValidationError(res: import('express').Response, details: z.ZodIssue[]) {
  res.status(400).json({ error: 'validation_error', details });
}

function sendNotFound(res: import('express').Response) {
  res.status(404).json({ error: 'not_found' });
}

function sendInternalError(res: import('express').Response, err: unknown) {
  console.error('[work]', err);
  res.status(500).json({ error: 'internal_error' });
}

async function appendEvent(
  pool: import('pg').Pool,
  itemId: string,
  eventType: 'created' | 'updated' | 'moved' | 'assigned' | 'deleted',
  payload: Record<string, unknown>
) {
  await pool.query(
    `INSERT INTO work_kanban_events (item_id, event_type, payload) VALUES ($1, $2, $3)`,
    [itemId, eventType, JSON.stringify(payload)]
  );
}

// GET /work/board
router.get('/board', async (req, res) => {
  try {
    const pool = getDb();
    const contextKey = typeof req.query.contextKey === 'string' ? req.query.contextKey : undefined;

    let sql = `SELECT id, title, description, status, priority, agent_id, created_at, updated_at, metadata
       FROM work_kanban_items`;
    const params: unknown[] = [];
    if (contextKey) {
      sql += ` WHERE metadata->>'contextKey' = $1`;
      params.push(contextKey);
    }
    sql += ' ORDER BY created_at ASC';

    const result = await pool.query(sql, params);
    const items = result.rows;

    const columns = [
      { id: 'queue' as const, title: 'Queue', items: [] as typeof items },
      { id: 'ongoing' as const, title: 'Ongoing', items: [] as typeof items },
      { id: 'need_human' as const, title: 'Need Human Input', items: [] as typeof items },
      { id: 'completed' as const, title: 'Completed', items: [] as typeof items },
    ];

    const counts = { queue: 0, ongoing: 0, need_human: 0, completed: 0, total: items.length };

    for (const row of items) {
      const item = {
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        status: row.status,
        priority: row.priority ?? 0,
        agentId: row.agent_id ?? null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
        metadata: row.metadata ?? {},
      };
      const col = columns.find((c) => c.id === row.status);
      if (col) {
        col.items.push(item);
        counts[row.status as keyof typeof counts]++;
      }
    }

    res.json({ columns, counts });
  } catch (err) {
    sendInternalError(res, err);
  }
});

// GET /work/items
router.get('/items', async (req, res) => {
  try {
    const schema = z.object({
      status: KanbanStatus.optional(),
      agentId: z.string().uuid().optional(),
      contextKey: z.string().optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.errors);
      return;
    }

    const pool = getDb();
    let sql = `SELECT id, title, description, status, priority, agent_id, created_at, updated_at, metadata
               FROM work_kanban_items WHERE 1=1`;
    const params: unknown[] = [];
    let idx = 1;

    if (parsed.data.status) {
      sql += ` AND status = $${idx++}`;
      params.push(parsed.data.status);
    }
    if (parsed.data.agentId) {
      sql += ` AND agent_id = $${idx++}`;
      params.push(parsed.data.agentId);
    }
    if (parsed.data.contextKey) {
      sql += ` AND metadata->>'contextKey' = $${idx++}`;
      params.push(parsed.data.contextKey);
    }

    sql += ' ORDER BY created_at ASC';
    const result = await pool.query(sql, params);

    const items = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      status: row.status,
      priority: row.priority ?? 0,
      agentId: row.agent_id ?? null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      metadata: row.metadata ?? {},
    }));

    res.json({ items });
  } catch (err) {
    sendInternalError(res, err);
  }
});

// POST /work/ingest/discord
router.post('/ingest/discord', async (req, res) => {
  try {
    const parsed = IngestDiscordSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.errors);
      return;
    }

    const { messageId, text, author, channelId, contextKey } = parsed.data;
    const extracted = extractTaskFromDiscordText(text);
    if (!extracted) {
      return res.status(200).json({ matched: false, reason: 'no_task_pattern' });
    }

    const payload = {
      messageId,
      text: extracted.title,
      author,
      channelId,
      contextKey,
      priority: extracted.priority,
    };

    req.body = payload;
    return (router as any).handle(
      { ...req, method: 'POST', url: '/items/from-message', body: payload },
      res,
      () => undefined
    );
  } catch (err) {
    sendInternalError(res, err);
  }
});

// POST /work/items/from-message
router.post('/items/from-message', async (req, res) => {
  try {
    const parsed = CreateFromMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.errors);
      return;
    }

    const { messageId, text, author, channelId, contextKey, priority } = parsed.data;
    const pool = getDb();

    const existing = await pool.query(
      `SELECT id, title, description, status, priority, agent_id, created_at, updated_at, metadata
       FROM work_kanban_items
       WHERE metadata->>'sourceMessageId' = $1
       LIMIT 1`,
      [messageId]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return res.status(200).json({
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        status: row.status,
        priority: row.priority ?? 0,
        agentId: row.agent_id ?? null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
        metadata: row.metadata ?? {},
        existing: true,
      });
    }

    const title = text.trim().replace(/\s+/g, ' ').slice(0, 140);
    const metadata = {
      source: 'discord-message',
      sourceMessageId: messageId,
      sourceAuthor: author ?? null,
      sourceChannelId: channelId ?? null,
      contextKey: contextKey ?? (channelId ? `channel:${channelId}` : 'global'),
    };

    const result = await pool.query(
      `INSERT INTO work_kanban_items (title, description, status, priority, agent_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, description, status, priority, agent_id, created_at, updated_at, metadata`,
      [title, text, 'queue', priority ?? 0, null, JSON.stringify(metadata)]
    );

    const row = result.rows[0];
    await appendEvent(pool, row.id, 'created', { title, status: 'queue', messageId });

    return res.status(201).json({
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      status: row.status,
      priority: row.priority ?? 0,
      agentId: row.agent_id ?? null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      metadata: row.metadata ?? {},
      existing: false,
    });
  } catch (err) {
    sendInternalError(res, err);
  }
});

// POST /work/items
router.post('/items', async (req, res) => {
  try {
    const parsed = CreateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.errors);
      return;
    }

    const { title, description, status, priority, agentId, metadata } = parsed.data;
    const pool = getDb();

    const result = await pool.query(
      `INSERT INTO work_kanban_items (title, description, status, priority, agent_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, description, status, priority, agent_id, created_at, updated_at, metadata`,
      [
        title,
        description ?? null,
        status ?? 'queue',
        priority ?? 0,
        agentId ?? null,
        JSON.stringify(metadata ?? {}),
      ]
    );

    const row = result.rows[0];
    await appendEvent(pool, row.id, 'created', { title, status: status ?? 'queue' });

    const item = {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      status: row.status,
      priority: row.priority ?? 0,
      agentId: row.agent_id ?? null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      metadata: row.metadata ?? {},
    };

    res.status(201).json(item);
  } catch (err) {
    sendInternalError(res, err);
  }
});

// PATCH /work/items/:id
router.patch('/items/:id', async (req, res) => {
  try {
    const parsed = UpdateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.errors);
      return;
    }

    const { id } = req.params;
    const pool = getDb();

    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (parsed.data.title !== undefined) {
      updates.push(`title = $${idx++}`);
      params.push(parsed.data.title);
    }
    if (parsed.data.description !== undefined) {
      updates.push(`description = $${idx++}`);
      params.push(parsed.data.description);
    }
    if (parsed.data.status !== undefined) {
      updates.push(`status = $${idx++}`);
      params.push(parsed.data.status);
    }
    if (parsed.data.priority !== undefined) {
      updates.push(`priority = $${idx++}`);
      params.push(parsed.data.priority);
    }
    if (parsed.data.agentId !== undefined) {
      updates.push(`agent_id = $${idx++}`);
      params.push(parsed.data.agentId);
    }
    if (parsed.data.metadata !== undefined) {
      updates.push(`metadata = $${idx++}`);
      params.push(JSON.stringify(parsed.data.metadata));
    }

    if (updates.length === 0) {
      const existing = await pool.query(
        'SELECT id, title, description, status, priority, agent_id, created_at, updated_at, metadata FROM work_kanban_items WHERE id = $1',
        [id]
      );
      if (existing.rows.length === 0) {
        sendNotFound(res);
        return;
      }
      const row = existing.rows[0];
      return res.json({
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        status: row.status,
        priority: row.priority ?? 0,
        agentId: row.agent_id ?? null,
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
        metadata: row.metadata ?? {},
      });
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE work_kanban_items SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idx} RETURNING id, title, description, status, priority, agent_id, created_at, updated_at, metadata`,
      params
    );

    if (result.rows.length === 0) {
      sendNotFound(res);
      return;
    }

    const row = result.rows[0];
    await appendEvent(pool, id, 'updated', parsed.data);

    const item = {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      status: row.status,
      priority: row.priority ?? 0,
      agentId: row.agent_id ?? null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      metadata: row.metadata ?? {},
    };

    res.json(item);
  } catch (err) {
    sendInternalError(res, err);
  }
});

// POST /work/items/:id/move
router.post('/items/:id/move', async (req, res) => {
  try {
    const parsed = MoveItemSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.errors);
      return;
    }

    const { id } = req.params;
    const pool = getDb();

    const result = await pool.query(
      `UPDATE work_kanban_items SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING id, title, description, status, priority, agent_id, created_at, updated_at, metadata`,
      [parsed.data.status, id]
    );

    if (result.rows.length === 0) {
      sendNotFound(res);
      return;
    }

    const row = result.rows[0];
    await appendEvent(pool, id, 'moved', { status: parsed.data.status });

    const item = {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      status: row.status,
      priority: row.priority ?? 0,
      agentId: row.agent_id ?? null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      metadata: row.metadata ?? {},
    };

    res.json(item);
  } catch (err) {
    sendInternalError(res, err);
  }
});

// DELETE /work/items/:id
router.delete('/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getDb();

    const existing = await pool.query(
      'SELECT id FROM work_kanban_items WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      sendNotFound(res);
      return;
    }

    await appendEvent(pool, id, 'deleted', {});
    await pool.query('DELETE FROM work_kanban_items WHERE id = $1', [id]);

    res.status(204).end();
  } catch (err) {
    sendInternalError(res, err);
  }
});

export default router;
