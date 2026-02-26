/**
 * Work Orchestration Repository
 * Database operations for work_items, work_events
 */

import type { Pool, PoolClient } from 'pg';

/** Pool or PoolClient - both support .query() */
type Queryable = Pool | PoolClient;
import type {
  WorkItem,
  WorkEvent,
  WorkStatus,
  CreateWorkItemInput,
  ClaimedWorkItem
} from './types';

export class WorkRepository {
  constructor(private db: Pool) {}

  // ============================================================================
  // WORK ITEMS
  // ============================================================================

  async createWorkItem(
    data: CreateWorkItemInput,
    client?: Queryable
  ): Promise<WorkItem> {
    const db = client || this.db;
    const result = await db.query(
      `INSERT INTO work_items (
        team_id, parent_work_item_id, priority, due_at,
        requested_by_type, requested_by_id, idempotency_key, input
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (idempotency_key) DO UPDATE SET
        id = work_items.id  -- no-op to return existing
      RETURNING *`,
      [
        data.team_id,
        data.parent_work_item_id || null,
        data.priority ?? 0,
        data.due_at || null,
        data.requested_by_type || 'system',
        data.requested_by_id || null,
        data.idempotency_key || null,
        JSON.stringify(data.input || {})
      ]
    );
    return this.mapWorkItem(result.rows[0]);
  }

  async getWorkItemById(id: string): Promise<WorkItem | null> {
    const result = await this.db.query(
      'SELECT * FROM work_items WHERE id = $1',
      [id]
    );
    return result.rows[0] ? this.mapWorkItem(result.rows[0]) : null;
  }

  async getWorkItemByIdempotencyKey(key: string): Promise<WorkItem | null> {
    const result = await this.db.query(
      'SELECT * FROM work_items WHERE idempotency_key = $1',
      [key]
    );
    return result.rows[0] ? this.mapWorkItem(result.rows[0]) : null;
  }

  async listWorkItems(filters: {
    team_id?: string;
    status?: WorkStatus;
    assignee_agent_id?: string;
    manager_agent_id?: string;
    parent_work_item_id?: string;
    limit?: number;
  } = {}): Promise<WorkItem[]> {
    let sql = 'SELECT * FROM work_items WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (filters.team_id) {
      sql += ` AND team_id = $${idx++}`;
      params.push(filters.team_id);
    }
    if (filters.status) {
      sql += ` AND status = $${idx++}`;
      params.push(filters.status);
    }
    if (filters.assignee_agent_id) {
      sql += ` AND assignee_agent_id = $${idx++}`;
      params.push(filters.assignee_agent_id);
    }
    if (filters.manager_agent_id) {
      sql += ` AND manager_agent_id = $${idx++}`;
      params.push(filters.manager_agent_id);
    }
    if (filters.parent_work_item_id !== undefined) {
      sql += ` AND parent_work_item_id ${filters.parent_work_item_id === null ? 'IS NULL' : `= $${idx++}`}`;
      if (filters.parent_work_item_id !== null) params.push(filters.parent_work_item_id);
    }

    sql += ' ORDER BY priority DESC, created_at ASC';

    if (filters.limit) {
      sql += ` LIMIT $${idx++}`;
      params.push(filters.limit);
    }

    const result = await this.db.query(sql, params);
    return result.rows.map(this.mapWorkItem);
  }

  /**
   * Atomically claim work items using SKIP LOCKED
   * Returns claimed items with their new status
   */
  async claimNextWorkItems(
    workerId: string,
    limit: number = 1,
    client?: PoolClient
  ): Promise<ClaimedWorkItem[]> {
    const db = client || this.db;

    // Use a transaction with explicit locking
    const claimed = await db.query(
      `WITH claimable AS (
        SELECT id
        FROM work_items
        WHERE status = 'queued'
        ORDER BY priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      UPDATE work_items wi
      SET 
        status = 'claimed',
        attempt_count = attempt_count + 1,
        claimed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      FROM claimable
      WHERE wi.id = claimable.id
      RETURNING wi.*`,
      [limit]
    );

    if (claimed.rows.length === 0) return [];

    // Log claim events
    for (const row of claimed.rows) {
      await this.appendWorkEvent(
        {
          work_item_id: row.id,
          event_type: 'CLAIMED',
          actor_type: 'system',
          actor_id: workerId,
          old_value: { status: 'queued' },
          new_value: { status: 'claimed', claimed_at: new Date().toISOString() },
          message: `Claimed by worker ${workerId}`
        },
        db
      );
    }

    return claimed.rows.map(this.mapWorkItem);
  }

  async updateWorkItemStatus(
    id: string,
    newStatus: WorkStatus,
    actorType: 'system' | 'agent' | 'human',
    actorId: string | null,
    options: {
      manager_agent_id?: string;
      assignee_agent_id?: string;
      last_error?: string;
      raw_log?: string;
      structured_output?: Record<string, unknown>;
    } = {}
  ): Promise<WorkItem | null> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Get current status
      const current = await client.query(
        'SELECT status FROM work_items WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (current.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const oldStatus = current.rows[0].status;

      // Build update
      const updates: string[] = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
      const params: any[] = [newStatus];
      let idx = 2;

      if (options.manager_agent_id) {
        updates.push(`manager_agent_id = $${idx++}`);
        params.push(options.manager_agent_id);
      }
      if (options.assignee_agent_id !== undefined) {
        updates.push(`assignee_agent_id = $${idx++}`);
        params.push(options.assignee_agent_id);
      }
      if (options.last_error) {
        updates.push(`last_error = $${idx++}`);
        params.push(options.last_error);
      }
      if (options.raw_log) {
        updates.push(`raw_log = $${idx++}`);
        params.push(options.raw_log);
      }
      if (options.structured_output) {
        updates.push(`structured_output = $${idx++}`);
        params.push(JSON.stringify(options.structured_output));
      }
      if (newStatus === 'working') {
        updates.push(`started_at = COALESCE(started_at, CURRENT_TIMESTAMP)`);
      }
      if (newStatus === 'done' || newStatus === 'failed' || newStatus === 'canceled') {
        updates.push(`completed_at = CURRENT_TIMESTAMP`);
      }

      params.push(id);

      const result = await client.query(
        `UPDATE work_items SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        params
      );

      // Log event
      await this.appendWorkEvent(
        {
          work_item_id: id,
          event_type: 'STATUS_CHANGED',
          actor_type: actorType,
          actor_id: actorId,
          old_value: { status: oldStatus },
          new_value: { status: newStatus },
          message: `Status changed from ${oldStatus} to ${newStatus}`
        },
        client
      );

      await client.query('COMMIT');
      return this.mapWorkItem(result.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // WORK EVENTS (append-only)
  // ============================================================================

  async appendWorkEvent(
    event: Omit<WorkEvent, 'id' | 'created_at'>,
    client?: Queryable
  ): Promise<WorkEvent> {
    const db = client || this.db;
    const result = await db.query(
      `INSERT INTO work_events (
        work_item_id, event_type, actor_type, actor_id,
        old_value, new_value, message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        event.work_item_id,
        event.event_type,
        event.actor_type,
        event.actor_id,
        event.old_value ? JSON.stringify(event.old_value) : null,
        event.new_value ? JSON.stringify(event.new_value) : null,
        event.message
      ]
    );
    return this.mapWorkEvent(result.rows[0]);
  }

  async getWorkEvents(workItemId: string): Promise<WorkEvent[]> {
    const result = await this.db.query(
      `SELECT * FROM work_events 
       WHERE work_item_id = $1 
       ORDER BY created_at ASC`,
      [workItemId]
    );
    return result.rows.map(this.mapWorkEvent);
  }

  // ============================================================================
  // MANAGER POOL
  // ============================================================================

  async getTeamManagerPool(teamId: string): Promise<Array<{ agent_id: string; priority: number }>> {
    const result = await this.db.query(
      `SELECT agent_id, priority 
       FROM registry_team_managers 
       WHERE team_id = $1 AND is_active = true
       ORDER BY priority ASC`,
      [teamId]
    );
    return result.rows;
  }

  // ============================================================================
  // MAPPERS
  // ============================================================================

  private mapWorkItem(row: any): WorkItem {
    return {
      id: row.id,
      team_id: row.team_id,
      parent_work_item_id: row.parent_work_item_id,
      status: row.status,
      priority: row.priority,
      due_at: row.due_at,
      requested_by_type: row.requested_by_type,
      requested_by_id: row.requested_by_id,
      manager_agent_id: row.manager_agent_id,
      assignee_agent_id: row.assignee_agent_id,
      idempotency_key: row.idempotency_key,
      input: typeof row.input === 'string' ? JSON.parse(row.input) : row.input,
      structured_output: row.structured_output ? 
        (typeof row.structured_output === 'string' ? JSON.parse(row.structured_output) : row.structured_output) : null,
      raw_log: row.raw_log,
      attempt_count: row.attempt_count,
      max_attempts: row.max_attempts,
      last_error: row.last_error,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      claimed_at: row.claimed_at ? (row.claimed_at instanceof Date ? row.claimed_at.toISOString() : row.claimed_at) : null,
      started_at: row.started_at ? (row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at) : null,
      completed_at: row.completed_at ? (row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at) : null
    };
  }

  private mapWorkEvent(row: any): WorkEvent {
    return {
      id: row.id,
      work_item_id: row.work_item_id,
      event_type: row.event_type,
      actor_type: row.actor_type,
      actor_id: row.actor_id,
      old_value: row.old_value ? 
        (typeof row.old_value === 'string' ? JSON.parse(row.old_value) : row.old_value) : null,
      new_value: row.new_value ? 
        (typeof row.new_value === 'string' ? JSON.parse(row.new_value) : row.new_value) : null,
      message: row.message,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
    };
  }
}
