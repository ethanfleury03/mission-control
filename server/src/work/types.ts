/**
 * Work Orchestration Types
 * Defines state machines, entities, and strict output schemas for managers/specialists
 */

import { z } from 'zod';

// ============================================================================
// STATE MACHINE ENUMS
// ============================================================================

export const WorkStatusEnum = z.enum([
  'queued',
  'claimed',
  'working',
  'needs_review',
  'blocked',
  'done',
  'failed',
  'canceled'
]);

export type WorkStatus = z.infer<typeof WorkStatusEnum>;

// Valid state transitions (enforced in service layer)
export const WORK_STATUS_TRANSITIONS: Record<WorkStatus, WorkStatus[]> = {
  queued: ['claimed'],
  claimed: ['working'],
  working: ['needs_review', 'blocked', 'done', 'failed'],
  blocked: ['working', 'canceled'],
  needs_review: ['working', 'done', 'failed'],
  failed: ['queued'], // retry only
  done: [], // terminal
  canceled: [] // terminal
};

export const ApprovalStatusEnum = z.enum(['requested', 'approved', 'denied', 'expired']);
export type ApprovalStatus = z.infer<typeof ApprovalStatusEnum>;

export const ExceptionTypeEnum = z.enum([
  'policy_violation',
  'missing_info',
  'low_confidence',
  'tool_error',
  'conflict',
  'unknown'
]);
export type ExceptionType = z.infer<typeof ExceptionTypeEnum>;

export const ExceptionSeverityEnum = z.enum(['low', 'medium', 'high', 'critical']);
export type ExceptionSeverity = z.infer<typeof ExceptionSeverityEnum>;

export const ExceptionStatusEnum = z.enum(['open', 'acknowledged', 'resolved', 'dismissed']);
export type ExceptionStatus = z.infer<typeof ExceptionStatusEnum>;

export const ActorTypeEnum = z.enum(['system', 'agent', 'human']);
export type ActorType = z.infer<typeof ActorTypeEnum>;

export const RequestedByTypeEnum = z.enum(['human', 'system', 'api']);
export type RequestedByType = z.infer<typeof RequestedByTypeEnum>;

// ============================================================================
// DATABASE ENTITY TYPES
// ============================================================================

export interface WorkItem {
  id: string;
  team_id: string;
  parent_work_item_id: string | null;
  status: WorkStatus;
  priority: number;
  due_at: string | null;
  requested_by_type: RequestedByType;
  requested_by_id: string | null;
  manager_agent_id: string | null;
  assignee_agent_id: string | null;
  idempotency_key: string | null;
  input: Record<string, unknown>;
  structured_output: Record<string, unknown> | null;
  raw_log: string | null;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

// Input for creating work items
export interface CreateWorkItemInput {
  team_id: string;
  input: Record<string, unknown>;
  parent_work_item_id?: string | null;
  priority?: number;
  due_at?: string | null;
  requested_by_type?: RequestedByType;
  requested_by_id?: string | null;
  idempotency_key?: string | null;
}

// Claimed work item (returned from claim operation)
export type ClaimedWorkItem = WorkItem;

export interface WorkEvent {
  id: string;
  work_item_id: string;
  event_type: string;
  actor_type: ActorType;
  actor_id: string | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  message: string | null;
  created_at: string;
}

export interface Approval {
  id: string;
  work_item_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  requested_at: string;
  resolved_at: string | null;
  requested_by: string;
  resolved_by: string | null;
  reason: string | null;
}

export interface Exception {
  id: string;
  work_item_id: string;
  type: ExceptionType;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  message: string;
  context: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// STRICT OUTPUT SCHEMAS (Managers & Specialists)
// ============================================================================

// Sub-task definition that managers output for delegation
export const SubtaskSchema = z.object({
  team_id: z.string().uuid(),
  assignee_agent_id: z.string().uuid().nullable(),
  title: z.string().min(1).max(500),
  input: z.record(z.unknown()),
  idempotency_key: z.string().min(1)
});

export type Subtask = z.infer<typeof SubtaskSchema>;

// Exception output from manager
export const ManagerExceptionSchema = z.object({
  type: ExceptionTypeEnum,
  severity: ExceptionSeverityEnum,
  message: z.string(),
  context: z.record(z.unknown()).nullable()
});

export type ManagerException = z.infer<typeof ManagerExceptionSchema>;

// STRICT: Manager output must follow this schema
export const ManagerOutputSchema = z.object({
  summary: z.string(),
  decision: z.enum(['delegate', 'final', 'needs_human', 'blocked']),
  subtasks: z.array(SubtaskSchema).max(20), // prevent abuse
  final_output: z.record(z.unknown()).nullable(),
  exceptions: z.array(ManagerExceptionSchema).max(10)
});

export type ManagerOutput = z.infer<typeof ManagerOutputSchema>;

// Artifact for specialist output
export const SpecialistArtifactSchema = z.object({
  type: z.string(),
  name: z.string(),
  content: z.union([z.string(), z.record(z.unknown())]),
  metadata: z.record(z.unknown()).optional()
});

// STRICT: Specialist output must follow this schema
export const SpecialistOutputSchema = z.object({
  summary: z.string(),
  result: z.record(z.unknown()),
  artifacts: z.array(SpecialistArtifactSchema).nullable(),
  next_actions: z.array(z.string()).nullable(),
  confidence: z.number().min(0).max(1)
});

export type SpecialistOutput = z.infer<typeof SpecialistOutputSchema>;

// ============================================================================
// API REQUEST/RESPONSE SCHEMAS
// ============================================================================

export const CreateWorkItemSchema = z.object({
  team_id: z.string().uuid(),
  input: z.record(z.unknown()),
  priority: z.number().int().min(-100).max(100).optional(),
  due_at: z.string().datetime().optional(),
  idempotency_key: z.string().min(1).max(255).optional(),
  requested_by: z.object({
    type: RequestedByTypeEnum,
    id: z.string().optional()
  }).optional(),
  parent_work_item_id: z.string().uuid().optional()
});

export const UpdateWorkItemStatusSchema = z.object({
  status: WorkStatusEnum,
  reason: z.string().optional()
});

export const AssignWorkItemSchema = z.object({
  assignee_agent_id: z.string().uuid()
});

export const CreateApprovalSchema = z.object({
  action_type: z.string(),
  payload: z.record(z.unknown())
});

export const ResolveApprovalSchema = z.object({
  decision: z.enum(['approved', 'denied']),
  resolved_by: z.string(),
  reason: z.string().optional()
});

export const CreateExceptionSchema = z.object({
  type: ExceptionTypeEnum,
  severity: ExceptionSeverityEnum,
  message: z.string(),
  context: z.record(z.unknown()).optional()
});

export const ResolveExceptionSchema = z.object({
  status: z.enum(['acknowledged', 'resolved', 'dismissed'])
});

// ============================================================================
// DISPATCHER CONFIGURATION
// ============================================================================

export interface DispatcherConfig {
  pollIntervalMs: number;
  claimBatchSize: number;
  maxConcurrentWork: number;
  workerId: string;
  maxRetries?: number;
  enableFailover?: boolean;
}

export const DEFAULT_DISPATCHER_CONFIG: Required<DispatcherConfig> = {
  pollIntervalMs: 2000,
  claimBatchSize: 5,
  maxConcurrentWork: 10,
  workerId: `worker_${Date.now()}`,
  maxRetries: 3,
  enableFailover: true
};

// ============================================================================
// TRACEABILITY LINKS
// ============================================================================

export interface TraceabilityContext {
  work_item_id: string;
  team_id: string;
  manager_agent_id: string | null;
  policy_snapshot_version: number | null;
}

// Schema for linking existing task/progress/tool_call tables
export const TraceabilityLinkSchema = z.object({
  work_item_id: z.string().uuid(),
  team_id: z.string().uuid(),
  manager_agent_id: z.string().uuid().nullable(),
  policy_snapshot_version: z.number().int().positive().nullable()
});
