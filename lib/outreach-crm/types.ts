export type OutreachDashboardSource = 'hubspot' | 'hubspot+activity' | 'hubspot+state' | 'state' | 'mock';

export type PipelineColor = 'red' | 'green' | 'amber' | 'blue' | 'muted';

export type FollowUpSeverity = 'success' | 'warning' | 'danger';

export type OutreachAgentState = 'active' | 'paused' | 'needs_setup' | 'sending' | 'blocked';

export type OutreachCampaignBucket = 'active_pool' | 'nurture' | 'terminal' | 'historical' | 'local_only' | 'inconsistent';

export type OutreachMembershipSource = 'hubspot_membership' | 'state_fallback' | 'cache' | 'unknown';

export type OutreachStageId =
  | 'drafted_ready'
  | 'initial_sent'
  | 'due_3_day_followup'
  | 'three_day_followup_sent'
  | 'due_5_day_followup'
  | 'five_day_followup_sent'
  | 'due_30_day_followup'
  | 'thirty_day_followup_sent'
  | 'replied_needs_review'
  | 'positive_meeting_path'
  | 'out_of_office_paused'
  | 'stopped_bounced_unsubscribed'
  | 'blocked_ineligible';

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
  activeCampaigns?: number;
  initialSent: number;
  emailsSentToday?: number;
  emailsSentTotal?: number;
  replies: number;
  positive: number;
  humanReview?: number;
  bouncedStopped: number;
  dueFollowUp: number;
  overdueFollowUp?: number;
  outOfOffice?: number;
  blockedIneligible?: number;
  positiveRate?: number;
  bounceRate?: number;
}

export interface PipelineSummaryItem {
  label: string;
  count: number;
  color: PipelineColor;
}

export interface FollowUpHealth {
  dueToday: number;
  overdue?: number;
  scheduled: number;
  next24h?: number;
  next7Days?: number;
  needsReview: number;
  blocked: number;
  blockedByReply?: number;
  blockedByListRemoval?: number;
  blockedByOwnerAssigned?: number;
  blockedByMaxTouches?: number;
  dueByStage?: Array<{ stage: string; count: number }>;
  dueByAgent?: Array<{ agentId: string; agentName: string; count: number }>;
  message: string;
  severity: FollowUpSeverity;
}

export interface OutreachReply {
  id: string;
  hubspotContactId?: string;
  agentId?: string;
  agentName?: string;
  agentInbox?: string;
  company: string;
  contactName: string;
  email: string;
  status: OutreachReplyStatus;
  subject?: string;
  lastReplyAt?: string;
  snippet?: string;
  classification?: string;
  confidence?: number;
  suggestedAction?: string;
  hubspotUrl?: string;
  gmailThreadUrl?: string;
}

export interface OutreachDashboardContact {
  id: string;
  hubspotContactId?: string;
  agentId?: string;
  agentName?: string;
  senderEmail?: string;
  hubspotListName?: string;
  name: string;
  email: string;
  company?: string;
  jobtitle?: string;
  phone?: string;
  stage: string;
  stageId?: OutreachStageId;
  status?: string;
  touchCount: number;
  lastOutboundAt?: string;
  nextFollowupAllowedAt?: string;
  overdue?: boolean;
  isActiveListMember?: boolean;
  isNurturedListMember?: boolean;
  campaignBucket?: OutreachCampaignBucket;
  isTerminal?: boolean;
  terminalReason?: string;
  dueNow?: boolean;
  nextActionLabel?: string;
  diagnostics?: string[];
  sourceStatePath?: string;
  membershipSource?: OutreachMembershipSource;
  replyStatus?: string;
  lastReplyAt?: string;
  lastReplySubject?: string;
  lastReplySnippet?: string;
  positiveReply: boolean;
  humanReviewRequired?: boolean;
  stopped: boolean;
  stopReason?: string;
  ownerId?: string;
  assignedTo?: string;
  isEligible?: boolean;
  ineligibilityReasons?: string[];
  hasPhone?: boolean;
  hubspotUrl?: string;
  gmailThreadUrl?: string;
}

export interface OutreachAgentHealthCheck {
  key: string;
  label: string;
  ok: boolean;
  severity: FollowUpSeverity;
  message: string;
  checkedAt?: string;
}

export interface OutreachAgentSummary {
  id: string;
  displayName: string;
  senderEmail: string;
  hubspotListName: string;
  hubspotListId?: string;
  state: OutreachAgentState;
  enabled: boolean;
  dailySendCap: number;
  sendDelaySeconds: number;
  contactsInList: number;
  activeContacts: number;
  draftedReady: number;
  sentToday: number;
  dailyCapRemaining: number;
  totalTouchesSent: number;
  replies: number;
  positiveReplies: number;
  humanReviewNeeded: number;
  bouncesStops: number;
  dueFollowUps: number;
  overdueFollowUps: number;
  lastInboxSyncAt?: string | null;
  lastHubSpotSyncAt?: string | null;
  lastSendAt?: string | null;
  currentQueueProgress?: string;
  healthChecks: OutreachAgentHealthCheck[];
}

export interface OutreachPipelineColumn {
  id: OutreachStageId;
  label: string;
  count: number;
  color: PipelineColor;
  contacts: OutreachDashboardContact[];
}

export interface OutreachQueueAgentCount {
  agentId: string;
  agentName: string;
  sentToday: number;
  remaining: number;
}

export interface OutreachSendQueueStatus {
  status: 'healthy' | 'sending' | 'paused' | 'failing' | 'inactive';
  isRunning: boolean;
  queueSize: number;
  sentCount: number;
  skippedCount: number;
  failureCount: number;
  currentDelaySeconds: number;
  perAgentCap: number;
  lastSentEmail?: string;
  lastSentContact?: string;
  lastSentCompany?: string;
  lastSentAgent?: string;
  lastSentAt?: string;
  nextExpectedSendAt?: string;
  perAgentSentToday: OutreachQueueAgentCount[];
  updatedAt?: string | null;
  message: string;
}

export interface OutreachHubSpotListHealth {
  agentId: string;
  agentName: string;
  listName: string;
  listId?: string;
  currentListSize: number;
  eligibleContacts: number;
  ineligibleContacts: number;
  missingEmail: number;
  withOwner: number;
  withAssignedTo: number;
  duplicatesAcrossAgents: number;
  bouncedStillInList: number;
  stoppedStillInList: number;
  needingCleanup: number;
  bouncedNoPhone: number;
  warnings: string[];
}

export interface OutreachDeliverabilityHealth {
  agentId: string;
  agentName: string;
  bounceRate: number;
  replyRate: number;
  positiveRate: number;
  stopRate: number;
  outOfOfficeRate: number;
  averageTimeToFirstReplyHours?: number | null;
  sendsToday: number;
  pacingCompliant: boolean;
  lastFailureReason?: string;
  warnings: string[];
}

export interface OutreachDataFreshness {
  generatedAt: string;
  lastGmailSyncAt?: string | null;
  lastHubSpotSyncAt?: string | null;
  lastSendQueueUpdateAt?: string | null;
  lastReplyMonitorRunAt?: string | null;
  staleWarnings: string[];
}

export interface OutreachMembershipSummary {
  source: OutreachMembershipSource;
  fetchedAt?: string | null;
  activeListMembers: number;
  nurturedListMembers: number;
  activeByAgent: Array<{ agentId: string; agentName: string; listName: string; count: number }>;
  warnings: string[];
}

export interface OutreachDiagnosticsSummary {
  total: number;
  byReason: Array<{ reason: string; count: number }>;
  contacts: Array<{ email: string; agentId?: string; agentName?: string; reasons: string[] }>;
}

export interface OutreachAuditSummary {
  buckets: Record<OutreachCampaignBucket, number>;
  dueNow: number;
  scheduledNext7Days: number;
  missingHubSpotId: number;
  localOnly: number;
  inconsistent: number;
  terminal: number;
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
  agents?: OutreachAgentSummary[];
  pipelineColumns?: OutreachPipelineColumn[];
  followUpHealth: FollowUpHealth;
  sendQueue?: OutreachSendQueueStatus;
  hubspotListHealth?: OutreachHubSpotListHealth[];
  deliverabilityHealth?: OutreachDeliverabilityHealth[];
  dataFreshness?: OutreachDataFreshness;
  membership?: OutreachMembershipSummary;
  diagnostics?: OutreachDiagnosticsSummary;
  audit?: OutreachAuditSummary;
  dailyReportText?: string;
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
  agent?: OutreachAgentConfig;
  daily?: Record<string, Record<string, unknown>>;
  hubspot?: Record<string, unknown>;
  replyMonitorRuns?: Array<Record<string, unknown>>;
  raw?: Record<string, unknown>;
}

export interface OutreachMembershipSnapshot {
  source: OutreachMembershipSource;
  fetchedAt?: string | null;
  activeListMemberIdsByAgent: Record<string, string[]>;
  activeListNamesByAgent?: Record<string, string>;
  nurturedListMemberIds: string[];
  nurtureListName?: string;
  nurtureListId?: string;
  warnings?: string[];
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
  agentId: string;
  agentName: string;
  senderEmail: string;
  hubspotListName: string;
  hubspotListId: string;
  dailySendCap: number;
  sendDelaySeconds: number;
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
  isActiveListMember: boolean;
  isNurturedListMember: boolean;
  campaignBucket: OutreachCampaignBucket;
  isTerminal: boolean;
  terminalReason: string;
  dueNow: boolean;
  nextActionLabel: string;
  diagnostics: string[];
  sourceStatePath: string;
  membershipSource: OutreachMembershipSource;
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
  isEligible: boolean;
  ineligibilityReasons: string[];
  hubspotCreatedAt?: string;
  hubspotUpdatedAt?: string;
  stateSyncedAt?: string;
  hubspotArchivedAt?: string;
  hubspotDeletedAt?: string;
  nurturedAt?: string;
  nurtureStatus: string;
  activeOutreachListRemovedAt?: string;
}

export interface OutreachAgentConfig {
  id: string;
  displayName: string;
  email: string;
  hubspotListName: string;
  hubspotListId?: string;
  statePath?: string;
  enabled: boolean;
  dailySendCap: number;
  sendDelaySeconds: number;
  role?: string;
  verifiedGmailOauth?: boolean;
  verifiedSignature?: boolean;
  lastSyncAt?: string | null;
}
