export type TeamStatus = 'draft' | 'active' | 'paused' | 'archived';
export type MemberStatus = 'invited' | 'active' | 'suspended' | 'removed';
export type PolicyScope = 'global' | 'team' | 'agent';
export type PolicyPermission = 'deny' | 'read' | 'draft' | 'execute';

export interface RegistryAgent {
  id: string;
  name: string;
  description: string | null;
  role: string;
  model: string | null;
  system_prompt: string | null;
  system_prompt_ref: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version: number;
  last_published_at: string | null;
  metadata: Record<string, unknown>;
  runtime: string | null;
  tokens_used: number;
  avatar_type: string | null;
  last_seen: string;
  primary_team_id: string | null;
}

export interface RegistryTeam {
  id: string;
  name: string;
  purpose: string | null;
  status: TeamStatus;
  primary_manager_agent_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  previous_version_id: string | null;
  metadata: Record<string, unknown>;
  description: string | null;
  color: string;
}

export interface RegistryTeamMember {
  id: string;
  team_id: string;
  agent_id: string;
  role_in_team: string;
  status: MemberStatus;
  invited_at: string | null;
  activated_at: string | null;
  suspended_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegistryTeamManager {
  id: string;
  team_id: string;
  agent_id: string;
  priority: number;
  is_active: boolean;
}

export interface ToolPolicy {
  id: string;
  scope_type: PolicyScope;
  scope_id: string | null;
  tool_name: string;
  permission: PolicyPermission;
  require_approval: boolean;
  max_cost_per_task: number | null;
  rate_limit_per_minute: number | null;
  constraints: Record<string, unknown>;
}

export interface DataAccessPolicy {
  id: string;
  scope_type: PolicyScope;
  scope_id: string | null;
  resource: string;
  permission: PolicyPermission;
  constraints: Record<string, unknown>;
}
