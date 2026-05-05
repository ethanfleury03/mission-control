import { readFile } from 'fs/promises';

import { HubSpotApiError, hubspotFetch } from '@/lib/hubspot/client';
import { hubspotAccessToken, hubspotContactUrl } from '@/lib/hubspot/config';
import type {
  FollowUpSeverity,
  HubSpotOutreachContact,
  NormalizedOutreachContact,
  OutreachDashboardContact,
  OutreachDashboardResponse,
  OutreachDashboardSource,
  OutreachReply,
  OutreachReplyStatus,
  OutreachStateEvent,
  OutreachStateContact,
  OutreachStateSnapshot,
  PipelineColor,
} from './types';

const DEFAULT_STATE_PATH = '/Users/sasha/.openclaw/workspace/scripts/sasha_outreach/state.json';
const DEFAULT_DASHBOARD_PATH =
  '/Users/sasha/.openclaw/workspace/scripts/sasha_outreach/run_artifacts/outreach_dashboard.json';
const DEFAULT_HUBSPOT_LIST_ID = '102';
const DEFAULT_HUBSPOT_LIST_NAME = 'Sasha-Outreach';
const MAX_PROACTIVE_TOUCHES = 4;

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
    contact.events.some(eventIndicatesInitialOutbound)
  );
}

function hasReply(contact: NormalizedContact): boolean {
  const replyStatus = contact.replyStatus.toLowerCase();
  const hasInboundEvidence = Boolean(contact.lastReplyAt || contact.lastReplySnippet || contact.lastReplySubject);
  return (
    hasInboundEvidence ||
    Boolean(contact.positiveReply && hasInboundEvidence) ||
    Boolean(contact.humanReviewRequired && hasInboundEvidence) ||
    Boolean(replyStatus && replyStatus !== 'no_reply' && replyStatus !== 'none' && hasInboundEvidence) ||
    contact.events.some(eventIndicatesReply)
  );
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
  if (isStoppedOrBounced(contact) || isPositiveLike(contact)) return false;
  if (contact.replyStatus && contact.replyStatus !== 'out_of_office') return false;
  const dueDate = parseDate(dueDateFromCadence(contact));
  return Boolean(dueDate && dueDate.getTime() <= now.getTime() && contact.touchCount < MAX_PROACTIVE_TOUCHES);
}

export function deriveOutreachStage(contact: NormalizedContact, now = new Date()): string {
  const replyStatus = contact.replyStatus;

  if (isStoppedOrBounced(contact)) return 'Stopped / Bounced / Unsubscribed';
  if (isPositiveLike(contact)) return 'Positive / Meeting Path';
  if (contact.humanReviewRequired || replyStatus === 'sensitive/needs-human') return 'Replied - Needs Review';
  if (replyStatus === 'out_of_office') return 'Out of Office';
  if (replyStatus && replyStatus !== 'bounce' && replyStatus !== 'no_reply') return 'Replied - Needs Review';
  if (isDueForFollowUp(contact, now)) {
    if (contact.touchCount === 1) return 'Due for 3-Day Follow-Up';
    if (contact.touchCount === 2) return 'Due for 5-Day Follow-Up';
    if (contact.touchCount === 3) return 'Due for 30-Day Follow-Up';
  }
  if (contact.touchCount <= 0) return contact.draftStatus ? 'Drafted / Ready' : 'Drafted / Ready';
  if (contact.touchCount === 1) return 'Initial Outreach Sent';
  if (contact.touchCount === 2) return '3-Day Follow-Up Sent';
  if (contact.touchCount === 3) return '5-Day Follow-Up Sent';
  return '30-Day Follow-Up Sent';
}

function deriveReplyStatus(contact: NormalizedContact): OutreachReplyStatus {
  const replyStatus = contact.replyStatus.toLowerCase();
  if (isStoppedOrBounced(contact) && replyStatus.includes('bounce')) return 'Bounced';
  if (isStoppedOrBounced(contact)) return replyStatus.includes('bounce') ? 'Bounced' : 'Stopped';
  if (isPositiveLike(contact)) return 'Positive';
  if (contact.humanReviewRequired || replyStatus === 'sensitive/needs-human') return 'Needs Review';
  if (replyStatus === 'out_of_office') return 'Out of Office';
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

  return {
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
    ownerId: firstDefinedString(props.hubspot_owner_id, state.hubspot_owner_id),
    assignedTo: firstDefinedString(props.assigned_to, state.assigned_to),
    touchCount: asNumber(state.touch_count),
    sentAt: iso(firstDefinedString(state.sent_at)),
    lastOutboundAt: iso(lastOutboundAt),
    nextFollowupAllowedAt: iso(nextFollowupAllowedAt),
    replyStatus: firstDefinedString(state.reply_status),
    lastReplyAt: iso(firstDefinedString(state.last_reply_at)),
    lastReplyFrom: firstDefinedString(state.last_reply_from),
    lastReplySubject: firstDefinedString(state.last_reply_subject),
    lastReplySnippet: firstDefinedString(state.last_reply_snippet),
    positiveReply: asBoolean(state.positive_reply),
    humanReviewRequired: asBoolean(state.human_review_required),
    humanReviewReason: firstDefinedString(state.human_review_reason),
    stopped: asBoolean(state.stopped) || firstDefinedString(state.status) === 'stopped',
    stopReason: firstDefinedString(state.stop_reason),
    bounceReason: firstDefinedString(state.bounce_reason),
    sendStatus: firstDefinedString(state.send_status),
    draftStatus: firstDefinedString(state.draft_status),
    status: firstDefinedString(state.status),
    sourceListId: firstDefinedString(state.source_list_id),
    sourceList: firstDefinedString(state.source_list),
    hubspotUrl: hubspotUrl || undefined,
    sentThreadId: firstDefinedString(state.sent_thread_id),
    lastReplyThreadId: firstDefinedString(state.last_reply_thread_id),
    threadIds: asStringArray(state.thread_ids),
    events,
    hubspotCreatedAt: iso(firstDefinedString(props.createdate, hubspot?.createdAt)),
    hubspotUpdatedAt: iso(firstDefinedString(props.lastmodifieddate, hubspot?.updatedAt)),
    stateSyncedAt: iso(firstDefinedString(state.synced_from_hubspot_at)),
  };
}

function toDashboardContact(contact: NormalizedContact, now: Date): OutreachDashboardContact {
  const threadId = contactGmailThreadId(contact);
  return {
    id: contact.hubspotContactId ?? contact.email,
    hubspotContactId: contact.hubspotContactId,
    name: contact.name,
    email: contact.email,
    company: contact.company || undefined,
    jobtitle: contact.jobtitle || undefined,
    stage: deriveOutreachStage(contact, now),
    touchCount: contact.touchCount,
    lastOutboundAt: contact.lastOutboundAt,
    nextFollowupAllowedAt: dueDateFromCadence(contact),
    replyStatus: contact.replyStatus || undefined,
    positiveReply: isPositiveLike(contact),
    stopped: isStoppedOrBounced(contact),
    stopReason: contact.stopReason || contact.bounceReason || undefined,
    hubspotUrl: contact.hubspotUrl,
    gmailThreadUrl: gmailThreadUrl(threadId),
  };
}

function toReply(contact: NormalizedContact): OutreachReply | null {
  if (!hasReply(contact)) return null;
  const threadId = contactGmailThreadId(contact);
  return {
    id: contact.hubspotContactId ?? contact.email,
    hubspotContactId: contact.hubspotContactId,
    company: contact.company || 'Unknown company',
    contactName: contact.name,
    email: contact.email,
    status: deriveReplyStatus(contact),
    lastReplyAt: contact.lastReplyAt,
    snippet: contact.lastReplySnippet || contact.stopReason || contact.bounceReason || contact.lastReplySubject || undefined,
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

export function buildOutreachDashboardFromSources(input: BuildDashboardInput): OutreachDashboardResponse {
  const now = input.now ?? new Date();
  const contacts = buildNormalizedOutreachContacts(input);
  const dashboardContacts = contacts.map((contact) => toDashboardContact(contact, now));
  const activeContacts = contacts.filter((contact) => !isStoppedOrBounced(contact));
  const initialSent = contacts.filter(hasInitialOutbound).length;
  const replies = contacts.filter(hasReply).length;
  const positive = contacts.filter(isPositiveLike).length;
  const bouncedStopped = contacts.filter(isStoppedOrBounced).length;
  const dueFollowUp = activeContacts.filter((contact) => isDueForFollowUp(contact, now)).length;
  const needsReview = contacts.filter((contact) => {
    const stage = deriveOutreachStage(contact, now);
    return hasReply(contact) && (contact.humanReviewRequired || stage === 'Replied - Needs Review');
  }).length;
  const scheduled = activeContacts.filter((contact) => {
    if (isPositiveLike(contact)) return false;
    const dueDate = parseDate(dueDateFromCadence(contact));
    return Boolean(dueDate && dueDate.getTime() > now.getTime() && contact.touchCount < MAX_PROACTIVE_TOUCHES);
  }).length;
  const severity = followUpSeverity(dueFollowUp);

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

  const lastSyncedAt = maxIso([
    input.state?.generatedAt,
    ...contacts.flatMap((contact) => [contact.stateSyncedAt, contact.hubspotUpdatedAt]),
  ]);

  return {
    generatedAt: now.toISOString(),
    lastSyncedAt,
    source: sourceFor(input.hubspotContacts.length, Object.keys(input.state?.contacts ?? {}).length),
    sourceWarnings: input.sourceWarnings?.length ? input.sourceWarnings : undefined,
    kpis: {
      totalContacts: contacts.length,
      active: activeContacts.length,
      initialSent,
      replies,
      positive,
      bouncedStopped,
      dueFollowUp,
    },
    replyRate: initialSent > 0 ? Number(((replies / initialSent) * 100).toFixed(1)) : 0,
    pipelineSummary: [
      pipelineItem('Initial Sent', initialSent, 'red'),
      pipelineItem('Replied', replies, 'red'),
      pipelineItem('Positive', positive, 'green'),
      pipelineItem('Stopped/Bounced', bouncedStopped, 'amber'),
      pipelineItem('Active Follow-ups', activeContacts.length, 'blue'),
    ],
    followUpHealth: {
      dueToday: dueFollowUp,
      scheduled,
      needsReview,
      blocked: bouncedStopped,
      message: dueFollowUp > 0 ? `${dueFollowUp} follow-ups overdue.` : 'No follow-ups overdue.',
      severity,
    },
    replies: replyRows,
    contacts: dashboardContacts,
  };
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
    .map((email) => normalizeOutreachContact(email, stateContacts[email], hubspotByEmail.get(email)));
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

export async function loadOutreachState(): Promise<OutreachStateSnapshot | null> {
  const statePath = envValue('SASHA_OUTREACH_STATE_PATH', 'OUTREACH_CRM_STATE_PATH') ?? DEFAULT_STATE_PATH;
  const stateJson = await readJsonFile(statePath);
  if (!stateJson || typeof stateJson !== 'object') return null;

  let generatedAt: string | null = asString((stateJson as { created_at?: unknown }).created_at) || null;
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
  };
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

export async function fetchHubSpotOutreachContacts(state: OutreachStateSnapshot | null): Promise<HubSpotOutreachContact[]> {
  if (!hubspotAccessToken()) return [];
  const listId = resolveListId(state);
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
    sourceWarnings,
  });
}
