import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { DEFAULT_PHONE_SETTINGS, getPhoneAgentProfile, getPhoneAgentProfiles, PHONE_FUTURE_SOURCE_CONNECTORS } from './config';
import { parsePhoneCsv, previewPhoneCsvImport } from './csv-import';
import {
  prismaPhoneCallToDomain,
  prismaPhoneCampaignToDomain,
  prismaPhoneListToDomain,
  prismaPhoneSettingsToDomain,
} from './db-mappers';
import {
  deriveBookedFlag,
  isConnectedDisposition,
  normalizeCallDisposition,
  shouldRetryDisposition,
} from './dispositions';
import { normalizePhone } from './phone-normalization';
import { getRetellCall, listRetellCalls } from './retell';
import { formatDayLabel, getZonedDateKey } from './time';
import type {
  PhoneAgentProfile,
  PhoneCall,
  PhoneCallFilters,
  PhoneCallLogResponse,
  PhoneCampaign,
  PhoneCampaignBanner,
  PhoneCampaignSettings,
  PhoneCsvPreview,
  PhoneHomeData,
  PhoneList,
  PhoneProviderInfo,
  PhoneSettings,
  PhoneSettingsResponse,
  PhoneWeekday,
} from './types';

type ListEntryInput = {
  companyName?: string;
  contactName?: string;
  title?: string;
  phoneRaw: string;
  email?: string;
  website?: string;
  country?: string;
  timezone?: string;
  notes?: string;
  sourceMetadata?: Record<string, unknown>;
  sourceExternalId?: string | null;
};

let phoneSchemaReady: Promise<void> | null = null;

function stringifyJson(value: unknown, fallback = '{}'): string {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback));
  } catch {
    return fallback;
  }
}

async function ensurePhoneSchema(): Promise<void> {
  if (phoneSchemaReady) return phoneSchemaReady;
  phoneSchemaReady = Promise.resolve();
  return phoneSchemaReady;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalString(value: unknown): string | null {
  const next = stringValue(value).trim();
  return next || null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  const num = numberValue(value);
  if (num && num > 10_000_000_000) return new Date(num);
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function transcriptToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';

  return value
    .map((turn) => {
      const record = parseObject(turn);
      const speaker = stringValue(record.speaker) || stringValue(record.role) || 'speaker';
      const text = stringValue(record.text) || stringValue(record.content);
      return text ? `${speaker}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function getRecordingUrl(call: Record<string, unknown>): string {
  const directKeys = ['recording_url', 'recordingUrl', 'call_recording_url', 'recording_url_signed'];
  for (const key of directKeys) {
    const value = stringValue(call[key]);
    if (value) return value;
  }

  const recording = parseObject(call.recording);
  return (
    stringValue(recording.url) ||
    stringValue(recording.signed_url) ||
    stringValue(parseObject(call.public_log).url)
  );
}

function buildCampaignSettingsSnapshot(
  settings: PhoneSettings,
  overrides?: Partial<PhoneCampaignSettings>,
): PhoneCampaignSettings {
  return {
    defaultTimezone: overrides?.defaultTimezone ?? settings.defaultTimezone,
    businessHoursStart: overrides?.businessHoursStart ?? settings.businessHoursStart,
    businessHoursEnd: overrides?.businessHoursEnd ?? settings.businessHoursEnd,
    activeWeekdays: overrides?.activeWeekdays ?? settings.activeWeekdays,
    dailyCallCap: overrides?.dailyCallCap ?? settings.dailyCallCap,
    cooldownSeconds: overrides?.cooldownSeconds ?? settings.cooldownSeconds,
    maxAttemptsPerLead: overrides?.maxAttemptsPerLead ?? settings.maxAttemptsPerLead,
    retryDelayMinutes: overrides?.retryDelayMinutes ?? settings.retryDelayMinutes,
    voicemailEnabled: overrides?.voicemailEnabled ?? settings.voicemailEnabled,
    autoPauseAfterRepeatedFailures:
      overrides?.autoPauseAfterRepeatedFailures ?? settings.autoPauseAfterRepeatedFailures,
    defaultSourceBehavior: overrides?.defaultSourceBehavior ?? settings.defaultSourceBehavior,
  };
}

function prepareListEntries(entries: ListEntryInput[]) {
  const seen = new Set<string>();
  const prepared = entries
    .map((entry) => {
      const phoneNormalized = normalizePhone(entry.phoneRaw);
      const duplicateWithinList = Boolean(phoneNormalized && seen.has(phoneNormalized));
      if (phoneNormalized) seen.add(phoneNormalized);

      return {
        companyName: entry.companyName?.trim() ?? '',
        contactName: entry.contactName?.trim() ?? '',
        title: entry.title?.trim() ?? '',
        phoneRaw: entry.phoneRaw.trim(),
        phoneNormalized,
        email: entry.email?.trim() ?? '',
        website: entry.website?.trim() ?? '',
        country: entry.country?.trim() ?? '',
        timezone: entry.timezone?.trim() ?? '',
        notes: entry.notes?.trim() ?? '',
        sourceMetadataJson: stringifyJson(entry.sourceMetadata ?? {}),
        sourceExternalId: entry.sourceExternalId ?? null,
        queueState: phoneNormalized ? 'ready' : 'invalid',
        duplicateWithinList,
        attempts: 0,
        lastOutcome: 'unknown',
      };
    })
    .filter((entry) => {
      const hasIdentity =
        entry.companyName ||
        entry.contactName ||
        entry.phoneRaw ||
        entry.email ||
        entry.website ||
        entry.notes;
      return Boolean(hasIdentity);
    });

  const dialableEntries = prepared.filter(
    (entry) => entry.phoneNormalized && !entry.duplicateWithinList,
  ).length;
  const invalidEntries = prepared.filter((entry) => !entry.phoneNormalized).length;
  const duplicateEntries = prepared.filter((entry) => entry.duplicateWithinList).length;

  return {
    prepared,
    counts: {
      totalEntries: prepared.length,
      dialableEntries,
      invalidEntries,
      duplicateEntries,
    },
  };
}

function parseActiveWeekdays(value: unknown): PhoneWeekday[] {
  if (!Array.isArray(value)) return DEFAULT_PHONE_SETTINGS.activeWeekdays;
  const weekdays = value.map((item) => String(item).trim().slice(0, 3).toLowerCase()) as PhoneWeekday[];
  const allowed = new Set<PhoneWeekday>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  const filtered = weekdays.filter((weekday) => allowed.has(weekday));
  return filtered.length ? filtered : DEFAULT_PHONE_SETTINGS.activeWeekdays;
}

export async function ensurePhoneSettingsRow() {
  await ensurePhoneSchema();
  try {
    return await prisma.phoneSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        defaultTimezone: DEFAULT_PHONE_SETTINGS.defaultTimezone,
        businessHoursStart: DEFAULT_PHONE_SETTINGS.businessHoursStart,
        businessHoursEnd: DEFAULT_PHONE_SETTINGS.businessHoursEnd,
        activeWeekdaysJson: stringifyJson(DEFAULT_PHONE_SETTINGS.activeWeekdays, '[]'),
        dailyCallCap: DEFAULT_PHONE_SETTINGS.dailyCallCap,
        cooldownSeconds: DEFAULT_PHONE_SETTINGS.cooldownSeconds,
        maxAttemptsPerLead: DEFAULT_PHONE_SETTINGS.maxAttemptsPerLead,
        retryDelayMinutes: DEFAULT_PHONE_SETTINGS.retryDelayMinutes,
        voicemailEnabled: DEFAULT_PHONE_SETTINGS.voicemailEnabled,
        autoPauseAfterRepeatedFailures: DEFAULT_PHONE_SETTINGS.autoPauseAfterRepeatedFailures,
        defaultSourceBehavior: DEFAULT_PHONE_SETTINGS.defaultSourceBehavior,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.phoneSettings.findUnique({ where: { id: 'default' } });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function previewPhoneListImport(text: string): Promise<PhoneCsvPreview> {
  await ensurePhoneSchema();
  return previewPhoneCsvImport(text);
}

export async function createPhoneList(input: {
  sourceType: PhoneList['sourceType'];
  displayName: string;
  notes?: string;
  sourceMetadata?: Record<string, unknown>;
  entries: ListEntryInput[];
}): Promise<PhoneList> {
  await ensurePhoneSchema();
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error('List name is required');

  const { prepared, counts } = prepareListEntries(input.entries);

  const list = await prisma.phoneList.create({
    data: {
      sourceType: input.sourceType,
      displayName,
      notes: input.notes?.trim() ?? '',
      sourceMetadataJson: stringifyJson(input.sourceMetadata ?? {}),
      totalEntries: counts.totalEntries,
      dialableEntries: counts.dialableEntries,
      invalidEntries: counts.invalidEntries,
      duplicateEntries: counts.duplicateEntries,
      entries: prepared.length
        ? {
            createMany: {
              data: prepared,
            },
          }
        : undefined,
    },
    include: { entries: true },
  });

  return prismaPhoneListToDomain(list);
}

export async function commitPhoneCsvImport(input: {
  displayName: string;
  notes?: string;
  text: string;
}): Promise<PhoneList> {
  await ensurePhoneSchema();
  const parsed = parsePhoneCsv(input.text);
  if (!parsed.rows.length) throw new Error('CSV must include at least one data row');
  if (!parsed.suggestedMap) throw new Error('Could not detect relevant call-list columns');

  return createPhoneList({
    sourceType: 'uploaded_csv',
    displayName: input.displayName,
    notes: input.notes,
    sourceMetadata: {
      header: parsed.header,
      suggestedMap: parsed.suggestedMap,
    },
    entries: parsed.rows.map((row) => ({
      companyName: row.companyName,
      contactName: row.contactName,
      title: row.title,
      phoneRaw: row.phoneRaw,
      email: row.email,
      website: row.website,
      country: row.country,
      timezone: row.timezone,
      notes: row.notes,
      sourceMetadata: {
        rowNumber: row.rowNumber,
        isDuplicate: row.isDuplicate,
      },
    })),
  });
}

export async function getPhoneLists(): Promise<PhoneList[]> {
  await ensurePhoneSchema();
  const rows = await prisma.phoneList.findMany({
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return rows.map((row) => prismaPhoneListToDomain(row));
}

export async function getPhoneListById(listId: string): Promise<PhoneList | null> {
  await ensurePhoneSchema();
  const row = await prisma.phoneList.findUnique({
    where: { id: listId },
    include: {
      entries: {
        orderBy: [{ createdAt: 'asc' }],
      },
    },
  });

  return row ? prismaPhoneListToDomain(row) : null;
}

export async function updatePhoneList(
  listId: string,
  patch: { displayName?: string; notes?: string; status?: PhoneList['status'] },
): Promise<PhoneList> {
  await ensurePhoneSchema();
  const row = await prisma.phoneList.update({
    where: { id: listId },
    data: {
      ...(patch.displayName !== undefined ? { displayName: patch.displayName.trim() } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes.trim() } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    },
  });

  return prismaPhoneListToDomain(row);
}

export async function deletePhoneList(listId: string): Promise<void> {
  await ensurePhoneSchema();
  await prisma.phoneList.delete({ where: { id: listId } });
}

export async function getPhoneCampaigns(): Promise<PhoneCampaign[]> {
  await ensurePhoneSchema();
  const rows = await prisma.phoneCampaign.findMany({
    include: {
      list: { select: { displayName: true } },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return rows.map((row) => prismaPhoneCampaignToDomain(row));
}

export async function createPhoneCampaign(input: {
  name: string;
  listId: string;
  agentProfileKey?: string;
  settings?: Partial<PhoneCampaignSettings>;
}): Promise<PhoneCampaign> {
  await ensurePhoneSchema();
  const list = await prisma.phoneList.findUnique({ where: { id: input.listId } });
  if (!list) throw new Error('List not found');

  const settingsRow = prismaPhoneSettingsToDomain(await ensurePhoneSettingsRow());
  const agentProfile = getPhoneAgentProfile(input.agentProfileKey);
  if (!agentProfile) throw new Error('Agent profile not found');

  const row = await prisma.phoneCampaign.create({
    data: {
      listId: input.listId,
      name: input.name.trim() || `${list.displayName} Campaign`,
      agentProfileKey: agentProfile.key,
      settingsJson: stringifyJson(buildCampaignSettingsSnapshot(settingsRow, input.settings)),
      status: list.dialableEntries > 0 ? 'ready' : 'draft',
    },
    include: {
      list: { select: { displayName: true } },
    },
  });

  return prismaPhoneCampaignToDomain(row);
}

export async function updatePhoneCampaign(
  campaignId: string,
  patch: {
    name?: string;
    listId?: string;
    agentProfileKey?: string;
    settings?: Partial<PhoneCampaignSettings>;
  },
): Promise<PhoneCampaign> {
  await ensurePhoneSchema();
  const existing = await prisma.phoneCampaign.findUnique({ where: { id: campaignId } });
  if (!existing) throw new Error('Campaign not found');

  if (patch.listId) {
    const list = await prisma.phoneList.findUnique({ where: { id: patch.listId } });
    if (!list) throw new Error('List not found');
  }
  if (patch.agentProfileKey && !getPhoneAgentProfile(patch.agentProfileKey)) {
    throw new Error('Agent profile not found');
  }

  let parsedExistingSettings: Partial<PhoneCampaignSettings> = {};
  try {
    parsedExistingSettings = JSON.parse(existing.settingsJson || '{}') as Partial<PhoneCampaignSettings>;
  } catch {
    parsedExistingSettings = {};
  }

  const currentSettings = buildCampaignSettingsSnapshot(
    prismaPhoneSettingsToDomain(await ensurePhoneSettingsRow()),
    parsedExistingSettings,
  );
  const nextSettings = buildCampaignSettingsSnapshot(
    {
      id: 'default',
      ...currentSettings,
      lastRetellSyncAt: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    patch.settings,
  );

  const row = await prisma.phoneCampaign.update({
    where: { id: campaignId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.listId !== undefined ? { listId: patch.listId } : {}),
      ...(patch.agentProfileKey !== undefined ? { agentProfileKey: patch.agentProfileKey } : {}),
      ...(patch.settings ? { settingsJson: stringifyJson(nextSettings) } : {}),
    },
    include: {
      list: { select: { displayName: true } },
    },
  });

  return prismaPhoneCampaignToDomain(row);
}

async function ensureNoOtherRunningCampaign(campaignId: string) {
  const running = await prisma.phoneCampaign.findFirst({
    where: {
      status: 'running',
      NOT: { id: campaignId },
    },
  });
  if (running) throw new Error('Only one active campaign is allowed at a time in v1');
}

export async function startPhoneCampaign(campaignId: string): Promise<PhoneCampaign> {
  await ensurePhoneSchema();
  const campaign = await prisma.phoneCampaign.findUnique({
    where: { id: campaignId },
    include: { list: { select: { displayName: true, dialableEntries: true } } },
  });
  if (!campaign) throw new Error('Campaign not found');
  if (campaign.list.dialableEntries <= 0) throw new Error('Selected list has no dialable contacts');

  await ensureNoOtherRunningCampaign(campaignId);

  const row = await prisma.phoneCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'running',
      pausedAt: null,
      completedAt: null,
      failedAt: null,
      startedAt: campaign.startedAt ?? new Date(),
    },
    include: { list: { select: { displayName: true } } },
  });

  return prismaPhoneCampaignToDomain(row);
}

export async function pausePhoneCampaign(campaignId: string): Promise<PhoneCampaign> {
  await ensurePhoneSchema();
  const row = await prisma.phoneCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'paused',
      pausedAt: new Date(),
    },
    include: { list: { select: { displayName: true } } },
  });

  return prismaPhoneCampaignToDomain(row);
}

export async function resumePhoneCampaign(campaignId: string): Promise<PhoneCampaign> {
  await ensurePhoneSchema();
  await ensureNoOtherRunningCampaign(campaignId);

  const row = await prisma.phoneCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'running',
      pausedAt: null,
      failedAt: null,
    },
    include: { list: { select: { displayName: true } } },
  });

  return prismaPhoneCampaignToDomain(row);
}

function buildPhoneCallWhere(filters: PhoneCallFilters): Prisma.PhoneCallWhereInput {
  const where: Prisma.PhoneCallWhereInput = {};

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }
  if (filters.listId) where.listId = filters.listId;
  if (filters.campaignId) where.campaignId = filters.campaignId;
  if (filters.disposition) where.disposition = filters.disposition;
  if (filters.bookedOnly) where.bookedFlag = true;
  if (filters.answered === 'answered') {
    where.disposition = {
      notIn: ['no_answer', 'busy', 'failed', 'voicemail'],
    };
  }
  if (filters.answered === 'not_connected') {
    where.disposition = {
      in: ['no_answer', 'busy', 'failed', 'voicemail'],
    };
  }
  if (filters.q) {
    where.OR = [
      { providerCallId: { contains: filters.q } },
      { summary: { contains: filters.q } },
      { metadataJson: { contains: filters.q } },
      { listEntry: { is: { companyName: { contains: filters.q } } } },
      { listEntry: { is: { contactName: { contains: filters.q } } } },
      { listEntry: { is: { phoneNormalized: { contains: filters.q } } } },
    ];
  }

  return where;
}

export async function getPhoneCalls(filters: PhoneCallFilters = {}): Promise<PhoneCallLogResponse> {
  await ensurePhoneSchema();
  const [rows, lists, campaigns] = await Promise.all([
    prisma.phoneCall.findMany({
      where: buildPhoneCallWhere(filters),
      include: {
        campaign: { select: { name: true } },
        list: { select: { displayName: true } },
        listEntry: { select: { companyName: true, contactName: true, phoneNormalized: true } },
      },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
      take: 250,
    }),
    prisma.phoneList.findMany({
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    }),
    prisma.phoneCampaign.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    items: rows.map((row) => prismaPhoneCallToDomain(row)),
    filterOptions: {
      lists,
      campaigns,
    },
  };
}

export async function getPhoneCallById(callId: string): Promise<PhoneCall | null> {
  await ensurePhoneSchema();
  let row = await prisma.phoneCall.findUnique({
    where: { id: callId },
    include: {
      campaign: { select: { name: true } },
      list: { select: { displayName: true } },
      listEntry: { select: { companyName: true, contactName: true, phoneNormalized: true } },
      events: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!row) return null;

  if (!row.transcript && row.providerCallId && !row.providerCallId.startsWith('launch_error_')) {
    try {
      const refreshed = await getRetellCall(row.providerCallId);
      await upsertPhoneCallFromRetellCall(refreshed, 'detail_refresh');
      row = await prisma.phoneCall.findUnique({
        where: { id: callId },
        include: {
          campaign: { select: { name: true } },
          list: { select: { displayName: true } },
          listEntry: { select: { companyName: true, contactName: true, phoneNormalized: true } },
          events: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    } catch {
      // Keep the local row if Retell refresh fails.
    }
  }

  return row ? prismaPhoneCallToDomain(row) : null;
}

function getRates(calls: PhoneCall[]) {
  const total = calls.length || 1;
  const connected = calls.filter((call) => isConnectedDisposition(call.disposition)).length;
  const booked = calls.filter((call) => call.bookedFlag).length;
  const doNotCall = calls.filter((call) => call.disposition === 'do_not_call').length;
  const averageDurationMs =
    calls.filter((call) => (call.durationMs ?? 0) > 0).reduce((sum, call) => sum + (call.durationMs ?? 0), 0) /
    Math.max(1, calls.filter((call) => (call.durationMs ?? 0) > 0).length);

  return {
    connectRate: connected / total,
    bookedRate: booked / total,
    doNotCallRate: doNotCall / total,
    averageDurationMs: Number.isFinite(averageDurationMs) ? Math.round(averageDurationMs) : 0,
  };
}

async function buildActiveCampaignBanner(
  campaigns: PhoneCampaign[],
): Promise<PhoneCampaignBanner | null> {
  const campaign =
    campaigns.find((item) => item.status === 'running') ??
    campaigns.find((item) => item.status === 'paused') ??
    campaigns.find((item) => item.status === 'ready') ??
    null;
  if (!campaign) return null;

  const [entryCounts, lastCall, nextRetry] = await Promise.all([
    prisma.phoneListEntry.groupBy({
      by: ['queueState'],
      where: { listId: campaign.listId },
      _count: { _all: true },
    }),
    prisma.phoneCall.findFirst({
      where: { campaignId: campaign.id },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.phoneListEntry.findFirst({
      where: {
        listId: campaign.listId,
        queueState: 'retry_due',
        retryAfter: { not: null },
      },
      orderBy: { retryAfter: 'asc' },
    }),
  ]);

  const countByState = Object.fromEntries(entryCounts.map((item) => [item.queueState, item._count._all])) as Record<
    string,
    number
  >;
  const callsRemaining =
    (countByState.ready ?? 0) + (countByState.retry_due ?? 0) + (countByState.in_progress ?? 0);
  const callsCompleted =
    (countByState.completed ?? 0) +
    (countByState.dnc ?? 0) +
    (countByState.invalid ?? 0) +
    (countByState.skipped ?? 0);

  let pacingStatus = 'Queue ready';
  if (campaign.status === 'paused') pacingStatus = 'Paused';
  else if (countByState.in_progress) pacingStatus = 'Call in progress';
  else if (nextRetry?.retryAfter) pacingStatus = 'Waiting on retry window';
  else if (callsRemaining === 0) pacingStatus = 'Queue complete';

  return {
    ...campaign,
    callsCompleted,
    callsRemaining,
    pacingStatus,
    lastCallTime: lastCall?.startedAt?.toISOString() ?? lastCall?.createdAt.toISOString() ?? null,
    nextRetryWindow: nextRetry?.retryAfter?.toISOString() ?? null,
  };
}

export async function getPhoneHomeData(): Promise<PhoneHomeData> {
  await ensurePhoneSchema();
  const settings = prismaPhoneSettingsToDomain(await ensurePhoneSettingsRow());
  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);

  const [listsRows, campaignRows, recentCallRows, metricCallRows] = await Promise.all([
    prisma.phoneList.findMany({
      orderBy: [{ updatedAt: 'desc' }],
    }),
    prisma.phoneCampaign.findMany({
      include: { list: { select: { displayName: true } } },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.phoneCall.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      include: {
        campaign: { select: { name: true } },
        list: { select: { displayName: true } },
        listEntry: { select: { companyName: true, contactName: true, phoneNormalized: true } },
      },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    }),
    prisma.phoneCall.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      include: {
        campaign: { select: { name: true } },
        list: { select: { displayName: true } },
        listEntry: { select: { companyName: true, contactName: true, phoneNormalized: true } },
      },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  const lists = listsRows.map((row) => prismaPhoneListToDomain(row));
  const campaigns = campaignRows.map((row) => prismaPhoneCampaignToDomain(row));
  const recentCalls = recentCallRows.map((row) => prismaPhoneCallToDomain(row)).slice(0, 8);
  const metricCalls = metricCallRows.map((row) => prismaPhoneCallToDomain(row));

  const todayKey = getZonedDateKey(new Date(), settings.defaultTimezone);
  const callsToday = metricCalls.filter((call) =>
    getZonedDateKey(new Date(call.startedAt ?? call.createdAt), settings.defaultTimezone) === todayKey,
  ).length;

  const callsByDayMap = new Map<string, number>();
  const bookedTrendMap = new Map<string, { booked: number; notBooked: number }>();
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    const key = getZonedDateKey(date, settings.defaultTimezone);
    callsByDayMap.set(key, 0);
    bookedTrendMap.set(key, { booked: 0, notBooked: 0 });
  }

  for (const call of metricCalls) {
    const key = getZonedDateKey(new Date(call.startedAt ?? call.createdAt), settings.defaultTimezone);
    if (callsByDayMap.has(key)) {
      callsByDayMap.set(key, (callsByDayMap.get(key) ?? 0) + 1);
      const trend = bookedTrendMap.get(key) ?? { booked: 0, notBooked: 0 };
      if (call.bookedFlag) trend.booked++;
      else trend.notBooked++;
      bookedTrendMap.set(key, trend);
    }
  }

  const outcomeCounts = new Map<PhoneCall['disposition'], number>();
  recentCallRows.forEach((row) => {
    const disposition = row.disposition as PhoneCall['disposition'];
    outcomeCounts.set(disposition, (outcomeCounts.get(disposition) ?? 0) + 1);
  });

  const activeCampaign = await buildActiveCampaignBanner(campaigns);
  const rates = getRates(metricCalls);

  return {
    summary: {
      totalDialableContacts: lists.reduce((sum, list) => sum + list.dialableEntries, 0),
      activeListSize:
        activeCampaign
          ? lists.find((list) => list.id === activeCampaign.listId)?.dialableEntries ?? 0
          : lists[0]?.dialableEntries ?? 0,
      callsToday,
      connectRate: rates.connectRate,
      bookedRate: rates.bookedRate,
      doNotCallRate: rates.doNotCallRate,
      averageCallDurationMs: rates.averageDurationMs,
    },
    activeCampaign,
    charts: {
      callsByDay: Array.from(callsByDayMap.entries()).map(([day, calls]) => ({
        day: formatDayLabel(day),
        calls,
      })),
      outcomesByDisposition: Array.from(outcomeCounts.entries())
        .map(([disposition, count]) => ({ disposition, count }))
        .sort((a, b) => b.count - a.count),
      bookedTrend: Array.from(bookedTrendMap.entries()).map(([day, counts]) => ({
        day: formatDayLabel(day),
        booked: counts.booked,
        notBooked: counts.notBooked,
      })),
    },
    lists,
    campaigns,
    recentCalls,
    agentProfiles: getPhoneAgentProfiles(),
    settings,
    futureSources: PHONE_FUTURE_SOURCE_CONNECTORS,
  };
}

export async function getPhoneSettingsResponse(): Promise<PhoneSettingsResponse> {
  await ensurePhoneSchema();
  const settings = prismaPhoneSettingsToDomain(await ensurePhoneSettingsRow());
  const profile = getPhoneAgentProfile();
  const providerInfo: PhoneProviderInfo = {
    providerName: 'Retell AI',
    agentProfileLabel: profile?.label ?? 'No configured profile',
    agentId: profile?.agentId ?? '',
    conversationFlowId: profile?.conversationFlowId ?? '',
    outboundNumberLabel: profile?.outboundNumberLabel ?? 'Locked outbound number',
    outboundNumber: profile?.outboundNumber ?? '',
    voiceLabel: profile?.voiceLabel ?? '',
    webhookStatus: profile?.webhookStatus ?? 'Unknown',
    lastSyncTime: settings.lastRetellSyncAt,
  };

  return {
    settings,
    agentProfiles: getPhoneAgentProfiles(),
    providerInfo,
    futureSources: PHONE_FUTURE_SOURCE_CONNECTORS,
  };
}

export async function updatePhoneSettings(
  patch: Partial<PhoneSettings>,
): Promise<PhoneSettingsResponse> {
  await ensurePhoneSchema();
  const row = await ensurePhoneSettingsRow();
  await prisma.phoneSettings.update({
    where: { id: row.id },
    data: {
      ...(patch.defaultTimezone ? { defaultTimezone: patch.defaultTimezone.trim() } : {}),
      ...(patch.businessHoursStart ? { businessHoursStart: patch.businessHoursStart.trim() } : {}),
      ...(patch.businessHoursEnd ? { businessHoursEnd: patch.businessHoursEnd.trim() } : {}),
      ...(patch.activeWeekdays ? { activeWeekdaysJson: stringifyJson(parseActiveWeekdays(patch.activeWeekdays), '[]') } : {}),
      ...(typeof patch.dailyCallCap === 'number' ? { dailyCallCap: patch.dailyCallCap } : {}),
      ...(typeof patch.cooldownSeconds === 'number' ? { cooldownSeconds: patch.cooldownSeconds } : {}),
      ...(typeof patch.maxAttemptsPerLead === 'number'
        ? { maxAttemptsPerLead: patch.maxAttemptsPerLead }
        : {}),
      ...(typeof patch.retryDelayMinutes === 'number'
        ? { retryDelayMinutes: patch.retryDelayMinutes }
        : {}),
      ...(typeof patch.voicemailEnabled === 'boolean' ? { voicemailEnabled: patch.voicemailEnabled } : {}),
      ...(typeof patch.autoPauseAfterRepeatedFailures === 'boolean'
        ? { autoPauseAfterRepeatedFailures: patch.autoPauseAfterRepeatedFailures }
        : {}),
      ...(patch.defaultSourceBehavior ? { defaultSourceBehavior: patch.defaultSourceBehavior.trim() } : {}),
    },
  });

  return getPhoneSettingsResponse();
}

async function resolveRelationId<T extends 'campaign' | 'list' | 'entry'>(
  type: T,
  id: string | null,
): Promise<string | null> {
  if (!id) return null;
  if (type === 'campaign') {
    const exists = await prisma.phoneCampaign.findUnique({ where: { id } });
    return exists?.id ?? null;
  }
  if (type === 'list') {
    const exists = await prisma.phoneList.findUnique({ where: { id } });
    return exists?.id ?? null;
  }
  const exists = await prisma.phoneListEntry.findUnique({ where: { id } });
  return exists?.id ?? null;
}

async function updateEntryOutcomeFromCall(input: {
  listEntryId: string;
  campaignId: string | null;
  disposition: PhoneCall['disposition'];
  startedAt: Date | null;
  isNewCall: boolean;
}) {
  const entry = await prisma.phoneListEntry.findUnique({ where: { id: input.listEntryId } });
  if (!entry) return;

  let attempts = entry.attempts;
  if (input.isNewCall && entry.queueState !== 'in_progress') attempts += 1;

  let settings = prismaPhoneSettingsToDomain(await ensurePhoneSettingsRow());
  if (input.campaignId) {
    const campaign = await prisma.phoneCampaign.findUnique({ where: { id: input.campaignId } });
    if (campaign) {
      try {
        settings = {
          ...settings,
          ...JSON.parse(campaign.settingsJson),
        } as PhoneSettings;
      } catch {
        // ignore malformed snapshots
      }
    }
  }

  let queueState: Prisma.PhoneListEntryUpdateInput['queueState'] = 'completed';
  let retryAfter: Date | null = null;
  if (!entry.phoneNormalized) queueState = 'invalid';
  else if (input.disposition === 'do_not_call') queueState = 'dnc';
  else if (shouldRetryDisposition(input.disposition) && attempts < settings.maxAttemptsPerLead) {
    queueState = 'retry_due';
    retryAfter = new Date(Date.now() + settings.retryDelayMinutes * 60 * 1000);
  }

  await prisma.phoneListEntry.update({
    where: { id: entry.id },
    data: {
      attempts,
      queueState,
      retryAfter,
      lastOutcome: input.disposition,
      lastCallAt: input.startedAt ?? new Date(),
    },
  });
}

export async function upsertPhoneCallFromRetellCall(
  call: Record<string, unknown>,
  eventType?: string,
): Promise<{ created: boolean; call: PhoneCall }> {
  await ensurePhoneSchema();
  const providerCallId = stringValue(call.call_id);
  if (!providerCallId) throw new Error('Retell call payload is missing call_id');

  const metadata = parseObject(call.metadata);
  const dynamicVariables = Object.fromEntries(
    Object.entries(parseObject(call.retell_llm_dynamic_variables)).map(([key, value]) => [key, String(value)]),
  );
  const analysis = parseObject(call.call_analysis);
  const disposition = normalizeCallDisposition(call);
  const bookedFlag = deriveBookedFlag(call, disposition);
  const startedAt = toDate(call.start_timestamp);
  const endedAt = toDate(call.end_timestamp);
  const durationMs =
    numberValue(call.duration_ms) ??
    (startedAt && endedAt ? Math.max(0, endedAt.getTime() - startedAt.getTime()) : null);
  const summary = stringValue(analysis.call_summary) || stringValue(call.call_summary);
  const transcript =
    transcriptToText(call.transcript_with_tool_calls) ||
    transcriptToText(call.transcript_object) ||
    transcriptToText(call.transcript) ||
    stringValue(call.transcript);

  const campaignId = await resolveRelationId(
    'campaign',
    optionalString(metadata.phoneCampaignId ?? metadata.campaignId),
  );
  const listId = await resolveRelationId('list', optionalString(metadata.phoneListId ?? metadata.listId));
  const listEntryId = await resolveRelationId(
    'entry',
    optionalString(metadata.phoneListEntryId ?? metadata.listEntryId ?? metadata.entryId),
  );

  const existing = await prisma.phoneCall.findUnique({ where: { providerCallId } });
  const row = existing
    ? await prisma.phoneCall.update({
        where: { providerCallId },
        data: {
          campaignId,
          listId,
          listEntryId,
          agentProfileKey:
            optionalString(metadata.agentProfileKey) || stringValue(call.agent_id) || existing.agentProfileKey,
          providerStatus: stringValue(call.call_status) || existing.providerStatus,
          disposition,
          bookedFlag,
          summary,
          transcript,
          recordingUrl: getRecordingUrl(call),
          disconnectionReason: stringValue(call.disconnection_reason),
          dynamicVariablesJson: stringifyJson(dynamicVariables),
          metadataJson: stringifyJson(metadata),
          analysisJson: stringifyJson(analysis),
          rawPayloadJson: stringifyJson(call),
          startedAt,
          endedAt,
          durationMs,
        },
        include: {
          campaign: { select: { name: true } },
          list: { select: { displayName: true } },
          listEntry: { select: { companyName: true, contactName: true, phoneNormalized: true } },
          events: { orderBy: { createdAt: 'asc' } },
        },
      })
    : await prisma.phoneCall.create({
        data: {
          providerCallId,
          campaignId,
          listId,
          listEntryId,
          agentProfileKey: optionalString(metadata.agentProfileKey) || stringValue(call.agent_id),
          providerStatus: stringValue(call.call_status) || 'ended',
          disposition,
          bookedFlag,
          summary,
          transcript,
          recordingUrl: getRecordingUrl(call),
          disconnectionReason: stringValue(call.disconnection_reason),
          dynamicVariablesJson: stringifyJson(dynamicVariables),
          metadataJson: stringifyJson(metadata),
          analysisJson: stringifyJson(analysis),
          rawPayloadJson: stringifyJson(call),
          startedAt,
          endedAt,
          durationMs,
        },
        include: {
          campaign: { select: { name: true } },
          list: { select: { displayName: true } },
          listEntry: { select: { companyName: true, contactName: true, phoneNormalized: true } },
          events: { orderBy: { createdAt: 'asc' } },
        },
      });

  if (eventType) {
    await prisma.phoneCallEvent.create({
      data: {
        phoneCallId: row.id,
        eventType,
        payloadJson: stringifyJson(call),
      },
    });
  }

  if (listEntryId) {
    await updateEntryOutcomeFromCall({
      listEntryId,
      campaignId,
      disposition,
      startedAt,
      isNewCall: !existing,
    });
  }

  const refreshed = await prisma.phoneCall.findUniqueOrThrow({
    where: { id: row.id },
    include: {
      campaign: { select: { name: true } },
      list: { select: { displayName: true } },
      listEntry: { select: { companyName: true, contactName: true, phoneNormalized: true } },
      events: { orderBy: { createdAt: 'asc' } },
    },
  });

  return {
    created: !existing,
    call: prismaPhoneCallToDomain(refreshed),
  };
}

export async function backfillRetellHistory(days = 30) {
  await ensurePhoneSchema();
  const profiles = getPhoneAgentProfiles().filter((profile) => profile.agentId);
  if (!profiles.length) throw new Error('No Retell phone agent profile is configured');

  const lowerThresholdMs = Date.now() - days * 24 * 60 * 60 * 1000;
  let paginationKey: string | null = null;
  let imported = 0;
  let updated = 0;
  let pages = 0;

  do {
    const response = await listRetellCalls({
      agentIds: profiles.map((profile) => profile.agentId),
      lowerThresholdMs,
      limit: 100,
      paginationKey: paginationKey ?? undefined,
    });

    for (const call of response.calls) {
      const result = await upsertPhoneCallFromRetellCall(call, 'backfill');
      if (result.created) imported++;
      else updated++;
    }

    paginationKey = response.paginationKey;
    pages++;
    if (!paginationKey || response.calls.length < 100 || pages >= 10) break;
  } while (paginationKey);

  const lastSyncAt = new Date();
  await prisma.phoneSettings.upsert({
    where: { id: 'default' },
    update: { lastRetellSyncAt: lastSyncAt },
    create: {
      id: 'default',
      defaultTimezone: DEFAULT_PHONE_SETTINGS.defaultTimezone,
      businessHoursStart: DEFAULT_PHONE_SETTINGS.businessHoursStart,
      businessHoursEnd: DEFAULT_PHONE_SETTINGS.businessHoursEnd,
      activeWeekdaysJson: stringifyJson(DEFAULT_PHONE_SETTINGS.activeWeekdays, '[]'),
      dailyCallCap: DEFAULT_PHONE_SETTINGS.dailyCallCap,
      cooldownSeconds: DEFAULT_PHONE_SETTINGS.cooldownSeconds,
      maxAttemptsPerLead: DEFAULT_PHONE_SETTINGS.maxAttemptsPerLead,
      retryDelayMinutes: DEFAULT_PHONE_SETTINGS.retryDelayMinutes,
      voicemailEnabled: DEFAULT_PHONE_SETTINGS.voicemailEnabled,
      autoPauseAfterRepeatedFailures: DEFAULT_PHONE_SETTINGS.autoPauseAfterRepeatedFailures,
      defaultSourceBehavior: DEFAULT_PHONE_SETTINGS.defaultSourceBehavior,
      lastRetellSyncAt: lastSyncAt,
    },
  });

  return {
    imported,
    updated,
    lastSyncAt: lastSyncAt.toISOString(),
  };
}

export async function ingestRetellWebhook(rawBody: string, payload: {
  event?: string;
  call?: Record<string, unknown>;
}) {
  await ensurePhoneSchema();
  const eventType = typeof payload.event === 'string' ? payload.event : 'unknown_event';
  const call = payload.call ?? {};
  const result = await upsertPhoneCallFromRetellCall(call, eventType);

  await prisma.phoneCallEvent.create({
    data: {
      phoneCallId: result.call.id,
      eventType: `${eventType}:raw`,
      payloadJson: stringifyJson({ rawBody }),
    },
  });

  return result.call;
}

export function buildPhoneDynamicVariables(input: {
  companyName: string;
  contactName: string;
  title: string;
  notes: string;
}): Record<string, string> {
  return {
    company_name: input.companyName || '',
    prospect_first_name: input.contactName.split(/\s+/)[0] || '',
    contact_role: input.title || 'unknown',
    reason_for_call:
      input.notes || 'Arrow Systems helps teams bring short-run label and packaging production in-house.',
  };
}

export function getPhoneAgentProfileOrThrow(key: string): PhoneAgentProfile {
  const profile = getPhoneAgentProfile(key);
  if (!profile) throw new Error('Agent profile not found');
  return profile;
}
