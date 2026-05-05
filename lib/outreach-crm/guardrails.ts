import { isDueForFollowUp, parseDate } from './dashboard';

export const OUTREACH_CAMPAIGN_ID = 'Sasha-Outreach';
export const OUTREACH_SENDER_EMAIL = 'sasha@arrsys.com';
export const OUTREACH_REQUIRED_CC = 'shaan@arrsys.com';
export const OUTREACH_MAX_PROACTIVE_TOUCHES = 4;

export const OUTREACH_ACTION_TYPES = [
  'sync',
  'deep_sync',
  'draft_first_touch',
  'send_first_touch',
  'send_followup',
  'send_reply',
  'stop_contact',
  'classify_reply',
] as const;

export type OutreachActionType = (typeof OUTREACH_ACTION_TYPES)[number];

export interface OutreachGuardrailContact {
  id?: string;
  email: string;
  name?: string;
  company?: string;
  stage?: string;
  active: boolean;
  inSourceList: boolean;
  eligibleForAutomation?: boolean;
  ownerId?: string;
  assignedTo?: string;
  stopped?: boolean;
  stopReason?: string;
  touchCount: number;
  lastOutboundAt?: Date | string | null;
  nextFollowupAllowedAt?: Date | string | null;
  replyStatus?: string;
  lastReplyAt?: Date | string | null;
  lastReplySnippet?: string;
  positiveReply?: boolean;
  humanReviewRequired?: boolean;
}

export interface OutreachGuardrailContext {
  actionType: OutreachActionType;
  contact?: OutreachGuardrailContact | null;
  dryRun?: boolean;
  now?: Date;
  firstTouchesToday?: number;
  followupsThisRun?: number;
  senderEmail?: string;
  ccEmails?: string[];
  signatureRequired?: boolean;
}

export interface OutreachGuardrailDecision {
  allowed: boolean;
  needsHuman: boolean;
  blockedReasons: string[];
  warnings: string[];
  policy: {
    senderEmail: string;
    requiredCc: string;
    firstTouchDailyCap: number;
    followupRunCap: number;
    maxProactiveTouches: number;
    minSecondsBetweenBatchSends: number;
  };
}

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function outreachPilotPolicy() {
  return {
    senderEmail: OUTREACH_SENDER_EMAIL,
    requiredCc: OUTREACH_REQUIRED_CC,
    firstTouchDailyCap: envInt('OUTREACH_CRM_FIRST_TOUCH_DAILY_CAP', 10),
    followupRunCap: envInt('OUTREACH_CRM_FOLLOWUP_RUN_CAP', 5),
    maxProactiveTouches: OUTREACH_MAX_PROACTIVE_TOUCHES,
    minSecondsBetweenBatchSends: envInt('OUTREACH_CRM_BATCH_PACING_SECONDS', 60),
  };
}

export function isOutreachActionType(value: unknown): value is OutreachActionType {
  return typeof value === 'string' && OUTREACH_ACTION_TYPES.includes(value as OutreachActionType);
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return parseDate(value ?? undefined);
}

function lower(...values: Array<string | null | undefined>): string {
  return values.filter(Boolean).join(' ').toLowerCase();
}

function hasRequiredCc(ccEmails: string[] | undefined, requiredCc: string): boolean {
  if (!ccEmails) return true;
  return ccEmails.map((email) => email.trim().toLowerCase()).includes(requiredCc);
}

function includesSensitiveReplySignal(contact: OutreachGuardrailContact): boolean {
  const text = lower(contact.replyStatus, contact.stage, contact.stopReason, contact.lastReplySnippet);
  return /\b(needs[_ -]?human|needs review|sensitive|pricing|legal|angry|unclear|complaint|refund|lawsuit|attorney|unsubscribe|not interested|remove me)\b/.test(
    text,
  );
}

function isSafeReply(contact: OutreachGuardrailContact): boolean {
  if (contact.humanReviewRequired || includesSensitiveReplySignal(contact)) return false;
  const text = lower(contact.replyStatus, contact.stage, contact.lastReplySnippet);
  return (
    Boolean(contact.positiveReply) ||
    /\b(positive|interested|meeting|walkthrough|demo|availability|available|out[_ -]?of[_ -]?office|ooo|thanks)\b/.test(
      text,
    )
  );
}

function wasProactiveOutboundToday(contact: OutreachGuardrailContact, now: Date): boolean {
  const lastOutboundAt = asDate(contact.lastOutboundAt);
  if (!lastOutboundAt) return false;
  return now.getTime() - lastOutboundAt.getTime() < 24 * 60 * 60 * 1000;
}

function pushContactEligibilityBlocks(reasons: string[], contact: OutreachGuardrailContact | null | undefined) {
  if (!contact) {
    reasons.push('contact_required');
    return;
  }
  if (!contact.email) reasons.push('contact_email_required');
  if (!contact.inSourceList) reasons.push('contact_not_in_hubspot_sasha_outreach_list');
  if (!contact.active || contact.stopped) reasons.push('contact_stopped_or_inactive');
  if (contact.stopReason) reasons.push('contact_has_stop_reason');
  if (contact.ownerId) reasons.push('hubspot_owner_id_must_be_empty');
  if (contact.assignedTo) reasons.push('assigned_to_must_be_empty');
}

export function evaluateOutreachActionGuardrails(input: OutreachGuardrailContext): OutreachGuardrailDecision {
  const policy = outreachPilotPolicy();
  const now = input.now ?? new Date();
  const contact = input.contact ?? null;
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  if (input.actionType === 'sync' || input.actionType === 'deep_sync') {
    return { allowed: true, needsHuman: false, blockedReasons, warnings, policy };
  }

  if (input.actionType === 'stop_contact') {
    if (!contact?.email && !contact?.id) blockedReasons.push('contact_required');
    return { allowed: blockedReasons.length === 0, needsHuman: false, blockedReasons, warnings, policy };
  }

  if (input.actionType === 'classify_reply') {
    if (!contact) blockedReasons.push('contact_required');
    if (contact && !contact.lastReplyAt && !contact.lastReplySnippet) blockedReasons.push('reply_required');
    return { allowed: blockedReasons.length === 0, needsHuman: false, blockedReasons, warnings, policy };
  }

  pushContactEligibilityBlocks(blockedReasons, contact);

  if (input.senderEmail && input.senderEmail.trim().toLowerCase() !== policy.senderEmail) {
    blockedReasons.push('sender_must_be_sasha');
  }
  if (!hasRequiredCc(input.ccEmails, policy.requiredCc)) blockedReasons.push('required_shaan_cc_missing');
  if (input.signatureRequired === false) blockedReasons.push('gmail_html_signature_required');

  if (contact) {
    if (contact.humanReviewRequired) blockedReasons.push('human_review_required');

    if (input.actionType === 'draft_first_touch' || input.actionType === 'send_first_touch') {
      if (contact.touchCount > 0 || contact.lastOutboundAt) blockedReasons.push('first_touch_already_sent');
      if ((input.firstTouchesToday ?? 0) >= policy.firstTouchDailyCap) blockedReasons.push('first_touch_daily_cap_reached');
    }

    if (input.actionType === 'send_first_touch' || input.actionType === 'send_followup') {
      if (wasProactiveOutboundToday(contact, now)) blockedReasons.push('max_one_proactive_outbound_per_contact_per_day');
      if (contact.touchCount >= policy.maxProactiveTouches) blockedReasons.push('max_proactive_touches_reached');
    }

    if (input.actionType === 'send_followup') {
      if (contact.touchCount <= 0) blockedReasons.push('followup_requires_prior_touch');
      if (!isDueForFollowUp(contact as any, now)) blockedReasons.push('followup_not_due');
      if ((input.followupsThisRun ?? 0) >= policy.followupRunCap) blockedReasons.push('followup_run_cap_reached');
    }

    if (input.actionType === 'send_reply') {
      if (!contact.lastReplyAt && !contact.lastReplySnippet) blockedReasons.push('reply_required');
      if (!isSafeReply(contact)) blockedReasons.push('reply_needs_human');
    }
  }

  const needsHuman = blockedReasons.includes('reply_needs_human') || blockedReasons.includes('human_review_required');
  if (input.dryRun && blockedReasons.length === 0) warnings.push('dry_run_no_send_will_be_dispatched');

  return {
    allowed: blockedReasons.length === 0,
    needsHuman,
    blockedReasons,
    warnings,
    policy,
  };
}
