import { readFile } from 'fs/promises';
import { isAbsolute, join } from 'path';

import { HubSpotApiError, hubspotFetch } from '@/lib/hubspot/client';
import { hubspotAccessToken, hubspotContactUrl } from '@/lib/hubspot/config';
import type {
  OutreachAuditSummary,
  OutreachAgentConfig,
  OutreachAgentSummary,
  OutreachCampaignBucket,
  OutreachDashboardContact,
  FollowUpSeverity,
  HubSpotOutreachContact,
  NormalizedOutreachContact,
  OutreachDiagnosticsSummary,
  OutreachDashboardResponse,
  OutreachDashboardSource,
  OutreachDeliverabilityHealth,
  OutreachHubSpotListHealth,
  OutreachMembershipSnapshot,
  OutreachMembershipSource,
  OutreachMembershipSummary,
  OutreachPipelineColumn,
  OutreachReply,
  OutreachReplyStatus,
  OutreachSendQueueStatus,
  OutreachStateEvent,
  OutreachStateContact,
  OutreachStateSnapshot,
  OutreachStageId,
  PipelineColor,
} from './types';

const DEFAULT_OUTREACH_WORKSPACE_ROOT = '/Users/sasha/.openclaw/workspace';
const DEFAULT_AGENTS_REGISTRY_PATH = '/Users/sasha/.openclaw/workspace/scripts/sasha_outreach/agents.json';
const DEFAULT_STATE_PATH = '/Users/sasha/.openclaw/workspace/scripts/sasha_outreach/state.json';
const DEFAULT_DASHBOARD_PATH =
  '/Users/sasha/.openclaw/workspace/scripts/sasha_outreach/run_artifacts/outreach_dashboard.json';
const DEFAULT_HUBSPOT_LIST_ID = '102';
const DEFAULT_HUBSPOT_LIST_NAME = 'Sasha-Outreach';
const DEFAULT_NURTURE_LIST_ID = '106';
const DEFAULT_NURTURE_LIST_NAME = 'Nurtured-Outreach';
const MAX_PROACTIVE_TOUCHES = 4;
const STALE_SYNC_MS = 24 * 60 * 60 * 1000;
const LIST_REFILL_TARGET = 50;
const OUTREACH_LOCAL_TIME_ZONE = 'America/New_York';
const TERMINAL_REPLY_STATUSES = new Set([
  'needs_review',
  'sensitive/needs-human',
  'positive',
  'positive_reply',
  'out_of_office',
  'ooo',
  'auto_reply',
  'bounce',
  'bounced',
  'stopped',
  'negative',
  'unsubscribe',
  'unsubscribed',
  'delivery_delay',
]);
const TERMINAL_CONTACT_STATUSES = new Set(['replied', 'positive_reply', 'stopped', 'archived', 'removed_from_list']);

export const OUTREACH_STAGE_DEFINITIONS: Array<{ id: OutreachStageId; label: string; color: PipelineColor }> = [
  { id: 'drafted_ready', label: 'Drafted / Ready', color: 'blue' },
  { id: 'initial_sent', label: 'Initial Sent', color: 'blue' },
  { id: 'due_3_day_followup', label: 'Due: 3-Day Follow-Up', color: 'amber' },
  { id: 'three_day_followup_sent', label: '3-Day Follow-Up Sent', color: 'blue' },
  { id: 'due_5_day_followup', label: 'Due: 5-Day Follow-Up', color: 'amber' },
  { id: 'five_day_followup_sent', label: '5-Day Follow-Up Sent', color: 'blue' },
  { id: 'due_30_day_followup', label: 'Due: 30-Day Final Follow-Up', color: 'amber' },
  { id: 'thirty_day_followup_sent', label: '30-Day Final Sent / Nurture Complete', color: 'muted' },
  { id: 'replied_needs_review', label: 'Replied - Needs Review', color: 'red' },
  { id: 'positive_meeting_path', label: 'Positive / Meeting Path', color: 'green' },
  { id: 'out_of_office_paused', label: 'Out of Office / Paused', color: 'amber' },
  { id: 'stopped_bounced_unsubscribed', label: 'Stopped / Bounced / Unsubscribed', color: 'red' },
  { id: 'blocked_ineligible', label: 'Blocked / Ineligible', color: 'muted' },
];

const DEFAULT_AGENT_CONFIGS: OutreachAgentConfig[] = [
  {
    id: 'sasha',
    displayName: 'Sasha',
    email: 'sasha@arrsys.com',
    hubspotListName: 'Sasha-Outreach',
    hubspotListId: '102',
    statePath: 'scripts/sasha_outreach/state.json',
    enabled: true,
    dailySendCap: 50,
    sendDelaySeconds: 65,
    role: 'existing_agent',
  },
  {
    id: 'mark',
    displayName: 'Mark',
    email: 'markodell@arrsys.com',
    hubspotListName: 'Mark-Outreach',
    hubspotListId: '103',
    statePath: 'scripts/sasha_outreach/agents/mark/state.json',
    enabled: true,
    dailySendCap: 50,
    sendDelaySeconds: 65,
    role: 'new_agent_ready_for_draft_testing',
  },
  {
    id: 'aaron',
    displayName: 'Aaron',
    email: 'aaron@arrsys.com',
    hubspotListName: 'Aaron-Outreach',
    hubspotListId: '104',
    statePath: 'scripts/sasha_outreach/agents/aaron/state.json',
    enabled: true,
    dailySendCap: 50,
    sendDelaySeconds: 65,
    role: 'new_agent_ready_for_draft_testing',
  },
  {
    id: 'jordan',
    displayName: 'Jordan',
    email: 'jordan@arrsys.com',
    hubspotListName: 'Jordan-Outreach',
    hubspotListId: '105',
    statePath: 'scripts/sasha_outreach/agents/jordan/state.json',
    enabled: true,
    dailySendCap: 50,
    sendDelaySeconds: 65,
    role: 'new_agent_ready_for_draft_testing',
  },
  {
    id: 'ashton',
    displayName: 'Ashton',
    email: 'ashton@arrsys.com',
    hubspotListName: 'Ashton-Outreach',
    hubspotListId: '107',
    statePath: 'scripts/sasha_outreach/agents/ashton/state.json',
    enabled: true,
    dailySendCap: 50,
    sendDelaySeconds: 65,
    role: 'new_agent_pending_gmail_auth_and_draft_testing',
  },
  {
    id: 'jaden',
    displayName: 'Jaden',
    email: 'jaden@arrsys.com',
    hubspotListName: 'Jaden-Outreach',
    hubspotListId: '108',
    statePath: 'scripts/sasha_outreach/agents/jaden/state.json',
    enabled: true,
    dailySendCap: 50,
    sendDelaySeconds: 65,
    role: 'new_agent_pending_gmail_auth_and_draft_testing',
  },
  {
    id: 'josh',
    displayName: 'Josh',
    email: 'josh@arrsys.com',
    hubspotListName: 'Josh-Outreach',
    hubspotListId: '109',
    statePath: 'scripts/sasha_outreach/agents/josh/state.json',
    enabled: true,
    dailySendCap: 50,
    sendDelaySeconds: 65,
    role: 'new_agent_pending_gmail_auth_and_draft_testing',
  },
  {
    id: 'tom',
    displayName: 'Tom',
    email: 'tom@arrsys.com',
    hubspotListName: 'Tom-Outreach',
    hubspotListId: '110',
    statePath: 'scripts/sasha_outreach/agents/tom/state.json',
    enabled: true,
    dailySendCap: 50,
    sendDelaySeconds: 65,
    role: 'new_agent_pending_gmail_auth_and_draft_testing',
  },
  {
    id: 'emily',
    displayName: 'Emily',
    email: 'emily@arrsys.com',
    hubspotListName: 'Emily-Outreach',
    hubspotListId: '111',
    statePath: 'scripts/sasha_outreach/agents/emily/state.json',
    enabled: true,
    dailySendCap: 50,
    sendDelaySeconds: 65,
    role: 'new_agent_pending_gmail_auth_and_draft_testing',
  },
];

const CONTACT_PROPERTIES = [
  'firstname',
  'lastname',
  'email',
  'company',
  'jobtitle',
  'phone',
  'website',
  'lifecyclestage',
  'hs_lead_status',
  'hubspot_owner_id',
  'assigned_to',
  'notes_last_contacted',
  'notes_last_updated',
  'createdate',
  'lastmodifieddate',
];

const CONTACT_PROPERTIES_WITHOUT_CUSTOM = CONTACT_PROPERTIES.filter((property) => property !== 'assigned_to');

interface HubSpotContactSearchPage {
  results?: HubSpotOutreachContact[];
  paging?: {
    next?: {
      after?: string;
    };
  };
  total?: number;
}

interface HubSpotListMembershipPage {
  results?: Array<{ recordId?: string | number }>;
  paging?: {
    next?: {
      after?: string;
    };
  };
}

interface HubSpotBatchReadResponse {
  results?: HubSpotOutreachContact[];
}

export interface BuildDashboardInput {
  hubspotContacts: HubSpotOutreachContact[];
  state: OutreachStateSnapshot | null;
  agent?: OutreachAgentConfig;
  membership?: OutreachMembershipSnapshot | null;
  now?: Date;
  sourceWarnings?: string[];
}

type NormalizedContact = NormalizedOutreachContact;
type OutreachEvent = OutreachStateEvent;

function envValue(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalString(value: unknown): string | undefined {
  const str = asString(value);
  return str || undefined;
}

function nullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function asEvents(value: unknown): OutreachEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is OutreachEvent => Boolean(item && typeof item === 'object'));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function todayKey(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OUTREACH_LOCAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function numberFromRecord(record: Record<string, unknown> | undefined, key: string): number {
  return asNumber(record?.[key]);
}

function resolveOutreachPath(path: string | undefined): string {
  const candidate = asString(path);
  if (!candidate) return DEFAULT_STATE_PATH;
  if (isAbsolute(candidate)) return candidate;
  const root = envValue('OUTREACH_CRM_WORKSPACE_ROOT') ?? DEFAULT_OUTREACH_WORKSPACE_ROOT;
  return join(root, candidate);
}

function stageIdForLabel(label: string): OutreachStageId {
  return OUTREACH_STAGE_DEFINITIONS.find((stage) => stage.label === label)?.id ?? 'drafted_ready';
}

function stageLabel(stageId: OutreachStageId): string {
  return OUTREACH_STAGE_DEFINITIONS.find((stage) => stage.id === stageId)?.label ?? 'Drafted / Ready';
}

function isDueStage(stageId: OutreachStageId): boolean {
  return stageId === 'due_3_day_followup' || stageId === 'due_5_day_followup' || stageId === 'due_30_day_followup';
}

function domainFromContact(contact: Pick<NormalizedContact, 'email' | 'website'>): string {
  const website = asString(contact.website).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (website) return website.toLowerCase();
  const emailDomain = contact.email.split('@')[1] ?? '';
  return emailDomain.toLowerCase();
}

function isStale(value: string | null | undefined, now: Date, maxAgeMs = STALE_SYNC_MS): boolean {
  const parsed = parseDate(value ?? undefined);
  if (!parsed) return true;
  return now.getTime() - parsed.getTime() > maxAgeMs;
}

export function normalizeOutreachEmail(value: unknown): string {
  return asString(value).toLowerCase();
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value: string | null | undefined): string | undefined {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString() : optionalString(value);
}

function maxIso(values: Array<string | null | undefined>): string | null {
  let best: Date | null = null;
  for (const value of values) {
    const parsed = parseDate(value ?? undefined);
    if (parsed && (!best || parsed.getTime() > best.getTime())) best = parsed;
  }
  return best?.toISOString() ?? null;
}

function addBusinessDays(date: Date, businessDays: number): Date {
  const next = new Date(date);
  let remaining = businessDays;
  while (remaining > 0) {
    next.setUTCDate(next.getUTCDate() + 1);
    const day = next.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return next;
}

function addCalendarDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function firstDefinedString(...values: unknown[]): string {
  for (const value of values) {
    const str = asString(value);
    if (str) return str;
  }
  return '';
}

function buildName(firstName: string, lastName: string, email: string, fallback = ''): string {
  const name = `${firstName} ${lastName}`.trim();
  return name || fallback || email;
}

function contactGmailThreadId(contact: NormalizedContact): string {
  return contact.lastReplyThreadId || contact.sentThreadId || contact.threadIds[0] || '';
}

function gmailThreadUrl(threadId: string): string | undefined {
  return threadId ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(threadId)}` : undefined;
}

function eventIndicatesInitialOutbound(event: OutreachEvent): boolean {
  return event.type === 'outbound' && event.is_followup !== true;
}

function eventIndicatesReply(event: OutreachEvent): boolean {
  return event.type === 'reply' || Boolean(event.classification);
}

function isPositiveLike(contact: NormalizedContact): boolean {
  const haystack = [contact.replyStatus, contact.status, contact.humanReviewReason, contact.lastReplySnippet]
    .join(' ')
    .toLowerCase();
  return contact.positiveReply || /\b(positive|interested|meeting|walkthrough|demo)\b/.test(haystack);
}

function isStoppedOrBounced(contact: NormalizedContact): boolean {
  const haystack = [contact.replyStatus, contact.status, contact.stopReason, contact.bounceReason].join(' ').toLowerCase();
  return (
    contact.stopped ||
    Boolean(contact.stopReason || contact.bounceReason) ||
    /\b(bounce|bounced|stopped|unsubscribe|unsubscribed|remove me|not interested|invalid)\b/.test(haystack)
  );
}

function hasInitialOutbound(contact: NormalizedContact): boolean {
  return (
    contact.touchCount >= 1 ||
    Boolean(contact.sentAt || contact.lastOutboundAt) ||
    (contact.events ?? []).some(eventIndicatesInitialOutbound)
  );
}

function hasReply(contact: NormalizedContact): boolean {
  const replyStatus = (contact.replyStatus ?? '').toLowerCase();
  const hasInboundEvidence = Boolean(contact.lastReplyAt || contact.lastReplySnippet || contact.lastReplySubject);
  return (
    hasInboundEvidence ||
    Boolean(contact.positiveReply && hasInboundEvidence) ||
    Boolean(contact.humanReviewRequired && hasInboundEvidence) ||
    Boolean(replyStatus && replyStatus !== 'no_reply' && replyStatus !== 'none' && hasInboundEvidence) ||
    (contact.events ?? []).some(eventIndicatesReply)
  );
}

function hasLocalNurtureMarker(contact: Partial<NormalizedContact> | OutreachStateContact): boolean {
  const record = contact as Record<string, unknown>;
  return Boolean(
    record.nurturedAt ||
      record.nurtured_at ||
      record.nurtureStatus === 'nurtured' ||
      record.nurture_status === 'nurtured' ||
      record.activeOutreachListRemovedAt ||
      record.active_outreach_list_removed_at,
  );
}

function isArchivedOrDeleted(contact: NormalizedContact): boolean {
  return Boolean(
      contact.hubspotArchivedAt ||
      contact.hubspotDeletedAt ||
      (contact.ineligibilityReasons ?? []).includes('removed_from_source_list') ||
      contact.status === 'archived' ||
      contact.status === 'removed_from_list',
  );
}

function isOutOfOfficeLike(contact: NormalizedContact): boolean {
  const replyStatus = (contact.replyStatus ?? '').toLowerCase();
  const snippet = (contact.lastReplySnippet ?? '').toLowerCase();
  return replyStatus === 'out_of_office' || replyStatus === 'ooo' || replyStatus === 'auto_reply' || /out of office|automatic reply/.test(snippet);
}

function terminalReasonForContact(contact: NormalizedContact): string {
  const replyStatus = (contact.replyStatus ?? '').toLowerCase();
  const status = (contact.status ?? '').toLowerCase();
  if (isStoppedOrBounced(contact)) {
    return /bounce|bounced|undeliverable|invalid|delivery failed/.test(
      [contact.replyStatus, contact.stopReason, contact.bounceReason, contact.lastReplySnippet].join(' ').toLowerCase(),
    )
      ? 'bounce'
      : 'stopped_or_unsubscribed';
  }
  if (isPositiveLike(contact)) return 'positive_reply';
  if (contact.humanReviewRequired || replyStatus === 'sensitive/needs-human') return 'needs_human_review';
  if (isOutOfOfficeLike(contact)) return 'out_of_office';
  if (isArchivedOrDeleted(contact)) return 'archived_or_deleted';
  if (TERMINAL_REPLY_STATUSES.has(replyStatus)) return replyStatus;
  if (TERMINAL_CONTACT_STATUSES.has(status)) return status;
  if (hasReply(contact)) return 'replied';
  return '';
}

function dueDateFromCadence(contact: NormalizedContact): string | undefined {
  if (contact.nextFollowupAllowedAt) return contact.nextFollowupAllowedAt;
  const anchor = parseDate(contact.lastOutboundAt || contact.sentAt);
  if (!anchor || contact.touchCount <= 0 || contact.touchCount >= MAX_PROACTIVE_TOUCHES) return undefined;
  if (contact.touchCount === 1) return addBusinessDays(anchor, 3).toISOString();
  if (contact.touchCount === 2) return addCalendarDays(anchor, 5).toISOString();
  if (contact.touchCount === 3) return addCalendarDays(anchor, 30).toISOString();
  return undefined;
}

export function isDueForFollowUp(contact: NormalizedContact, now = new Date()): boolean {
  if (contact.isTerminal ?? Boolean(terminalReasonForContact(contact))) return false;
  const replyStatus = (contact.replyStatus ?? '').toLowerCase();
  if (replyStatus && replyStatus !== 'no_reply' && replyStatus !== 'none') return false;
  if (contact.touchCount <= 0 || contact.touchCount >= MAX_PROACTIVE_TOUCHES) return false;
  if (contact.touchCount === 3 && !contact.isNurturedListMember && !hasLocalNurtureMarker(contact)) return false;
  if (contact.membershipSource === 'hubspot_membership') {
    if ((contact.touchCount === 1 || contact.touchCount === 2) && !contact.isActiveListMember) return false;
  }
  const dueDate = parseDate(dueDateFromCadence(contact));
  return Boolean(dueDate && dueDate.getTime() <= now.getTime());
}

function membershipIdSet(ids: string[] | undefined): Set<string> {
  return new Set((ids ?? []).map((id) => id.trim()).filter(Boolean));
}

function localActiveListFallback(contact: {
  hubspotArchivedAt?: string;
  hubspotDeletedAt?: string;
  sourceList: string;
  agent?: OutreachAgentConfig;
  state: OutreachStateContact;
}): boolean {
  if (contact.hubspotArchivedAt || contact.hubspotDeletedAt || hasLocalNurtureMarker(contact.state)) return false;
  return Boolean(contact.sourceList && contact.agent?.hubspotListName && contact.sourceList === contact.agent.hubspotListName);
}

function contactMembership(input: {
  hubspotContactId: string;
  sourceList: string;
  state: OutreachStateContact;
  agent?: OutreachAgentConfig;
  membership?: OutreachMembershipSnapshot | null;
  hubspotArchivedAt?: string;
  hubspotDeletedAt?: string;
}): { isActiveListMember: boolean; isNurturedListMember: boolean; source: OutreachMembershipSource } {
  const { hubspotContactId, membership, agent } = input;
  if (membership?.source === 'hubspot_membership' || membership?.source === 'cache') {
    const activeIds = membershipIdSet(agent?.id ? membership.activeListMemberIdsByAgent[agent.id] : undefined);
    const nurturedIds = membershipIdSet(membership.nurturedListMemberIds);
    return {
      isActiveListMember: Boolean(hubspotContactId && activeIds.has(hubspotContactId)),
      isNurturedListMember: Boolean(hubspotContactId && nurturedIds.has(hubspotContactId)),
      source: 'hubspot_membership',
    };
  }
  return {
    isActiveListMember: localActiveListFallback(input),
    isNurturedListMember: hasLocalNurtureMarker(input.state),
    source: membership?.source ?? 'state_fallback',
  };
}

function campaignBucketForContact(contact: NormalizedContact): OutreachCampaignBucket {
  if (contact.isActiveListMember && contact.isNurturedListMember) return 'inconsistent';
  if (contact.isTerminal) return 'terminal';
  if (contact.isNurturedListMember || hasLocalNurtureMarker(contact) || (contact.touchCount >= 3 && !contact.isActiveListMember)) {
    return 'nurture';
  }
  if (contact.isActiveListMember) return 'active_pool';
  if (contact.membershipSource === 'hubspot_membership' && contact.hubspotContactId) return 'historical';
  return 'local_only';
}

function nextActionLabelForContact(contact: NormalizedContact, now: Date): string {
  if (contact.isTerminal) {
    switch (contact.terminalReason) {
      case 'positive_reply':
        return 'Route to meeting path';
      case 'needs_human_review':
        return 'Human review required';
      case 'out_of_office':
        return 'Paused for out-of-office';
      case 'bounce':
        return 'Suppressed after bounce';
      case 'archived_or_deleted':
        return 'HubSpot archived/deleted';
      default:
        return 'No proactive outreach';
    }
  }
  if (contact.dueNow) {
    if (contact.touchCount === 1) return 'Send 3-day follow-up';
    if (contact.touchCount === 2) return 'Send 5-day follow-up';
    if (contact.touchCount === 3) return 'Send 30-day nurture follow-up';
  }
  const due = parseDate(dueDateFromCadence(contact));
  if (contact.touchCount <= 0) return 'Ready for initial outreach';
  if (contact.touchCount >= MAX_PROACTIVE_TOUCHES) return 'Max proactive touches reached';
  if (due && due.getTime() > now.getTime()) return `Waiting until ${formatShortDate(due)}`;
  if (contact.campaignBucket === 'historical') return 'Historical contact; not in active/nurture list';
  if (contact.campaignBucket === 'local_only') return 'Awaiting list membership confirmation';
  return 'Monitor campaign state';
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: OUTREACH_LOCAL_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function contactDiagnostics(contact: NormalizedContact, now: Date): string[] {
  const diagnostics: string[] = [];
  if (!contact.hubspotContactId) diagnostics.push('missing_hubspot_id');
  if (contact.isActiveListMember && contact.isNurturedListMember) diagnostics.push('active_and_nurtured_membership_conflict');
  if (contact.isActiveListMember && contact.touchCount >= 3 && !contact.isTerminal) diagnostics.push('touch_3_plus_still_in_active_list');
  if (
    contact.membershipSource === 'hubspot_membership' &&
    contact.hubspotContactId &&
    !contact.isActiveListMember &&
    !contact.isNurturedListMember &&
    !contact.isTerminal
  ) {
    diagnostics.push('contact_absent_from_expected_lists');
  }
  if (contact.touchCount > 0 && contact.touchCount < MAX_PROACTIVE_TOUCHES && !contact.nextFollowupAllowedAt && !contact.isTerminal) {
    diagnostics.push('missing_next_followup_allowed_at');
  }
  if (contact.stateSyncedAt && isStale(contact.stateSyncedAt, now)) diagnostics.push('state_sync_stale');
  if (isArchivedOrDeleted(contact) && (contact.isActiveListMember || contact.isNurturedListMember)) diagnostics.push('archived_contact_still_in_list');
  return Array.from(new Set(diagnostics));
}

function contactIneligibilityReasons(contact: NormalizedContact): string[] {
  const reasons: string[] = [];
  if (!contact.email) reasons.push('missing_email');
  if (contact.ownerId) reasons.push('hubspot_owner_present');
  if (contact.assignedTo) reasons.push('assigned_to_present');
  if (contact.status === 'archived' || contact.status === 'removed_from_list') reasons.push('removed_from_source_list');
  return reasons;
}

export function deriveOutreachStage(contact: NormalizedContact, now = new Date()): string {
  const replyStatus = contact.replyStatus;
  const ineligibilityReasons = contact.ineligibilityReasons ?? contactIneligibilityReasons(contact);
  const isEligible = contact.isEligible ?? ineligibilityReasons.length === 0;
  const hardBlocked = ineligibilityReasons.some((reason) => reason === 'missing_email' || reason === 'removed_from_source_list');
  const hasStartedOutreach = hasInitialOutbound(contact);
  const terminalReason = contact.terminalReason || terminalReasonForContact(contact);

  if (terminalReason === 'bounce' || terminalReason === 'stopped_or_unsubscribed' || terminalReason === 'negative' || terminalReason === 'unsubscribe') {
    return 'Stopped / Bounced / Unsubscribed';
  }
  if (terminalReason === 'positive_reply') return 'Positive / Meeting Path';
  if (terminalReason === 'needs_human_review' || terminalReason === 'delivery_delay' || terminalReason === 'replied') return 'Replied - Needs Review';
  if (terminalReason === 'out_of_office') return 'Out of Office / Paused';
  if (replyStatus && replyStatus !== 'bounce' && replyStatus !== 'no_reply') return 'Replied - Needs Review';
  if (hardBlocked) return 'Blocked / Ineligible';

  if (isDueForFollowUp(contact, now)) {
    if (contact.touchCount === 1) return 'Due: 3-Day Follow-Up';
    if (contact.touchCount === 2) return 'Due: 5-Day Follow-Up';
    if (contact.touchCount === 3) return 'Due: 30-Day Final Follow-Up';
  }

  // Owner/assigned fields affect automation eligibility, not the historical drip
  // lifecycle. Once outreach has started, keep the contact in its real touch stage
  // so Mission Control does not hide followed-up contacts as merely ineligible.
  if (!isEligible && !hasStartedOutreach) return 'Blocked / Ineligible';
  if (contact.touchCount <= 0) return contact.draftStatus ? 'Drafted / Ready' : 'Drafted / Ready';
  if (contact.touchCount === 1) return 'Initial Sent';
  if (contact.touchCount === 2) return '3-Day Follow-Up Sent';
  if (contact.touchCount === 3) return '5-Day Follow-Up Sent';
  return '30-Day Final Sent / Nurture Complete';
}

function deriveReplyStatus(contact: NormalizedContact): OutreachReplyStatus {
  const replyStatus = (contact.replyStatus ?? '').toLowerCase();
  if (isStoppedOrBounced(contact) && replyStatus.includes('bounce')) return 'Bounced';
  if (isStoppedOrBounced(contact)) return replyStatus.includes('bounce') ? 'Bounced' : 'Stopped';
  if (isPositiveLike(contact)) return 'Positive';
  if (contact.humanReviewRequired || replyStatus === 'sensitive/needs-human') return 'Needs Review';
  if (replyStatus === 'out_of_office') return 'Out of Office';
  if (replyStatus === 'delivery_delay') return 'Needs Review';
  if (replyStatus && replyStatus !== 'bounce' && replyStatus !== 'no_reply') return 'Needs Review';
  return 'No Reply';
}

function replySortKey(reply: OutreachReply): number {
  switch (reply.status) {
    case 'Needs Review':
      return 0;
    case 'Positive':
      return 1;
    case 'Out of Office':
      return 3;
    case 'Bounced':
    case 'Stopped':
      return 4;
    default:
      return 2;
  }
}

function toHubSpotContactMap(contacts: HubSpotOutreachContact[]) {
  const map = new Map<string, HubSpotOutreachContact>();
  for (const contact of contacts) {
    const email = normalizeOutreachEmail(contact.properties?.email);
    if (email) map.set(email, contact);
  }
  return map;
}

export function normalizeOutreachContact(
  email: string,
  stateContact: OutreachStateContact | undefined,
  hubspot: HubSpotOutreachContact | undefined,
  agent?: OutreachAgentConfig,
  membership?: OutreachMembershipSnapshot | null,
  sourceStatePath = '',
  now = new Date(),
): NormalizedContact {
  const props = hubspot?.properties ?? {};
  const state = stateContact ?? {};
  const normalizedEmail = normalizeOutreachEmail(firstDefinedString(props.email, state.email, email));
  const firstName = firstDefinedString(props.firstname, state.first_name, state.firstname);
  const lastName = firstDefinedString(props.lastname, state.last_name, state.lastname);
  const stateName = firstDefinedString(state.name);
  const hubspotId = hubspot?.id || firstDefinedString(state.hubspot_contact_id);
  const hubspotUrl = firstDefinedString(state.hubspot_url) || (hubspotId ? hubspotContactUrl(hubspotId) ?? '' : '');
  const lastOutboundAt = firstDefinedString(state.last_outbound_at, state.sent_at);
  const nextFollowupAllowedAt = firstDefinedString(state.next_followup_allowed_at);
  const events = asEvents(state.events);
  const ownerId = firstDefinedString(props.hubspot_owner_id, state.hubspot_owner_id);
  const assignedTo = firstDefinedString(props.assigned_to, state.assigned_to);
  const status = firstDefinedString(state.status);
  const stopped = asBoolean(state.stopped) || status === 'stopped';
  const sourceListId = firstDefinedString(state.source_list_id, agent?.hubspotListId);
  const sourceList = firstDefinedString(state.source_list, agent?.hubspotListName);
  const hubspotArchivedAt = iso(firstDefinedString(state.hubspot_archived_at));
  const hubspotDeletedAt = iso(firstDefinedString(state.hubspot_deleted_at));
  const nurturedAt = iso(firstDefinedString(state.nurtured_at));
  const activeOutreachListRemovedAt = iso(firstDefinedString(state.active_outreach_list_removed_at));
  const membershipState = contactMembership({
    hubspotContactId: hubspotId,
    sourceList,
    state,
    agent,
    membership,
    hubspotArchivedAt,
    hubspotDeletedAt,
  });
  const ineligibilityReasons: string[] = [];
  if (!normalizedEmail) ineligibilityReasons.push('missing_email');
  if (ownerId) ineligibilityReasons.push('hubspot_owner_present');
  if (assignedTo) ineligibilityReasons.push('assigned_to_present');
  if (hubspotArchivedAt || hubspotDeletedAt) ineligibilityReasons.push('removed_from_source_list');

  const normalized: NormalizedContact = {
    agentId: firstDefinedString(state.agent_id, agent?.id, 'sasha'),
    agentName: firstDefinedString(agent?.displayName, state.agent_name, 'Sasha'),
    senderEmail: firstDefinedString(state.sender_email, agent?.email, 'sasha@arrsys.com'),
    hubspotListName: sourceList || DEFAULT_HUBSPOT_LIST_NAME,
    hubspotListId: sourceListId || DEFAULT_HUBSPOT_LIST_ID,
    dailySendCap: agent?.dailySendCap ?? 50,
    sendDelaySeconds: agent?.sendDelaySeconds ?? 65,
    email: normalizedEmail,
    hubspotContactId: hubspotId || undefined,
    firstName,
    lastName,
    name: buildName(firstName, lastName, normalizedEmail, stateName),
    company: firstDefinedString(props.company, state.company),
    jobtitle: firstDefinedString(props.jobtitle, state.jobtitle),
    phone: firstDefinedString(props.phone, state.phone),
    website: firstDefinedString(props.website, state.website),
    lifecycleStage: firstDefinedString(props.lifecyclestage, state.lifecyclestage),
    leadStatus: firstDefinedString(props.hs_lead_status, state.hs_lead_status),
    ownerId,
    assignedTo,
    touchCount: asNumber(state.touch_count),
    sentAt: iso(firstDefinedString(state.sent_at)),
    lastOutboundAt: iso(lastOutboundAt),
    nextFollowupAllowedAt: iso(nextFollowupAllowedAt),
    isActiveListMember: membershipState.isActiveListMember,
    isNurturedListMember: membershipState.isNurturedListMember,
    campaignBucket: 'local_only',
    isTerminal: false,
    terminalReason: '',
    dueNow: false,
    nextActionLabel: '',
    diagnostics: [],
    sourceStatePath,
    membershipSource: membershipState.source,
    replyStatus: firstDefinedString(state.reply_status),
    lastReplyAt: iso(firstDefinedString(state.last_reply_at)),
    lastReplyFrom: firstDefinedString(state.last_reply_from),
    lastReplySubject: firstDefinedString(state.last_reply_subject),
    lastReplySnippet: firstDefinedString(state.last_reply_snippet),
    positiveReply: asBoolean(state.positive_reply),
    humanReviewRequired: asBoolean(state.human_review_required),
    humanReviewReason: firstDefinedString(state.human_review_reason),
    stopped,
    stopReason: firstDefinedString(state.stop_reason),
    bounceReason: firstDefinedString(state.bounce_reason),
    sendStatus: firstDefinedString(state.send_status),
    draftStatus: firstDefinedString(state.draft_status),
    status,
    sourceListId,
    sourceList,
    hubspotUrl: hubspotUrl || undefined,
    sentThreadId: firstDefinedString(state.sent_thread_id),
    lastReplyThreadId: firstDefinedString(state.last_reply_thread_id),
    threadIds: asStringArray(state.thread_ids),
    events,
    isEligible: ineligibilityReasons.length === 0 && !stopped,
    ineligibilityReasons,
    hubspotCreatedAt: iso(firstDefinedString(props.createdate, hubspot?.createdAt)),
    hubspotUpdatedAt: iso(firstDefinedString(props.lastmodifieddate, hubspot?.updatedAt)),
    stateSyncedAt: iso(firstDefinedString(state.synced_from_hubspot_at)),
    hubspotArchivedAt,
    hubspotDeletedAt,
    nurturedAt,
    nurtureStatus: firstDefinedString(state.nurture_status),
    activeOutreachListRemovedAt,
  };
  normalized.terminalReason = terminalReasonForContact(normalized);
  normalized.isTerminal = Boolean(normalized.terminalReason);
  normalized.dueNow = isDueForFollowUp(normalized, now);
  normalized.campaignBucket = campaignBucketForContact(normalized);
  normalized.nextActionLabel = nextActionLabelForContact(normalized, now);
  normalized.diagnostics = contactDiagnostics(normalized, now);
  return normalized;
}

function toDashboardContact(contact: NormalizedContact, now: Date): OutreachDashboardContact {
  const threadId = contactGmailThreadId(contact);
  const stage = deriveOutreachStage(contact, now);
  const nextFollowupAllowedAt = dueDateFromCadence(contact);
  const dueAt = parseDate(nextFollowupAllowedAt);
  return {
    id: contact.hubspotContactId ?? contact.email,
    hubspotContactId: contact.hubspotContactId,
    agentId: contact.agentId,
    agentName: contact.agentName,
    senderEmail: contact.senderEmail,
    hubspotListName: contact.hubspotListName,
    name: contact.name,
    email: contact.email,
    company: contact.company || undefined,
    jobtitle: contact.jobtitle || undefined,
    phone: contact.phone || undefined,
    stage,
    stageId: stageIdForLabel(stage),
    status: contact.status || undefined,
    touchCount: contact.touchCount,
    lastOutboundAt: contact.lastOutboundAt,
    nextFollowupAllowedAt,
    overdue: Boolean(contact.dueNow && dueAt && todayKey(dueAt) < todayKey(now)),
    isActiveListMember: contact.isActiveListMember,
    isNurturedListMember: contact.isNurturedListMember,
    campaignBucket: contact.campaignBucket,
    isTerminal: contact.isTerminal,
    terminalReason: contact.terminalReason || undefined,
    dueNow: contact.dueNow,
    nextActionLabel: contact.nextActionLabel,
    diagnostics: contact.diagnostics,
    sourceStatePath: contact.sourceStatePath || undefined,
    membershipSource: contact.membershipSource,
    replyStatus: contact.replyStatus || undefined,
    lastReplyAt: contact.lastReplyAt,
    lastReplySubject: contact.lastReplySubject || undefined,
    lastReplySnippet: contact.lastReplySnippet || undefined,
    positiveReply: isPositiveLike(contact),
    humanReviewRequired: contact.humanReviewRequired,
    stopped: isStoppedOrBounced(contact),
    stopReason: contact.stopReason || contact.bounceReason || undefined,
    ownerId: contact.ownerId || undefined,
    assignedTo: contact.assignedTo || undefined,
    isEligible: contact.isEligible,
    ineligibilityReasons: contact.ineligibilityReasons,
    hasPhone: Boolean(contact.phone),
    hubspotUrl: contact.hubspotUrl,
    gmailThreadUrl: gmailThreadUrl(threadId),
  };
}

function suggestedReplyAction(contact: NormalizedContact): string {
  const status = deriveReplyStatus(contact);
  if (status === 'Positive') return 'Route to meeting path';
  if (status === 'Out of Office') return 'Pause until return window';
  if (status === 'Bounced') return 'Stop and clean up HubSpot';
  if (status === 'Stopped') return 'Keep suppressed';
  if (status === 'Needs Review') return 'Human review before any reply';
  return 'Archive/no action';
}

function toReply(contact: NormalizedContact): OutreachReply | null {
  if (!hasReply(contact)) return null;
  const threadId = contactGmailThreadId(contact);
  return {
    id: contact.hubspotContactId ?? contact.email,
    hubspotContactId: contact.hubspotContactId,
    agentId: contact.agentId,
    agentName: contact.agentName,
    agentInbox: contact.senderEmail,
    company: contact.company || 'Unknown company',
    contactName: contact.name,
    email: contact.email,
    status: deriveReplyStatus(contact),
    subject: contact.lastReplySubject || undefined,
    lastReplyAt: contact.lastReplyAt,
    snippet: contact.lastReplySnippet || contact.stopReason || contact.bounceReason || contact.lastReplySubject || undefined,
    classification: contact.replyStatus || undefined,
    suggestedAction: suggestedReplyAction(contact),
    hubspotUrl: contact.hubspotUrl,
    gmailThreadUrl: gmailThreadUrl(threadId),
  };
}

function sourceFor(hubspotCount: number, stateCount: number): OutreachDashboardSource {
  if (hubspotCount > 0 && stateCount > 0) return 'hubspot+state';
  if (hubspotCount > 0) return 'hubspot';
  if (stateCount > 0) return 'state';
  return 'mock';
}

function pipelineItem(label: string, count: number, color: PipelineColor) {
  return { label, count, color };
}

function followUpSeverity(dueFollowUp: number): FollowUpSeverity {
  if (dueFollowUp <= 0) return 'success';
  if (dueFollowUp < 5) return 'warning';
  return 'danger';
}

function sentTodayFromSnapshot(snapshot: OutreachStateSnapshot | undefined, agentContacts: NormalizedContact[], now: Date): number {
  const daily = snapshot?.daily?.[todayKey(now)];
  const recorded = numberFromRecord(daily, 'outbound_count');
  if (recorded > 0) return recorded;
  return agentContacts.filter((contact) => {
    const outboundAt = parseDate(contact.lastOutboundAt || contact.sentAt);
    return Boolean(outboundAt && todayKey(outboundAt) === todayKey(now));
  }).length;
}

function latestReplyMonitorRun(snapshot: OutreachStateSnapshot | undefined): string | null {
  return maxIso((snapshot?.replyMonitorRuns ?? []).map((run) => asString(run.at)));
}

function latestHubSpotSync(snapshot: OutreachStateSnapshot | undefined, agentContacts: NormalizedContact[]): string | null {
  return maxIso([
    asString(snapshot?.hubspot?.last_sync_at),
    snapshot?.agent?.lastSyncAt ?? null,
    ...agentContacts.map((contact) => contact.stateSyncedAt),
  ]);
}

function latestSend(agentContacts: NormalizedContact[]): string | null {
  return maxIso(agentContacts.map((contact) => contact.lastOutboundAt || contact.sentAt));
}

function healthCheck(
  key: string,
  label: string,
  ok: boolean,
  message: string,
  severity: FollowUpSeverity = ok ? 'success' : 'warning',
  checkedAt?: string | null,
) {
  return { key, label, ok, severity, message, checkedAt: checkedAt ?? undefined };
}

function buildAgentSummaries(
  agents: OutreachAgentConfig[],
  snapshots: OutreachStateSnapshot[],
  contacts: NormalizedContact[],
  dashboardContacts: OutreachDashboardContact[],
  now: Date,
): OutreachAgentSummary[] {
  return agents.map((agent) => {
    const snapshot = snapshots.find((item) => item.agent?.id === agent.id);
    const agentContacts = contacts.filter((contact) => contact.agentId === agent.id);
    const agentDashboardContacts = dashboardContacts.filter((contact) => contact.agentId === agent.id);
    const sentToday = sentTodayFromSnapshot(snapshot, agentContacts, now);
    const lastInboxSyncAt = latestReplyMonitorRun(snapshot);
    const lastHubSpotSyncAt = latestHubSpotSync(snapshot, agentContacts);
    const lastSendAt = latestSend(agentContacts);
    const recentlySent = Boolean(lastSendAt && now.getTime() - (parseDate(lastSendAt)?.getTime() ?? 0) < 30 * 60 * 1000);
    const hasContacts = agentContacts.length > 0;
    const hasQueueFailure = agentDashboardContacts.some((contact) => String(contact.stopReason || '').toLowerCase().includes('failure'));
    const healthChecks = [
      healthCheck(
        'gmail_oauth',
        'Gmail OAuth',
        agent.verifiedGmailOauth !== false,
        agent.verifiedGmailOauth === false ? 'Needs verification' : 'Healthy',
        agent.verifiedGmailOauth === false ? 'danger' : 'success',
      ),
      healthCheck(
        'signature',
        'Signature',
        agent.verifiedSignature !== false,
        agent.verifiedSignature === false ? 'Missing or unverified' : 'Present',
        agent.verifiedSignature === false ? 'danger' : 'success',
      ),
      healthCheck(
        'hubspot',
        'HubSpot list',
        !isStale(lastHubSpotSyncAt, now),
        isStale(lastHubSpotSyncAt, now) ? 'Sync stale' : 'Synced',
        isStale(lastHubSpotSyncAt, now) ? 'warning' : 'success',
        lastHubSpotSyncAt,
      ),
      healthCheck(
        'reply_monitor',
        'Reply monitor',
        !hasContacts || !isStale(lastInboxSyncAt, now),
        !hasContacts ? 'No active state yet' : isStale(lastInboxSyncAt, now) ? 'No recent monitor run' : 'Healthy',
        hasContacts && isStale(lastInboxSyncAt, now) ? 'warning' : 'success',
        lastInboxSyncAt,
      ),
      healthCheck(
        'send_queue',
        'Send queue',
        !hasQueueFailure,
        hasQueueFailure ? 'Failures recorded' : 'No queue failure recorded',
        hasQueueFailure ? 'warning' : 'success',
      ),
    ];
    const bouncesStops = agentDashboardContacts.filter((contact) => contact.stageId === 'stopped_bounced_unsubscribed').length;
    const dueFollowUps = agentDashboardContacts.filter((contact) => isDueStage(contact.stageId ?? 'drafted_ready')).length;

    return {
      id: agent.id,
      displayName: agent.displayName,
      senderEmail: agent.email,
      hubspotListName: agent.hubspotListName,
      hubspotListId: agent.hubspotListId,
      state: recentlySent ? 'sending' : agent.enabled ? 'active' : hasContacts ? 'paused' : 'needs_setup',
      enabled: agent.enabled,
      dailySendCap: agent.dailySendCap,
      sendDelaySeconds: agent.sendDelaySeconds,
      contactsInList:
        agentDashboardContacts.filter((contact) => contact.isActiveListMember).length ||
        numberFromRecord(snapshot?.hubspot, 'list_size') ||
        agentContacts.length,
      activeContacts: agentDashboardContacts.filter((contact) => contact.campaignBucket === 'active_pool').length,
      draftedReady: agentDashboardContacts.filter((contact) => contact.stageId === 'drafted_ready').length,
      sentToday,
      dailyCapRemaining: Math.max(0, agent.dailySendCap - sentToday),
      totalTouchesSent: agentContacts.reduce((sum, contact) => sum + contact.touchCount, 0),
      replies: agentContacts.filter(hasReply).length,
      positiveReplies: agentContacts.filter(isPositiveLike).length,
      humanReviewNeeded: agentContacts.filter(
        (contact) => contact.humanReviewRequired || (hasReply(contact) && stageIdForLabel(deriveOutreachStage(contact, now)) === 'replied_needs_review'),
      ).length,
      bouncesStops,
      dueFollowUps: agentDashboardContacts.filter((contact) => contact.dueNow && isDueStage(contact.stageId ?? 'drafted_ready')).length,
      overdueFollowUps: agentDashboardContacts.filter((contact) => contact.overdue && isDueStage(contact.stageId ?? 'drafted_ready')).length,
      lastInboxSyncAt,
      lastHubSpotSyncAt,
      lastSendAt,
      currentQueueProgress: dueFollowUps > 0 ? `${dueFollowUps} follow-ups due` : `${Math.max(0, agent.dailySendCap - sentToday)} sends remaining`,
      healthChecks,
    };
  });
}

function buildPipelineColumns(dashboardContacts: OutreachDashboardContact[]): OutreachPipelineColumn[] {
  return OUTREACH_STAGE_DEFINITIONS.map((stage) => {
    const contacts = dashboardContacts
      .filter((contact) => (contact.stageId ?? stageIdForLabel(contact.stage)) === stage.id)
      .sort((a, b) => {
        const aDue = parseDate(a.nextFollowupAllowedAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bDue = parseDate(b.nextFollowupAllowedAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aDue - bDue || (a.company ?? '').localeCompare(b.company ?? '');
      });
    return {
      ...stage,
      count: contacts.length,
      contacts: contacts.slice(0, 12),
    };
  });
}

function addDiagnostic(contact: OutreachDashboardContact, reason: string) {
  contact.diagnostics = Array.from(new Set([...(contact.diagnostics ?? []), reason]));
  if (
    reason.includes('conflict') ||
    reason.includes('duplicate') ||
    reason === 'touch_3_plus_still_in_active_list' ||
    reason === 'archived_contact_still_in_list'
  ) {
    contact.campaignBucket = 'inconsistent';
  }
}

function applyCrossContactDiagnostics(dashboardContacts: OutreachDashboardContact[]): OutreachDashboardContact[] {
  const byEmail = new Map<string, OutreachDashboardContact[]>();
  const byHubSpot = new Map<string, OutreachDashboardContact[]>();
  for (const contact of dashboardContacts) {
    const email = normalizeOutreachEmail(contact.email);
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), contact]);
    if (contact.hubspotContactId) byHubSpot.set(contact.hubspotContactId, [...(byHubSpot.get(contact.hubspotContactId) ?? []), contact]);
  }
  for (const contact of dashboardContacts) {
    const emailMatches = byEmail.get(normalizeOutreachEmail(contact.email)) ?? [];
    if (emailMatches.length > 1) addDiagnostic(contact, 'duplicate_email_across_agents');
    const idMatches = contact.hubspotContactId ? byHubSpot.get(contact.hubspotContactId) ?? [] : [];
    if (idMatches.length > 1) addDiagnostic(contact, 'duplicate_hubspot_id_across_agents');
    if (
      (contact.diagnostics ?? []).some(
        (reason) =>
          reason.includes('conflict') ||
          reason.includes('duplicate') ||
          reason === 'touch_3_plus_still_in_active_list' ||
          reason === 'archived_contact_still_in_list',
      )
    ) {
      contact.campaignBucket = 'inconsistent';
    }
  }
  return dashboardContacts;
}

function buildDuplicateMaps(contacts: NormalizedContact[]) {
  const byEmail = new Map<string, Set<string>>();
  const byHubSpot = new Map<string, Set<string>>();
  const byDomain = new Map<string, Set<string>>();
  for (const contact of contacts) {
    if (contact.email) {
      const set = byEmail.get(contact.email) ?? new Set<string>();
      set.add(contact.agentId);
      byEmail.set(contact.email, set);
    }
    if (contact.hubspotContactId) {
      const set = byHubSpot.get(contact.hubspotContactId) ?? new Set<string>();
      set.add(contact.agentId);
      byHubSpot.set(contact.hubspotContactId, set);
    }
    const domain = domainFromContact(contact);
    if (domain) {
      const set = byDomain.get(domain) ?? new Set<string>();
      set.add(contact.agentId);
      byDomain.set(domain, set);
    }
  }
  return { byEmail, byHubSpot, byDomain };
}

function hasCrossAgentDuplicate(contact: NormalizedContact, maps: ReturnType<typeof buildDuplicateMaps>): boolean {
  const domain = domainFromContact(contact);
  return Boolean(
    (contact.email && (maps.byEmail.get(contact.email)?.size ?? 0) > 1) ||
      (contact.hubspotContactId && (maps.byHubSpot.get(contact.hubspotContactId)?.size ?? 0) > 1) ||
      (domain && (maps.byDomain.get(domain)?.size ?? 0) > 1),
  );
}

function buildHubSpotListHealth(
  agents: OutreachAgentConfig[],
  snapshots: OutreachStateSnapshot[],
  contacts: NormalizedContact[],
): OutreachHubSpotListHealth[] {
  const duplicateMaps = buildDuplicateMaps(contacts);
  return agents.map((agent) => {
    const snapshot = snapshots.find((item) => item.agent?.id === agent.id);
    const agentContacts = contacts.filter((contact) => contact.agentId === agent.id);
    const missingEmail = agentContacts.filter((contact) => !contact.email).length;
    const withOwner = agentContacts.filter((contact) => contact.ownerId).length;
    const withAssignedTo = agentContacts.filter((contact) => contact.assignedTo).length;
    const activeListContacts = agentContacts.filter((contact) => contact.isActiveListMember);
    const stoppedContacts = activeListContacts.filter(isStoppedOrBounced);
    const eligibleContacts = activeListContacts.filter((contact) => contact.campaignBucket === 'active_pool' && !contact.isTerminal).length;
    const bouncedNoPhone = stoppedContacts.filter((contact) => !contact.phone).length;
    const duplicatesAcrossAgents = agentContacts.filter((contact) => hasCrossAgentDuplicate(contact, duplicateMaps)).length;
    const touchMismatch = activeListContacts.filter((contact) => contact.touchCount >= 3 && !contact.isTerminal).length;
    const warnings: string[] = [];
    if (eligibleContacts < Math.min(agent.dailySendCap, LIST_REFILL_TARGET)) warnings.push('List needs refill');
    if (stoppedContacts.length > 0) warnings.push('Cleanup needed');
    if (withOwner > 0 || withAssignedTo > 0) warnings.push('Owner conflict');
    if (duplicatesAcrossAgents > 0) warnings.push('Cross-agent duplicate');
    if (touchMismatch > 0) warnings.push('Nurture migration needed');

    return {
      agentId: agent.id,
      agentName: agent.displayName,
      listName: agent.hubspotListName,
      listId: agent.hubspotListId,
      currentListSize: activeListContacts.length || numberFromRecord(snapshot?.hubspot, 'list_size') || agentContacts.length,
      eligibleContacts,
      ineligibleContacts: Math.max(0, activeListContacts.length - eligibleContacts),
      missingEmail,
      withOwner,
      withAssignedTo,
      duplicatesAcrossAgents,
      bouncedStillInList: stoppedContacts.length,
      stoppedStillInList: stoppedContacts.length,
      needingCleanup: stoppedContacts.length + withOwner + withAssignedTo + duplicatesAcrossAgents + touchMismatch,
      bouncedNoPhone,
      warnings,
    };
  });
}

function buildDeliverabilityHealth(agents: OutreachAgentConfig[], contacts: NormalizedContact[], now: Date): OutreachDeliverabilityHealth[] {
  return agents.map((agent) => {
    const agentContacts = contacts.filter((contact) => contact.agentId === agent.id);
    const sent = agentContacts.filter(hasInitialOutbound);
    const replies = agentContacts.filter(hasReply);
    const positives = agentContacts.filter(isPositiveLike);
    const stopped = agentContacts.filter(isStoppedOrBounced);
    const outOfOffice = agentContacts.filter((contact) => contact.replyStatus === 'out_of_office');
    const failures = stopped.filter((contact) => /bounce|failure|undeliverable|invalid/i.test(contact.stopReason || contact.bounceReason || contact.replyStatus));
    const sentToday = sentTodayFromSnapshot(undefined, agentContacts, now);
    const warnings: string[] = [];
    const bounceRate = sent.length > 0 ? Number(((failures.length / sent.length) * 100).toFixed(1)) : 0;
    const stopRate = sent.length > 0 ? Number(((stopped.length / sent.length) * 100).toFixed(1)) : 0;
    if (bounceRate >= 5) warnings.push('Bounce rate high');
    if (sentToday > agent.dailySendCap) warnings.push('Daily cap exceeded');
    if (sent.some((contact) => contact.touchCount >= MAX_PROACTIVE_TOUCHES && !hasReply(contact))) warnings.push('Too many unanswered touches');

    const firstReplyHours = replies
      .map((contact) => {
        const first = parseDate(contact.sentAt || contact.lastOutboundAt);
        const reply = parseDate(contact.lastReplyAt);
        return first && reply ? (reply.getTime() - first.getTime()) / (60 * 60 * 1000) : null;
      })
      .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);

    return {
      agentId: agent.id,
      agentName: agent.displayName,
      bounceRate,
      replyRate: sent.length > 0 ? Number(((replies.length / sent.length) * 100).toFixed(1)) : 0,
      positiveRate: sent.length > 0 ? Number(((positives.length / sent.length) * 100).toFixed(1)) : 0,
      stopRate,
      outOfOfficeRate: sent.length > 0 ? Number(((outOfOffice.length / sent.length) * 100).toFixed(1)) : 0,
      averageTimeToFirstReplyHours:
        firstReplyHours.length > 0
          ? Number((firstReplyHours.reduce((sum, value) => sum + value, 0) / firstReplyHours.length).toFixed(1))
          : null,
      sendsToday: sentToday,
      pacingCompliant: sentToday <= agent.dailySendCap,
      lastFailureReason: failures[0]?.stopReason || failures[0]?.bounceReason || undefined,
      warnings,
    };
  });
}

function buildSendQueueStatus(
  agents: OutreachAgentSummary[],
  contacts: NormalizedContact[],
  dashboardContacts: OutreachDashboardContact[],
  now: Date,
): OutreachSendQueueStatus {
  const queued = dashboardContacts.filter(
    (contact) =>
      (contact.stageId === 'drafted_ready' && contact.campaignBucket === 'active_pool') ||
      (contact.dueNow && isDueStage(contact.stageId ?? 'drafted_ready')),
  );
  const lastSent = [...contacts]
    .filter((contact) => contact.lastOutboundAt || contact.sentAt)
    .sort((a, b) => (parseDate(b.lastOutboundAt || b.sentAt)?.getTime() ?? 0) - (parseDate(a.lastOutboundAt || a.sentAt)?.getTime() ?? 0))[0];
  const lastSentAt = lastSent?.lastOutboundAt || lastSent?.sentAt;
  const isRunning = Boolean(lastSentAt && now.getTime() - (parseDate(lastSentAt)?.getTime() ?? 0) < 15 * 60 * 1000);
  const failureCount = dashboardContacts.filter((contact) => contact.stageId === 'stopped_bounced_unsubscribed').length;
  const status = failureCount > 10 ? 'failing' : isRunning ? 'sending' : queued.length > 0 ? 'healthy' : 'inactive';
  const delay = Math.max(65, ...agents.map((agent) => agent.sendDelaySeconds));

  return {
    status,
    isRunning,
    queueSize: queued.length,
    sentCount: agents.reduce((sum, agent) => sum + agent.sentToday, 0),
    skippedCount: dashboardContacts.filter((contact) => contact.stageId === 'blocked_ineligible').length,
    failureCount,
    currentDelaySeconds: delay,
    perAgentCap: Math.max(...agents.map((agent) => agent.dailySendCap), 50),
    lastSentEmail: lastSent?.email,
    lastSentContact: lastSent?.name,
    lastSentCompany: lastSent?.company,
    lastSentAgent: lastSent?.agentName,
    lastSentAt,
    nextExpectedSendAt: isRunning && lastSentAt ? new Date((parseDate(lastSentAt)?.getTime() ?? now.getTime()) + delay * 1000).toISOString() : undefined,
    perAgentSentToday: agents.map((agent) => ({
      agentId: agent.id,
      agentName: agent.displayName,
      sentToday: agent.sentToday,
      remaining: agent.dailyCapRemaining,
    })),
    updatedAt: lastSentAt ?? null,
    message: isRunning ? 'Queue appears to be sending now.' : queued.length > 0 ? `${queued.length} contacts are ready or due.` : 'No send queue activity detected.',
  };
}

function buildMembershipSummary(
  agents: OutreachAgentConfig[],
  dashboardContacts: OutreachDashboardContact[],
  membership?: OutreachMembershipSnapshot | null,
): OutreachMembershipSummary {
  const activeByAgent = agents.map((agent) => ({
    agentId: agent.id,
    agentName: agent.displayName,
    listName: agent.hubspotListName,
    count:
      membership?.source === 'hubspot_membership'
        ? membership.activeListMemberIdsByAgent[agent.id]?.length ?? 0
        : dashboardContacts.filter((contact) => contact.agentId === agent.id && contact.isActiveListMember).length,
  }));
  return {
    source: membership?.source ?? (dashboardContacts.some((contact) => contact.membershipSource === 'state_fallback') ? 'state_fallback' : 'unknown'),
    fetchedAt: membership?.fetchedAt ?? null,
    activeListMembers: activeByAgent.reduce((sum, row) => sum + row.count, 0),
    nurturedListMembers:
      membership?.source === 'hubspot_membership'
        ? membership.nurturedListMemberIds.length
        : dashboardContacts.filter((contact) => contact.isNurturedListMember).length,
    activeByAgent,
    warnings: membership?.warnings ?? [],
  };
}

function buildAuditSummary(dashboardContacts: OutreachDashboardContact[], next7Days: number): OutreachAuditSummary {
  const buckets: Record<OutreachCampaignBucket, number> = {
    active_pool: 0,
    nurture: 0,
    terminal: 0,
    historical: 0,
    local_only: 0,
    inconsistent: 0,
  };
  for (const contact of dashboardContacts) {
    const bucket = contact.campaignBucket ?? 'local_only';
    buckets[bucket] += 1;
  }
  return {
    buckets,
    dueNow: dashboardContacts.filter((contact) => contact.dueNow).length,
    scheduledNext7Days: next7Days,
    missingHubSpotId: dashboardContacts.filter((contact) => contact.diagnostics?.includes('missing_hubspot_id')).length,
    localOnly: buckets.local_only,
    inconsistent: buckets.inconsistent,
    terminal: buckets.terminal,
  };
}

function buildDiagnosticsSummary(dashboardContacts: OutreachDashboardContact[]): OutreachDiagnosticsSummary {
  const counts = new Map<string, number>();
  const contacts: OutreachDiagnosticsSummary['contacts'] = [];
  for (const contact of dashboardContacts) {
    const reasons = contact.diagnostics ?? [];
    if (!reasons.length) continue;
    contacts.push({
      email: contact.email,
      agentId: contact.agentId,
      agentName: contact.agentName,
      reasons,
    });
    for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return {
    total: contacts.length,
    byReason: Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    contacts: contacts.slice(0, 100),
  };
}

function buildDailyReport(dashboard: OutreachDashboardResponse, now: Date): string {
  const agents = dashboard.agents ?? [];
  const lines = [
    `Arrow Outreach Daily - ${todayKey(now)}`,
    '',
    'Sends today:',
    ...agents.map((agent) => `- ${agent.displayName}: ${agent.sentToday}`),
    '',
    'Replies:',
    `- Positive: ${dashboard.kpis.positive}`,
    `- Needs review: ${dashboard.kpis.humanReview ?? 0}`,
    `- OOO: ${dashboard.kpis.outOfOffice ?? 0}`,
    `- Bounces/stops: ${dashboard.kpis.bouncedStopped}`,
    '',
    'Follow-ups:',
    `- Due now: ${dashboard.kpis.dueFollowUp}`,
    `- Overdue: ${dashboard.kpis.overdueFollowUp ?? 0}`,
    `- Next 24h: ${dashboard.followUpHealth.next24h ?? 0}`,
    '',
    'Queue:',
    `- Status: ${dashboard.sendQueue?.status ?? 'unknown'}`,
    `- Last send: ${dashboard.sendQueue?.lastSentAgent ?? 'none'} -> ${dashboard.sendQueue?.lastSentEmail ?? 'none'}${dashboard.sendQueue?.lastSentAt ? ` at ${dashboard.sendQueue.lastSentAt}` : ''}`,
    `- Failures: ${dashboard.sendQueue?.failureCount ?? 0}`,
    '',
    'Actions:',
  ];
  const actions: string[] = [];
  if ((dashboard.kpis.humanReview ?? 0) > 0) actions.push(`Review ${dashboard.kpis.humanReview} replies needing human input.`);
  for (const list of dashboard.hubspotListHealth ?? []) {
    if (list.eligibleContacts < Math.min(LIST_REFILL_TARGET, agents.find((agent) => agent.id === list.agentId)?.dailySendCap ?? LIST_REFILL_TARGET)) {
      actions.push(`Refill ${list.listName}; ${list.eligibleContacts} eligible contacts remaining.`);
    }
    if (list.needingCleanup > 0) actions.push(`Clean up ${list.needingCleanup} HubSpot records in ${list.listName}.`);
  }
  if ((dashboard.kpis.dueFollowUp ?? 0) > 0) actions.push(`Send or draft ${dashboard.kpis.dueFollowUp} due follow-ups within caps.`);
  if (actions.length === 0) actions.push('No urgent outreach actions detected.');
  return [...lines, ...actions.map((action, index) => `${index + 1}. ${action}`)].join('\n');
}

function buildDashboardFromNormalizedContacts(input: {
  contacts: NormalizedContact[];
  snapshots: OutreachStateSnapshot[];
  agents: OutreachAgentConfig[];
  membership?: OutreachMembershipSnapshot | null;
  now: Date;
  lastSyncedAt: string | null;
  source: OutreachDashboardSource;
  sourceWarnings?: string[];
}): OutreachDashboardResponse {
  const { contacts, snapshots, agents, now } = input;
  const dashboardContacts = applyCrossContactDiagnostics(contacts.map((contact) => toDashboardContact(contact, now)));
  const activeContacts = contacts.filter((contact) => contact.campaignBucket === 'active_pool');
  const actionableContacts = contacts.filter((contact) => !contact.isTerminal);
  const initialSent = contacts.filter(hasInitialOutbound).length;
  const emailsSentTotal = initialSent;
  const replies = contacts.filter(hasReply).length;
  const positive = contacts.filter(isPositiveLike).length;
  const bouncedStopped = contacts.filter((contact) => contact.terminalReason === 'bounce' || contact.terminalReason === 'stopped_or_unsubscribed').length;
  const humanReview = contacts.filter(
    (contact) =>
      contact.humanReviewRequired ||
      (hasReply(contact) && (contact.terminalReason === 'needs_human_review' || stageIdForLabel(deriveOutreachStage(contact, now)) === 'replied_needs_review')),
  ).length;
  const outOfOffice = contacts.filter((contact) => contact.terminalReason === 'out_of_office').length;
  const blockedIneligible = dashboardContacts.filter((contact) => contact.stageId === 'blocked_ineligible').length;
  const dueContacts = dashboardContacts.filter((contact) => contact.dueNow && isDueStage(contact.stageId ?? 'drafted_ready'));
  const dueFollowUp = dueContacts.length;
  const overdueFollowUp = dueContacts.filter((contact) => {
    const due = parseDate(contact.nextFollowupAllowedAt);
    return Boolean(due && todayKey(due) < todayKey(now));
  }).length;
  const scheduled = actionableContacts.filter((contact) => {
    if (isPositiveLike(contact)) return false;
    const dueDate = parseDate(dueDateFromCadence(contact));
    return Boolean(dueDate && dueDate.getTime() > now.getTime() && contact.touchCount < MAX_PROACTIVE_TOUCHES);
  }).length;
  const next24h = actionableContacts.filter((contact) => {
    const dueDate = parseDate(dueDateFromCadence(contact));
    return Boolean(dueDate && dueDate.getTime() > now.getTime() && dueDate.getTime() <= now.getTime() + 24 * 60 * 60 * 1000);
  }).length;
  const next7Days = actionableContacts.filter((contact) => {
    const dueDate = parseDate(dueDateFromCadence(contact));
    return Boolean(dueDate && dueDate.getTime() > now.getTime() && dueDate.getTime() <= now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }).length;
  const severity = followUpSeverity(dueFollowUp + overdueFollowUp);
  const replyRows = contacts
    .map(toReply)
    .filter((reply): reply is OutreachReply => Boolean(reply))
    .sort((a, b) => {
      const priority = replySortKey(a) - replySortKey(b);
      if (priority !== 0) return priority;
      const aTime = parseDate(a.lastReplyAt)?.getTime() ?? 0;
      const bTime = parseDate(b.lastReplyAt)?.getTime() ?? 0;
      return bTime - aTime || a.company.localeCompare(b.company);
    });
  const agentSummaries = buildAgentSummaries(agents, snapshots, contacts, dashboardContacts, now);
  const pipelineColumns = buildPipelineColumns(dashboardContacts);
  const sendQueue = buildSendQueueStatus(agentSummaries, contacts, dashboardContacts, now);
  const hubspotListHealth = buildHubSpotListHealth(agents, snapshots, contacts);
  const deliverabilityHealth = buildDeliverabilityHealth(agents, contacts, now);
  const membership = buildMembershipSummary(agents, dashboardContacts, input.membership);
  const diagnostics = buildDiagnosticsSummary(dashboardContacts);
  const audit = buildAuditSummary(dashboardContacts, next7Days);
  const emailsSentToday = agentSummaries.reduce((sum, agent) => sum + agent.sentToday, 0);
  const lastGmailSyncAt = maxIso(agentSummaries.map((agent) => agent.lastInboxSyncAt ?? null));
  const lastHubSpotSyncAt = maxIso(agentSummaries.map((agent) => agent.lastHubSpotSyncAt ?? null));
  const staleWarnings = [
    ...agentSummaries
      .filter((agent) => isStale(agent.lastHubSpotSyncAt, now))
      .map((agent) => `${agent.displayName} HubSpot sync is stale.`),
    ...agentSummaries
      .filter((agent) => agent.activeContacts > 0 && isStale(agent.lastInboxSyncAt, now))
      .map((agent) => `${agent.displayName} reply monitor is stale.`),
  ];

  const dashboard: OutreachDashboardResponse = {
    generatedAt: now.toISOString(),
    lastSyncedAt: input.lastSyncedAt,
    source: input.source,
    sourceWarnings: input.sourceWarnings?.length ? input.sourceWarnings : undefined,
    kpis: {
      totalContacts: contacts.length,
      active: activeContacts.length,
      activeCampaigns: agentSummaries.filter((agent) => agent.activeContacts > 0).length,
      initialSent,
      emailsSentToday,
      emailsSentTotal,
      replies,
      positive,
      humanReview,
      bouncedStopped,
      dueFollowUp,
      overdueFollowUp,
      outOfOffice,
      blockedIneligible,
      positiveRate: initialSent > 0 ? Number(((positive / initialSent) * 100).toFixed(1)) : 0,
      bounceRate: initialSent > 0 ? Number(((bouncedStopped / initialSent) * 100).toFixed(1)) : 0,
    },
    replyRate: initialSent > 0 ? Number(((replies / initialSent) * 100).toFixed(1)) : 0,
    pipelineSummary: pipelineColumns.map((column) => pipelineItem(column.label, column.count, column.color)),
    agents: agentSummaries,
    pipelineColumns,
    followUpHealth: {
      dueToday: dueFollowUp,
      overdue: overdueFollowUp,
      scheduled,
      next24h,
      next7Days,
      needsReview: humanReview,
      blocked: bouncedStopped + blockedIneligible,
      blockedByReply: contacts.filter(hasReply).length,
      blockedByListRemoval: contacts.filter((contact) => contact.ineligibilityReasons.includes('removed_from_source_list') || contact.diagnostics.includes('contact_absent_from_expected_lists')).length,
      blockedByOwnerAssigned: contacts.filter((contact) => contact.ownerId || contact.assignedTo).length,
      blockedByMaxTouches: contacts.filter((contact) => contact.touchCount >= MAX_PROACTIVE_TOUCHES && !hasReply(contact)).length,
      dueByStage: OUTREACH_STAGE_DEFINITIONS.filter((stage) => isDueStage(stage.id)).map((stage) => ({
        stage: stage.label,
        count: dashboardContacts.filter((contact) => contact.stageId === stage.id).length,
      })),
      dueByAgent: agentSummaries.map((agent) => ({
        agentId: agent.id,
        agentName: agent.displayName,
        count: agent.dueFollowUps,
      })),
      message: dueFollowUp > 0 ? `${dueFollowUp} follow-ups due now.` : 'No follow-ups due now.',
      severity,
    },
    sendQueue,
    hubspotListHealth,
    deliverabilityHealth,
    membership,
    diagnostics,
    audit,
    dataFreshness: {
      generatedAt: now.toISOString(),
      lastGmailSyncAt,
      lastHubSpotSyncAt,
      lastSendQueueUpdateAt: sendQueue.updatedAt,
      lastReplyMonitorRunAt: lastGmailSyncAt,
      staleWarnings,
    },
    replies: replyRows,
    contacts: dashboardContacts,
  };
  dashboard.dailyReportText = buildDailyReport(dashboard, now);
  return dashboard;
}

export function buildOutreachDashboardFromSources(input: BuildDashboardInput): OutreachDashboardResponse {
  const now = input.now ?? new Date();
  const contacts = buildNormalizedOutreachContacts(input);
  const lastSyncedAt = maxIso([
    input.state?.generatedAt,
    ...contacts.flatMap((contact) => [contact.stateSyncedAt, contact.hubspotUpdatedAt]),
  ]);

  return buildDashboardFromNormalizedContacts({
    contacts,
    snapshots: input.state ? [input.state] : [],
    agents: [input.agent ?? input.state?.agent ?? DEFAULT_AGENT_CONFIGS[0]],
    membership: input.membership,
    now,
    lastSyncedAt,
    source: sourceFor(input.hubspotContacts.length, Object.keys(input.state?.contacts ?? {}).length),
    sourceWarnings: input.sourceWarnings,
  });
}

export function buildNormalizedOutreachContacts(input: BuildDashboardInput): NormalizedContact[] {
  const hubspotByEmail = toHubSpotContactMap(input.hubspotContacts);
  const stateContacts = input.state?.contacts ?? {};
  const emails = new Set<string>();
  for (const email of Object.keys(stateContacts)) {
    const normalized = normalizeOutreachEmail(email || stateContacts[email]?.email);
    if (normalized) emails.add(normalized);
  }
  for (const email of hubspotByEmail.keys()) emails.add(email);

  return Array.from(emails)
    .sort()
    .map((email) => {
      const agent = input.agent ?? input.state?.agent ?? DEFAULT_AGENT_CONFIGS[0];
      return normalizeOutreachContact(
        email,
        stateContacts[email],
        hubspotByEmail.get(email),
        agent,
        input.membership,
        input.state?.sourcePath ?? '',
        input.now ?? new Date(),
      );
    });
}

export function buildMultiAgentOutreachDashboardFromSnapshots(input: {
  agents: OutreachAgentConfig[];
  snapshots: OutreachStateSnapshot[];
  membership?: OutreachMembershipSnapshot | null;
  now?: Date;
  sourceWarnings?: string[];
}): OutreachDashboardResponse {
  const now = input.now ?? new Date();
  const contacts = input.snapshots.flatMap((snapshot) =>
    buildNormalizedOutreachContacts({
      hubspotContacts: [],
      state: snapshot,
      agent: snapshot.agent,
      membership: input.membership,
      now,
    }),
  );
  const lastSyncedAt = maxIso([
    ...input.snapshots.map((snapshot) => snapshot.generatedAt),
    ...contacts.flatMap((contact) => [contact.stateSyncedAt, contact.hubspotUpdatedAt]),
  ]);
  return buildDashboardFromNormalizedContacts({
    contacts,
    snapshots: input.snapshots,
    agents: input.agents,
    membership: input.membership,
    now,
    lastSyncedAt,
    source: input.membership?.source === 'hubspot_membership' && contacts.length > 0 ? 'hubspot+state' : contacts.length > 0 ? 'state' : 'mock',
    sourceWarnings: [...(input.sourceWarnings ?? []), ...(input.membership?.warnings ?? [])],
  });
}

export function buildMultiAgentOutreachDashboardFromAgentSources(input: {
  agents: OutreachAgentConfig[];
  sources: Array<{
    agent: OutreachAgentConfig;
    state: OutreachStateSnapshot | null;
    hubspotContacts: HubSpotOutreachContact[];
  }>;
  membership?: OutreachMembershipSnapshot | null;
  now?: Date;
  sourceWarnings?: string[];
}): OutreachDashboardResponse {
  const now = input.now ?? new Date();
  const contacts = input.sources.flatMap((source) =>
    buildNormalizedOutreachContacts({
      hubspotContacts: source.hubspotContacts,
      state: source.state,
      agent: source.agent,
      membership: input.membership,
      now,
    }),
  );
  const snapshots = input.sources
    .map((source) => source.state)
    .filter((snapshot): snapshot is OutreachStateSnapshot => Boolean(snapshot));
  const lastSyncedAt = maxIso([
    ...snapshots.map((snapshot) => snapshot.generatedAt),
    ...contacts.flatMap((contact) => [contact.stateSyncedAt, contact.hubspotUpdatedAt]),
  ]);
  return buildDashboardFromNormalizedContacts({
    contacts,
    snapshots,
    agents: input.agents,
    membership: input.membership,
    now,
    lastSyncedAt,
    source: input.membership?.source === 'hubspot_membership' && contacts.length > 0 ? 'hubspot+state' : sourceFor(contacts.length, 0),
    sourceWarnings: [...(input.sourceWarnings ?? []), ...(input.membership?.warnings ?? [])],
  });
}

function stateContactsFromJson(json: unknown): Record<string, OutreachStateContact> {
  if (!json || typeof json !== 'object') return {};
  const contacts = (json as { contacts?: unknown }).contacts;
  if (Array.isArray(contacts)) {
    const output: Record<string, OutreachStateContact> = {};
    for (const item of contacts) {
      if (!item || typeof item !== 'object') continue;
      const email = normalizeOutreachEmail((item as OutreachStateContact).email);
      if (email) output[email] = item as OutreachStateContact;
    }
    return output;
  }
  if (!contacts || typeof contacts !== 'object') return {};
  const output: Record<string, OutreachStateContact> = {};
  for (const [key, value] of Object.entries(contacts)) {
    if (!value || typeof value !== 'object') continue;
    const email = normalizeOutreachEmail((value as OutreachStateContact).email) || normalizeOutreachEmail(key);
    if (email) output[email] = value as OutreachStateContact;
  }
  return output;
}

async function readJsonFile(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function normalizeAgentConfig(raw: Record<string, unknown>, fallback: OutreachAgentConfig): OutreachAgentConfig {
  return {
    id: firstDefinedString(raw.id, fallback.id),
    displayName: firstDefinedString(raw.display_name, raw.displayName, fallback.displayName),
    email: firstDefinedString(raw.email, fallback.email),
    hubspotListName: firstDefinedString(raw.hubspot_list_name, raw.hubspotListName, fallback.hubspotListName),
    hubspotListId: firstDefinedString(raw.hubspot_list_id, raw.hubspotListId, fallback.hubspotListId),
    statePath: firstDefinedString(raw.state_path, raw.statePath, fallback.statePath),
    enabled: raw.enabled === undefined ? fallback.enabled : asBoolean(raw.enabled),
    dailySendCap: asNumber(raw.daily_send_cap) || asNumber(raw.dailySendCap) || fallback.dailySendCap,
    sendDelaySeconds: asNumber(raw.send_delay_seconds) || asNumber(raw.sendDelaySeconds) || fallback.sendDelaySeconds,
    role: firstDefinedString(raw.role, fallback.role),
    verifiedGmailOauth: raw.verified_gmail_oauth === undefined ? fallback.verifiedGmailOauth : asBoolean(raw.verified_gmail_oauth),
    verifiedSignature: raw.verified_signature === undefined ? fallback.verifiedSignature : asBoolean(raw.verified_signature),
    lastSyncAt: nullableString(raw.last_sync_at ?? raw.lastSyncAt ?? fallback.lastSyncAt),
  };
}

export async function loadOutreachAgentConfigs(): Promise<{ agents: OutreachAgentConfig[]; warnings: string[] }> {
  const warnings: string[] = [];
  const registryPath = envValue('OUTREACH_CRM_AGENTS_PATH') ?? DEFAULT_AGENTS_REGISTRY_PATH;
  const byId = new Map(DEFAULT_AGENT_CONFIGS.map((agent) => [agent.id, agent]));

  try {
    const registryJson = await readJsonFile(registryPath);
    const rawAgents = Array.isArray((registryJson as { agents?: unknown })?.agents)
      ? ((registryJson as { agents?: unknown[] }).agents ?? [])
      : [];
    for (const raw of rawAgents) {
      if (!raw || typeof raw !== 'object') continue;
      const record = raw as Record<string, unknown>;
      const id = firstDefinedString(record.id);
      const fallback = byId.get(id) ?? {
        id,
        displayName: id,
        email: '',
        hubspotListName: '',
        enabled: false,
        dailySendCap: 50,
        sendDelaySeconds: 65,
      };
      if (id) byId.set(id, normalizeAgentConfig(record, fallback));
    }
  } catch (error) {
    warnings.push(`Agent registry load skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  return {
    agents: DEFAULT_AGENT_CONFIGS.map((agent) => byId.get(agent.id) ?? agent),
    warnings,
  };
}

export async function loadOutreachState(): Promise<OutreachStateSnapshot | null> {
  const statePath = envValue('SASHA_OUTREACH_STATE_PATH', 'OUTREACH_CRM_STATE_PATH') ?? DEFAULT_STATE_PATH;
  const stateJson = await readJsonFile(statePath);
  if (!stateJson || typeof stateJson !== 'object') return null;
  const record = asRecord(stateJson);
  const agent = normalizeAgentConfig(record.agent && typeof record.agent === 'object' ? (record.agent as Record<string, unknown>) : {}, DEFAULT_AGENT_CONFIGS[0]);

  let generatedAt: string | null = asString(record.created_at) || null;
  const dashboardPath =
    envValue('SASHA_OUTREACH_DASHBOARD_PATH', 'OUTREACH_CRM_DASHBOARD_PATH') ?? DEFAULT_DASHBOARD_PATH;
  const dashboardJson = await readJsonFile(dashboardPath).catch(() => null);
  if (dashboardJson && typeof dashboardJson === 'object') {
    generatedAt = asString((dashboardJson as { generated_at?: unknown; generatedAt?: unknown }).generated_at) ||
      asString((dashboardJson as { generatedAt?: unknown }).generatedAt) ||
      generatedAt;
  }

  return {
    contacts: stateContactsFromJson(stateJson),
    generatedAt,
    sourcePath: statePath,
    agent,
    daily: asRecord(record.daily) as Record<string, Record<string, unknown>>,
    hubspot: asRecord(record.hubspot),
    replyMonitorRuns: Array.isArray(record.reply_monitor_runs) ? (record.reply_monitor_runs as Array<Record<string, unknown>>) : [],
    raw: record,
  };
}

async function loadOutreachStateForAgent(agent: OutreachAgentConfig): Promise<OutreachStateSnapshot> {
  const path = resolveOutreachPath(agent.statePath);
  const stateJson = await readJsonFile(path);
  if (!stateJson || typeof stateJson !== 'object') {
    return { contacts: {}, generatedAt: null, sourcePath: path, agent, daily: {}, hubspot: {}, replyMonitorRuns: [], raw: {} };
  }
  const record = asRecord(stateJson);
  const stateAgent = normalizeAgentConfig(
    record.agent && typeof record.agent === 'object' ? (record.agent as Record<string, unknown>) : {},
    agent,
  );
  const mergedAgent = { ...agent, ...stateAgent, statePath: agent.statePath };
  return {
    contacts: stateContactsFromJson(stateJson),
    generatedAt: asString(record.created_at) || asString(record.generated_at) || null,
    sourcePath: path,
    agent: mergedAgent,
    daily: asRecord(record.daily) as Record<string, Record<string, unknown>>,
    hubspot: asRecord(record.hubspot),
    replyMonitorRuns: Array.isArray(record.reply_monitor_runs) ? (record.reply_monitor_runs as Array<Record<string, unknown>>) : [],
    raw: record,
  };
}

export async function loadMultiAgentOutreachStateSnapshots(): Promise<{
  agents: OutreachAgentConfig[];
  snapshots: OutreachStateSnapshot[];
  warnings: string[];
}> {
  const registry = await loadOutreachAgentConfigs();
  const warnings = [...registry.warnings];
  const snapshots: OutreachStateSnapshot[] = [];
  for (const agent of registry.agents) {
    try {
      snapshots.push(await loadOutreachStateForAgent(agent));
    } catch (error) {
      warnings.push(`${agent.displayName} state load skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
      snapshots.push({
        contacts: {},
        generatedAt: null,
        sourcePath: resolveOutreachPath(agent.statePath),
        agent,
        daily: {},
        hubspot: {},
        replyMonitorRuns: [],
        raw: {},
      });
    }
  }
  return { agents: registry.agents, snapshots, warnings };
}

function resolveListId(state: OutreachStateSnapshot | null): string {
  const envListId = envValue('SASHA_OUTREACH_HUBSPOT_LIST_ID', 'OUTREACH_CRM_HUBSPOT_LIST_ID');
  if (envListId) return envListId;
  for (const contact of Object.values(state?.contacts ?? {})) {
    const id = asString(contact.source_list_id);
    if (id) return id;
  }
  return DEFAULT_HUBSPOT_LIST_ID;
}

async function fetchHubSpotContactPage(listId: string, after: string | undefined, properties: string[]) {
  const body: Record<string, unknown> = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: 'ilsListIds',
            operator: 'IN',
            values: [listId],
          },
        ],
      },
    ],
    properties,
    sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
    limit: 100,
  };
  if (after) body.after = after;

  const res = await hubspotFetch('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body,
    retries: 2,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new HubSpotApiError(`HubSpot Sasha-Outreach contact search failed: ${res.status}`, res.status, text);
  }
  return JSON.parse(text) as HubSpotContactSearchPage;
}

async function fetchHubSpotListMemberIds(listId: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  do {
    const params = new URLSearchParams({ limit: '100' });
    if (after) params.set('after', after);
    const res = await hubspotFetch(`/crm/v3/lists/${encodeURIComponent(listId)}/memberships?${params.toString()}`, {
      method: 'GET',
      retries: 2,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new HubSpotApiError(`HubSpot Sasha-Outreach list memberships failed: ${res.status}`, res.status, text);
    }
    const data = JSON.parse(text) as HubSpotListMembershipPage;
    for (const item of data.results ?? []) {
      const id = String(item.recordId ?? '').trim();
      if (id) ids.push(id);
    }
    after = data.paging?.next?.after;
  } while (after);
  return ids;
}

async function findHubSpotListIdByName(name: string): Promise<string | null> {
  if (!hubspotAccessToken()) return null;
  const res = await hubspotFetch('/crm/v3/lists/search', {
    method: 'POST',
    body: { query: name, count: 10 },
    retries: 1,
  });
  const text = await res.text();
  if (!res.ok) return null;
  const data = JSON.parse(text) as { lists?: Array<Record<string, unknown>>; results?: Array<Record<string, unknown>> };
  const rows = [...(data.lists ?? []), ...(data.results ?? [])];
  const match = rows.find((row) => asString(row.name).toLowerCase() === name.toLowerCase()) ?? rows[0];
  return asString(match?.listId) || asString(match?.id) || null;
}

async function fetchMembershipListIds(agents: OutreachAgentConfig[]): Promise<{
  activeIdsByAgent: Record<string, string>;
  nurtureListId: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const activeIdsByAgent: Record<string, string> = {};
  for (const agent of agents) {
    const configured = asString(agent.hubspotListId);
    if (configured) {
      activeIdsByAgent[agent.id] = configured;
      continue;
    }
    const found = await findHubSpotListIdByName(agent.hubspotListName).catch(() => null);
    if (found) activeIdsByAgent[agent.id] = found;
    else warnings.push(`${agent.displayName} HubSpot list ID unavailable for ${agent.hubspotListName}.`);
  }
  const nurtureListName = envValue('OUTREACH_CRM_NURTURE_LIST_NAME') ?? DEFAULT_NURTURE_LIST_NAME;
  const configuredNurtureId = envValue('OUTREACH_CRM_NURTURE_LIST_ID') ?? DEFAULT_NURTURE_LIST_ID;
  let nurtureListId = configuredNurtureId;
  if (!nurtureListId) {
    nurtureListId = (await findHubSpotListIdByName(nurtureListName).catch(() => null)) ?? '';
  }
  if (!nurtureListId) warnings.push(`Nurture HubSpot list ID unavailable for ${nurtureListName}.`);
  return { activeIdsByAgent, nurtureListId, warnings };
}

export async function loadOutreachMembershipSnapshot(agents: OutreachAgentConfig[]): Promise<OutreachMembershipSnapshot> {
  const fetchedAt = new Date().toISOString();
  const warnings: string[] = [];
  if (!hubspotAccessToken()) {
    return {
      source: 'state_fallback',
      fetchedAt,
      activeListMemberIdsByAgent: {},
      activeListNamesByAgent: Object.fromEntries(agents.map((agent) => [agent.id, agent.hubspotListName])),
      nurturedListMemberIds: [],
      nurtureListName: DEFAULT_NURTURE_LIST_NAME,
      nurtureListId: DEFAULT_NURTURE_LIST_ID,
      warnings: ['HubSpot membership unavailable; using local state source-list fallback.'],
    };
  }

  try {
    const { activeIdsByAgent, nurtureListId, warnings: idWarnings } = await fetchMembershipListIds(agents);
    warnings.push(...idWarnings);
    const activeListMemberIdsByAgent: Record<string, string[]> = {};
    for (const agent of agents) {
      const listId = activeIdsByAgent[agent.id];
      if (!listId) {
        activeListMemberIdsByAgent[agent.id] = [];
        continue;
      }
      try {
        activeListMemberIdsByAgent[agent.id] = await fetchHubSpotListMemberIds(listId);
      } catch (error) {
        warnings.push(`${agent.displayName} HubSpot membership read skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
        activeListMemberIdsByAgent[agent.id] = [];
      }
    }
    let nurturedListMemberIds: string[] = [];
    if (nurtureListId) {
      try {
        nurturedListMemberIds = await fetchHubSpotListMemberIds(nurtureListId);
      } catch (error) {
        warnings.push(`Nurtured-Outreach membership read skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    const failedAllActiveReads = agents.every((agent) => (activeListMemberIdsByAgent[agent.id] ?? []).length === 0);
    if (failedAllActiveReads && warnings.length > 0) {
      return {
        source: 'state_fallback',
        fetchedAt,
        activeListMemberIdsByAgent: {},
        activeListNamesByAgent: Object.fromEntries(agents.map((agent) => [agent.id, agent.hubspotListName])),
        nurturedListMemberIds: [],
        nurtureListName: DEFAULT_NURTURE_LIST_NAME,
        nurtureListId,
        warnings: [`HubSpot membership incomplete; using local state fallback.`, ...warnings],
      };
    }
    return {
      source: 'hubspot_membership',
      fetchedAt,
      activeListMemberIdsByAgent,
      activeListNamesByAgent: Object.fromEntries(agents.map((agent) => [agent.id, agent.hubspotListName])),
      nurturedListMemberIds,
      nurtureListName: DEFAULT_NURTURE_LIST_NAME,
      nurtureListId,
      warnings,
    };
  } catch (error) {
    return {
      source: 'state_fallback',
      fetchedAt,
      activeListMemberIdsByAgent: {},
      activeListNamesByAgent: Object.fromEntries(agents.map((agent) => [agent.id, agent.hubspotListName])),
      nurturedListMemberIds: [],
      nurtureListName: DEFAULT_NURTURE_LIST_NAME,
      nurtureListId: DEFAULT_NURTURE_LIST_ID,
      warnings: [`HubSpot membership unavailable; using local state fallback: ${error instanceof Error ? error.message : 'unknown error'}`],
    };
  }
}

async function batchReadHubSpotContacts(ids: string[], properties: string[]): Promise<HubSpotOutreachContact[]> {
  const contacts: HubSpotOutreachContact[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const res = await hubspotFetch('/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      body: {
        properties,
        inputs: chunk.map((id) => ({ id })),
      },
      retries: 2,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new HubSpotApiError(`HubSpot Sasha-Outreach contact batch read failed: ${res.status}`, res.status, text);
    }
    const data = JSON.parse(text) as HubSpotBatchReadResponse;
    contacts.push(...(data.results ?? []));
  }
  return contacts;
}

async function fetchHubSpotOutreachContactsByMembership(listId: string): Promise<HubSpotOutreachContact[]> {
  const ids = await fetchHubSpotListMemberIds(listId);
  if (ids.length === 0) return [];
  try {
    return await batchReadHubSpotContacts(ids, CONTACT_PROPERTIES);
  } catch (error) {
    if (error instanceof HubSpotApiError && error.status === 400) {
      return batchReadHubSpotContacts(ids, CONTACT_PROPERTIES_WITHOUT_CUSTOM);
    }
    throw error;
  }
}

export async function fetchHubSpotOutreachContactsForList(listId: string): Promise<HubSpotOutreachContact[]> {
  if (!hubspotAccessToken() || !asString(listId)) return [];
  let properties = CONTACT_PROPERTIES;
  const contacts: HubSpotOutreachContact[] = [];
  let after: string | undefined;
  let retriedWithoutCustomProperty = false;

  do {
    try {
      const page = await fetchHubSpotContactPage(listId, after, properties);
      contacts.push(...(page.results ?? []));
      after = page.paging?.next?.after;
    } catch (error) {
      if (
        error instanceof HubSpotApiError &&
        error.status === 400 &&
        !retriedWithoutCustomProperty &&
        properties.includes('assigned_to')
      ) {
        properties = CONTACT_PROPERTIES_WITHOUT_CUSTOM;
        contacts.length = 0;
        after = undefined;
        retriedWithoutCustomProperty = true;
        continue;
      }
      return fetchHubSpotOutreachContactsByMembership(listId);
    }
  } while (after);

  return contacts.length > 0 ? contacts : fetchHubSpotOutreachContactsByMembership(listId);
}

export async function fetchHubSpotOutreachContacts(state: OutreachStateSnapshot | null): Promise<HubSpotOutreachContact[]> {
  if (!hubspotAccessToken()) return [];
  const listId = resolveListId(state);
  return fetchHubSpotOutreachContactsForList(listId);
}

export async function buildSashaOutreachDashboard(): Promise<OutreachDashboardResponse> {
  const sourceWarnings: string[] = [];
  const state = await loadOutreachState().catch((error) => {
    const message = error instanceof Error ? error.message : 'Unable to load outreach state';
    sourceWarnings.push(`State load skipped: ${message}`);
    return null;
  });

  let hubspotContacts: HubSpotOutreachContact[] = [];
  try {
    hubspotContacts = await fetchHubSpotOutreachContacts(state);
  } catch (error) {
    const listName = envValue('SASHA_OUTREACH_HUBSPOT_LIST_NAME', 'OUTREACH_CRM_HUBSPOT_LIST_NAME') ?? DEFAULT_HUBSPOT_LIST_NAME;
    const message = error instanceof Error ? error.message : `Unable to load HubSpot list ${listName}`;
    if (!state || Object.keys(state.contacts).length === 0) throw error;
    sourceWarnings.push(`HubSpot load skipped: ${message}`);
  }

  return buildOutreachDashboardFromSources({
    hubspotContacts,
    state,
    agent: state?.agent,
    sourceWarnings,
  });
}

export async function buildMultiAgentOutreachDashboard(): Promise<OutreachDashboardResponse> {
  const loaded = await loadMultiAgentOutreachStateSnapshots();
  const membership = await loadOutreachMembershipSnapshot(loaded.agents);
  return buildMultiAgentOutreachDashboardFromSnapshots({
    agents: loaded.agents,
    snapshots: loaded.snapshots,
    membership,
    sourceWarnings: [...loaded.warnings, ...(membership.warnings ?? [])],
  });
}

export function buildOutreachDailyReport(dashboard: OutreachDashboardResponse, now = new Date()): string {
  return buildDailyReport(dashboard, now);
}
