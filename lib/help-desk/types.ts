export const HELP_DESK_DEVELOPER_EMAIL = 'ethan@arrsys.com';

export const TICKET_STATUSES = ['open', 'in_progress', 'needs_input', 'finished'] as const;
export const TICKET_URGENCIES = ['low', 'normal', 'high', 'urgent'] as const;
export const TICKET_CATEGORIES = [
  'bug_fix',
  'new_automation',
  'dashboard_report',
  'hubspot_crm',
  'ai_prompt_workflow',
  'data_issue',
  'training_help',
  'other',
] as const;
export const TICKET_VISIBILITIES = ['private', 'team', 'company'] as const;
export const COMMENT_VISIBILITIES = ['public', 'internal'] as const;
export const AI_PLAN_STATUSES = ['generating', 'ready', 'failed'] as const;
export const ACTIVITY_EVENT_TYPES = ['create', 'update', 'status', 'comment', 'ai', 'archive'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketUrgency = (typeof TICKET_URGENCIES)[number];
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketVisibility = (typeof TICKET_VISIBILITIES)[number];
export type TicketCommentVisibility = (typeof COMMENT_VISIBILITIES)[number];
export type TicketAIPlanStatus = (typeof AI_PLAN_STATUSES)[number];
export type TicketActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export interface TicketAIPlanDTO {
  id: string;
  ticketId: string;
  status: TicketAIPlanStatus;
  summary: string;
  steps: string[];
  suggestedPrompt: string;
  filesToInspect: string[];
  questionsToAsk: string[];
  validationChecklist: string[];
  riskNotes: string[];
  errorMessage: string;
  generatedAt: string;
  generatedByModel: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketActivityEventDTO {
  id: string;
  ticketId: string;
  type: TicketActivityEventType;
  actorUserId: string;
  actorName: string;
  actorEmail: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TicketCommentDTO {
  id: string;
  ticketId: string;
  authorUserId: string;
  authorName: string;
  authorEmail: string;
  body: string;
  visibility: TicketCommentVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDTO {
  id: string;
  title: string;
  description: string;
  category: TicketCategory;
  urgency: TicketUrgency;
  status: TicketStatus;
  requestedDate: string | null;
  nextStep: string;
  businessImpact: string;
  attachmentNote: string;
  createdByUserId: string;
  createdByName: string;
  createdByEmail: string;
  requesterColor: string;
  team: string;
  assignedToEmail: string;
  visibility: TicketVisibility;
  sortOrder: number;
  archivedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  latestComment: TicketCommentDTO | null;
  aiPlan: TicketAIPlanDTO | null;
  comments?: TicketCommentDTO[];
  activity?: TicketActivityEventDTO[];
}

export interface TicketsResponse {
  tickets: TicketDTO[];
  lastUpdatedAt: string;
}

export interface TicketDetailResponse {
  ticket: TicketDTO;
}

export type DeveloperTicketsResponse = TicketsResponse;

export function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && TICKET_STATUSES.includes(value as TicketStatus);
}

export function isTicketUrgency(value: unknown): value is TicketUrgency {
  return typeof value === 'string' && TICKET_URGENCIES.includes(value as TicketUrgency);
}

export function isTicketCategory(value: unknown): value is TicketCategory {
  return typeof value === 'string' && TICKET_CATEGORIES.includes(value as TicketCategory);
}

export function isTicketVisibility(value: unknown): value is TicketVisibility {
  return typeof value === 'string' && TICKET_VISIBILITIES.includes(value as TicketVisibility);
}

export function isTicketCommentVisibility(value: unknown): value is TicketCommentVisibility {
  return typeof value === 'string' && COMMENT_VISIBILITIES.includes(value as TicketCommentVisibility);
}

export function isTicketAIPlanStatus(value: unknown): value is TicketAIPlanStatus {
  return typeof value === 'string' && AI_PLAN_STATUSES.includes(value as TicketAIPlanStatus);
}

export function isTicketActivityEventType(value: unknown): value is TicketActivityEventType {
  return typeof value === 'string' && ACTIVITY_EVENT_TYPES.includes(value as TicketActivityEventType);
}
