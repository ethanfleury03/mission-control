import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  buildNormalizedOutreachContacts,
  buildOutreachDashboardFromSources,
  buildSashaOutreachDashboard,
  deriveOutreachStage,
  fetchHubSpotOutreachContacts,
  isDueForFollowUp,
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
  OutreachDashboardResponse,
  OutreachStateContact,
  OutreachStateSnapshot,
} from './types';

const db = prisma as any;
const SYNC_STATE_ID = 'sasha-outreach';
const MAX_LIST_LIMIT = 500;

type JsonRecord = Record<string, unknown>;

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
    email: contact.email,
    name: contact.name,
    company: contact.company,
    jobtitle: contact.jobtitle,
    stage,
    touchCount: contact.touchCount,
    lastOutboundAt: contact.lastOutboundAt ?? null,
    nextFollowupAllowedAt: contact.nextFollowupAllowedAt ?? null,
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

  if (row.nextFollowupAllowedAt && row.active && !row.stopped && isDueForFollowUp(row as any, now)) {
    const prevDue = prev?.nextFollowupAllowedAt && isDueForFollowUp(prev as any, now);
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
    snapshot: parseJson<JsonRecord>(row.snapshotJson, {}),
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
  const contacts = rows.map((row) => ({
    id: row.hubspotContactId || row.id,
    hubspotContactId: row.hubspotContactId || undefined,
    name: row.name || row.email,
    email: row.email,
    company: row.company || undefined,
    jobtitle: row.jobtitle || undefined,
    stage: row.stage || 'Drafted / Ready',
    touchCount: row.touchCount || 0,
    lastOutboundAt: iso(row.lastOutboundAt) ?? undefined,
    nextFollowupAllowedAt: iso(row.nextFollowupAllowedAt) ?? undefined,
    replyStatus: row.replyStatus || undefined,
    positiveReply: Boolean(row.positiveReply),
    stopped: Boolean(row.stopped),
    stopReason: row.stopReason || undefined,
    hubspotUrl: row.hubspotUrl || undefined,
    gmailThreadUrl: row.gmailThreadUrl || undefined,
  }));
  const activeRows = rows.filter((row) => !row.stopped);
  const initialSent = rows.filter((row) => (row.touchCount || 0) > 0 || row.lastOutboundAt).length;
  const replyRows = rows.filter(hasReplyEvidence);
  const positive = rows.filter((row) => row.positiveReply || replyStatusForRow(row) === 'Positive').length;
  const bouncedStopped = rows.filter((row) => row.stopped || row.stopReason).length;
  const dueFollowUp = activeRows.filter((row) => isDueForFollowUp(row as any, now)).length;
  const scheduled = activeRows.filter((row) => {
    const due = dateOrNull(row.nextFollowupAllowedAt);
    return Boolean(due && due.getTime() > now.getTime() && (row.touchCount || 0) < 4);
  }).length;
  const needsReview = rows.filter((row) => hasReplyEvidence(row) && (row.humanReviewRequired || replyStatusForRow(row) === 'Needs Review')).length;
  const hasAnyActivity = rows.some(hasActivity);
  const cacheSyncedAt = iso(syncState?.lastSyncedAt);
  const summary = parseJson<JsonRecord>(syncState?.summaryJson, {});

  return {
    generatedAt: now.toISOString(),
    lastSyncedAt: cacheSyncedAt,
    cacheSyncedAt,
    activitySyncedAt: typeof summary.activitySyncedAt === 'string' ? summary.activitySyncedAt : null,
    source: hasAnyActivity ? 'hubspot+activity' : rows.length > 0 ? 'hubspot' : 'mock',
    sourceWarnings: Array.isArray(summary.warnings) ? (summary.warnings as string[]) : undefined,
    kpis: {
      totalContacts: rows.length,
      active: activeRows.length,
      initialSent,
      replies: replyRows.length,
      positive,
      bouncedStopped,
      dueFollowUp,
    },
    replyRate: initialSent > 0 ? Number(((replyRows.length / initialSent) * 100).toFixed(1)) : 0,
    pipelineSummary: [
      { label: 'Initial Sent', count: initialSent, color: 'red' },
      { label: 'Replied', count: replyRows.length, color: 'red' },
      { label: 'Positive', count: positive, color: 'green' },
      { label: 'Stopped/Bounced', count: bouncedStopped, color: 'amber' },
      { label: 'Active Follow-ups', count: activeRows.length, color: 'blue' },
    ],
    followUpHealth: {
      dueToday: dueFollowUp,
      scheduled,
      needsReview,
      blocked: bouncedStopped,
      message: dueFollowUp > 0 ? `${dueFollowUp} follow-ups overdue.` : 'No follow-ups overdue.',
      severity: dueFollowUp <= 0 ? 'success' : dueFollowUp < 5 ? 'warning' : 'danger',
    },
    replies: replyRows
      .map((row) => ({
        id: row.hubspotContactId || row.id,
        hubspotContactId: row.hubspotContactId || undefined,
        company: row.company || 'Unknown company',
        contactName: row.name || row.email,
        email: row.email,
        status: replyStatusForRow(row),
        lastReplyAt: iso(row.lastReplyAt) ?? undefined,
        snippet: row.lastReplySnippet || row.stopReason || undefined,
        hubspotUrl: row.hubspotUrl || undefined,
        gmailThreadUrl: row.gmailThreadUrl || undefined,
      }))
      .sort((a, b) => {
        const aTime = dateOrNull(a.lastReplyAt)?.getTime() ?? 0;
        const bTime = dateOrNull(b.lastReplyAt)?.getTime() ?? 0;
        return bTime - aTime || a.company.localeCompare(b.company);
      }),
    contacts,
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
  input: { jobId?: string | null; agentId?: string | null } = {},
) {
  const contacts = Array.isArray(snapshot.contacts) ? snapshot.contacts : [];
  if (contacts.length === 0) {
    return { applied: 0, skipped: 0, rejected: 0, errors: ['contacts_required'] };
  }

  const rows = await db.outreachCrmContact.findMany({ where: { campaignName: OUTREACH_CAMPAIGN_ID } });
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
    const row = byEmail.get(validation.email);
    if (!row) {
      if (contact.unmatched) {
        skipped += 1;
        continue;
      }
      rejected += 1;
      errors.push(`unknown_email:${validation.email}`);
      continue;
    }

    const patch: JsonRecord = {};
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
    if (Array.isArray(contact.events)) patch.rawStateJson = jsonString({ activityEvents: contact.events });

    patch.stage = activityStage(row, patch, now);
    patch.active = !Boolean(patch.stopped ?? row.stopped);
    patch.eligibleForAutomation =
      Boolean(row.inSourceList) &&
      !row.ownerId &&
      !row.assignedTo &&
      !Boolean(patch.stopped ?? row.stopped) &&
      !Boolean(patch.humanReviewRequired ?? row.humanReviewRequired);
    patch.snapshotJson = jsonString(activitySnapshotForRow(row, patch));

    const updated = await db.outreachCrmContact.update({
      where: { id: row.id },
      data: patch,
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
  try {
    const syncState = await db.outreachCrmSyncState.findUnique({ where: { id: SYNC_STATE_ID } });
    const cached = parseJson<OutreachDashboardResponse | null>(syncState?.dashboardJson, null);
    if (cached?.contacts?.length) return cached;
  } catch {
    // Cache table may not exist before migrations are applied. The UI remains useful via live merge.
  }
  return buildSashaOutreachDashboard();
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
    const state = await loadOutreachState().catch((error) => {
      warnings.push(`State load skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
      return null;
    });

    let hubspotContacts: HubSpotOutreachContact[] = [];
    try {
      hubspotContacts = await fetchHubSpotOutreachContacts(state);
    } catch (error) {
      if (!state || Object.keys(state.contacts).length === 0) throw error;
      warnings.push(`HubSpot load skipped: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    const dashboard = buildOutreachDashboardFromSources({
      hubspotContacts,
      state,
      now,
      sourceWarnings: warnings,
    });
    const normalizedContacts = buildNormalizedOutreachContacts({ hubspotContacts, state, now });
    const stateByEmail = stateContactMap(state);
    const hubspotByEmail = hubspotContactMap(hubspotContacts);
    const existingRows = await db.outreachCrmContact.findMany({ where: { campaignName: OUTREACH_CAMPAIGN_ID } });
    const existingByEmail = new Map<string, any>(existingRows.map((row: any) => [row.email, row]));
    let eventsCreated = 0;

    for (const contact of normalizedContacts) {
      const rawState = stateByEmail.get(contact.email) ?? {};
      const rawHubspot = hubspotByEmail.get(contact.email) ?? null;
      const inSourceList = Boolean(rawHubspot);
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
      const active = !mergedStopped;
      const eligibleForAutomation =
        active &&
        inSourceList &&
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

    await db.outreachCrmSyncState.update({
      where: { id: SYNC_STATE_ID },
      data: {
        status: 'idle',
        lastSyncedAt: now,
        lastError: '',
        dashboardJson: jsonString(dashboard),
        summaryJson: jsonString({
          contactsSynced: normalizedContacts.length,
          hubspotContacts: hubspotContacts.length,
          stateContacts: Object.keys(state?.contacts ?? {}).length,
          eventsCreated,
          warnings,
        }),
      },
    });

    const cachedDashboard = await refreshDashboardCacheFromRows();

    const syncEvent = await createOutreachEvent({
      eventType: 'sync.completed',
      summary: `Outreach CRM sync completed: ${normalizedContacts.length} contacts, ${eventsCreated} events.`,
      payload: {
        campaignId: OUTREACH_CAMPAIGN_ID,
        action: { actionType: 'sync' },
        summary: { contactsSynced: normalizedContacts.length, eventsCreated, warnings },
      },
      idempotencyKey: idempotencyKey('sync.completed', [now.toISOString(), normalizedContacts.length, eventsCreated]),
      occurredAt: now,
    });
    if (syncEvent) eventsCreated += 1;

    return {
      ok: true,
      dashboard: cachedDashboard,
      contactsSynced: normalizedContacts.length,
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
    return [
      'Mission Control Outreach CRM read-only deep sync.',
      `jobId: ${job.id}`,
      `campaignId: ${OUTREACH_CAMPAIGN_ID}`,
      `callbackUrl: ${callbackUrl()}`,
      '',
      'Task:',
      '- Reconcile Sasha outreach activity from Sasha outreach state and Gmail history for the HubSpot Sasha-Outreach campaign.',
      '- Return strict JSON only and call the callback endpoint with HMAC headers.',
      '- Do not send email, draft email, modify Gmail, modify HubSpot, assign owners, or change lifecycle data.',
      '- Match contacts by normalized email. Unknown contacts must be returned with unmatched=true or omitted.',
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
  const deepSyncContacts =
    request.actionType === 'deep_sync'
      ? await db.outreachCrmContact.findMany({
          where: { campaignName: OUTREACH_CAMPAIGN_ID, inSourceList: true },
          select: { email: true },
          orderBy: { email: 'asc' },
        })
      : [];
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
      });
      const completed = await db.outreachAutomationJob.update({
        where: { id: job.id },
        data: {
          status: merge.rejected > 0 ? 'needs_human' : 'completed',
          resultJson: jsonString({ parsedOutput: dispatch.parsedOutput, activityMerge: merge }),
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
        })
      : null;
  const updated = await db.outreachAutomationJob.update({
    where: { id: jobId },
    data: {
      status: activityMerge && activityMerge.rejected > 0 ? 'needs_human' : status,
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
