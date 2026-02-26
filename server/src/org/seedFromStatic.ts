/**
 * Seed org chart from static data (orgChartData).
 * Idempotent: only runs if org_people is empty.
 */

import { getDb } from '../database';
import * as orgRepo from './repository';

const ADVISORY_LOCK_KEY = 0x6f726773656564; // 'orgseed' in hex

/** Static seed data matching app/lib/orgChartData initialNodes */
const SEED_PEOPLE: Array<{
  id: string;
  name: string;
  role: string;
  email: string | null;
  department: string;
  level: number;
  status: string;
  type: string;
  managerId: string | null;
  permissions: string[];
  profileFile: string | null;
  posX: number;
  posY: number;
}> = [
  { id: 'shaan', name: 'Shaan', role: 'Integration/IT Lead', email: 'shaan@arrsys.com', department: 'IT/Integration', level: 1, status: 'active', type: 'root', managerId: null, permissions: ['proactive_access'], profileFile: 'memory/profiles/shaan.md', posX: 0, posY: 0 },
  { id: 'ethan', name: 'Ethan Fleury', role: 'Lead Developer', email: 'ethan@arrsys.com', department: 'Development', level: 2, status: 'active', type: 'leaf', managerId: 'shaan', permissions: ['proactive_access', 'org_manager', 'system_admin'], profileFile: 'memory/profiles/ethan.md', posX: -150, posY: 150 },
  { id: 'cody', name: 'Cody', role: 'Team Member', email: null, department: 'Operations', level: 2, status: 'active', type: 'leaf', managerId: 'shaan', permissions: [], profileFile: 'memory/profiles/cody.md', posX: 150, posY: 150 },
];

const DEPARTMENT_COLORS: Record<string, string> = {
  'IT/Integration': '#6366f1',
  'Development': '#10b981',
  'Operations': '#f59e0b',
  'Sales': '#ec4899',
  'Marketing': '#8b5cf6',
  'Management': '#dc2626',
};

export async function seedOrgFromStaticIfEmpty(): Promise<void> {
  const pool = getDb();
  const client = await pool.connect();

  try {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [ADVISORY_LOCK_KEY]
    );
    if (!lockResult.rows[0]?.acquired) {
      return;
    }

    const countResult = await client.query('SELECT COUNT(*)::int AS count FROM org_people');
    const count = countResult.rows[0]?.count ?? 0;
    if (count > 0) {
      return;
    }

    const deptIdMap = new Map<string, string>();
    for (const [dept, color] of Object.entries(DEPARTMENT_COLORS)) {
      const id = await orgRepo.upsertDepartment(dept, color);
      deptIdMap.set(dept, id);
    }

    for (const p of SEED_PEOPLE) {
      const deptId = deptIdMap.get(p.department) ?? null;
      await orgRepo.upsertPerson({
        id: p.id,
        name: p.name,
        role: p.role,
        email: p.email,
        level: p.level,
        status: p.status,
        type: p.type,
        manager_id: p.managerId,
        permissions: p.permissions,
        profile_file: p.profileFile,
        department_id: deptId,
        pos_x: p.posX,
        pos_y: p.posY,
      });
    }

    console.log('Org chart seeded from static data');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    client.release();
  }
}
