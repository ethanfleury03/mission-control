import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { DEFAULT_PHONE_SETTINGS, getPhoneAgentProfile, getPhoneAgentProfiles } from './config';
import { parsePhoneCsv, previewPhoneCsvImport } from './csv-import';
import {
  prismaPhoneCallToDomain,
  prismaPhoneCampaignToDomain,
  prismaPhoneListToDomain,
  prismaPhoneRetellAgentToDomain,
  prismaPhoneSettingsToDomain,
} from './db-mappers';
import {
  deriveBookedFlag,
  isConnectedDisposition,
  normalizeCallDisposition,
  shouldRetryDisposition,
} from './dispositions';
import { normalizePhone } from './phone-normalization';
import { getRetellApiKey, getRetellCall, listRetellAgents, listRetellCalls } from './retell';
import { formatDayLabel, getZonedDateKey } from './time';
import type {
  PhoneAgentProfile,
  PhoneCall,
  PhoneCallFilters,
  PhoneCallLogResponse,
  PhoneCampaign,
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
  phoneSchemaReady = (async () => {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "phone_calls"
        ADD COLUMN IF NOT EXISTS "agentId" TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "agentName" TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "agentVersion" INTEGER,
        ADD COLUMN IF NOT EXISTS "callType" TEXT NOT NULL DEFAULT 'phone_call',
        ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "fromNumber" TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "toNumber" TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "recordingMultiChannelUrl" TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "publicLogUrl" TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "knowledgeBaseRetrievedContentsUrl" TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "userSentiment" TEXT NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "callSuccessful" BOOLEAN,
        ADD COLUMN IF NOT EXISTS "inVoicemail" BOOLEAN,
        ADD COLUMN IF NOT EXISTS "costCents" DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS "costJson" TEXT NOT NULL DEFAULT '{}'
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "phone_settings"
        ADD COLUMN IF NOT EXISTS "lastRetellAgentSyncAt" TIMESTAMP(3)
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "phone_retell_agents" (
        "id" TEXT NOT NULL,
        "agentId" TEXT NOT NULL,
        "version" INTEGER NOT NULL DEFAULT 0,
        "agentName" TEXT NOT NULL DEFAULT '',
        "voiceId" TEXT NOT NULL DEFAULT '',
        "voiceModel" TEXT NOT NULL DEFAULT '',
        "responseEngineJson" TEXT NOT NULL DEFAULT '{}',
        "rawPayloadJson" TEXT NOT NULL DEFAULT '{}',
        "isPublished" BOOLEAN NOT NULL DEFAULT false,
        "lastModifiedAt" TIMESTAMP(3),
        "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "phone_retell_agents_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "phone_retell_agents_agentId_version_key"
      ON "phone_retell_agents"("agentId", "version")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "phone_calls_agentId_idx" ON "phone_calls"("agentId")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "phone_calls_direction_idx" ON "phone_calls"("direction")
    `);
  })();
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

function getMultiChannelRecordingUrl(call: Record<string, unknown>): string {
  return (
    stringValue(call.recording_multi_channel_url) ||
    stringValue(call.scrubbed_recording_multi_channel_url)
  );
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function costCentsFromCall(call: Record<string, unknown>): number | null {
  const cost = parseObject(call.call_cost);
  return numberValue(cost.combined_cost);
}

function publicLogUrlFromCall(call: Record<string, unknown>): string {
  return stringValue(call.public_log_url) || stringValue(parseObject(call.public_log).url);
}

function configuredRetellAgentIds(): string[] {
  return [...new Set(getPhoneAgentProfiles().map((profile) => profile.agentId).filter(Boolean))];
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
      lastRetellAgentSyncAt: null,
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
    where.startedAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }
  if (filters.agentId) where.agentId = filters.agentId;
  if (filters.callStatus) where.providerStatus = filters.callStatus;
  if (filters.direction) where.direction = filters.direction;
  if (filters.sentiment) where.userSentiment = filters.sentiment;
  if (filters.disposition) where.disposition = filters.disposition;
  if (filters.bookedOnly) where.bookedFlag = true;
  if (filters.successfulOnly) where.callSuccessful = true;
  if (typeof filters.minCostCents === 'number' || typeof filters.maxCostCents === 'number') {
    where.costCents = {
      ...(typeof filters.minCostCents === 'number' ? { gte: filters.minCostCents } : {}),
      ...(typeof filters.maxCostCents === 'number' ? { lte: filters.maxCostCents } : {}),
    };
  }
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
      { agentName: { contains: filters.q } },
      { agentId: { contains: filters.q } },
      { fromNumber: { contains: filters.q } },
      { toNumber: { contains: filters.q } },
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
  const [rows, agents, statusRows, directionRows, sentimentRows] = await Promise.all([
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
    prisma.phoneRetellAgent.findMany({
      select: { agentId: true, agentName: true, version: true },
      orderBy: [{ agentName: 'asc' }, { agentId: 'asc' }],
    }),
    prisma.phoneCall.groupBy({ by: ['providerStatus'], _count: { _all: true } }),
    prisma.phoneCall.groupBy({ by: ['direction'], _count: { _all: true } }),
    prisma.phoneCall.groupBy({ by: ['userSentiment'], _count: { _all: true } }),
  ]);

  return {
    items: rows.map((row) => prismaPhoneCallToDomain(row)),
    filterOptions: {
      agents,
      statuses: statusRows.map((row) => row.providerStatus).filter(Boolean).sort(),
      directions: directionRows.map((row) => row.direction).filter(Boolean).sort(),
      sentiments: sentimentRows.map((row) => row.userSentiment).filter(Boolean).sort(),
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

function sumCostCents(calls: PhoneCall[]) {
  return calls.reduce((sum, call) => sum + (call.costCents ?? 0), 0);
}

function averagePositive(values: number[]) {
  const positives = values.filter((value) => value > 0);
  if (!positives.length) return 0;
  return Math.round(positives.reduce((sum, value) => sum + value, 0) / positives.length);
}

function getRates(calls: PhoneCall[]) {
  const total = calls.length || 1;
  const connected = calls.filter((call) => isConnectedDisposition(call.disposition)).length;
  const booked = calls.filter((call) => call.bookedFlag).length;
  const successful = calls.filter((call) => call.callSuccessful === true || call.bookedFlag).length;
  const averageDurationMs = averagePositive(calls.map((call) => call.durationMs ?? 0));
  const averageCostCents = averagePositive(calls.map((call) => call.costCents ?? 0));

  return {
    connectRate: connected / total,
    successfulRate: successful / total,
    bookedRate: booked / total,
    averageDurationMs,
    averageCostCents,
  };
}

function buildProductCostSummary(calls: PhoneCall[]) {
  const byProduct = new Map<string, { costCents: number; unitPrice: number | null; isTransferLegCost: boolean | null }>();
  for (const call of calls) {
    for (const item of call.cost.productCosts) {
      const key = item.product || 'unknown';
      const current = byProduct.get(key) ?? {
        costCents: 0,
        unitPrice: item.unitPrice,
        isTransferLegCost: item.isTransferLegCost,
      };
      current.costCents += item.costCents ?? 0;
      current.unitPrice = current.unitPrice ?? item.unitPrice;
      current.isTransferLegCost = current.isTransferLegCost ?? item.isTransferLegCost;
      byProduct.set(key, current);
    }
  }

  return Array.from(byProduct.entries())
    .map(([product, item]) => ({
      product,
      costCents: item.costCents,
      unitPrice: item.unitPrice,
      isTransferLegCost: item.isTransferLegCost,
    }))
    .sort((a, b) => (b.costCents ?? 0) - (a.costCents ?? 0));
}

function buildAgentSummaries(calls: PhoneCall[]) {
  const groups = new Map<string, PhoneCall[]>();
  for (const call of calls) {
    const key = call.agentId || call.agentName || 'unknown';
    groups.set(key, [...(groups.get(key) ?? []), call]);
  }

  return Array.from(groups.values())
    .map((items) => {
      const first = items[0];
      const rates = getRates(items);
      const totalCostCents = sumCostCents(items);
      return {
        agentId: first?.agentId ?? '',
        agentName: first?.agentName || first?.agentId || 'Unknown agent',
        version: first?.agentVersion ?? null,
        totalCalls: items.length,
        liveCalls: items.filter((call) => ['registered', 'ongoing'].includes(call.providerStatus)).length,
        connectedCalls: items.filter((call) => isConnectedDisposition(call.disposition)).length,
        successfulCalls: items.filter((call) => call.callSuccessful === true || call.bookedFlag).length,
        bookedCalls: items.filter((call) => call.bookedFlag).length,
        averageDurationMs: rates.averageDurationMs,
        totalCostCents,
        averageCostCents: rates.averageCostCents,
        lastCallAt: (() => {
          const sorted = items.map((call) => call.startedAt ?? call.createdAt).sort();
          return sorted[sorted.length - 1] ?? null;
        })(),
      };
    })
    .sort((a, b) => b.totalCalls - a.totalCalls);
}

export async function getPhoneHomeData(): Promise<PhoneHomeData> {
  await ensurePhoneSchema();
  const settings = prismaPhoneSettingsToDomain(await ensurePhoneSettingsRow());
  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);

  const [recentCallRows, metricCallRows, liveCallRows] = await Promise.all([
    prisma.phoneCall.findMany({
      where: {
        OR: [
          { createdAt: { gte: thirtyDaysAgo } },
          { startedAt: { gte: thirtyDaysAgo } },
        ],
      },
      include: {
        campaign: { select: { name: true } },
        list: { select: { displayName: true } },
        listEntry: { select: { companyName: true, contactName: true, phoneNormalized: true } },
      },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    }),
    prisma.phoneCall.findMany({
      where: {
        OR: [
          { createdAt: { gte: sevenDaysAgo } },
          { startedAt: { gte: sevenDaysAgo } },
        ],
      },
      include: {
        campaign: { select: { name: true } },
        list: { select: { displayName: true } },
        listEntry: { select: { companyName: true, contactName: true, phoneNormalized: true } },
      },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.phoneCall.findMany({
      where: { providerStatus: { in: ['registered', 'ongoing'] } },
      include: {
        campaign: { select: { name: true } },
        list: { select: { displayName: true } },
        listEntry: { select: { companyName: true, contactName: true, phoneNormalized: true } },
      },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  const recentCalls = recentCallRows.map((row) => prismaPhoneCallToDomain(row)).slice(0, 8);
  const metricCalls = metricCallRows.map((row) => prismaPhoneCallToDomain(row));
  const liveCalls = liveCallRows.map((row) => prismaPhoneCallToDomain(row));

  const todayKey = getZonedDateKey(new Date(), settings.defaultTimezone);
  const callsToday = metricCalls.filter((call) =>
    getZonedDateKey(new Date(call.startedAt ?? call.createdAt), settings.defaultTimezone) === todayKey,
  ).length;

  const callsByDayMap = new Map<string, number>();
  const bookedTrendMap = new Map<string, { booked: number; notBooked: number }>();
  const costByDayMap = new Map<string, number>();
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
    const key = getZonedDateKey(date, settings.defaultTimezone);
    callsByDayMap.set(key, 0);
    bookedTrendMap.set(key, { booked: 0, notBooked: 0 });
    costByDayMap.set(key, 0);
  }

  for (const call of metricCalls) {
    const key = getZonedDateKey(new Date(call.startedAt ?? call.createdAt), settings.defaultTimezone);
    if (callsByDayMap.has(key)) {
      callsByDayMap.set(key, (callsByDayMap.get(key) ?? 0) + 1);
      const trend = bookedTrendMap.get(key) ?? { booked: 0, notBooked: 0 };
      if (call.bookedFlag) trend.booked++;
      else trend.notBooked++;
      bookedTrendMap.set(key, trend);
      costByDayMap.set(key, (costByDayMap.get(key) ?? 0) + (call.costCents ?? 0));
    }
  }

  const outcomeCounts = new Map<PhoneCall['disposition'], number>();
  metricCalls.forEach((call) => {
    const disposition = call.disposition;
    outcomeCounts.set(disposition, (outcomeCounts.get(disposition) ?? 0) + 1);
  });

  const rates = getRates(metricCalls);
  const totalCostCents = sumCostCents(metricCalls);
  const todayCostCents = metricCalls
    .filter((call) =>
      getZonedDateKey(new Date(call.startedAt ?? call.createdAt), settings.defaultTimezone) === todayKey,
    )
    .reduce((sum, call) => sum + (call.costCents ?? 0), 0);
  const settingsResponse = await getPhoneSettingsResponse();

  return {
    summary: {
      totalCalls: metricCalls.length,
      liveCalls: liveCalls.length,
      callsToday,
      connectRate: rates.connectRate,
      successfulRate: rates.successfulRate,
      bookedRate: rates.bookedRate,
      averageCallDurationMs: rates.averageDurationMs,
      totalCostCents,
      averageCostCents: rates.averageCostCents,
      todayCostCents,
    },
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
      costByDay: Array.from(costByDayMap.entries()).map(([day, costCents]) => ({
        day: formatDayLabel(day),
        costCents,
      })),
    },
    liveCalls,
    recentCalls,
    agentSummaries: buildAgentSummaries(metricCalls),
    costSummary: {
      totalCostCents,
      averageCostCents: rates.averageCostCents,
      todayCostCents,
      productCosts: buildProductCostSummary(metricCalls),
    },
    agentProfiles: settingsResponse.agentProfiles,
    retellAgents: settingsResponse.retellAgents,
    settings,
    providerInfo: settingsResponse.providerInfo,
  };
}

export async function getPhoneSettingsResponse(): Promise<PhoneSettingsResponse> {
  await ensurePhoneSchema();
  const settings = prismaPhoneSettingsToDomain(await ensurePhoneSettingsRow());
  const profile = getPhoneAgentProfile();
  const retellAgents = await prisma.phoneRetellAgent.findMany({
    orderBy: [{ agentName: 'asc' }, { agentId: 'asc' }, { version: 'desc' }],
  });
  const configuredAgentIds = configuredRetellAgentIds();
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    '';
  const providerInfo: PhoneProviderInfo = {
    providerName: 'Retell AI',
    agentProfileLabel: profile?.label ?? 'No configured profile',
    agentId: profile?.agentId ?? '',
    configuredAgentIds,
    conversationFlowId: profile?.conversationFlowId ?? '',
    outboundNumberLabel: profile?.outboundNumberLabel ?? 'Locked outbound number',
    outboundNumber: profile?.outboundNumber ?? '',
    voiceLabel: profile?.voiceLabel ?? '',
    webhookStatus: profile?.webhookStatus ?? 'Unknown',
    lastSyncTime: settings.lastRetellSyncAt,
    lastAgentSyncTime: settings.lastRetellAgentSyncAt,
    apiStatus: getRetellApiKey() ? 'configured' : 'missing_api_key',
    webhookUrl: `${baseUrl.replace(/\/$/, '')}/api/phone/retell/webhook`,
  };

  return {
    settings,
    agentProfiles: getPhoneAgentProfiles(),
    retellAgents: retellAgents.map(prismaPhoneRetellAgentToDomain),
    providerInfo,
    futureSources: [],
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
  const costJson = parseObject(call.call_cost);
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
  const agentId = stringValue(call.agent_id);
  const agentName = stringValue(call.agent_name);
  const agentVersion = numberValue(call.agent_version);
  const callType = stringValue(call.call_type) || 'phone_call';
  const direction = stringValue(call.direction);
  const fromNumber = stringValue(call.from_number);
  const toNumber = stringValue(call.to_number);
  const recordingUrl = getRecordingUrl(call);
  const recordingMultiChannelUrl = getMultiChannelRecordingUrl(call);
  const publicLogUrl = publicLogUrlFromCall(call);
  const knowledgeBaseRetrievedContentsUrl = stringValue(call.knowledge_base_retrieved_contents_url);
  const userSentiment = stringValue(analysis.user_sentiment);
  const callSuccessful = booleanValue(analysis.call_successful);
  const inVoicemail = booleanValue(analysis.in_voicemail);
  const costCents = costCentsFromCall(call);

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
          campaignId: campaignId ?? existing.campaignId,
          listId: listId ?? existing.listId,
          listEntryId: listEntryId ?? existing.listEntryId,
          agentProfileKey:
            optionalString(metadata.agentProfileKey) || agentId || existing.agentProfileKey,
          agentId: agentId || existing.agentId,
          agentName: agentName || existing.agentName,
          agentVersion: agentVersion ?? existing.agentVersion,
          callType: callType || existing.callType,
          direction: direction || existing.direction,
          fromNumber: fromNumber || existing.fromNumber,
          toNumber: toNumber || existing.toNumber,
          providerStatus: stringValue(call.call_status) || existing.providerStatus,
          disposition: disposition === 'unknown' && existing.disposition !== 'unknown'
            ? existing.disposition
            : disposition,
          bookedFlag: bookedFlag || existing.bookedFlag,
          summary: summary || existing.summary,
          transcript: transcript || existing.transcript,
          recordingUrl: recordingUrl || existing.recordingUrl,
          recordingMultiChannelUrl: recordingMultiChannelUrl || existing.recordingMultiChannelUrl,
          publicLogUrl: publicLogUrl || existing.publicLogUrl,
          knowledgeBaseRetrievedContentsUrl:
            knowledgeBaseRetrievedContentsUrl || existing.knowledgeBaseRetrievedContentsUrl,
          disconnectionReason: stringValue(call.disconnection_reason) || existing.disconnectionReason,
          userSentiment: userSentiment || existing.userSentiment,
          callSuccessful: callSuccessful ?? existing.callSuccessful,
          inVoicemail: inVoicemail ?? existing.inVoicemail,
          costCents: costCents ?? existing.costCents,
          costJson: Object.keys(costJson).length ? stringifyJson(costJson) : existing.costJson,
          dynamicVariablesJson: Object.keys(dynamicVariables).length
            ? stringifyJson(dynamicVariables)
            : existing.dynamicVariablesJson,
          metadataJson: Object.keys(metadata).length ? stringifyJson(metadata) : existing.metadataJson,
          analysisJson: Object.keys(analysis).length ? stringifyJson(analysis) : existing.analysisJson,
          rawPayloadJson: stringifyJson(call),
          startedAt: startedAt ?? existing.startedAt,
          endedAt: endedAt ?? existing.endedAt,
          durationMs: durationMs ?? existing.durationMs,
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
          agentProfileKey: optionalString(metadata.agentProfileKey) || agentId,
          agentId,
          agentName,
          agentVersion,
          callType,
          direction,
          fromNumber,
          toNumber,
          providerStatus: stringValue(call.call_status) || 'ended',
          disposition,
          bookedFlag,
          summary,
          transcript,
          recordingUrl,
          recordingMultiChannelUrl,
          publicLogUrl,
          knowledgeBaseRetrievedContentsUrl,
          disconnectionReason: stringValue(call.disconnection_reason),
          userSentiment,
          callSuccessful,
          inVoicemail,
          costCents,
          costJson: stringifyJson(costJson),
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

export async function syncRetellAgents(): Promise<{ imported: number; updated: number; lastSyncAt: string }> {
  await ensurePhoneSchema();
  const agents = await listRetellAgents();
  let imported = 0;
  let updated = 0;
  const syncedAt = new Date();

  for (const agent of agents) {
    const agentId = stringValue(agent.agent_id);
    if (!agentId) continue;
    const version = numberValue(agent.version) ?? 0;
    const existing = await prisma.phoneRetellAgent.findUnique({
      where: { agentId_version: { agentId, version } },
      select: { id: true },
    });
    const lastModificationTimestamp = numberValue(agent.last_modification_timestamp);

    await prisma.phoneRetellAgent.upsert({
      where: { agentId_version: { agentId, version } },
      update: {
        agentName: stringValue(agent.agent_name),
        voiceId: stringValue(agent.voice_id),
        voiceModel: stringValue(agent.voice_model),
        responseEngineJson: stringifyJson(parseObject(agent.response_engine)),
        rawPayloadJson: stringifyJson(agent),
        isPublished: agent.is_published === true,
        lastModifiedAt: lastModificationTimestamp ? new Date(lastModificationTimestamp) : null,
        syncedAt,
      },
      create: {
        agentId,
        version,
        agentName: stringValue(agent.agent_name),
        voiceId: stringValue(agent.voice_id),
        voiceModel: stringValue(agent.voice_model),
        responseEngineJson: stringifyJson(parseObject(agent.response_engine)),
        rawPayloadJson: stringifyJson(agent),
        isPublished: agent.is_published === true,
        lastModifiedAt: lastModificationTimestamp ? new Date(lastModificationTimestamp) : null,
        syncedAt,
      },
    });

    if (existing) updated++;
    else imported++;
  }

  await prisma.phoneSettings.upsert({
    where: { id: 'default' },
    update: { lastRetellAgentSyncAt: syncedAt },
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
      lastRetellAgentSyncAt: syncedAt,
    },
  });

  return { imported, updated, lastSyncAt: syncedAt.toISOString() };
}

export async function backfillRetellHistory(days = 30) {
  await ensurePhoneSchema();
  await syncRetellAgents();
  const configuredAgentIds = configuredRetellAgentIds();

  const lowerThresholdMs = Date.now() - days * 24 * 60 * 60 * 1000;
  let paginationKey: string | null = null;
  let imported = 0;
  let updated = 0;
  let pages = 0;

  do {
    const response = await listRetellCalls({
      agentIds: configuredAgentIds,
      lowerThresholdMs,
      limit: 100,
      paginationKey: paginationKey ?? undefined,
    });

    for (const call of response.calls) {
      if (stringValue(call.call_type) && stringValue(call.call_type) !== 'phone_call') continue;
      const result = await upsertPhoneCallFromRetellCall(call, 'backfill');
      if (result.created) imported++;
      else updated++;
    }

    paginationKey = response.paginationKey;
    pages++;
    if (!response.hasMore || !paginationKey || response.calls.length < 100 || pages >= 25) break;
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
