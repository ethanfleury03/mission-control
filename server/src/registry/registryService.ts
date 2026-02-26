import type { Pool, PoolClient } from 'pg';
import { getDb, withTransaction } from '../database';
import { RegistryRepository } from './repository';
import {
  teamStatusTransitions,
  memberStatusTransitions,
  teamCreateSchema,
  teamUpdateSchema,
  agentCreateSchema,
  agentUpdateSchema,
} from './schemas';
import type { TeamStatus, MemberStatus, RegistryAgent, RegistryTeam } from './types';

export class RegistryService {
  private repo: RegistryRepository;

  constructor(db: Pool = getDb()) {
    this.repo = new RegistryRepository(db);
  }

  private validateTeamStatusTransition(from: TeamStatus, to: TeamStatus): void {
    const allowed = teamStatusTransitions[from];
    if (!allowed || !allowed.includes(to)) {
      throw new Error(
        `Invalid team status transition: ${from} -> ${to}. Allowed: ${allowed?.join(', ') || 'none'}`
      );
    }
  }

  private validateMemberStatusTransition(from: MemberStatus, to: MemberStatus): void {
    const allowed = memberStatusTransitions[from];
    if (!allowed || !allowed.includes(to)) {
      throw new Error(
        `Invalid member status transition: ${from} -> ${to}. Allowed: ${allowed?.join(', ') || 'none'}`
      );
    }
  }

  async getAgents(teamId?: string): Promise<RegistryAgent[]> {
    return this.repo.listAgents(teamId);
  }

  async getAgent(id: string): Promise<RegistryAgent | null> {
    return this.repo.findAgentById(id);
  }

  async getAgentByLegacyId(legacyId: string): Promise<RegistryAgent | null> {
    const newId = await this.repo.getLegacyId(legacyId);
    return newId ? this.repo.findAgentById(newId) : this.repo.findAgentById(legacyId);
  }

  async createAgent(data: unknown, actorUserId?: string): Promise<RegistryAgent> {
    const parsed = agentCreateSchema.parse(data);
    const agent = await this.repo.createAgent({
      name: parsed.name,
      description: parsed.description,
      role: parsed.role,
      model: parsed.model,
      runtime: parsed.runtime,
      avatar_type: parsed.avatar_type,
      primary_team_id: parsed.primary_team_id ?? undefined,
      metadata: parsed.metadata,
    });
    await this.repo.appendAudit({
      actor_user_id: actorUserId,
      action: 'AGENT_CREATED',
      entity_type: 'agent',
      entity_id: agent.id,
      new_value: agent as unknown as Record<string, unknown>,
    });
    await this.repo.saveAgentVersion(agent.id, 1, agent as unknown as Record<string, unknown>, actorUserId);
    return agent;
  }

  async updateAgent(
    id: string,
    data: unknown,
    expectedVersion?: number,
    actorUserId?: string
  ): Promise<RegistryAgent> {
    const existing = await this.repo.findAgentById(id);
    if (!existing) throw new Error('Agent not found');
    const parsed = agentUpdateSchema.parse(data);
    const updated = await this.repo.updateAgent(id, parsed, expectedVersion);
    if (!updated) {
      throw new Error(`Conflict: agent was modified (expected version ${expectedVersion})`);
    }
    await this.repo.appendAudit({
      actor_user_id: actorUserId,
      action: 'AGENT_UPDATED',
      entity_type: 'agent',
      entity_id: id,
      old_value: existing as unknown as Record<string, unknown>,
      new_value: updated as unknown as Record<string, unknown>,
    });
    await this.repo.saveAgentVersion(
      id,
      updated.version,
      updated as unknown as Record<string, unknown>,
      actorUserId
    );
    return updated;
  }

  async getTeams(status?: TeamStatus): Promise<RegistryTeam[]> {
    return this.repo.listTeams(status);
  }

  async getTeam(id: string): Promise<RegistryTeam | null> {
    return this.repo.findTeamById(id);
  }

  async getTeamByLegacyId(legacyId: string): Promise<RegistryTeam | null> {
    const newId = await this.repo.getLegacyId(legacyId);
    return newId ? this.repo.findTeamById(newId) : this.repo.findTeamById(legacyId);
  }

  async createTeam(data: unknown, actorUserId?: string): Promise<RegistryTeam> {
    const parsed = teamCreateSchema.parse(data);
    const team = await this.repo.createTeam({
      name: parsed.name,
      purpose: parsed.purpose,
      description: parsed.description,
      color: parsed.color,
      primary_manager_agent_id: parsed.primary_manager_agent_id,
      metadata: parsed.metadata,
    });
    const legacyId = `team-${team.name.toLowerCase().replace(/\s+/g, '-')}`;
    await this.repo.setLegacyId(legacyId, 'team', team.id);
    await this.repo.appendAudit({
      actor_user_id: actorUserId,
      action: 'TEAM_CREATED',
      entity_type: 'team',
      entity_id: team.id,
      new_value: team as unknown as Record<string, unknown>,
    });
    await this.repo.saveTeamVersion(team.id, 1, team as unknown as Record<string, unknown>, actorUserId);
    return team;
  }

  async updateTeam(
    id: string,
    data: unknown,
    expectedVersion?: number,
    actorUserId?: string
  ): Promise<RegistryTeam> {
    const existing = await this.repo.findTeamById(id);
    if (!existing) throw new Error('Team not found');
    const parsed = teamUpdateSchema.parse(data);
    const updated = await this.repo.updateTeam(id, parsed, expectedVersion);
    if (!updated) {
      throw new Error(`Conflict: team was modified (expected version ${expectedVersion})`);
    }
    await this.repo.appendAudit({
      actor_user_id: actorUserId,
      action: 'TEAM_UPDATED',
      entity_type: 'team',
      entity_id: id,
      old_value: existing as unknown as Record<string, unknown>,
      new_value: updated as unknown as Record<string, unknown>,
    });
    await this.repo.saveTeamVersion(
      id,
      updated.version,
      updated as unknown as Record<string, unknown>,
      actorUserId
    );
    return updated;
  }

  async setTeamStatus(
    id: string,
    newStatus: TeamStatus,
    expectedVersion: number,
    actorUserId?: string
  ): Promise<RegistryTeam> {
    const existing = await this.repo.findTeamById(id);
    if (!existing) throw new Error('Team not found');
    this.validateTeamStatusTransition(existing.status, newStatus);
    if (newStatus === 'active') {
      const managers = await this.repo.listTeamManagers(id);
      if (managers.length === 0) {
        throw new Error('Team cannot be activated: must have at least one manager');
      }
      if (!existing.name || !existing.purpose) {
        throw new Error('Team cannot be activated: name and purpose required');
      }
    }
    const updated = await this.repo.setTeamStatus(id, newStatus, expectedVersion);
    if (!updated) {
      throw new Error(`Conflict: team was modified (expected version ${expectedVersion})`);
    }
    await this.repo.appendAudit({
      actor_user_id: actorUserId,
      action: 'TEAM_STATUS_CHANGED',
      entity_type: 'team',
      entity_id: id,
      old_value: { status: existing.status },
      new_value: { status: newStatus },
    });
    await this.repo.saveTeamVersion(
      id,
      updated.version,
      updated as unknown as Record<string, unknown>,
      actorUserId
    );
    return updated;
  }

  async inviteMember(
    teamId: string,
    agentId: string,
    roleInTeam: string = 'specialist',
    actorUserId?: string
  ) {
    return withTransaction(async (client: PoolClient) => {
      const txRepo = new RegistryRepository(client);
      const member = await txRepo.inviteMember(teamId, agentId, roleInTeam);
      await txRepo.appendAudit({
        actor_user_id: actorUserId,
        action: 'MEMBER_INVITED',
        entity_type: 'team_member',
        entity_id: member.id,
        new_value: member as unknown as Record<string, unknown>,
      });
      await txRepo.bumpTeamVersionAndSnapshot(teamId, actorUserId);
      return member;
    });
  }

  async setMemberStatus(
    id: string,
    newStatus: MemberStatus,
    actorUserId?: string
  ) {
    const existing = await this.repo.findTeamMember(id);
    if (!existing) throw new Error('Team member not found');
    this.validateMemberStatusTransition(existing.status, newStatus);

    return withTransaction(async (client: PoolClient) => {
      const txRepo = new RegistryRepository(client);
      const updated = await txRepo.setMemberStatus(id, newStatus);
      if (!updated) throw new Error('Failed to update member status');
      await txRepo.appendAudit({
        actor_user_id: actorUserId,
        action: 'MEMBER_STATUS_CHANGED',
        entity_type: 'team_member',
        entity_id: id,
        old_value: { status: existing.status },
        new_value: { status: newStatus },
      });
      await txRepo.bumpTeamVersionAndSnapshot(existing.team_id, actorUserId);
      return updated;
    });
  }

  async addTeamManager(
    teamId: string,
    agentId: string,
    priority: number = 0,
    actorUserId?: string
  ) {
    return withTransaction(async (client: PoolClient) => {
      const txRepo = new RegistryRepository(client);
      const manager = await txRepo.addTeamManager(teamId, agentId, priority);
      await txRepo.appendAudit({
        actor_user_id: actorUserId,
        action: 'MANAGER_ADDED',
        entity_type: 'team',
        entity_id: teamId,
        new_value: { manager_agent_id: agentId, priority },
      });
      await txRepo.bumpTeamVersionAndSnapshot(teamId, actorUserId);
      return manager;
    });
  }

  async removeTeamManager(teamId: string, agentId: string, actorUserId?: string) {
    return withTransaction(async (client: PoolClient) => {
      const txRepo = new RegistryRepository(client);
      await txRepo.removeTeamManager(teamId, agentId);
      await txRepo.appendAudit({
        actor_user_id: actorUserId,
        action: 'MANAGER_REMOVED',
        entity_type: 'team',
        entity_id: teamId,
        new_value: { removed_agent_id: agentId },
      });
      await txRepo.bumpTeamVersionAndSnapshot(teamId, actorUserId);
    });
  }

  async getManagersForTeam(teamId: string) {
    return this.repo.listTeamManagers(teamId);
  }

  /** Upsert tool policy; bumps team version when scope is team. */
  async upsertToolPolicy(data: {
    scope_type: 'global' | 'team' | 'agent';
    scope_id: string | null;
    tool_name: string;
    permission: string;
    require_approval?: boolean;
    max_cost_per_task?: number;
    rate_limit_per_minute?: number;
    constraints?: Record<string, unknown>;
  }, actorUserId?: string) {
    if (data.scope_type === 'team' && data.scope_id) {
      return withTransaction(async (client: PoolClient) => {
        const txRepo = new RegistryRepository(client);
        const policy = await txRepo.upsertToolPolicy(data);
        await txRepo.appendAudit({
          actor_user_id: actorUserId,
          action: 'TOOL_POLICY_UPSERTED',
          entity_type: 'policy',
          entity_id: policy.id,
          new_value: policy as unknown as Record<string, unknown>,
        });
        await txRepo.bumpTeamVersionAndSnapshot(data.scope_id!, actorUserId);
        return policy;
      });
    }
    return this.repo.upsertToolPolicy(data);
  }

  /** Upsert data access policy; bumps team version when scope is team. */
  async upsertDataAccessPolicy(data: {
    scope_type: 'global' | 'team' | 'agent';
    scope_id: string | null;
    resource: string;
    permission: string;
    constraints?: Record<string, unknown>;
  }, actorUserId?: string) {
    if (data.scope_type === 'team' && data.scope_id) {
      return withTransaction(async (client: PoolClient) => {
        const txRepo = new RegistryRepository(client);
        const policy = await txRepo.upsertDataAccessPolicy(data);
        await txRepo.appendAudit({
          actor_user_id: actorUserId,
          action: 'DATA_ACCESS_POLICY_UPSERTED',
          entity_type: 'policy',
          entity_id: policy.id,
          new_value: policy as unknown as Record<string, unknown>,
        });
        await txRepo.bumpTeamVersionAndSnapshot(data.scope_id!, actorUserId);
        return policy;
      });
    }
    return this.repo.upsertDataAccessPolicy(data);
  }

  async listAudit(filters?: { entity_type?: string; entity_id?: string; limit?: number }) {
    return this.repo.listAudit(filters);
  }

  getRepository(): RegistryRepository {
    return this.repo;
  }
}
