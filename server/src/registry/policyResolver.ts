import { RegistryRepository } from './repository';
import type { ToolPolicy, DataAccessPolicy, PolicyPermission } from './types';

export interface ResolvedToolPolicy {
  permission: PolicyPermission;
  require_approval: boolean;
  max_cost_per_task: number | null;
  rate_limit_per_minute: number | null;
  constraints: Record<string, unknown>;
  source: 'agent' | 'team' | 'global';
}

export interface ResolvedDataAccessPolicy {
  permission: PolicyPermission;
  constraints: Record<string, unknown>;
  source: 'agent' | 'team' | 'global';
}

/**
 * Resolve effective tool policy for an agent in a team.
 * Order: agent > team > global
 */
export async function resolveToolPolicy(
  repo: RegistryRepository,
  agentId: string,
  teamId: string,
  toolName: string
): Promise<ResolvedToolPolicy> {
  const defaultPolicy: ResolvedToolPolicy = {
    permission: 'deny',
    require_approval: false,
    max_cost_per_task: null,
    rate_limit_per_minute: null,
    constraints: {},
    source: 'global',
  };

  const [agentPolicies, teamPolicies, globalPolicies] = await Promise.all([
    repo.getToolPolicies('agent', agentId),
    repo.getToolPolicies('team', teamId),
    repo.getToolPolicies('global', null),
  ]);

  const agentPolicy = agentPolicies.find((p) => p.tool_name === toolName);
  const teamPolicy = teamPolicies.find((p) => p.tool_name === toolName);
  const globalPolicy = globalPolicies.find((p) => p.tool_name === toolName);

  if (agentPolicy) {
    return mapToolPolicy(agentPolicy, 'agent');
  }
  if (teamPolicy) {
    return mapToolPolicy(teamPolicy, 'team');
  }
  if (globalPolicy) {
    return mapToolPolicy(globalPolicy, 'global');
  }

  return defaultPolicy;
}

/**
 * Resolve effective data access policy for an agent in a team.
 * Order: agent > team > global
 */
export async function resolveDataAccessPolicy(
  repo: RegistryRepository,
  agentId: string,
  teamId: string,
  resource: string
): Promise<ResolvedDataAccessPolicy> {
  const defaultPolicy: ResolvedDataAccessPolicy = {
    permission: 'deny',
    constraints: {},
    source: 'global',
  };

  const [agentPolicies, teamPolicies, globalPolicies] = await Promise.all([
    repo.getDataAccessPolicies('agent', agentId),
    repo.getDataAccessPolicies('team', teamId),
    repo.getDataAccessPolicies('global', null),
  ]);

  const agentPolicy = agentPolicies.find((p) => p.resource === resource);
  const teamPolicy = teamPolicies.find((p) => p.resource === resource);
  const globalPolicy = globalPolicies.find((p) => p.resource === resource);

  if (agentPolicy) {
    return mapDataAccessPolicy(agentPolicy, 'agent');
  }
  if (teamPolicy) {
    return mapDataAccessPolicy(teamPolicy, 'team');
  }
  if (globalPolicy) {
    return mapDataAccessPolicy(globalPolicy, 'global');
  }

  return defaultPolicy;
}

function mapToolPolicy(p: ToolPolicy, source: 'agent' | 'team' | 'global'): ResolvedToolPolicy {
  return {
    permission: p.permission,
    require_approval: p.require_approval,
    max_cost_per_task: p.max_cost_per_task,
    rate_limit_per_minute: p.rate_limit_per_minute,
    constraints: p.constraints || {},
    source,
  };
}

function mapDataAccessPolicy(
  p: DataAccessPolicy,
  source: 'agent' | 'team' | 'global'
): ResolvedDataAccessPolicy {
  return {
    permission: p.permission,
    constraints: p.constraints || {},
    source,
  };
}
