/**
 * Adapter that provides DataManager-compatible interface for CommandExecutor,
 * delegating to RegistryService.
 */
import { RegistryService } from '../registry';
import { toLegacyAgent, toLegacyTeam } from '../registry/adapter';

export interface Agent {
  id: string;
  name: string;
  teamId: string;
  status: string;
  model: string;
  runtime: string;
  lastSeen: string;
  tokensUsed: number;
  description?: string;
  tokens?: string;
  avatarType?: string;
  isManager?: boolean;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  color: string;
  managerId?: string;
  createdAt: string;
}

export class RegistryAdapter {
  constructor(private registry: RegistryService) {}

  private async resolveTeamId(teamId: string): Promise<string> {
    return this.registry.getRepository().getLegacyId(teamId).then((id) => id ?? teamId);
  }

  async getAgents(teamId?: string): Promise<Agent[]> {
    const resolved = teamId ? await this.resolveTeamId(teamId) : undefined;
    const agents = await this.registry.getAgents(resolved);
    const repo = this.registry.getRepository();

    return Promise.all(
      agents.map(async (a) => {
        const tid = a.primary_team_id ?? '';
        const managers = tid ? await repo.listTeamManagers(tid) : [];
        const isManager = managers.some((m) => m.agent_id === a.id);
        return toLegacyAgent(a, tid, isManager) as Agent;
      })
    );
  }

  async getAgent(id: string): Promise<Agent | null> {
    let agent = await this.registry.getAgent(id);
    if (!agent) agent = await this.registry.getAgentByLegacyId(id);
    if (!agent) return null;

    const tid = agent.primary_team_id ?? '';
    const repo = this.registry.getRepository();
    const managers = tid ? await repo.listTeamManagers(tid) : [];
    const isManager = managers.some((m) => m.agent_id === agent!.id);
    return toLegacyAgent(agent, tid, isManager) as Agent;
  }

  async createAgent(data: Omit<Agent, 'id'>): Promise<Agent> {
    const teamId = await this.resolveTeamId(data.teamId);
    const agent = await this.registry.createAgent({
      name: data.name,
      model: data.model,
      runtime: data.runtime,
      description: data.description,
      avatar_type: data.avatarType || 'robot-teal',
      primary_team_id: teamId,
      tokens_used: data.tokensUsed ?? 0,
    });

    await this.registry.getRepository().inviteMember(teamId, agent.id, 'specialist');
    const member = await this.registry.getRepository().findTeamMemberByTeamAndAgent(
      teamId,
      agent.id
    );
    if (member) await this.registry.setMemberStatus(member.id, 'active');

    return toLegacyAgent(agent, teamId, false) as Agent;
  }

  async updateAgent(id: string, updates: Partial<Agent>): Promise<Agent | null> {
    let agent = await this.registry.getAgent(id);
    if (!agent) agent = await this.registry.getAgentByLegacyId(id);
    if (!agent) return null;

    const mapped: Record<string, unknown> = {};
    if (updates.name !== undefined) mapped.name = updates.name;
    if (updates.model !== undefined) mapped.model = updates.model;
    if (updates.runtime !== undefined) mapped.runtime = updates.runtime;
    if (updates.description !== undefined) mapped.description = updates.description;
    if (updates.avatarType !== undefined) mapped.avatar_type = updates.avatarType;
    if (updates.teamId !== undefined) {
      mapped.primary_team_id = await this.resolveTeamId(updates.teamId);
    }
    if (updates.tokensUsed !== undefined) mapped.tokens_used = updates.tokensUsed;

    try {
      const updated = await this.registry.updateAgent(agent.id, mapped);
      const tid = updated.primary_team_id ?? '';
      const repo = this.registry.getRepository();
      const managers = tid ? await repo.listTeamManagers(tid) : [];
      const isManager = managers.some((m) => m.agent_id === updated.id);
      return toLegacyAgent(updated, tid, isManager) as Agent;
    } catch {
      return null;
    }
  }

  async deleteAgent(id: string): Promise<boolean> {
    let agent = await this.registry.getAgent(id);
    if (!agent) agent = await this.registry.getAgentByLegacyId(id);
    if (!agent) return false;

    await this.registry.updateAgent(agent.id, { is_active: false });
    return true;
  }

  async getTeams(): Promise<Team[]> {
    const teams = await this.registry.getTeams();
    const result: Team[] = [];

    for (const t of teams) {
      const managerId = t.primary_manager_agent_id ?? undefined;
      result.push(toLegacyTeam(t, managerId) as Team);
    }
    return result;
  }

  async getTeam(id: string): Promise<Team | null> {
    let team = await this.registry.getTeam(id);
    if (!team) team = await this.registry.getTeamByLegacyId(id);
    if (!team) return null;

    const managerId = team.primary_manager_agent_id ?? undefined;
    return toLegacyTeam(team, managerId) as Team;
  }

  async createTeam(data: Omit<Team, 'id' | 'createdAt'>): Promise<Team> {
    const team = await this.registry.createTeam({
      name: data.name,
      description: data.description || '',
      color: data.color || '#22d3ee',
    });
    return toLegacyTeam(team) as Team;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | null> {
    let team = await this.registry.getTeam(id);
    if (!team) team = await this.registry.getTeamByLegacyId(id);
    if (!team) return null;

    const mapped: Record<string, unknown> = {};
    if (updates.name !== undefined) mapped.name = updates.name;
    if (updates.description !== undefined) mapped.description = updates.description;
    if (updates.color !== undefined) mapped.color = updates.color;

    try {
      const updated = await this.registry.updateTeam(team.id, mapped);
      return toLegacyTeam(updated) as Team;
    } catch {
      return null;
    }
  }

  async deleteTeam(id: string, moveAgentsToTeam?: string): Promise<boolean> {
    let team = await this.registry.getTeam(id);
    if (!team) team = await this.registry.getTeamByLegacyId(id);
    if (!team) return false;

    await this.registry.setTeamStatus(team.id, 'archived', team.version, undefined);
    if (moveAgentsToTeam) {
      const resolved = await this.resolveTeamId(moveAgentsToTeam);
      const agents = await this.registry.getAgents(team.id);
      for (const a of agents) {
        await this.registry.getRepository().updateAgent(a.id, {
          primary_team_id: resolved,
        });
      }
    }
    return true;
  }
}
