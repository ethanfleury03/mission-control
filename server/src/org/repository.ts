/**
 * Org Chart Repository - PostgreSQL-backed
 * Single source of truth for org chart data.
 */

import { getDb } from '../database';

export interface OrgDepartment {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface OrgPerson {
  id: string;
  name: string;
  role: string;
  email: string | null;
  level: number;
  status: string;
  type: string;
  avatar: string | null;
  permissions: string | null;
  profile_file: string | null;
  department_id: string | null;
  manager_id: string | null;
  pos_x: number;
  pos_y: number;
  created_at: string;
  updated_at: string;
}

export interface OrgEventRow {
  id: string;
  type: string;
  person_id: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata: string | null;
  created_at: string;
}

export interface OrgSnapshotRow {
  id: string;
  name: string;
  description: string | null;
  data: unknown;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Ensure department exists, return id */
export async function upsertDepartment(name: string, color: string): Promise<string> {
  const db = getDb();
  const result = await db.query(
    `INSERT INTO org_departments (name, color) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color, updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [name, color]
  );
  return result.rows[0].id;
}

/** Insert or update person */
export async function upsertPerson(person: {
  id?: string;
  name: string;
  role: string;
  email?: string | null;
  level?: number;
  status?: string;
  type?: string;
  avatar?: string | null;
  permissions?: string[];
  profile_file?: string | null;
  department_id?: string | null;
  manager_id?: string | null;
  pos_x?: number;
  pos_y?: number;
}): Promise<string> {
  const db = getDb();
  const id = person.id || crypto.randomUUID();
  const perms = person.permissions ? JSON.stringify(person.permissions) : null;
  await db.query(
    `INSERT INTO org_people (id, name, role, email, level, status, type, avatar, permissions, profile_file, department_id, manager_id, pos_x, pos_y)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, role = EXCLUDED.role, email = EXCLUDED.email,
       level = EXCLUDED.level, status = EXCLUDED.status, type = EXCLUDED.type,
       avatar = EXCLUDED.avatar, permissions = EXCLUDED.permissions,
       profile_file = EXCLUDED.profile_file, department_id = EXCLUDED.department_id,
       manager_id = EXCLUDED.manager_id, pos_x = EXCLUDED.pos_x, pos_y = EXCLUDED.pos_y,
       updated_at = CURRENT_TIMESTAMP`,
    [
      id, person.name, person.role, person.email ?? null,
      person.level ?? 1, person.status ?? 'active', person.type ?? 'leaf',
      person.avatar ?? null, perms, person.profile_file ?? null,
      person.department_id ?? null, person.manager_id ?? null,
      person.pos_x ?? 0, person.pos_y ?? 0
    ]
  );
  return id;
}

/** Get all people with department names */
export async function getAllPeople(): Promise<Array<OrgPerson & { department_name?: string }>> {
  const db = getDb();
  const result = await db.query(`
    SELECT p.*, d.name AS department_name
    FROM org_people p
    LEFT JOIN org_departments d ON p.department_id = d.id
    ORDER BY p.level, p.name
  `);
  return result.rows.map(normalizePerson);
}

/** Get all departments */
export async function getAllDepartments(): Promise<OrgDepartment[]> {
  const db = getDb();
  const result = await db.query('SELECT * FROM org_departments ORDER BY name');
  return result.rows;
}

/** Get people count - for migration check */
export async function getPeopleCount(): Promise<number> {
  const db = getDb();
  const result = await db.query('SELECT COUNT(*)::int AS count FROM org_people');
  return result.rows[0]?.count ?? 0;
}

/** Add org event */
export async function addOrgEvent(event: {
  type: string;
  person_id: string;
  field?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  metadata?: string | null;
}): Promise<string> {
  const db = getDb();
  const result = await db.query(
    `INSERT INTO org_events (type, person_id, field, old_value, new_value, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      event.type, event.person_id, event.field ?? null,
      event.old_value ?? null, event.new_value ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null
    ]
  );
  return result.rows[0].id;
}

/** Get single event by id */
export async function getOrgEventById(id: string): Promise<OrgEventRow | null> {
  const db = getDb();
  const result = await db.query('SELECT * FROM org_events WHERE id = $1', [id]);
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at } as OrgEventRow;
}

/** Get events since timestamp or id */
export async function getOrgEvents(opts?: {
  since?: string;
  person_id?: string;
  type?: string;
  limit?: number;
}): Promise<OrgEventRow[]> {
  const db = getDb();
  let sql = 'SELECT * FROM org_events WHERE 1=1';
  const params: unknown[] = [];
  let p = 1;
  if (opts?.person_id) {
    sql += ` AND person_id = $${p++}`;
    params.push(opts.person_id);
  }
  if (opts?.type) {
    sql += ` AND type = $${p++}`;
    params.push(opts.type);
  }
  if (opts?.since) {
    sql += ` AND created_at > $${p++}`;
    params.push(opts.since);
  }
  sql += ' ORDER BY created_at DESC';
  if (opts?.limit) {
    sql += ` LIMIT $${p++}`;
    params.push(opts.limit);
  } else {
    sql += ' LIMIT 50';
  }
  const result = await db.query(sql, params);
  return result.rows.map(normalizeEvent);
}

/** Create snapshot */
export async function createSnapshot(data: {
  id?: string;
  name: string;
  description?: string | null;
  data: unknown;
  version?: number;
}): Promise<string> {
  const db = getDb();
  const id = data.id ?? `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await db.query(
    `INSERT INTO org_snapshots (id, name, description, data, version)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
    [id, data.name, data.description ?? null, JSON.stringify(data.data), data.version ?? 1]
  );
  return id;
}

/** Get snapshot by id */
export async function getSnapshot(id: string): Promise<OrgSnapshotRow | null> {
  const db = getDb();
  const result = await db.query(
    'SELECT * FROM org_snapshots WHERE id = $1',
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data
  };
}

/** List snapshots */
export async function listSnapshots(): Promise<Array<{ id: string; name: string; description: string | null; created_at: string; updated_at: string; version: number }>> {
  const db = getDb();
  const result = await db.query(
    'SELECT id, name, description, created_at, updated_at, version FROM org_snapshots ORDER BY updated_at DESC'
  );
  return result.rows;
}

/** Update snapshot */
export async function updateSnapshot(id: string, updates: { name?: string; description?: string; data?: unknown }): Promise<boolean> {
  const db = getDb();
  const sets: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const params: unknown[] = [];
  let p = 1;
  if (updates.name !== undefined) {
    sets.push(`name = $${p++}`);
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    sets.push(`description = $${p++}`);
    params.push(updates.description);
  }
  if (updates.data !== undefined) {
    sets.push(`data = $${p++}`);
    params.push(JSON.stringify(updates.data));
  }
  if (sets.length <= 1) return false;
  params.push(id);
  const result = await db.query(
    `UPDATE org_snapshots SET version = version + 1, ${sets.join(', ')} WHERE id = $${p}`,
    params
  );
  return (result.rowCount ?? 0) > 0;
}

/** Delete snapshot */
export async function deleteSnapshot(id: string): Promise<boolean> {
  const db = getDb();
  const result = await db.query('DELETE FROM org_snapshots WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

function normalizePerson(row: Record<string, unknown>): OrgPerson & { department_name?: string } {
  const r = { ...row } as Record<string, unknown>;
  for (const k of ['created_at', 'updated_at']) {
    if (r[k] instanceof Date) r[k] = (r[k] as Date).toISOString();
  }
  return r as unknown as OrgPerson & { department_name?: string };
}

function normalizeEvent(row: Record<string, unknown>): OrgEventRow {
  const r = { ...row } as Record<string, unknown>;
  if (r.created_at instanceof Date) r.created_at = (r.created_at as Date).toISOString();
  return r as unknown as OrgEventRow;
}
