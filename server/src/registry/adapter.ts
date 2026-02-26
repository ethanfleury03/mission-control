/**
 * Adapts registry DB format to legacy API format (agents.json / teams.json style)
 * for backward compatibility with the Mission Control UI.
 */
import type { RegistryAgent, RegistryTeam } from './types';

export interface LegacyAgent {
  id: string;
  name: string;
  teamId: string;
  isManager?: boolean;
  status: string;
  model: string;
  runtime: string;
  lastSeen: string;
  tokensUsed: number;
  description?: string;
  tokens?: string;
  avatarType?: string;
}

export interface LegacyTeam {
  id: string;
  name: string;
  description: string;
  color: string;
  managerId?: string;
  createdAt: string;
}

export function toLegacyAgent(agent: RegistryAgent, teamId: string, isManager?: boolean): LegacyAgent {
  const tokensUsed = agent.tokens_used ?? 0;
  return {
    id: agent.id,
    name: agent.name,
    teamId,
    isManager: isManager ?? false,
    status: agent.is_active ? 'active' : 'idle',
    model: agent.model ?? 'unknown',
    runtime: agent.runtime ?? agent.model ?? 'unknown',
    lastSeen: agent.last_seen ?? new Date().toISOString(),
    tokensUsed,
    description: agent.description ?? undefined,
    tokens: `${(tokensUsed / 1000).toFixed(1)}K`,
    avatarType: (agent.avatar_type as 'cat' | 'robot-teal' | 'robot-orange' | 'robot-purple') ?? undefined,
  };
}

export function toLegacyTeam(team: RegistryTeam, managerId?: string): LegacyTeam {
  return {
    id: team.id,
    name: team.name,
    description: team.description ?? team.purpose ?? '',
    color: team.color ?? '#22d3ee',
    managerId,
    createdAt: team.created_at,
  };
}
