export type OutreachDashboardSource = 'hubspot' | 'hubspot+activity' | 'hubspot+state' | 'state' | 'mock';

export type PipelineColor = 'red' | 'green' | 'amber' | 'blue' | 'muted';

export type FollowUpSeverity = 'success' | 'warning' | 'danger';

export type OutreachReplyStatus =
  | 'Positive'
  | 'Out of Office'
  | 'Needs Review'
  | 'Bounced'
  | 'Stopped'
  | 'No Reply'
  | string;

export interface OutreachKpis {
  totalContacts: number;
  active: number;
  initialSent: number;
  replies: number;
  positive: number;
  bouncedStopped: number;
  dueFollowUp: number;
}

export interface PipelineSummaryItem {
  label: string;
  count: number;
  color: PipelineColor;
}

export interface FollowUpHealth {
  dueToday: number;
  scheduled: number;
  needsReview: number;
  blocked: number;
  message: string;
  severity: FollowUpSeverity;
}

export interface OutreachReply {
  id: string;
  hubspotContactId?: string;
  company: string;
  contactName: string;
  email: string;
  status: OutreachReplyStatus;
  lastReplyAt?: string;
  snippet?: string;
  hubspotUrl?: string;
  gmailThreadUrl?: string;
}

export interface OutreachDashboardContact {
  id: string;
  hubspotContactId?: string;
  name: string;
  email: string;
  company?: string;
  jobtitle?: string;
  stage: string;
  touchCount: number;
  lastOutboundAt?: string;
  nextFollowupAllowedAt?: string;
  replyStatus?: string;
  positiveReply: boolean;
  stopped: boolean;
  stopReason?: string;
  hubspotUrl?: string;
  gmailThreadUrl?: string;
}

export interface OutreachDashboardResponse {
  generatedAt: string;
  lastSyncedAt: string | null;
  cacheSyncedAt?: string | null;
  activitySyncedAt?: string | null;
  source: OutreachDashboardSource;
  sourceWarnings?: string[];
  kpis: OutreachKpis;
  replyRate: number;
  pipelineSummary: PipelineSummaryItem[];
  followUpHealth: FollowUpHealth;
  replies: OutreachReply[];
  contacts: OutreachDashboardContact[];
}

export interface HubSpotOutreachContact {
  id: string;
  properties?: Record<string, string | null | undefined>;
  createdAt?: string;
  updatedAt?: string;
}

export type OutreachStateContact = Record<string, unknown>;

export interface OutreachStateSnapshot {
  contacts: Record<string, OutreachStateContact>;
  generatedAt?: string | null;
  sourcePath?: string;
}

export interface OutreachStateEvent {
  type?: string;
  at?: string;
  is_followup?: boolean;
  classification?: string;
  reason?: string;
  snippet?: string;
  subject?: string;
  thread_id?: string;
}

export interface NormalizedOutreachContact {
  email: string;
  hubspotContactId?: string;
  firstName: string;
  lastName: string;
  name: string;
  company: string;
  jobtitle: string;
  phone: string;
  website: string;
  lifecycleStage: string;
  leadStatus: string;
  ownerId: string;
  assignedTo: string;
  touchCount: number;
  sentAt?: string;
  lastOutboundAt?: string;
  nextFollowupAllowedAt?: string;
  replyStatus: string;
  lastReplyAt?: string;
  lastReplyFrom: string;
  lastReplySubject: string;
  lastReplySnippet: string;
  positiveReply: boolean;
  humanReviewRequired: boolean;
  humanReviewReason: string;
  stopped: boolean;
  stopReason: string;
  bounceReason: string;
  sendStatus: string;
  draftStatus: string;
  status: string;
  sourceListId: string;
  sourceList: string;
  hubspotUrl?: string;
  sentThreadId: string;
  lastReplyThreadId: string;
  threadIds: string[];
  events: OutreachStateEvent[];
  hubspotCreatedAt?: string;
  hubspotUpdatedAt?: string;
  stateSyncedAt?: string;
}
