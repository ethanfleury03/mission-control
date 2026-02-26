import { z } from 'zod';

export const teamStatusEnum = z.enum(['draft', 'active', 'paused', 'archived']);
export const memberStatusEnum = z.enum(['invited', 'active', 'suspended', 'removed']);
export const policyScopeEnum = z.enum(['global', 'team', 'agent']);
export const policyPermissionEnum = z.enum(['deny', 'read', 'draft', 'execute']);

export const teamStatusTransitions: Record<string, string[]> = {
  draft: ['active', 'archived'],
  active: ['paused', 'archived'],
  paused: ['active', 'archived'],
  archived: [],
};

export const memberStatusTransitions: Record<string, string[]> = {
  invited: ['active', 'removed'],
  active: ['suspended', 'removed'],
  suspended: ['active', 'removed'],
  removed: [],
};

export const agentCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  role: z.string().default('specialist'),
  model: z.string().optional(),
  system_prompt: z.string().optional(),
  system_prompt_ref: z.string().optional(),
  runtime: z.string().optional(),
  avatar_type: z.string().optional(),
  primary_team_id: z.string().uuid().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export const agentUpdateSchema = agentCreateSchema.partial();

export const teamCreateSchema = z.object({
  name: z.string().min(1).max(255),
  purpose: z.string().optional(),
  description: z.string().optional(),
  color: z.string().default('#22d3ee'),
  primary_manager_agent_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const teamUpdateSchema = teamCreateSchema.partial();

export const teamMemberInviteSchema = z.object({
  agent_id: z.string().uuid(),
  role_in_team: z.string().default('specialist'),
});

export const teamManagerAddSchema = z.object({
  agent_id: z.string().uuid(),
  priority: z.number().int().min(0).default(0),
});

export const toolPolicySchema = z.object({
  scope_type: policyScopeEnum,
  scope_id: z.string().uuid().nullable(),
  tool_name: z.string().min(1),
  permission: policyPermissionEnum.default('deny'),
  require_approval: z.boolean().default(false),
  max_cost_per_task: z.number().optional(),
  rate_limit_per_minute: z.number().int().optional(),
  constraints: z.record(z.unknown()).optional(),
});

export const dataAccessPolicySchema = z.object({
  scope_type: policyScopeEnum,
  scope_id: z.string().uuid().nullable(),
  resource: z.string().min(1),
  permission: policyPermissionEnum.default('deny'),
  constraints: z.record(z.unknown()).optional(),
});
