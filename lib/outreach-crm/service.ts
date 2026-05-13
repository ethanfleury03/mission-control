import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  buildMultiAgentOutreachDashboardFromAgentSources,
  buildMultiAgentOutreachDashboardFromSnapshots,
  buildMultiAgentOutreachDashboard,
  buildNormalizedOutreachContacts,
  buildOutreachDashboardFromSources,
  buildSashaOutreachDashboard,
  buildOutreachDailyReport,
  deriveOutreachStage,
  fetchHubSpotOutreachContacts,
  fetchHubSpotOutreachContactsForList,
  loadOutreachMembershipSnapshot,
  loadMultiAgentOutreachStateSnapshots,
  loadOutreachState,
  normalizeOutreachEmail,
  parseDate,
} from './dashboard';
import {
  OUTREACH_CAMPAIGN_ID,
  OUTREACH_REQUIRED_CC,
  OUTREACH_SENDER_EMAIL,
  evaluateOutreachActionGuardrails,
  isOutreachActionType,
  type OutreachActionType,
  type OutreachGuardrailContact,
} from './guardrails';
import { dispatchOpenClaw, outreachOpenClawAgentId } from './openclaw';
import { buildArrowSignature } from './service-auth';
import type {
  HubSpotOutreachContact,
  NormalizedOutreachContact,
  OutreachAgentConfig,
  OutreachDashboardResponse,
  OutreachMembershipSnapshot,
  OutreachStateContact,
  OutreachStateSnapshot,
} from './types';

const db = prisma as any;
const SYNC_STATE_ID = 'sasha-outreach';
const MAX_LIST_LIMIT = 500;

const KNOWN_OUTREACH_AGENTS = {
  sasha: { displayName: 'Sasha', email: 'sasha@arrsys.com', hubspotListName: 'Sasha-Outreach', hubspotListId: '102' },
  mark: { displayName: 'Mark', email: 'markodell@arrsys.com', hubspotListName: 'Mark-Outreach', hubspotListId: '103' },
  aaron: { displayName: 'Aaron', email: 'aaron@arrsys.com', hubspotListName: 'Aaron-Outreach', hubspotListId: '104' },
  jordan: { displayName: 'Jordan', email: 'jordan@arrsys.com', hubspotListName: 'Jordan-Outreach', hubspotListId: '105' },
  ashton: { displayName: 'Ashton', email: 'ashton@arrsys.com', hubspotListName: 'Ashton-Outreach', hubspotListId: '107' },
  jaden: { displayName: 'Jaden', email: 'jaden@arrsys.com', hubspotListName: 'Jaden-Outreach', hubspotListId: '108' },
  josh: { displayName: 'Josh', email: 'josh@arrsys.com', hubspotListName: 'Josh-Outreach', hubspotListId: '109' },
  tom: { displayName: 'Tom', email: 'tom@arrsys.com', hubspotListName: 'Tom-Outreach', hubspotListId: '110' },
  emily: { displayName: 'Emily', email: 'emily@arrsys.com', hubspotListName: 'Emily-Outreach', hubspotListId: '111' },
} as const;
const REQUIRED_DEEP_SYNC_AGENT_IDS = Object.keys(KNOWN_OUTREACH_AGENTS);
const REQUIRED_DEEP_SYNC_AGENT_NAMES = Object.values(KNOWN_OUTREACH_AGENTS).map((agent) => agent.displayName).join(', ');
const REQUIRED_DEEP_SYNC_AGENT_ID_EXAMPLE = REQUIRED_DEEP_SYNC_AGENT_IDS.join(' | ');
const REQUIRED_DEEP_SYNC_AGENT_NAME_EXAMPLE = Object.values(KNOWN_OUTREACH_AGENTS)
  .map((agent) => agent.displayName)
  .join(' | ');

type JsonRecord = Record<string, unknown>;

export function expectedOutreachAgentIds(): string[] {
  return [...REQUIRED_DEEP_SYNC_AGENT_IDS];
}

export interface OutreachSyncResult {
  ok: boolean;
  dashboard: OutreachDashboardResponse;
  contactsSynced: number;
  eventsCreated: number;
  warnings: string[];
}

export interface OutreachActionRequest {
  actionType: OutreachActionType;
  contactId?: string;
  email?: string;
  replyThreadId?: string;
  instructions?: string;
  dryRun?: boolean;
  idempotencyKey?: string;
  senderEmail?: string;
  ccEmails?: string[];
  signatureRequired?: boolean;
}

export interface OutreachCallbackPayload {
  jobId?: string;
  status?: string;
  agentId?: string;
  result?: unknown;
  sentMessage?: unknown;
  blockedReasons?: string[];
  rawOutput?: string;
  activitySnapshot?: OutreachActivitySnapshot;
}

export interface OutreachActivitySnapshot {
  generatedAt?: string;
  sourceSummary?: string;
  contacts?: OutreachActivityContact[];
}

export interface OutreachActivityContact {
  email?: string;
  name?: string;
  company?: string;
  agentId?: string;
  agentName?: string;
  senderEmail?: string;
  hubspotListName?: string;
  hubspotListId?: string;
  touchCount?: number;
  lastOutboundAt?: string | null;
  nextFollowupAllowedAt?: string | null;
  replyStatus?: string;
  lastReplyAt?: string | null;
  lastReplySnippet?: string;
  positiveReply?: boolean;
  humanReviewRequired?: boolean;
  stopped?: boolean;
  stopReason?: string;
  gmailThreadId?: string;
  events?: unknown[];
  unmatched?: boolean;
}

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function jsonString(value: unknown, fallback = '{}'): string {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback));
  } catch {
    return fallback;
  }
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return parseDate(value)?.toISOString() ?? null;
  return null;
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function knownAgentName(agentId: string): string {
  return KNOWN_OUTREACH_AGENTS[agentId as keyof typeof KNOWN_OUTREACH_AGENTS]?.displayName ?? agentId;
}

function expectedDeepSyncAgents() {
  return REQUIRED_DEEP_SYNC_AGENT_IDS.map((id) => {
    const agent = KNOWN_OUTREACH_AGENTS[id as keyof typeof KNOWN_OUTREACH_AGENTS];
    return {
      id,
      name: agent.displayName,
      senderEmail: agent.email,
      hubspotListName: agent.hubspotListName,
      hubspotListId: agent.hubspotListId,
      statePath:
        id === 'sasha'
          ? '/Users/sasha/.openclaw/workspace/scripts/sasha_outreach/state.json'
          : `/Users/sasha/.openclaw/workspace/scripts/sasha_outreach/agents/${id}/state.json`,
    };
  });
}

function dateOrNull(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return parseDate(value ?? undefined);
}

function optionalDate(value: string | Date | null | undefined, fallback: Date | null | undefined): Date | null {
  const parsed = dateOrNull(value);
  return parsed ?? fallback ?? null;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);
}

function idempotencyKey(eventType: string, parts: unknown[]): string {
  return `${OUTREACH_CAMPAIGN_ID}:${eventType}:${parts.map(hash).join(':')}`;
}

function stateContactMap(state: OutreachStateSnapshot | null): Map<string, OutreachStateContact> {
  const map = new Map<string, OutreachStateContact>();
  for (const [key, value] of Object.entries(state?.contacts ?? {})) {
    const email = normalizeOutreachEmail(value.email) || normalizeOutreachEmail(key);
    if (email) map.set(email, value);
  }
  return map;
}

function hubspotContactMap(contacts: HubSpotOutreachContact[]): Map<string, HubSpotOutreachContact> {
  const map = new Map<string, HubSpotOutreachContact>();
  for (const contact of contacts) {
    const email = normalizeOutreachEmail(contact.properties?.email);
    if (email) map.set(email, contact);
  }
  return map;
}

function contactThreadUrl(contact: NormalizedOutreachContact): string {
  const threadId = contact.lastReplyThreadId || contact.sentThreadId || contact.threadIds[0] || '';
  return threadId ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(threadId)}` : '';
}

function gmailThreadUrl(threadId: string | null | undefined): string {
  const normalized = typeof threadId === 'string' ? threadId.trim() : '';
  return normalized ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(normalized)}` : '';
}

function contactSnapshot(contact: NormalizedOutreachContact, now: Date, inSourceList: boolean): JsonRecord {
  const stage = deriveOutreachStage(contact, now);
  return {
    id: contact.hubspotContactId || contact.email,
    hubspotContactId: contact.hubspotContactId ?? '',
    agentId: contact.agentId,
    agentName: contact.agentName,
    senderEmail: contact.senderEmail,
    hubspotListName: contact.hubspotListName,
    hubspotListId: contact.hubspotListId,
    dailySendCap: contact.dailySendCap,
    sendDelaySeconds: contact.sendDelaySeconds,
    email: contact.email,
    name: contact.name,
    company: contact.company,
    jobtitle: contact.jobtitle,
    stage,
    touchCount: contact.touchCount,
    lastOutboundAt: contact.lastOutboundAt ?? null,
    nextFollowupAllowedAt: contact.nextFollowupAllowedAt ?? null,
    isActiveListMember: contact.isActiveListMember,
    isNurturedListMember: contact.isNurturedListMember,
    campaignBucket: contact.campaignBucket,
    isTerminal: contact.isTerminal,
    terminalReason: contact.terminalReason,
    dueNow: contact.dueNow,
    nextActionLabel: contact.nextActionLabel,
    diagnostics: contact.diagnostics,
    sourceStatePath: contact.sourceStatePath,
    membershipSource: contact.membershipSource,
    lastReplyAt: contact.lastReplyAt ?? null,
    replyStatus: contact.replyStatus,
    positiveReply: contact.positiveReply,
    humanReviewRequired: contact.humanReviewRequired,
    stopped: contact.stopped,
    stopReason: contact.stopReason || contact.bounceReason,
    inSourceList,
    ownerId: contact.ownerId,
    assignedTo: contact.assignedTo,
    hubspotUrl: contact.hubspotUrl ?? '',
    gmailThreadUrl: contactThreadUrl(contact),
  };
}

function contactEventPayload(row: any, extra: JsonRecord = {}): JsonRecord {
  if (!row) {
    return {
      campaignId: OUTREACH_CAMPAIGN_ID,
      contact: null,
      links: {},
      ...extra,
    };
  }
  return {
    campaignId: row.campaignName ?? OUTREACH_CAMPAIGN_ID,
    contact: serializeContact(row),
    links: {
      hubspot: row.hubspotUrl || undefined,
      gmailThread: row.gmailThreadUrl || undefined,
    },
    ...extra,
  };
}

function contactChanged(prev: any | null, nextData: JsonRecord): boolean {
  if (!prev) return true;
  const snapshot = parseJson<JsonRecord>(prev.snapshotJson, {});
  return hash(snapshot) !== hash(nextData);
}

function eventRowsFromDiff(prev: any | null, row: any, snapshot: JsonRecord, now: Date): Array<{
  eventType: string;
  summary: string;
  keyParts: unknown[];
  payload?: JsonRecord;
}> {
  const events: Array<{ eventType: string; summary: string; keyParts: unknown[]; payload?: JsonRecord }> = [];
  if (contactChanged(prev, snapshot)) {
    events.push({
      eventType: 'contact.synced',
      summary: `${row.name || row.email} synced into Outreach CRM cache.`,
      keyParts: [row.email, snapshot],
    });
  }

  const prevLastReplyAt = iso(prev?.lastReplyAt);
  const nextLastReplyAt = iso(row.lastReplyAt);
  if (nextLastReplyAt && (!prev || prevLastReplyAt !== nextLastReplyAt || prev.lastReplySnippet !== row.lastReplySnippet)) {
    events.push({
      eventType: 'reply.received',
      summary: `Reply received from ${row.name || row.email}.`,
      keyParts: [row.email, nextLastReplyAt, row.lastReplySnippet, row.replyStatus],
    });
  }

  if (row.positiveReply && !prev?.positiveReply) {
    events.push({
      eventType: 'reply.positive',
      summary: `Positive reply from ${row.name || row.email}.`,
      keyParts: [row.email, row.lastReplyAt, row.lastReplySnippet],
    });
  }

  if (row.nextFollowupAllowedAt && row.active && !row.stopped && snapshot.dueNow === true) {
    const prevSnapshot = parseJson<JsonRecord>(prev?.snapshotJson, {});
    const prevDue = prevSnapshot.dueNow === true;
    if (!prevDue) {
      events.push({
        eventType: 'followup.due',
        summary: `Follow-up is due for ${row.name || row.email}.`,
        keyParts: [row.email, iso(row.nextFollowupAllowedAt), row.touchCount],
      });
    }
  }

  if (row.stopped && !prev?.stopped) {
    events.push({
      eventType: 'contact.stopped',
      summary: `${row.name || row.email} is stopped from outreach.`,
      keyParts: [row.email, row.stopReason, row.updatedAt ?? now.toISOString()],
    });
  }

  return events;
}

function serializeContact(row: any): JsonRecord {
  if (!row) return {};
  const snapshot = parseJson<JsonRecord>(row.snapshotJson, {});
  return {
    id: row.id,
    campaignId: row.campaignName,
    email: row.email,
    hubspotContactId: row.hubspotContactId || undefined,
    name: row.name,
    firstName: row.firstName,
    lastName: row.lastName,
    company: row.company,
    jobtitle: row.jobtitle,
    phone: row.phone,
    website: row.website,
    stage: row.stage,
    status: row.status,
    sendStatus: row.sendStatus,
    draftStatus: row.draftStatus,
    replyStatus: row.replyStatus,
    positiveReply: row.positiveReply,
    humanReviewRequired: row.humanReviewRequired,
    stopped: row.stopped,
    active: row.active,
    inSourceList: row.inSourceList,
    eligibleForAutomation: row.eligibleForAutomation,
    touchCount: row.touchCount,
    isActiveListMember: snapshot.isActiveListMember ?? row.inSourceList,
    isNurturedListMember: snapshot.isNurturedListMember ?? false,
    campaignBucket: snapshot.campaignBucket,
    isTerminal: snapshot.isTerminal,
    terminalReason: snapshot.terminalReason,
    dueNow: snapshot.dueNow,
    nextActionLabel: snapshot.nextActionLabel,
    diagnostics: Array.isArray(snapshot.diagnostics) ? snapshot.diagnostics : [],
    sourceStatePath: snapshot.sourceStatePath,
    membershipSource: snapshot.membershipSource,
    lastOutboundAt: iso(row.lastOutboundAt),
    nextFollowupAllowedAt: iso(row.nextFollowupAllowedAt),
    lastReplyAt: iso(row.lastReplyAt),
    sourceUpdatedAt: iso(row.sourceUpdatedAt),
    lastSyncedAt: iso(row.lastSyncedAt),
    hubspotUrl: row.hubspotUrl || undefined,
    gmailThreadUrl: row.gmailThreadUrl || undefined,
    stopReason: row.stopReason || undefined,
    lastReplySnippet: row.lastReplySnippet || undefined,
    ownerId: row.ownerId || undefined,
    assignedTo: row.assignedTo || undefined,
    snapshot,
  };
}

function serializeEvent(row: any): JsonRecord {
  const payload = parseJson<JsonRecord>(row.payloadJson, {});
  return {
    id: row.id,
    eventId: row.id,
    eventType: row.eventType,
    occurredAt: iso(row.occurredAt),
    campaignId: row.campaignName,
    contactId: row.contactId,
    email: row.email,
    jobId: row.jobId || undefined,
    idempotencyKey: row.idempotencyKey,
    summary: row.summary,
    payload,
  };
}

function serializeJob(row: any): JsonRecord {
  return {
    id: row.id,
    jobId: row.id,
    actionType: row.actionType,
    status: row.status,
    campaignId: row.campaignName,
    contactId: row.contactId || undefined,
    email: row.email || undefined,
    replyThreadId: row.replyThreadId || undefined,
    dryRun: row.dryRun,
    transport: row.transport || undefined,
    agentId: row.agentId || undefined,
    idempotencyKey: row.idempotencyKey,
    instructions: row.instructions || undefined,
    guardrail: parseJson<JsonRecord>(row.guardrailJson, {}),
    result: parseJson<JsonRecord>(row.resultJson, {}),
    blockedReasons: parseJson<string[]>(row.blockedReasonsJson, []),
    rawOutput: row.rawOutput || undefined,
    createdBy: row.createdBy || undefined,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function hasActivity(row: any): boolean {
  return Boolean(
    row &&
      ((Number(row.touchCount) || 0) > 0 ||
        row.lastOutboundAt ||
        row.nextFollowupAllowedAt ||
        row.lastReplyAt ||
        row.replyStatus ||
        row.lastReplySnippet ||
        row.positiveReply ||
        row.humanReviewRequired ||
        row.stopped ||
        row.stopReason),
  );
}

function replyStatusForRow(row: any): string {
  const haystack = [row.replyStatus, row.stage, row.stopReason, row.lastReplySnippet].filter(Boolean).join(' ').toLowerCase();
  if (row.stopped && /\b(bounce|bounced|invalid|undeliverable)\b/.test(haystack)) return 'Bounced';
  if (row.stopped) return 'Stopped';
  if (row.positiveReply || /\b(positive|interested|meeting|walkthrough|demo)\b/.test(haystack)) return 'Positive';
  if (row.humanReviewRequired || /\b(needs review|needs[_ -]?human|sensitive|pricing|legal|unclear|angry)\b/.test(haystack)) {
    return 'Needs Review';
  }
  if (/\b(out[_ -]?of[_ -]?office|ooo)\b/.test(haystack)) return 'Out of Office';
  if (row.replyStatus || row.lastReplyAt || row.lastReplySnippet) return 'Needs Review';
  return 'No Reply';
}

function hasReplyEvidence(row: any): boolean {
  const replyStatus = String(row.replyStatus || '').trim().toLowerCase();
  return Boolean(
    row.lastReplyAt ||
      row.lastReplySnippet ||
      (replyStatus && replyStatus !== 'no_reply' && replyStatus !== 'none' && (row.positiveReply || row.humanReviewRequired || row.stopped)),
  );
}

function dashboardFromCachedRows(rows: any[], syncState: any | null, now = new Date()): OutreachDashboardResponse {
  const cacheSyncedAt = iso(syncState?.lastSyncedAt);
  const summary = parseJson<JsonRecord>(syncState?.summaryJson, {});
  const warnings = Array.isArray(summary.warnings) ? (summary.warnings as string[]) : [];
  const agents = new Map<string, {
    id: string;
    displayName: string;
    email: string;
    hubspotListName: string;
    hubspotListId?: string;
    enabled: boolean;
    dailySendCap: number;
    sendDelaySeconds: number;
  }>();
  const contactsByAgent = new Map<string, Record<string, OutreachStateContact>>();
  const cachedMembership: OutreachMembershipSnapshot = {
    source: 'cache',
    fetchedAt: cacheSyncedAt,
    activeListMemberIdsByAgent: {},
    activeListNamesByAgent: {},
    nurturedListMemberIds: [],
    nurtureListName: 'Nurtured-Outreach',
    nurtureListId: '106',
    warnings: [],
  };

  const ensureAgent = (snapshot: JsonRecord) => {
    const rawId = stringValue(snapshot.agentId ?? snapshot.agent_id).toLowerCase();
    const id = rawId || 'sasha';
    const known = KNOWN_OUTREACH_AGENTS[id as keyof typeof KNOWN_OUTREACH_AGENTS] ?? KNOWN_OUTREACH_AGENTS.sasha;
    const existing = agents.get(id);
    if (existing) return existing;
    const agent = {
      id,
      displayName: stringValue(snapshot.agentName ?? snapshot.agent_name) || known.displayName,
      email: stringValue(snapshot.senderEmail ?? snapshot.sender_email) || known.email,
      hubspotListName: stringValue(snapshot.hubspotListName ?? snapshot.hubspot_list_name ?? snapshot.sourceList ?? snapshot.source_list) || known.hubspotListName,
      hubspotListId: stringValue(snapshot.hubspotListId ?? snapshot.hubspot_list_id ?? snapshot.sourceListId ?? snapshot.source_list_id) || known.hubspotListId,
      enabled: true,
      dailySendCap: numberValue(snapshot.dailySendCap ?? snapshot.daily_send_cap, 50),
      sendDelaySeconds: numberValue(snapshot.sendDelaySeconds ?? snapshot.send_delay_seconds, 65),
    };
    agents.set(id, agent);
    contactsByAgent.set(id, {});
    return agent;
  };

  for (const row of rows) {
    const snapshot = parseJson<JsonRecord>(row.snapshotJson, {});
    const rawState = parseJson<JsonRecord>(row.rawStateJson, {});
    const agent = ensureAgent(snapshot);
    const hubspotContactId = row.hubspotContactId || stringValue(snapshot.hubspotContactId);
    cachedMembership.activeListNamesByAgent![agent.id] = agent.hubspotListName;
    cachedMembership.activeListMemberIdsByAgent[agent.id] ??= [];
    if (hubspotContactId && Boolean(snapshot.isActiveListMember ?? row.inSourceList)) {
      cachedMembership.activeListMemberIdsByAgent[agent.id].push(hubspotContactId);
    }
    if (hubspotContactId && Boolean(snapshot.isNurturedListMember)) {
      cachedMembership.nurturedListMemberIds.push(hubspotContactId);
    }
    const contact: OutreachStateContact = {
      ...rawState,
      email: row.email,
      hubspot_contact_id: hubspotContactId,
      first_name: row.firstName,
      last_name: row.lastName,
      name: row.name || row.email,
      company: row.company,
      jobtitle: row.jobtitle,
      phone: row.phone,
      website: row.website,
      agent_id: agent.id,
      agent_name: agent.displayName,
      sender_email: agent.email,
      source_list: agent.hubspotListName,
      source_list_id: agent.hubspotListId,
      hubspot_url: row.hubspotUrl || snapshot.hubspotUrl,
      touch_count: row.touchCount || 0,
      sent_at: iso(row.lastOutboundAt) ?? undefined,
      last_outbound_at: iso(row.lastOutboundAt) ?? undefined,
      next_followup_allowed_at: iso(row.nextFollowupAllowedAt) ?? undefined,
      reply_status: row.replyStatus || snapshot.replyStatus,
      last_reply_at: iso(row.lastReplyAt) ?? undefined,
      last_reply_snippet: row.lastReplySnippet || snapshot.lastReplySnippet,
      positive_reply: Boolean(row.positiveReply),
      human_review_required: Boolean(row.humanReviewRequired),
      stopped: Boolean(row.stopped),
      stop_reason: row.stopReason || snapshot.stopReason,
      status: row.status,
      send_status: row.sendStatus,
      draft_status: row.draftStatus,
      hubspot_owner_id: row.ownerId,
      assigned_to: row.assignedTo,
      nurtured_at: snapshot.nurturedAt,
      nurture_status: snapshot.isNurturedListMember ? 'nurtured' : snapshot.nurtureStatus,
      active_outreach_list_removed_at: snapshot.activeOutreachListRemovedAt,
    };
    contactsByAgent.get(agent.id)![row.email] = contact;
  }

  const observedAgentIds = new Set(agents.keys());
  const missingKnownAgents = REQUIRED_DEEP_SYNC_AGENT_IDS.filter((id) => !observedAgentIds.has(id));
  if (rows.length > 0 && missingKnownAgents.length > 0) {
    warnings.push(
      `Cached outreach state is partial: missing ${missingKnownAgents.map(knownAgentName).join(', ')} from the nine-inbox sync.`,
    );
  }

  if (agents.size === 0) {
    for (const [id, known] of Object.entries(KNOWN_OUTREACH_AGENTS)) {
      agents.set(id, {
        id,
        displayName: known.displayName,
        email: known.email,
        hubspotListName: known.hubspotListName,
        hubspotListId: known.hubspotListId,
        enabled: id === 'sasha',
        dailySendCap: 50,
        sendDelaySeconds: 65,
      });
      contactsByAgent.set(id, {});
    }
  }

  const snapshots = Array.from(agents.values()).map((agent) => ({
    contacts: contactsByAgent.get(agent.id) ?? {},
    generatedAt: cacheSyncedAt,
    sourcePath: 'outreach_crm_contacts_cache',
    agent,
    daily: {},
    hubspot: { list_size: Object.keys(contactsByAgent.get(agent.id) ?? {}).length },
    replyMonitorRuns: [],
    raw: {},
  }));
  const hasAnyActivity = rows.some(hasActivity);
  const dashboard = buildMultiAgentOutreachDashboardFromSnapshots({
    agents: Array.from(agents.values()),
    snapshots,
    membership: cachedMembership,
    now,
    sourceWarnings: warnings,
  });

  return {
    ...dashboard,
    lastSyncedAt: dashboard.lastSyncedAt ?? cacheSyncedAt,
    cacheSyncedAt,
    activitySyncedAt: typeof summary.activitySyncedAt === 'string' ? summary.activitySyncedAt : null,
    source: hasAnyActivity ? 'hubspot+activity' : rows.length > 0 ? 'state' : 'mock',
  };
}

async function refreshDashboardCacheFromRows(extraSummary: JsonRecord = {}) {
  const [syncState, rows] = await Promise.all([
    db.outreachCrmSyncState.findUnique({ where: { id: SYNC_STATE_ID } }),
    db.outreachCrmContact.findMany({ where: { campaignName: OUTREACH_CAMPAIGN_ID } }),
  ]);
  const existingSummary = parseJson<JsonRecord>(syncState?.summaryJson, {});
  const dashboard = dashboardFromCachedRows(rows, syncState);
  await db.outreachCrmSyncState.upsert({
    where: { id: SYNC_STATE_ID },
    create: {
      id: SYNC_STATE_ID,
      campaignName: OUTREACH_CAMPAIGN_ID,
      status: 'idle',
      source: dashboard.source,
      lastSyncedAt: new Date(),
      dashboardJson: jsonString(dashboard),
      summaryJson: jsonString({ ...existingSummary, ...extraSummary }),
    },
    update: {
      source: dashboard.source,
      dashboardJson: jsonString(dashboard),
      summaryJson: jsonString({ ...existingSummary, ...extraSummary }),
    },
  });
  return dashboard;
}

function hasForbiddenDeepSyncInstruction(payload: OutreachCallbackPayload): boolean {
  if (payload.sentMessage) return true;
  if (!payload.result || typeof payload.result !== 'object') return false;
  const result = payload.result as Record<string, unknown>;
  return ['sentMessage', 'draftMessage', 'draftId', 'sentMessageId', 'gmailDraftId', 'gmailMessageId'].some((key) =>
    Boolean(result[key]),
  );
}

function activityContactEmail(contact: OutreachActivityContact): string {
  return normalizeOutreachEmail(contact.email);
}

function validateActivityContact(contact: OutreachActivityContact): { ok: true; email: string } | { ok: false; reason: string } {
  const email = activityContactEmail(contact);
  if (!email) return { ok: false, reason: 'email_required' };
  if (contact.touchCount !== undefined && (!Number.isInteger(contact.touchCount) || contact.touchCount < 0 || contact.touchCount > 20)) {
    return { ok: false, reason: 'invalid_touch_count' };
  }
  for (const key of ['lastOutboundAt', 'nextFollowupAllowedAt', 'lastReplyAt'] as const) {
    const value = contact[key];
    if (value !== undefined && value !== null && !dateOrNull(value)) {
      return { ok: false, reason: `invalid_${key}` };
    }
  }
  return { ok: true, email };
}

function activityStage(row: any, patch: JsonRecord, now = new Date()): string {
  const merged = {
    ...row,
    ...patch,
    email: row.email,
    replyStatus: String(patch.replyStatus ?? row.replyStatus ?? ''),
    status: row.status ?? '',
    humanReviewReason: '',
    stopReason: String(patch.stopReason ?? row.stopReason ?? ''),
    bounceReason: '',
    positiveReply: Boolean(patch.positiveReply ?? row.positiveReply),
    humanReviewRequired: Boolean(patch.humanReviewRequired ?? row.humanReviewRequired),
    stopped: Boolean(patch.stopped ?? row.stopped),
    lastReplySnippet: String(patch.lastReplySnippet ?? row.lastReplySnippet ?? ''),
    touchCount: Number(patch.touchCount ?? row.touchCount ?? 0),
    sentAt: iso(patch.lastOutboundAt ?? row.lastOutboundAt) ?? undefined,
    lastOutboundAt: iso(patch.lastOutboundAt ?? row.lastOutboundAt) ?? undefined,
    nextFollowupAllowedAt: iso(patch.nextFollowupAllowedAt ?? row.nextFollowupAllowedAt) ?? undefined,
    lastReplyAt: iso(patch.lastReplyAt ?? row.lastReplyAt) ?? undefined,
    events: [],
  };
  return deriveOutreachStage(merged as any, now);
}

function activitySnapshotForRow(row: any, patch: JsonRecord): JsonRecord {
  const existing = parseJson<JsonRecord>(row.snapshotJson, {});
  return {
    ...existing,
    agentId: patch.agentId ?? existing.agentId,
    agentName: patch.agentName ?? existing.agentName,
    senderEmail: patch.senderEmail ?? existing.senderEmail,
    hubspotListName: patch.hubspotListName ?? existing.hubspotListName,
    hubspotListId: patch.hubspotListId ?? existing.hubspotListId,
    name: patch.name ?? row.name,
    company: patch.company ?? row.company,
    stage: patch.stage ?? row.stage,
    touchCount: patch.touchCount ?? row.touchCount,
    lastOutboundAt: iso(patch.lastOutboundAt ?? row.lastOutboundAt),
    nextFollowupAllowedAt: iso(patch.nextFollowupAllowedAt ?? row.nextFollowupAllowedAt),
    lastReplyAt: iso(patch.lastReplyAt ?? row.lastReplyAt),
    replyStatus: patch.replyStatus ?? row.replyStatus,
    lastReplySnippet: patch.lastReplySnippet ?? row.lastReplySnippet,
    positiveReply: patch.positiveReply ?? row.positiveReply,
    humanReviewRequired: patch.humanReviewRequired ?? row.humanReviewRequired,
    stopped: patch.stopped ?? row.stopped,
    stopReason: patch.stopReason ?? row.stopReason,
    gmailThreadUrl: patch.gmailThreadUrl ?? row.gmailThreadUrl,
  };
}

export async function applyOutreachActivitySnapshot(
  snapshot: OutreachActivitySnapshot,
  input: { jobId?: string | null; agentId?: string | null; requireAgentIds?: string[] } = {},
) {
  const contacts = Array.isArray(snapshot.contacts) ? snapshot.contacts : [];
  if (contacts.length === 0) {
    return { applied: 0, skipped: 0, rejected: 0, errors: ['contacts_required'] };
  }

  const [syncState, rows] = await Promise.all([
    db.outreachCrmSyncState.findUnique({ where: { id: SYNC_STATE_ID } }),
    db.outreachCrmContact.findMany({ where: { campaignName: OUTREACH_CAMPAIGN_ID } }),
  ]);
  const requiredAgentIds = (input.requireAgentIds ?? [])
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  if (requiredAgentIds.length > 1) {
    const observedAgentIds = new Set(
      contacts
        .map((contact) => String(contact?.agentId ?? '').trim().toLowerCase())
        .filter(Boolean),
    );
    const missingAgentIds = requiredAgentIds.filter((id) => !observedAgentIds.has(id));
    if (missingAgentIds.length > 0) {
      const error = `partial_multi_agent_deep_sync_missing_agents:${missingAgentIds.join(',')}`;
      const dashboard = dashboardFromCachedRows(rows, syncState);
      return {
        applied: 0,
        skipped: contacts.length,
        rejected: contacts.length,
        errors: [error],
        dashboard: {
          ...dashboard,
          sourceWarnings: [
            ...(dashboard.sourceWarnings ?? []),
            `Deep sync returned partial state only. Missing ${missingAgentIds.map(knownAgentName).join(', ')}; cache was left unchanged.`,
          ],
        },
      };
    }
  }

  const byEmail = new Map<string, any>(rows.map((row: any) => [row.email, row]));
  const now = new Date();
  let applied = 0;
  let skipped = 0;
  let rejected = 0;
  const errors: string[] = [];

  for (const contact of contacts) {
    if (!contact || typeof contact !== 'object') {
      rejected += 1;
      errors.push('malformed_contact');
      continue;
    }
    const validation = validateActivityContact(contact);
    if (!validation.ok) {
      rejected += 1;
      errors.push(validation.reason ?? 'invalid_contact');
      continue;
    }
    let row = byEmail.get(validation.email);
    if (!row) {
      if (contact.unmatched) {
        skipped += 1;
        continue;
      }
      const bootstrapSnapshot: JsonRecord = {
        agentId: contact.agentId ?? 'sasha',
        agentName: contact.agentName ?? 'Sasha',
        senderEmail: contact.senderEmail ?? 'sasha@arrsys.com',
        hubspotListName: contact.hubspotListName ?? 'Sasha-Outreach',
        hubspotListId: contact.hubspotListId ?? '',
        email: validation.email,
        name: contact.name ?? validation.email,
        company: contact.company ?? '',
      };
      row = await db.outreachCrmContact.create({
        data: {
          campaignName: OUTREACH_CAMPAIGN_ID,
          email: validation.email,
          name: stringValue(contact.name) || validation.email,
          company: stringValue(contact.company),
          stage: 'Drafted / Ready',
          active: true,
          inSourceList: true,
          eligibleForAutomation: false,
          lastSyncedAt: now,
          snapshotJson: jsonString(bootstrapSnapshot),
          rawStateJson: jsonString(bootstrapSnapshot),
          rawHubspotJson: '{}',
        },
      });
      byEmail.set(validation.email, row);
    }

    const patch: JsonRecord = {};
    if (contact.agentId !== undefined) patch.agentId = String(contact.agentId).trim();
    if (contact.agentName !== undefined) patch.agentName = String(contact.agentName).trim();
    if (contact.senderEmail !== undefined) patch.senderEmail = String(contact.senderEmail).trim();
    if (contact.hubspotListName !== undefined) patch.hubspotListName = String(contact.hubspotListName).trim();
    if (contact.hubspotListId !== undefined) patch.hubspotListId = String(contact.hubspotListId).trim();
    if (contact.name !== undefined) patch.name = String(contact.name).trim();
    if (contact.company !== undefined) patch.company = String(contact.company).trim();
    if (contact.touchCount !== undefined) patch.touchCount = contact.touchCount;
    if (contact.lastOutboundAt !== undefined) patch.lastOutboundAt = dateOrNull(contact.lastOutboundAt);
    if (contact.nextFollowupAllowedAt !== undefined) patch.nextFollowupAllowedAt = dateOrNull(contact.nextFollowupAllowedAt);
    if (contact.replyStatus !== undefined) patch.replyStatus = String(contact.replyStatus).trim();
    if (contact.lastReplyAt !== undefined) patch.lastReplyAt = dateOrNull(contact.lastReplyAt);
    if (contact.lastReplySnippet !== undefined) patch.lastReplySnippet = String(contact.lastReplySnippet).trim().slice(0, 1000);
    if (contact.positiveReply !== undefined) patch.positiveReply = Boolean(contact.positiveReply);
    if (contact.humanReviewRequired !== undefined) patch.humanReviewRequired = Boolean(contact.humanReviewRequired);
    if (contact.stopped !== undefined) patch.stopped = Boolean(contact.stopped);
    if (contact.stopReason !== undefined) patch.stopReason = String(contact.stopReason).trim().slice(0, 500);
    if (contact.gmailThreadId !== undefined) patch.gmailThreadUrl = gmailThreadUrl(contact.gmailThreadId);
    if (Array.isArray(contact.events)) {
      patch.rawStateJson = jsonString({
        activityEvents: contact.events,
        agent_id: patch.agentId,
        agent_name: patch.agentName,
        sender_email: patch.senderEmail,
        source_list: patch.hubspotListName,
        source_list_id: patch.hubspotListId,
      });
    }

    patch.stage = activityStage(row, patch, now);
    patch.active = !Boolean(patch.stopped ?? row.stopped);
    patch.eligibleForAutomation =
      Boolean(row.inSourceList) &&
      !row.ownerId &&
      !row.assignedTo &&
      !Boolean(patch.stopped ?? row.stopped) &&
      !Boolean(patch.humanReviewRequired ?? row.humanReviewRequired);
    patch.snapshotJson = jsonString(activitySnapshotForRow(row, patch));

    const dataPatch = { ...patch };
    delete dataPatch.agentId;
    delete dataPatch.agentName;
    delete dataPatch.senderEmail;
    delete dataPatch.hubspotListName;
    delete dataPatch.hubspotListId;

    const updated = await db.outreachCrmContact.update({
      where: { id: row.id },
      data: dataPatch,
    });
    applied += 1;

    const diffEvents = eventRowsFromDiff(row, updated, parseJson<JsonRecord>(updated.snapshotJson, {}), now);
    for (const event of diffEvents) {
      await createOutreachEvent({
        eventType: event.eventType,
        contactId: updated.id,
        email: updated.email,
        jobId: input.jobId ?? null,
        summary: event.summary,
        payload: contactEventPayload(updated, {
          action: { actionType: 'deep_sync', agentId: input.agentId ?? undefined },
          sourceSummary: snapshot.sourceSummary,
        }),
        idempotencyKey: idempotencyKey(event.eventType, [input.jobId ?? '', event.keyParts]),
        occurredAt: now,
      });
    }
  }

  const dashboard = await refreshDashboardCacheFromRows({
    activitySyncedAt: now.toISOString(),
    activitySourceSummary: snapshot.sourceSummary ?? '',
    activityApplied: applied,
    activitySkipped: skipped,
    activityRejected: rejected,
    activityErrors: errors.slice(0, 25),
  });

  return { applied, skipped, rejected, errors, dashboard };
}

async function deliverWebhookForEvent(event: any) {
  const targetUrl = env('OUTREACH_CRM_OPENCLAW_WEBHOOK_URL');
  if (!targetUrl) return;

  const payload = {
    eventId: event.id,
    eventType: event.eventType,
    occurredAt: iso(event.occurredAt) ?? new Date().toISOString(),
    campaignId: event.campaignName,
    contact: parseJson<JsonRecord>(event.payloadJson, {}).contact ?? null,
    action: parseJson<JsonRecord>(event.payloadJson, {}).action ?? null,
    jobId: event.jobId || undefined,
    idempotencyKey: event.idempotencyKey,
    summary: event.summary,
    links: parseJson<JsonRecord>(event.payloadJson, {}).links ?? {},
  };
  const body = JSON.stringify(payload);
  const signature = buildArrowSignature(body, { eventId: event.id });
  const headers = {
    'content-type': 'application/json',
    'x-arrow-event-id': signature.eventId,
    'x-arrow-timestamp': signature.timestamp,
    'x-arrow-signature': signature.signature,
  };

  const delivery = await db.outreachWebhookDelivery.create({
    data: {
      eventId: event.id,
      targetUrl,
      status: 'queued',
      payloadJson: body,
      headersJson: jsonString(headers),
    },
  });

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const responseText = await response.text().catch(() => '');
    await db.outreachWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: response.ok ? 'delivered' : 'failed',
        attemptCount: 1,
        lastAttemptAt: new Date(),
        lastStatusCode: response.status,
        lastError: response.ok ? '' : responseText.slice(0, 1000),
        nextAttemptAt: response.ok ? null : new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  } catch (error) {
    await db.outreachWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'failed',
        attemptCount: 1,
        lastAttemptAt: new Date(),
        lastError: error instanceof Error ? error.message : 'Webhook delivery failed',
        nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  }
}

async function createOutreachEvent(input: {
  eventType: string;
  contactId?: string | null;
  email?: string;
  jobId?: string | null;
  summary: string;
  payload?: JsonRecord;
  idempotencyKey?: string;
  occurredAt?: Date;
}): Promise<any | null> {
  const key =
    input.idempotencyKey ??
    idempotencyKey(input.eventType, [input.email ?? '', input.jobId ?? '', input.summary, input.payload ?? {}]);
  try {
    const event = await db.outreachCrmEvent.create({
      data: {
        eventType: input.eventType,
        campaignName: OUTREACH_CAMPAIGN_ID,
        contactId: input.contactId ?? null,
        email: normalizeOutreachEmail(input.email) || '',
        jobId: input.jobId ?? null,
        idempotencyKey: key,
        payloadJson: jsonString(input.payload ?? {}),
        summary: input.summary,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
    await deliverWebhookForEvent(event);
    return event;
  } catch (error) {
    if (error && typeof error === 'object' && (error as { code?: string }).code === 'P2002') return null;
    throw error;
  }
}

export async function getOutreachDashboardWithCacheFallback(): Promise<OutreachDashboardResponse> {
  let cached: OutreachDashboardResponse | null = null;
  try {
    const multiAgent = await buildMultiAgentOutreachDashboard();
    if (multiAgent.contacts.length > 0 || multiAgent.agents?.some((agent) => agent.contactsInList > 0)) return multiAgent;
  } catch {
    // If local multi-agent state is unavailable in a deployed environment, fall back to cache/live Sasha merge.
  }
  try {
    const syncState = await db.outreachCrmSyncState.findUnique({ where: { id: SYNC_STATE_ID } });
    cached = parseJson<OutreachDashboardResponse | null>(syncState?.dashboardJson, null);
    if (cached?.contacts?.length && cached.agents?.length) return cached;
  } catch {
    // Cache table may not exist before migrations are applied. The UI remains useful via live merge.
  }
  if (cached?.contacts?.length) return cached;
  return buildSashaOutreachDashboard();
}

export function generateOutreachDailyReport(dashboard: OutreachDashboardResponse, now = new Date()): string {
  return buildOutreachDailyReport(dashboard, now);
}

export async function syncOutreachCrmCache(): Promise<OutreachSyncResult> {
  const now = new Date();
  const warnings: string[] = [];
  await db.outreachCrmSyncState.upsert({
    where: { id: SYNC_STATE_ID },
    create: {
      id: SYNC_STATE_ID,
      campaignName: OUTREACH_CAMPAIGN_ID,
      status: 'running',
      source: 'hubspot+state',
      lastAttemptedAt: now,
      dashboardJson: '{}',
      summaryJson: '{}',
    },
    update: {
      status: 'running',
      source: 'hubspot+state',
      lastAttemptedAt: now,
      lastError: '',
    },
  });

  try {
    let dashboard: OutreachDashboardResponse | null = null;
    let normalizedContacts: NormalizedOutreachContact[] = [];
    let hubspotContacts: HubSpotOutreachContact[] = [];
    let stateContactCount = 0;
    let hubspotContactCount = 0;
    const stateByEmail = new Map<string, OutreachStateContact>();
    let hubspotByEmail = new Map<string, HubSpotOutreachContact>();
    let multiAgentState: Awaited<ReturnType<typeof loadMultiAgentOutreachStateSnapshots>> | null = null;
    let membership: OutreachMembershipSnapshot | null = null;

    try {
      multiAgentState = await loadMultiAgentOutreachStateSnapshots();
      membership = await loadOutreachMembershipSnapshot(multiAgentState.agents);
      warnings.push(...multiAgentState.warnings);
      warnings.push(...(membership.warnings ?? []));
      normalizedContacts = multiAgentState.snapshots.flatMap((snapshot) =>
        buildNormalizedOutreachContacts({
          hubspotContacts: [],
          state: snapshot,
          agent: snapshot.agent,
          membership,
          now,
        }),
      );
      for (const snapshot of multiAgentState.snapshots) {
        stateContactCount += Object.keys(snapshot.contacts).length;
        for (const [email, contact] of stateContactMap(snapshot)) {
          stateByEmail.set(email, contact);
        }
      }
      dashboard = buildMultiAgentOutreachDashboardFromSnapshots({
        agents: multiAgentState.agents,
        snapshots: multiAgentState.snapshots,
        membership,
        now,
        sourceWarnings: warnings,
      });
      if (normalizedContacts.length === 0 && !dashboard.agents?.some((agent) => agent.contactsInList > 0)) {
        dashboard = null;
      }
    } catch (error) {
      warnings.push(`Multi-agent state load skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    if (!dashboard) {
      try {
        multiAgentState ??= await loadMultiAgentOutreachStateSnapshots();
        membership ??= await loadOutreachMembershipSnapshot(multiAgentState.agents);
        warnings.push(...(membership.warnings ?? []));
        const sources: Array<{
          agent: OutreachAgentConfig;
          state: OutreachStateSnapshot | null;
          hubspotContacts: HubSpotOutreachContact[];
        }> = [];
        hubspotContacts = [];
        hubspotByEmail = new Map<string, HubSpotOutreachContact>();

        for (const agent of multiAgentState.agents) {
          if (!agent.enabled) continue;
          const listId = agent.hubspotListId?.trim();
          if (!listId) {
            warnings.push(`${agent.displayName} HubSpot list skipped: list ID missing.`);
            sources.push({ agent, state: null, hubspotContacts: [] });
            continue;
          }
          const contacts = await fetchHubSpotOutreachContactsForList(listId);
          const state: OutreachStateSnapshot = {
            generatedAt: membership.fetchedAt ?? now.toISOString(),
            sourcePath: `hubspot_list_${listId}`,
            agent,
            contacts: {},
            daily: {},
            hubspot: {
              list_id: listId,
              list_name: agent.hubspotListName,
              list_size: contacts.length,
            },
            replyMonitorRuns: [],
            raw: {},
          };
          sources.push({ agent, state, hubspotContacts: contacts });
          hubspotContacts.push(...contacts);
          for (const contact of contacts) {
            const email = normalizeOutreachEmail(contact.properties?.email);
            if (email) hubspotByEmail.set(email, contact);
          }
        }

        normalizedContacts = sources.flatMap((source) =>
          buildNormalizedOutreachContacts({
            hubspotContacts: source.hubspotContacts,
            state: source.state,
            agent: source.agent,
            membership,
            now,
          }),
        );
        hubspotContactCount = hubspotContacts.length;
        dashboard = buildMultiAgentOutreachDashboardFromAgentSources({
          agents: multiAgentState.agents,
          sources,
          membership,
          now,
          sourceWarnings: warnings,
        });
        if (normalizedContacts.length === 0 && !dashboard.agents?.some((agent) => agent.contactsInList > 0)) {
          dashboard = null;
        }
      } catch (error) {
        warnings.push(`Nine-agent HubSpot list load skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    if (!dashboard) {
      const state = await loadOutreachState().catch((error) => {
        warnings.push(`State load skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
        return null;
      });

      try {
        hubspotContacts = await fetchHubSpotOutreachContacts(state);
      } catch (error) {
        if (!state || Object.keys(state.contacts).length === 0) throw error;
        warnings.push(`HubSpot load skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
      }

      dashboard = buildOutreachDashboardFromSources({
        hubspotContacts,
        state,
        now,
        sourceWarnings: warnings,
      });
      normalizedContacts = buildNormalizedOutreachContacts({ hubspotContacts, state, now });
      stateContactCount = Object.keys(state?.contacts ?? {}).length;
      for (const [email, contact] of stateContactMap(state)) stateByEmail.set(email, contact);
      hubspotByEmail = hubspotContactMap(hubspotContacts);
      hubspotContactCount = hubspotContacts.length;
    }

    const existingRows = await db.outreachCrmContact.findMany({ where: { campaignName: OUTREACH_CAMPAIGN_ID } });
    const existingByEmail = new Map<string, any>(existingRows.map((row: any) => [row.email, row]));
    const normalizedEmailSet = new Set(normalizedContacts.map((contact) => contact.email));
    let eventsCreated = 0;

    for (const contact of normalizedContacts) {
      const rawState = stateByEmail.get(contact.email) ?? {};
      const rawHubspot = hubspotByEmail.get(contact.email) ?? null;
      const inSourceList = Boolean(contact.isActiveListMember);
      const prev = existingByEmail.get(contact.email) ?? null;
      const rawStateHasActivity = Object.keys(rawState).some((key) =>
        [
          'touch_count',
          'sent_at',
          'last_outbound_at',
          'next_followup_allowed_at',
          'reply_status',
          'last_reply_at',
          'last_reply_snippet',
          'positive_reply',
          'human_review_required',
          'stopped',
          'stop_reason',
          'bounce_reason',
        ].includes(key),
      );
      const preservePrevActivity = Boolean(prev && !rawStateHasActivity);
      const stage = preservePrevActivity ? prev.stage : deriveOutreachStage(contact, now);
      const stopped = dashboard.contacts.find((item) => item.email === contact.email)?.stopped ?? contact.stopped;
      const mergedStopped = preservePrevActivity ? Boolean(prev.stopped) : stopped;
      const active = contact.campaignBucket === 'active_pool' && !mergedStopped;
      const eligibleForAutomation =
        active &&
        inSourceList &&
        !contact.isTerminal &&
        !contact.ownerId &&
        !contact.assignedTo &&
        !(preservePrevActivity ? prev.humanReviewRequired : contact.humanReviewRequired);
      const snapshot = {
        ...contactSnapshot(contact, now, inSourceList),
        stage,
        touchCount: preservePrevActivity ? prev.touchCount : contact.touchCount,
        lastOutboundAt: preservePrevActivity ? iso(prev.lastOutboundAt) : contact.lastOutboundAt ?? null,
        nextFollowupAllowedAt: preservePrevActivity ? iso(prev.nextFollowupAllowedAt) : contact.nextFollowupAllowedAt ?? null,
        lastReplyAt: preservePrevActivity ? iso(prev.lastReplyAt) : contact.lastReplyAt ?? null,
        replyStatus: preservePrevActivity ? prev.replyStatus : contact.replyStatus,
        positiveReply: preservePrevActivity ? prev.positiveReply : contact.positiveReply,
        humanReviewRequired: preservePrevActivity ? prev.humanReviewRequired : contact.humanReviewRequired,
        stopped: mergedStopped,
        stopReason: preservePrevActivity ? prev.stopReason : contact.stopReason || contact.bounceReason,
        gmailThreadUrl: preservePrevActivity ? prev.gmailThreadUrl : contactThreadUrl(contact),
      };
      const data = {
        campaignName: OUTREACH_CAMPAIGN_ID,
        email: contact.email,
        hubspotContactId: contact.hubspotContactId ?? '',
        name: contact.name,
        firstName: contact.firstName,
        lastName: contact.lastName,
        company: contact.company,
        jobtitle: contact.jobtitle,
        phone: contact.phone,
        website: contact.website,
        stage,
        status: contact.status,
        sendStatus: contact.sendStatus,
        draftStatus: contact.draftStatus,
        replyStatus: preservePrevActivity ? prev.replyStatus : contact.replyStatus,
        positiveReply: Boolean(snapshot.positiveReply),
        humanReviewRequired: Boolean(snapshot.humanReviewRequired),
        stopped: mergedStopped,
        active,
        inSourceList,
        eligibleForAutomation,
        touchCount: preservePrevActivity ? prev.touchCount : contact.touchCount,
        lastOutboundAt: preservePrevActivity ? prev.lastOutboundAt : dateOrNull(contact.lastOutboundAt),
        nextFollowupAllowedAt: preservePrevActivity ? prev.nextFollowupAllowedAt : dateOrNull(contact.nextFollowupAllowedAt),
        lastReplyAt: preservePrevActivity ? prev.lastReplyAt : dateOrNull(contact.lastReplyAt),
        sourceUpdatedAt: dateOrNull(contact.hubspotUpdatedAt || contact.stateSyncedAt),
        lastSyncedAt: now,
        hubspotUrl: contact.hubspotUrl ?? '',
        gmailThreadUrl: preservePrevActivity ? prev.gmailThreadUrl : contactThreadUrl(contact),
        stopReason: preservePrevActivity ? prev.stopReason : contact.stopReason || contact.bounceReason,
        lastReplySnippet: preservePrevActivity ? prev.lastReplySnippet : contact.lastReplySnippet,
        ownerId: contact.ownerId,
        assignedTo: contact.assignedTo,
        snapshotJson: jsonString(snapshot),
        rawStateJson: jsonString(rawState),
        rawHubspotJson: jsonString(rawHubspot ?? {}),
      };

      const row = prev
        ? await db.outreachCrmContact.update({ where: { id: prev.id }, data })
        : await db.outreachCrmContact.create({ data });

      const diffEvents = eventRowsFromDiff(prev, row, snapshot, now);
      for (const event of diffEvents) {
        const created = await createOutreachEvent({
          eventType: event.eventType,
          contactId: row.id,
          email: row.email,
          summary: event.summary,
          payload: contactEventPayload(row, event.payload),
          idempotencyKey: idempotencyKey(event.eventType, event.keyParts),
          occurredAt: now,
        });
        if (created) eventsCreated += 1;
      }
    }

    if (existingRows.some((row: any) => !normalizedEmailSet.has(row.email))) {
      const refreshedRows = await db.outreachCrmContact.findMany({ where: { campaignName: OUTREACH_CAMPAIGN_ID } });
      const preservedDashboard = dashboardFromCachedRows(
        refreshedRows,
        {
          lastSyncedAt: now,
          summaryJson: jsonString({
            contactsSynced: normalizedContacts.length,
            hubspotContacts: hubspotContactCount,
            stateContacts: stateContactCount,
            warnings,
          }),
        },
        now,
      );
      if (preservedDashboard.contacts.length > dashboard.contacts.length) {
        dashboard = {
          ...preservedDashboard,
          source: dashboard.source,
          membership: dashboard.membership ?? preservedDashboard.membership,
          sourceWarnings: [
            ...(dashboard.sourceWarnings ?? []),
            `Preserved ${preservedDashboard.contacts.length - normalizedContacts.length} cached deep-sync contact(s) outside the current HubSpot active lists.`,
          ],
        };
      }
    }

    await db.outreachCrmSyncState.update({
      where: { id: SYNC_STATE_ID },
      data: {
        status: 'idle',
        lastSyncedAt: now,
        lastError: '',
        dashboardJson: jsonString(dashboard),
        summaryJson: jsonString({
          contactsSynced: normalizedContacts.length,
          hubspotContacts: hubspotContactCount,
          stateContacts: stateContactCount,
          multiAgentContacts: dashboard.kpis.totalContacts,
          eventsCreated,
          warnings,
        }),
      },
    });

    const syncEvent = await createOutreachEvent({
      eventType: 'sync.completed',
      summary: `Outreach CRM sync completed: ${dashboard.kpis.totalContacts} multi-agent contacts, ${eventsCreated} events.`,
      payload: {
        campaignId: OUTREACH_CAMPAIGN_ID,
        action: { actionType: 'sync' },
        summary: { contactsSynced: dashboard.kpis.totalContacts, eventsCreated, warnings },
      },
      idempotencyKey: idempotencyKey('sync.completed', [now.toISOString(), dashboard.kpis.totalContacts, eventsCreated]),
      occurredAt: now,
    });
    if (syncEvent) eventsCreated += 1;

    return {
      ok: true,
      dashboard,
      contactsSynced: dashboard.kpis.totalContacts,
      eventsCreated,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Outreach CRM sync failed';
    await db.outreachCrmSyncState.upsert({
      where: { id: SYNC_STATE_ID },
      create: {
        id: SYNC_STATE_ID,
        campaignName: OUTREACH_CAMPAIGN_ID,
        status: 'failed',
        source: 'hubspot+state',
        lastAttemptedAt: now,
        lastError: message,
        dashboardJson: '{}',
        summaryJson: '{}',
      },
      update: {
        status: 'failed',
        lastError: message,
      },
    });
    throw error;
  }
}

export async function listOutreachContacts(input: {
  q?: string | null;
  status?: string | null;
  cursor?: string | null;
  limit?: number;
}) {
  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, Number(input.limit ?? 100)));
  const q = input.q?.trim();
  const status = input.status?.trim();
  const where: JsonRecord = { campaignName: OUTREACH_CAMPAIGN_ID };
  if (status) {
    where.OR = [{ stage: { contains: status } }, { status: { contains: status } }, { replyStatus: { contains: status } }];
  }
  if (q) {
    const qWhere = [
      { email: { contains: q } },
      { name: { contains: q } },
      { company: { contains: q } },
      { jobtitle: { contains: q } },
      { hubspotContactId: { contains: q } },
    ];
    where.OR = Array.isArray(where.OR) ? [...(where.OR as unknown[]), ...qWhere] : qWhere;
  }

  const rows = await db.outreachCrmContact.findMany({
    where,
    orderBy: [{ company: 'asc' }, { email: 'asc' }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: page.map(serializeContact),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function getOutreachContact(identifier: string) {
  const normalized = normalizeOutreachEmail(identifier);
  const row = await db.outreachCrmContact.findFirst({
    where: {
      campaignName: OUTREACH_CAMPAIGN_ID,
      OR: [{ id: identifier }, { email: normalized }, { hubspotContactId: identifier }],
    },
  });
  return row ? serializeContact(row) : null;
}

async function findOutreachContactForAction(input: { contactId?: string; email?: string }) {
  const email = normalizeOutreachEmail(input.email);
  const identifiers = [input.contactId, email].filter(Boolean) as string[];
  if (identifiers.length === 0) return null;
  return db.outreachCrmContact.findFirst({
    where: {
      campaignName: OUTREACH_CAMPAIGN_ID,
      OR: identifiers.flatMap((identifier) => [
        { id: identifier },
        { hubspotContactId: identifier },
        { email: normalizeOutreachEmail(identifier) },
      ]),
    },
  });
}

export async function listOutreachEvents(input: { since?: string | null; limit?: number; eventType?: string | null }) {
  const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, Number(input.limit ?? 100)));
  const since = parseDate(input.since ?? undefined);
  const where: JsonRecord = { campaignName: OUTREACH_CAMPAIGN_ID };
  if (since) where.occurredAt = { gt: since };
  if (input.eventType?.trim()) where.eventType = input.eventType.trim();

  const rows = await db.outreachCrmEvent.findMany({
    where,
    orderBy: { occurredAt: 'asc' },
    take: limit,
  });
  return { items: rows.map(serializeEvent) };
}

function toGuardrailContact(row: any | null): OutreachGuardrailContact | null {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    company: row.company,
    stage: row.stage,
    active: row.active,
    inSourceList: row.inSourceList,
    eligibleForAutomation: row.eligibleForAutomation,
    ownerId: row.ownerId,
    assignedTo: row.assignedTo,
    stopped: row.stopped,
    stopReason: row.stopReason,
    touchCount: row.touchCount,
    lastOutboundAt: row.lastOutboundAt,
    nextFollowupAllowedAt: row.nextFollowupAllowedAt,
    replyStatus: row.replyStatus,
    lastReplyAt: row.lastReplyAt,
    lastReplySnippet: row.lastReplySnippet,
    positiveReply: row.positiveReply,
    humanReviewRequired: row.humanReviewRequired,
  };
}

async function actionCounts(now: Date) {
  const today = startOfUtcDay(now);
  const activeStatuses = ['queued', 'dispatching', 'dispatched', 'completed'];
  const [firstTouchesToday, followupsThisRun] = await Promise.all([
    db.outreachAutomationJob.count({
      where: {
        campaignName: OUTREACH_CAMPAIGN_ID,
        actionType: 'send_first_touch',
        status: { in: activeStatuses },
        createdAt: { gte: today },
      },
    }),
    db.outreachAutomationJob.count({
      where: {
        campaignName: OUTREACH_CAMPAIGN_ID,
        actionType: 'send_followup',
        status: { in: activeStatuses },
        createdAt: { gte: today },
      },
    }),
  ]);
  return { firstTouchesToday, followupsThisRun };
}

function actionIdempotencyKey(request: OutreachActionRequest, contact: any | null): string {
  if (request.idempotencyKey?.trim()) return request.idempotencyKey.trim();
  return idempotencyKey('action', [
    request.actionType,
    contact?.id ?? request.email ?? request.contactId ?? '',
    request.replyThreadId ?? '',
    request.dryRun ? 'dry' : 'live',
    Date.now(),
  ]);
}

function callbackUrl(): string {
  const explicit = env('OUTREACH_CRM_CALLBACK_URL');
  if (explicit) return explicit;
  const base = env('NEXTAUTH_URL') || env('NEXT_PUBLIC_APP_URL') || 'http://localhost:3002';
  return `${base.replace(/\/$/, '')}/api/outreach-crm/v1/openclaw/callback`;
}

function buildOpenClawPrompt(job: any, contact: any | null, request: OutreachActionRequest, guardrail: JsonRecord): string {
  if (request.actionType === 'deep_sync') {
    const agents = expectedDeepSyncAgents();
    const deepSyncEnvelope = {
      jobId: job.id,
      actionType: 'deep_sync',
      callbackUrl: callbackUrl(),
      payload: {
        jobId: job.id,
        actionType: 'deep_sync',
        contacts: [],
        expectedAgentIds: REQUIRED_DEEP_SYNC_AGENT_IDS,
        stateRoot: '/Users/sasha/.openclaw/workspace/scripts/sasha_outreach',
      },
    };
    return [
      'Mission Control Outreach CRM read-only deep sync.',
      `jobId: ${job.id}`,
      `campaignId: ${OUTREACH_CAMPAIGN_ID}`,
      `callbackUrl: ${callbackUrl()}`,
      '',
      'Task:',
      '- Reconcile the full nine-inbox Arrow Outreach state, not only Sasha.',
      `- Expected agents are ${REQUIRED_DEEP_SYNC_AGENT_NAMES}. Read agents.json and every enabled/known agent state file.`,
      '- If no requested contacts are provided, return all contacts across all nine agents.',
      '- If requested contacts are provided, search across all nine agent states by normalized email.',
      '- Prefer the local read-only helper when available: python3 /Users/sasha/.openclaw/workspace/scripts/sasha_outreach/deep_sync.py --message <JSON envelope below>.',
      '- Return strict JSON only and call the callback endpoint with HMAC headers.',
      '- Do not send email, draft email, modify Gmail, modify HubSpot, assign owners, or change lifecycle data.',
      '- Every returned contact must include agentId, agentName, and senderEmail metadata.',
      '- If any expected agent cannot be read, return status needs_human or failed and explain the missing agent in rawOutput/sourceSummary instead of returning a partial agent set as completed.',
      '',
      'Expected nine-inbox sources:',
      ...agents.map(
        (agent) =>
          `- ${agent.name}: agentId=${agent.id}, sender=${agent.senderEmail}, HubSpot list=${agent.hubspotListName} (${agent.hubspotListId}), state=${agent.statePath}`,
      ),
      '',
      'JSON envelope for helper/gateway:',
      jsonString(deepSyncEnvelope),
      '',
      'Required callback shape:',
      jsonString({
        jobId: job.id,
        status: 'completed',
        agentId: outreachOpenClawAgentId(),
        activitySnapshot: {
          generatedAt: new Date().toISOString(),
          sourceSummary: 'Short description of checked sources',
          contacts: [
            {
              email: 'normalized contact email',
              agentId: REQUIRED_DEEP_SYNC_AGENT_ID_EXAMPLE,
              agentName: REQUIRED_DEEP_SYNC_AGENT_NAME_EXAMPLE,
              senderEmail: 'agent sender inbox',
              touchCount: 1,
              lastOutboundAt: 'ISO timestamp or null',
              nextFollowupAllowedAt: 'ISO timestamp or null',
              replyStatus: 'positive | out_of_office | needs_review | bounce | stopped | no_reply',
              lastReplyAt: 'ISO timestamp or null',
              lastReplySnippet: 'short snippet',
              positiveReply: false,
              humanReviewRequired: false,
              stopped: false,
              stopReason: '',
              gmailThreadId: 'thread id when known',
              events: [],
            },
          ],
        },
        rawOutput: 'short run summary',
      }),
    ].join('\n');
  }

  return [
    'Mission Control Outreach CRM job.',
    `jobId: ${job.id}`,
    `actionType: ${request.actionType}`,
    `campaignId: ${OUTREACH_CAMPAIGN_ID}`,
    `callbackUrl: ${callbackUrl()}`,
    '',
    'Non-negotiable policy:',
    `- Sender must be ${OUTREACH_SENDER_EMAIL}.`,
    `- CC must include ${OUTREACH_REQUIRED_CC}.`,
    '- Use the configured Gmail HTML signature.',
    '- Do not send if HubSpot list membership, owner, assigned_to, stop state, pacing, touch count, or reply-safety checks fail.',
    '- Positive replies use the ask-availability flow: ask for a couple good times and notify Ethan/Shaan. Do not book calendar meetings in v1.',
    '- Sensitive, pricing, legal, angry, unclear, unsubscribe, and not-interested replies must become needs_human.',
    '- Return JSON and call the callback endpoint with HMAC headers when the action is finished or blocked.',
    '',
    jsonString({
      jobId: job.id,
      actionType: request.actionType,
      dryRun: request.dryRun ?? false,
      replyThreadId: request.replyThreadId ?? '',
      instructions: request.instructions ?? '',
      contact: contact ? serializeContact(contact) : null,
      guardrail,
      callbackShape: {
        jobId: job.id,
        status: 'completed | failed | blocked | needs_human',
        agentId: outreachOpenClawAgentId(),
        result: {},
        sentMessage: {},
        blockedReasons: [],
        rawOutput: '',
      },
    }),
  ].join('\n');
}

export async function createOutreachAction(request: OutreachActionRequest, createdBy = 'service') {
  if (!isOutreachActionType(request.actionType)) {
    return { ok: false, status: 400, error: 'invalid_action_type' };
  }

  const now = new Date();
  const contact = request.actionType === 'sync' || request.actionType === 'deep_sync' ? null : await findOutreachContactForAction(request);
  const counts = await actionCounts(now);
  const guardrail = evaluateOutreachActionGuardrails({
    actionType: request.actionType,
    contact: toGuardrailContact(contact),
    dryRun: request.dryRun,
    now,
    firstTouchesToday: counts.firstTouchesToday,
    followupsThisRun: counts.followupsThisRun,
    senderEmail: request.senderEmail,
    ccEmails: request.ccEmails,
    signatureRequired: request.signatureRequired,
  });
  const initialStatus = request.dryRun
    ? 'dry_run'
    : guardrail.allowed
      ? 'queued'
      : guardrail.needsHuman
        ? 'needs_human'
        : 'blocked';

  const job = await db.outreachAutomationJob.create({
    data: {
      actionType: request.actionType,
      status: initialStatus,
      campaignName: OUTREACH_CAMPAIGN_ID,
      contactId: contact?.id ?? null,
      email: contact?.email ?? normalizeOutreachEmail(request.email) ?? '',
      replyThreadId: request.replyThreadId ?? '',
      dryRun: Boolean(request.dryRun),
      agentId: outreachOpenClawAgentId(),
      idempotencyKey: actionIdempotencyKey(request, contact),
      instructions: request.instructions ?? '',
      requestJson: jsonString(request),
      guardrailJson: jsonString(guardrail),
      blockedReasonsJson: jsonString(guardrail.blockedReasons, '[]'),
      createdBy,
    },
  });

  if (request.actionType === 'sync' && guardrail.allowed && !request.dryRun) {
    await db.outreachAutomationJob.update({
      where: { id: job.id },
      data: { status: 'dispatching', startedAt: now },
    });
    const sync = await syncOutreachCrmCache();
    const completed = await db.outreachAutomationJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        resultJson: jsonString(sync),
        finishedAt: new Date(),
      },
    });
    return { ok: true, job: serializeJob(completed), result: sync };
  }

  if (request.actionType === 'deep_sync' && guardrail.allowed && !request.dryRun) {
    await db.outreachAutomationJob.update({
      where: { id: job.id },
      data: { status: 'dispatching', startedAt: now },
    });
    const sync = await syncOutreachCrmCache();
    await db.outreachAutomationJob.update({
      where: { id: job.id },
      data: { resultJson: jsonString({ deterministicSync: sync }) },
    });
  }

  if (request.dryRun) {
    return { ok: true, job: serializeJob(job), guardrail };
  }

  if (!guardrail.allowed) {
    await createOutreachEvent({
      eventType: 'send.blocked',
      contactId: contact?.id ?? null,
      email: contact?.email ?? request.email ?? '',
      jobId: job.id,
      summary: `Outreach action blocked: ${guardrail.blockedReasons.join(', ')}`,
      payload: contactEventPayload(contact, {
        action: { actionType: request.actionType, dryRun: false },
        blockedReasons: guardrail.blockedReasons,
      }),
      idempotencyKey: idempotencyKey('send.blocked', [job.id, guardrail.blockedReasons]),
    });
    return { ok: true, job: serializeJob(job), guardrail };
  }

  if (request.actionType === 'stop_contact') {
    const stopped = await db.outreachCrmContact.update({
      where: { id: contact.id },
      data: {
        stopped: true,
        active: false,
        eligibleForAutomation: false,
        stopReason: request.instructions || contact.stopReason || 'Stopped by Outreach CRM action',
      },
    });
    await createOutreachEvent({
      eventType: 'contact.stopped',
      contactId: stopped.id,
      email: stopped.email,
      jobId: job.id,
      summary: `${stopped.name || stopped.email} stopped by Outreach CRM action.`,
      payload: contactEventPayload(stopped, { action: { actionType: request.actionType } }),
      idempotencyKey: idempotencyKey('contact.stopped', [job.id, stopped.email]),
    });
    const completed = await db.outreachAutomationJob.update({
      where: { id: job.id },
      data: { status: 'completed', resultJson: jsonString({ stopped: true }), finishedAt: new Date() },
    });
    return { ok: true, job: serializeJob(completed) };
  }

  const dispatching = await db.outreachAutomationJob.update({
    where: { id: job.id },
    data: { status: 'dispatching', startedAt: new Date() },
  });
  const prompt = buildOpenClawPrompt(dispatching, contact, request, guardrail as unknown as JsonRecord);
  const deepSyncContacts: Array<{ email: string }> = [];
  const dispatch = await dispatchOpenClaw({
    jobId: job.id,
    actionType: request.actionType,
    agentId: job.agentId,
    prompt,
    payload: {
      jobId: job.id,
      actionType: request.actionType,
      contact: contact ? serializeContact(contact) : null,
      contacts: deepSyncContacts,
      expectedAgentIds: request.actionType === 'deep_sync' ? REQUIRED_DEEP_SYNC_AGENT_IDS : undefined,
      expectedAgentStateRoot:
        request.actionType === 'deep_sync' ? '/Users/sasha/.openclaw/workspace/scripts/sasha_outreach' : undefined,
      guardrail,
    },
  });

  if (!dispatch.ok) {
    const failed = await db.outreachAutomationJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        transport: dispatch.transport,
        rawOutput: dispatch.rawOutput,
        resultJson: jsonString({ error: dispatch.error }),
        finishedAt: new Date(),
      },
    });
    await createOutreachEvent({
      eventType: 'send.blocked',
      contactId: contact?.id ?? null,
      email: contact?.email ?? request.email ?? '',
      jobId: job.id,
      summary: `OpenClaw dispatch failed: ${dispatch.error ?? 'unknown error'}`,
      payload: contactEventPayload(contact, {
        action: { actionType: request.actionType },
        blockedReasons: ['openclaw_dispatch_failed'],
      }),
      idempotencyKey: idempotencyKey('send.blocked', [job.id, 'openclaw_dispatch_failed']),
    });
    return { ok: false, status: 502, job: serializeJob(failed), error: dispatch.error };
  }

  const dispatched = await db.outreachAutomationJob.update({
    where: { id: job.id },
    data: {
      status: 'dispatched',
      transport: dispatch.transport,
      agentId: dispatch.agentId,
      rawOutput: dispatch.rawOutput,
      resultJson: jsonString({ parsedOutput: dispatch.parsedOutput }),
    },
  });

  if (request.actionType === 'deep_sync' && dispatch.parsedOutput && typeof dispatch.parsedOutput === 'object') {
    const parsed = dispatch.parsedOutput as { activitySnapshot?: OutreachActivitySnapshot };
    if (parsed.activitySnapshot) {
      const merge = await applyOutreachActivitySnapshot(parsed.activitySnapshot, {
        jobId: job.id,
        agentId: dispatch.agentId,
        requireAgentIds: REQUIRED_DEEP_SYNC_AGENT_IDS,
      });
      const completed = await db.outreachAutomationJob.update({
        where: { id: job.id },
        data: {
          status: merge.rejected > 0 || merge.errors?.length ? 'needs_human' : 'completed',
          resultJson: jsonString({ parsedOutput: dispatch.parsedOutput, activityMerge: merge }),
          blockedReasonsJson: merge.errors?.length ? jsonString(merge.errors, '[]') : dispatched.blockedReasonsJson,
          finishedAt: new Date(),
        },
      });
      return { ok: true, job: serializeJob(completed), dispatch, activityMerge: merge };
    }
  }
  return { ok: true, job: serializeJob(dispatched), dispatch };
}

export async function getOutreachJob(jobId: string) {
  const row = await db.outreachAutomationJob.findUnique({ where: { id: jobId } });
  return row ? serializeJob(row) : null;
}

function normalizeCallbackStatus(status: string | undefined): string {
  const normalized = status?.trim().toLowerCase() ?? '';
  if (['completed', 'success', 'sent', 'done'].includes(normalized)) return 'completed';
  if (['blocked', 'needs_human', 'failed', 'dispatched'].includes(normalized)) return normalized;
  return 'failed';
}

export async function applyOutreachOpenClawCallback(payload: OutreachCallbackPayload) {
  const jobId = payload.jobId?.trim();
  if (!jobId) return { ok: false, status: 400, error: 'jobId is required' };

  const existing = await db.outreachAutomationJob.findUnique({ where: { id: jobId } });
  if (!existing) return { ok: false, status: 404, error: 'job not found' };

  if (existing.actionType === 'deep_sync' && hasForbiddenDeepSyncInstruction(payload)) {
    const blocked = await db.outreachAutomationJob.update({
      where: { id: jobId },
      data: {
        status: 'blocked',
        agentId: payload.agentId ?? existing.agentId,
        resultJson: jsonString({ error: 'deep_sync_is_read_only', result: payload.result }),
        rawOutput: payload.rawOutput ?? existing.rawOutput,
        blockedReasonsJson: jsonString(['deep_sync_is_read_only'], '[]'),
        finishedAt: new Date(),
      },
    });
    await createOutreachEvent({
      eventType: 'send.blocked',
      email: existing.email,
      jobId,
      summary: 'Deep sync callback was blocked because it included send or draft activity.',
      payload: { action: { actionType: 'deep_sync' }, blockedReasons: ['deep_sync_is_read_only'] },
      idempotencyKey: idempotencyKey('send.blocked', [jobId, 'deep_sync_is_read_only']),
    });
    return { ok: false, status: 400, error: 'deep_sync_is_read_only', job: serializeJob(blocked) };
  }

  const status = normalizeCallbackStatus(payload.status);
  const blockedReasons = Array.isArray(payload.blockedReasons) ? payload.blockedReasons.map(String) : [];
  const activityMerge =
    existing.actionType === 'deep_sync' && payload.activitySnapshot
      ? await applyOutreachActivitySnapshot(payload.activitySnapshot, {
          jobId,
          agentId: payload.agentId ?? existing.agentId,
          requireAgentIds: REQUIRED_DEEP_SYNC_AGENT_IDS,
        })
      : null;
  const updated = await db.outreachAutomationJob.update({
    where: { id: jobId },
    data: {
      status: activityMerge && (activityMerge.rejected > 0 || activityMerge.errors?.length) ? 'needs_human' : status,
      agentId: payload.agentId ?? existing.agentId,
      resultJson: jsonString({ result: payload.result, sentMessage: payload.sentMessage, activityMerge }),
      rawOutput: payload.rawOutput ?? existing.rawOutput,
      blockedReasonsJson: jsonString(activityMerge?.errors?.length ? [...blockedReasons, ...activityMerge.errors] : blockedReasons, '[]'),
      finishedAt: ['completed', 'failed', 'blocked', 'needs_human'].includes(status) ? new Date() : existing.finishedAt,
    },
  });

  const contact = existing.contactId
    ? await db.outreachCrmContact.findUnique({ where: { id: existing.contactId } })
    : null;

  if (status === 'completed' && existing.actionType.startsWith('send_')) {
    await createOutreachEvent({
      eventType: 'send.completed',
      contactId: existing.contactId,
      email: existing.email,
      jobId,
      summary: `Outreach send completed for ${existing.email || jobId}.`,
      payload: contactEventPayload(contact, {
        action: { actionType: existing.actionType },
        sentMessage: payload.sentMessage ?? null,
        result: payload.result ?? null,
      }),
      idempotencyKey: idempotencyKey('send.completed', [jobId, payload.sentMessage ?? payload.result ?? status]),
    });
  }

  if (status === 'blocked' || status === 'needs_human' || blockedReasons.length > 0) {
    await createOutreachEvent({
      eventType: 'send.blocked',
      contactId: existing.contactId,
      email: existing.email,
      jobId,
      summary: `Outreach action requires attention for ${existing.email || jobId}.`,
      payload: contactEventPayload(contact, {
        action: { actionType: existing.actionType },
        blockedReasons,
        result: payload.result ?? null,
      }),
      idempotencyKey: idempotencyKey('send.blocked', [jobId, blockedReasons, status]),
    });
  }

  return { ok: true, job: serializeJob(updated) };
}
