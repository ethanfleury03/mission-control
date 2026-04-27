import type { Pool, PoolClient } from 'pg';
import { getDb } from '../database';
import type {
  RegistryAgent,
  RegistryTeam,
  RegistryTeamMember,
  RegistryTeamManager,
  TeamStatus,
  MemberStatus,
  PolicyScope,
  ToolPolicy,
  DataAccessPolicy,
} from './types';

export class RegistryRepository {
  constructor(private db: Pool | PoolClient = getDb()) {}

  // --- Agents ---
  async findAgentById(id: string): Promise<RegistryAgent | null> {
    const r = await this.db.query(
      `SELECT * FROM registry_agents WHERE id = $1`,
      [id]
    );
    return (r.rows[0] as RegistryAgent) || null;
  }

  async findAgentByName(name: string): Promise<RegistryAgent | null> {
    const r = await this.db.query(
      `SELECT * FROM registry_agents WHERE name = $1`,
      [name]
    );
    return (r.rows[0] as RegistryAgent) || null;
  }

  async listAgents(teamId?: string): Promise<RegistryAgent[]> {
    if (teamId) {
      const r = await this.db.query(
        `SELECT a.* FROM registry_agents a
         WHERE a.primary_team_id = $1
            OR EXISTS (SELECT 1 FROM registry_team_members m WHERE m.agent_id = a.id AND m.team_id = $1 AND m.status != 'removed')
         ORDER BY a.name`,
        [teamId]
      );
      return r.rows as RegistryAgent[];
    }
    const r = await this.db.query(
      `SELECT * FROM registry_agents ORDER BY name`
    );
    return r.rows as RegistryAgent[];
  }

  async createAgent(data: {
    name: string;
    description?: string;
    role?: string;
    model?: string;
    runtime?: string;
    avatar_type?: string;
    primary_team_id?: string | null;
    tokens_used?: number;
    metadata?: Record<string, unknown>;
  }): Promise<RegistryAgent> {
    const r = await this.db.query(
      `INSERT INTO registry_agents (name, description, role, model, runtime, avatar_type, primary_team_id, tokens_used, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.name,
        data.description ?? null,
        data.role ?? 'specialist',
        data.model ?? null,
        data.runtime ?? null,
        data.avatar_type ?? null,
        data.primary_team_id ?? null,
        data.tokens_used ?? 0,
        JSON.stringify(data.metadata ?? {}),
      ]
    );
    return r.rows[0] as RegistryAgent;
  }

  async updateAgent(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      role: string;
      model: string;
      runtime: string;
      avatar_type: string;
      is_active: boolean;
      primary_team_id: string | null;
      tokens_used: number;
      metadata: Record<string, unknown>;
    }>,
    expectedVersion?: number
  ): Promise<RegistryAgent | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const fields: [string, string][] = [
      ['name', 'name'],
      ['description', 'description'],
      ['role', 'role'],
      ['model', 'model'],
      ['runtime', 'runtime'],
      ['avatar_type', 'avatar_type'],
      ['is_active', 'is_active'],
      ['primary_team_id', 'primary_team_id'],
      ['tokens_used', 'tokens_used'],
      ['metadata', 'metadata'],
    ];
    for (const [key, col] of fields) {
      const v = (data as Record<string, unknown>)[key];
      if (v !== undefined) {
        updates.push(`${col} = $${idx}`);
        values.push(key === 'metadata' ? JSON.stringify(v) : v);
        idx++;
      }
    }
    if (updates.length === 0) return this.findAgentById(id);

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    updates.push(`version = version + 1`);
    const idPos = idx;
    values.push(id);
    idx++;
    let versionPos: number | null = null;
    if (expectedVersion !== undefined) {
      versionPos = idx;
      values.push(expectedVersion);
      idx++;
    }

    const setClause = updates.join(', ');
    const whereClause =
      versionPos !== null
        ? `id = $${idPos} AND version = $${versionPos}`
        : `id = $${idPos}`;

    const r = await this.db.query(
      `UPDATE registry_agents SET ${setClause} WHERE ${whereClause} RETURNING *`,
      values
    );
    return (r.rows[0] as RegistryAgent) || null;
  }

  // --- Teams ---
  async findTeamById(id: string): Promise<RegistryTeam | null> {
    const r = await this.db.query(
      `SELECT * FROM registry_teams WHERE id = $1`,
      [id]
    );
    return (r.rows[0] as RegistryTeam) || null;
  }

  async findTeamByName(name: string): Promise<RegistryTeam | null> {
    const r = await this.db.query(
      `SELECT * FROM registry_teams WHERE name = $1`,
      [name]
    );
    return (r.rows[0] as RegistryTeam) || null;
  }

  async listTeams(status?: TeamStatus): Promise<RegistryTeam[]> {
    let sql = `SELECT * FROM registry_teams ORDER BY name`;
    const params: string[] = [];
    if (status) {
      sql = `SELECT * FROM registry_teams WHERE status = $1 ORDER BY name`;
      params.push(status);
    }
    const r = await this.db.query(sql, params);
    return r.rows as RegistryTeam[];
  }

  async createTeam(data: {
    name: string;
    purpose?: string;
    description?: string;
    color?: string;
    primary_manager_agent_id?: string;
    metadata?: Record<string, unknown>;
  }): Promise<RegistryTeam> {
    const r = await this.db.query(
      `INSERT INTO registry_teams (name, purpose, description, color, primary_manager_agent_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.name,
        data.purpose ?? null,
        data.description ?? null,
        data.color ?? '#22d3ee',
        data.primary_manager_agent_id ?? null,
        JSON.stringify(data.metadata ?? {}),
      ]
    );
    return r.rows[0] as RegistryTeam;
  }

  async updateTeam(
    id: string,
    data: Partial<{
      name: string;
      purpose: string;
      description: string;
      color: string;
      primary_manager_agent_id: string | null;
      metadata: Record<string, unknown>;
    }>,
    expectedVersion?: number
  ): Promise<RegistryTeam | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    const fields: [string, string][] = [
      ['name', 'name'],
      ['purpose', 'purpose'],
      ['description', 'description'],
      ['color', 'color'],
      ['primary_manager_agent_id', 'primary_manager_agent_id'],
      ['metadata', 'metadata'],
    ];
    for (const [key, col] of fields) {
      const v = (data as Record<string, unknown>)[key];
      if (v !== undefined) {
        updates.push(`${col} = $${idx}`);
        values.push(key === 'metadata' ? JSON.stringify(v) : v);
        idx++;
      }
    }
    if (updates.length === 0) return this.findTeamById(id);

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    updates.push(`version = version + 1`);
    const idPos = idx;
    values.push(id);
    idx++;
    let versionPos: number | null = null;
    if (expectedVersion !== undefined) {
      versionPos = idx;
      values.push(expectedVersion);
      idx++;
    }

    const setClause = updates.join(', ');
    const whereClause =
      versionPos !== null
        ? `id = $${idPos} AND version = $${versionPos}`
        : `id = $${idPos}`;

    const r = await this.db.query(
      `UPDATE registry_teams SET ${setClause} WHERE ${whereClause} RETURNING *`,
      values
    );
    return (r.rows[0] as RegistryTeam) || null;
  }

  async setTeamStatus(
    id: string,
    status: TeamStatus,
    expectedVersion: number
  ): Promise<RegistryTeam | null> {
    const r = await this.db.query(
      `UPDATE registry_teams SET status = $1, updated_at = CURRENT_TIMESTAMP, version = version + 1
       WHERE id = $2 AND version = $3 RETURNING *`,
      [status, id, expectedVersion]
    );
    return (r.rows[0] as RegistryTeam) || null;
  }

  // --- Team Members ---
  async findTeamMember(id: string): Promise<RegistryTeamMember | null> {
    const r = await this.db.query(
      `SELECT * FROM registry_team_members WHERE id = $1`,
      [id]
    );
    return (r.rows[0] as RegistryTeamMember) || null;
  }

  async findTeamMemberByTeamAndAgent(
    teamId: string,
    agentId: string
  ): Promise<RegistryTeamMember | null> {
    const r = await this.db.query(
      `SELECT * FROM registry_team_members WHERE team_id = $1 AND agent_id = $2`,
      [teamId, agentId]
    );
    return (r.rows[0] as RegistryTeamMember) || null;
  }

  async listTeamMembers(teamId: string): Promise<RegistryTeamMember[]> {
    const r = await this.db.query(
      `SELECT * FROM registry_team_members WHERE team_id = $1 ORDER BY role_in_team, agent_id`,
      [teamId]
    );
    return r.rows as RegistryTeamMember[];
  }

  async inviteMember(
    teamId: string,
    agentId: string,
    roleInTeam: string = 'specialist'
  ): Promise<RegistryTeamMember> {
    const r = await this.db.query(
      `INSERT INTO registry_team_members (team_id, agent_id, role_in_team, status, invited_at)
       VALUES ($1, $2, $3, 'invited', CURRENT_TIMESTAMP)
       ON CONFLICT (team_id, agent_id) DO UPDATE SET
         role_in_team = EXCLUDED.role_in_team, status = 'invited', invited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [teamId, agentId, roleInTeam]
    );
    return r.rows[0] as RegistryTeamMember;
  }

  async setMemberStatus(
    id: string,
    status: MemberStatus,
    expectedVersion?: number
  ): Promise<RegistryTeamMember | null> {
    const timestamps: Record<string, string> = {
      invited: 'invited_at',
      active: 'activated_at',
      suspended: 'suspended_at',
      removed: 'removed_at',
    };
    const col = timestamps[status];
    const r = await this.db.query(
      `UPDATE registry_team_members SET status = $1, ${col} = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return (r.rows[0] as RegistryTeamMember) || null;
  }

  // --- Team Managers ---
  async listAllManagerAgentIds(): Promise<Set<string>> {
    const r = await this.db.query(
      `SELECT agent_id FROM registry_team_managers WHERE is_active = true`
    );
    return new Set(r.rows.map((row: { agent_id: string }) => row.agent_id));
  }

  async listTeamManagers(teamId: string): Promise<RegistryTeamManager[]> {
    const r = await this.db.query(
      `SELECT * FROM registry_team_managers WHERE team_id = $1 AND is_active ORDER BY priority`,
      [teamId]
    );
    return r.rows as RegistryTeamManager[];
  }

  async addTeamManager(
    teamId: string,
    agentId: string,
    priority: number = 0
  ): Promise<RegistryTeamManager> {
    const r = await this.db.query(
      `INSERT INTO registry_team_managers (team_id, agent_id, priority)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_id, agent_id) DO UPDATE SET priority = EXCLUDED.priority, is_active = true
       RETURNING *`,
      [teamId, agentId, priority]
    );
    return r.rows[0] as RegistryTeamManager;
  }

  async removeTeamManager(teamId: string, agentId: string): Promise<void> {
    await this.db.query(
      `UPDATE registry_team_managers SET is_active = false WHERE team_id = $1 AND agent_id = $2`,
      [teamId, agentId]
    );
  }

  async setPrimaryManager(teamId: string, agentId: string | null): Promise<void> {
    await this.db.query(
      `UPDATE registry_teams SET primary_manager_agent_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [agentId, teamId]
    );
  }

  // --- Policies ---
  async getToolPolicies(scopeType: PolicyScope, scopeId?: string | null): Promise<ToolPolicy[]> {
    const r = await this.db.query(
      `SELECT * FROM registry_tool_policies WHERE scope_type = $1 AND (scope_id = $2 OR ($2 IS NULL AND scope_id IS NULL))`,
      [scopeType, scopeId ?? null]
    );
    return r.rows as ToolPolicy[];
  }

  async getDataAccessPolicies(
    scopeType: PolicyScope,
    scopeId?: string | null
  ): Promise<DataAccessPolicy[]> {
    const r = await this.db.query(
      `SELECT * FROM registry_data_access_policies WHERE scope_type = $1 AND (scope_id = $2 OR ($2 IS NULL AND scope_id IS NULL))`,
      [scopeType, scopeId ?? null]
    );
    return r.rows as DataAccessPolicy[];
  }

  async upsertToolPolicy(data: {
    scope_type: PolicyScope;
    scope_id: string | null;
    tool_name: string;
    permission: string;
    require_approval?: boolean;
    max_cost_per_task?: number;
    rate_limit_per_minute?: number;
    constraints?: Record<string, unknown>;
  }): Promise<ToolPolicy> {
    const r = await this.db.query(
      `INSERT INTO registry_tool_policies (scope_type, scope_id, tool_name, permission, require_approval, max_cost_per_task, rate_limit_per_minute, constraints)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (scope_type, scope_id, tool_name) DO UPDATE SET
         permission = EXCLUDED.permission, require_approval = EXCLUDED.require_approval,
         max_cost_per_task = EXCLUDED.max_cost_per_task, rate_limit_per_minute = EXCLUDED.rate_limit_per_minute,
         constraints = EXCLUDED.constraints, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        data.scope_type,
        data.scope_id,
        data.tool_name,
        data.permission,
        data.require_approval ?? false,
        data.max_cost_per_task ?? null,
        data.rate_limit_per_minute ?? null,
        JSON.stringify(data.constraints ?? {}),
      ]
    );
    return r.rows[0] as ToolPolicy;
  }

  async upsertDataAccessPolicy(data: {
    scope_type: PolicyScope;
    scope_id: string | null;
    resource: string;
    permission: string;
    constraints?: Record<string, unknown>;
  }): Promise<DataAccessPolicy> {
    const r = await this.db.query(
      `INSERT INTO registry_data_access_policies (scope_type, scope_id, resource, permission, constraints)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scope_type, scope_id, resource) DO UPDATE SET
         permission = EXCLUDED.permission, constraints = EXCLUDED.constraints, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        data.scope_type,
        data.scope_id,
        data.resource,
        data.permission,
        JSON.stringify(data.constraints ?? {}),
      ]
    );
    return r.rows[0] as DataAccessPolicy;
  }

  // --- Audit ---
  async appendAudit(data: {
    actor_user_id?: string;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    old_value?: Record<string, unknown> | null;
    new_value?: Record<string, unknown> | null;
    request_context?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO registry_audit_log (actor_user_id, action, entity_type, entity_id, old_value, new_value, request_context)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        data.actor_user_id ?? null,
        data.action,
        data.entity_type,
        data.entity_id ?? null,
        data.old_value ? JSON.stringify(data.old_value) : null,
        data.new_value ? JSON.stringify(data.new_value) : null,
        JSON.stringify(data.request_context ?? {}),
      ]
    );
  }

  async listAudit(filters?: {
    entity_type?: string;
    entity_id?: string;
    limit?: number;
  }): Promise<{ rows: unknown[] }> {
    let sql = `SELECT * FROM registry_audit_log WHERE 1=1`;
    const params: unknown[] = [];
    let idx = 1;
    if (filters?.entity_type) {
      sql += ` AND entity_type = $${idx}`;
      params.push(filters.entity_type);
      idx++;
    }
    if (filters?.entity_id) {
      sql += ` AND entity_id = $${idx}`;
      params.push(filters.entity_id);
      idx++;
    }
    sql += ` ORDER BY created_at DESC`;
    if (filters?.limit) {
      sql += ` LIMIT $${idx}`;
      params.push(filters.limit);
    }
    const r = await this.db.query(sql, params);
    return { rows: r.rows };
  }

  // --- Versions ---
  async saveAgentVersion(
    agentId: string,
    version: number,
    config: Record<string, unknown>,
    createdBy?: string
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO registry_agent_versions (agent_id, version, config, created_by) VALUES ($1, $2, $3, $4)`,
      [agentId, version, JSON.stringify(config), createdBy ?? null]
    );
  }

  async saveTeamVersion(
    teamId: string,
    version: number,
    config: Record<string, unknown>,
    createdBy?: string
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO registry_team_versions (team_id, version, config, created_by) VALUES ($1, $2, $3, $4)`,
      [teamId, version, JSON.stringify(config), createdBy ?? null]
    );
  }

  /** Bump team version and write snapshot. Call after any mutation affecting the team. */
  async bumpTeamVersionAndSnapshot(
    teamId: string,
    createdBy?: string
  ): Promise<RegistryTeam> {
    const team = await this.findTeamById(teamId);
    if (!team) throw new Error('Team not found');

    const members = await this.listTeamMembers(teamId);
    const managers = await this.listTeamManagers(teamId);

    const r = await this.db.query(
      `UPDATE registry_teams SET version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [teamId]
    );
    const updated = r.rows[0] as RegistryTeam;

    const config = {
      ...updated,
      members,
      managers,
    };
    await this.saveTeamVersion(teamId, updated.version, config as unknown as Record<string, unknown>, createdBy);
    return updated;
  }

  // --- Legacy ID mapping ---
  async getLegacyId(legacyId: string): Promise<string | null> {
    const r = await this.db.query(
      `SELECT new_id FROM registry_legacy_id_map WHERE legacy_id = $1`,
      [legacyId]
    );
    return (r.rows[0]?.new_id as string) || null;
  }

  async setLegacyId(legacyId: string, entityType: string, newId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO registry_legacy_id_map (legacy_id, entity_type, new_id) VALUES ($1, $2, $3)
       ON CONFLICT (legacy_id) DO UPDATE SET new_id = EXCLUDED.new_id`,
      [legacyId, entityType, newId]
    );
  }
}
