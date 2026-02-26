import fs from 'fs/promises';
import path from 'path';
import { RegistryRepository } from './repository';
import { toLegacyAgent, toLegacyTeam } from './adapter';
import type { RegistryAgent, RegistryTeam } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

export interface JsonAgent {
  id: string;
  name: string;
  teamId: string;
  isManager?: boolean;
  status?: string;
  model: string;
  runtime: string;
  lastSeen?: string;
  tokensUsed?: number;
  description?: string;
  tokens?: string;
  avatarType?: string;
}

export interface JsonTeam {
  id: string;
  name: string;
  description?: string;
  color?: string;
  managerId?: string;
  createdAt?: string;
}

export interface JsonExport {
  schema_version: number;
  exported_at: string;
  agents: JsonAgent[];
  teams: JsonTeam[];
}

/**
 * Export registry to JSON format (compatible with legacy agents.json + teams.json)
 */
export async function exportSnapshot(
  repo: RegistryRepository,
  teamId?: string
): Promise<JsonExport> {
  const teams = teamId ? [await repo.findTeamById(teamId)].filter(Boolean) : await repo.listTeams();
  const allAgents: JsonAgent[] = [];

  for (const team of teams) {
    if (!team) continue;
    const agents = teamId ? await repo.listAgents(teamId) : await repo.listAgents();
    const managers = await repo.listTeamManagers(team.id);
    const managerIds = new Set(managers.map((m) => m.agent_id));

    for (const agent of agents) {
      const tid = agent.primary_team_id ?? (teamId ?? team.id);
      if (teamId && tid !== teamId) continue;
      allAgents.push({
        id: agent.id,
        name: agent.name,
        teamId: tid,
        isManager: managerIds.has(agent.id),
        status: agent.is_active ? 'active' : 'idle',
        model: agent.model ?? 'unknown',
        runtime: agent.runtime ?? agent.model ?? 'unknown',
        lastSeen: agent.last_seen,
        tokensUsed: agent.tokens_used ?? 0,
        description: agent.description ?? undefined,
        tokens: `${((agent.tokens_used ?? 0) / 1000).toFixed(1)}K`,
        avatarType: agent.avatar_type ?? undefined,
      });
    }
  }

  const uniqueAgents = Array.from(
    new Map(allAgents.map((a) => [a.id, a])).values()
  );

  const jsonTeams: JsonTeam[] = teams.map((t) => {
    if (!t) return null;
    const primaryManager = t.primary_manager_agent_id;
    return {
      id: t.id,
      name: t.name,
      description: t.description ?? t.purpose ?? '',
      color: t.color ?? '#22d3ee',
      managerId: primaryManager ?? undefined,
      createdAt: t.created_at,
    };
  }).filter(Boolean) as JsonTeam[];

  return {
    schema_version: 2,
    exported_at: new Date().toISOString(),
    agents: uniqueAgents,
    teams: jsonTeams,
  };
}

/**
 * Import from JSON (legacy agents.json + teams.json format).
 * Upserts agents and teams, creates legacy ID mapping.
 */
export async function importFromJson(
  repo: RegistryRepository,
  agentsJson: { agents: JsonAgent[] },
  teamsJson: { teams: JsonTeam[] },
  actorUserId?: string
): Promise<{ agentsCreated: number; teamsCreated: number }> {
  const agents = agentsJson.agents ?? [];
  const teams = teamsJson.teams ?? [];
  let agentsCreated = 0;
  let teamsCreated = 0;

  const teamIdMap = new Map<string, string>();
  const agentIdMap = new Map<string, string>();

  for (const t of teams) {
    const existing = await repo.findTeamByName(t.name);
    if (existing) {
      teamIdMap.set(t.id, existing.id);
      await repo.setLegacyId(t.id, 'team', existing.id);
      continue;
    }
    const inserted = await repo.createTeam({
      name: t.name,
      description: t.description ?? '',
      color: t.color ?? '#22d3ee',
    });
    teamIdMap.set(t.id, inserted.id);
    await repo.setLegacyId(t.id, 'team', inserted.id);
    teamsCreated++;
  }

  for (const a of agents) {
    const teamUuid = teamIdMap.get(a.teamId) ?? a.teamId;
    const existing = await repo.findAgentByName(a.name);
    if (existing) {
      agentIdMap.set(a.id, existing.id);
      await repo.setLegacyId(a.id, 'agent', existing.id);
      await repo.updateAgent(existing.id, {
        model: a.model,
        runtime: a.runtime,
        primary_team_id: teamUuid,
        avatar_type: a.avatarType,
        description: a.description,
        tokens_used: a.tokensUsed ?? 0,
      });
      continue;
    }
    const inserted = await repo.createAgent({
      name: a.name,
      description: a.description,
      model: a.model,
      runtime: a.runtime,
      avatar_type: a.avatarType,
      primary_team_id: teamUuid,
      tokens_used: a.tokensUsed ?? 0,
    });
    agentIdMap.set(a.id, inserted.id);
    await repo.setLegacyId(a.id, 'agent', inserted.id);
    agentsCreated++;

    if (a.isManager) {
      const teamId = teamIdMap.get(a.teamId) ?? a.teamId;
      await repo.addTeamManager(teamId, inserted.id, 0);
      await repo.setPrimaryManager(teamId, inserted.id);
    }

    await repo.inviteMember(teamIdMap.get(a.teamId) ?? a.teamId, inserted.id, 'specialist');
    const member = await repo.findTeamMemberByTeamAndAgent(
      teamIdMap.get(a.teamId) ?? a.teamId,
      inserted.id
    );
    if (member) {
      await repo.setMemberStatus(member.id, 'active');
    }
  }

  return { agentsCreated, teamsCreated };
}

/**
 * Write export to backups directory with timestamp
 */
export async function writeBackup(exportData: JsonExport): Promise<string> {
  await fs.mkdir(BACKUPS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `snapshot_${timestamp}`;
  const agentsPath = path.join(BACKUPS_DIR, `${base}_agents.json`);
  const teamsPath = path.join(BACKUPS_DIR, `${base}_teams.json`);
  await fs.writeFile(agentsPath, JSON.stringify({ agents: exportData.agents }, null, 2), 'utf-8');
  await fs.writeFile(teamsPath, JSON.stringify({ teams: exportData.teams }, null, 2), 'utf-8');
  return base;
}
