import type {
  PhoneCall as PrismaPhoneCall,
  PhoneCallEvent as PrismaPhoneCallEvent,
  PhoneCampaign as PrismaPhoneCampaign,
  PhoneList as PrismaPhoneList,
  PhoneListEntry as PrismaPhoneListEntry,
  PhoneRetellAgent as PrismaPhoneRetellAgent,
  PhoneSettings as PrismaPhoneSettings,
} from '@prisma/client';
import type {
  PhoneCall,
  PhoneCallCostProduct,
  PhoneCallDisposition,
  PhoneCampaign,
  PhoneCampaignSettings,
  PhoneList,
  PhoneListEntry,
  PhoneRetellAgent,
  PhoneSettings,
  PhoneWeekday,
} from './types';
import { DEFAULT_PHONE_SETTINGS } from './config';

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseWeekdays(value: string): PhoneWeekday[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed.map(String) as PhoneWeekday[]) : DEFAULT_PHONE_SETTINGS.activeWeekdays;
  } catch {
    return DEFAULT_PHONE_SETTINGS.activeWeekdays;
  }
}

function parseCampaignSettings(value: string): PhoneCampaignSettings {
  const parsed = parseObject(value);
  return {
    defaultTimezone:
      typeof parsed.defaultTimezone === 'string'
        ? parsed.defaultTimezone
        : DEFAULT_PHONE_SETTINGS.defaultTimezone,
    businessHoursStart:
      typeof parsed.businessHoursStart === 'string'
        ? parsed.businessHoursStart
        : DEFAULT_PHONE_SETTINGS.businessHoursStart,
    businessHoursEnd:
      typeof parsed.businessHoursEnd === 'string'
        ? parsed.businessHoursEnd
        : DEFAULT_PHONE_SETTINGS.businessHoursEnd,
    activeWeekdays: Array.isArray(parsed.activeWeekdays)
      ? (parsed.activeWeekdays.map(String) as PhoneWeekday[])
      : DEFAULT_PHONE_SETTINGS.activeWeekdays,
    dailyCallCap:
      typeof parsed.dailyCallCap === 'number' ? parsed.dailyCallCap : DEFAULT_PHONE_SETTINGS.dailyCallCap,
    cooldownSeconds:
      typeof parsed.cooldownSeconds === 'number'
        ? parsed.cooldownSeconds
        : DEFAULT_PHONE_SETTINGS.cooldownSeconds,
    maxAttemptsPerLead:
      typeof parsed.maxAttemptsPerLead === 'number'
        ? parsed.maxAttemptsPerLead
        : DEFAULT_PHONE_SETTINGS.maxAttemptsPerLead,
    retryDelayMinutes:
      typeof parsed.retryDelayMinutes === 'number'
        ? parsed.retryDelayMinutes
        : DEFAULT_PHONE_SETTINGS.retryDelayMinutes,
    voicemailEnabled:
      typeof parsed.voicemailEnabled === 'boolean'
        ? parsed.voicemailEnabled
        : DEFAULT_PHONE_SETTINGS.voicemailEnabled,
    autoPauseAfterRepeatedFailures:
      typeof parsed.autoPauseAfterRepeatedFailures === 'boolean'
        ? parsed.autoPauseAfterRepeatedFailures
        : DEFAULT_PHONE_SETTINGS.autoPauseAfterRepeatedFailures,
    defaultSourceBehavior:
      typeof parsed.defaultSourceBehavior === 'string'
        ? parsed.defaultSourceBehavior
        : DEFAULT_PHONE_SETTINGS.defaultSourceBehavior,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseCost(value: string, fallbackCostCents: number | null): PhoneCall['cost'] {
  const parsed = parseObject(value);
  const productCosts = Array.isArray(parsed.product_costs)
    ? parsed.product_costs
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map(
          (item): PhoneCallCostProduct => ({
            product: typeof item.product === 'string' ? item.product : '',
            costCents: numberOrNull(item.cost),
            unitPrice: numberOrNull(item.unit_price),
            isTransferLegCost:
              typeof item.is_transfer_leg_cost === 'boolean' ? item.is_transfer_leg_cost : null,
          }),
        )
    : [];

  return {
    combinedCents: numberOrNull(parsed.combined_cost) ?? fallbackCostCents,
    totalDurationSeconds: numberOrNull(parsed.total_duration_seconds),
    totalDurationUnitPrice: numberOrNull(parsed.total_duration_unit_price),
    productCosts,
  };
}

export function prismaPhoneListEntryToDomain(entry: PrismaPhoneListEntry): PhoneListEntry {
  return {
    id: entry.id,
    listId: entry.listId,
    companyName: entry.companyName,
    contactName: entry.contactName,
    title: entry.title,
    phoneRaw: entry.phoneRaw,
    phoneNormalized: entry.phoneNormalized,
    email: entry.email,
    website: entry.website,
    country: entry.country,
    timezone: entry.timezone,
    notes: entry.notes,
    sourceMetadata: parseObject(entry.sourceMetadataJson),
    sourceExternalId: entry.sourceExternalId ?? null,
    queueState: entry.queueState as PhoneListEntry['queueState'],
    duplicateWithinList: entry.duplicateWithinList,
    attempts: entry.attempts,
    lastOutcome: entry.lastOutcome as PhoneCallDisposition,
    lastCallAt: entry.lastCallAt?.toISOString() ?? null,
    retryAfter: entry.retryAfter?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function prismaPhoneListToDomain(
  list: PrismaPhoneList & { entries?: PrismaPhoneListEntry[] },
): PhoneList {
  return {
    id: list.id,
    sourceType: list.sourceType as PhoneList['sourceType'],
    displayName: list.displayName,
    notes: list.notes,
    status: list.status as PhoneList['status'],
    sourceMetadata: parseObject(list.sourceMetadataJson),
    totalEntries: list.totalEntries,
    dialableEntries: list.dialableEntries,
    invalidEntries: list.invalidEntries,
    duplicateEntries: list.duplicateEntries,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
    entries: list.entries?.map(prismaPhoneListEntryToDomain),
  };
}

export function prismaPhoneCampaignToDomain(
  campaign: PrismaPhoneCampaign & { list?: Pick<PrismaPhoneList, 'displayName'> | null },
): PhoneCampaign {
  return {
    id: campaign.id,
    listId: campaign.listId,
    listName: campaign.list?.displayName ?? '',
    name: campaign.name,
    agentProfileKey: campaign.agentProfileKey,
    settings: parseCampaignSettings(campaign.settingsJson),
    status: campaign.status as PhoneCampaign['status'],
    startedAt: campaign.startedAt?.toISOString() ?? null,
    pausedAt: campaign.pausedAt?.toISOString() ?? null,
    completedAt: campaign.completedAt?.toISOString() ?? null,
    failedAt: campaign.failedAt?.toISOString() ?? null,
    lastRunAt: campaign.lastRunAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

export function prismaPhoneCallEventToDomain(event: PrismaPhoneCallEvent) {
  return {
    id: event.id,
    phoneCallId: event.phoneCallId,
    eventType: event.eventType,
    payload: parseObject(event.payloadJson),
    createdAt: event.createdAt.toISOString(),
  };
}

export function prismaPhoneCallToDomain(
  call: PrismaPhoneCall & {
    campaign?: Pick<PrismaPhoneCampaign, 'name'> | null;
    list?: Pick<PrismaPhoneList, 'displayName'> | null;
    listEntry?: Pick<PrismaPhoneListEntry, 'companyName' | 'contactName' | 'phoneNormalized'> | null;
    events?: PrismaPhoneCallEvent[];
  },
): PhoneCall {
  const metadata = parseObject(call.metadataJson);
  return {
    id: call.id,
    providerCallId: call.providerCallId,
    campaignId: call.campaignId ?? null,
    campaignName: call.campaign?.name ?? '',
    listId: call.listId ?? null,
    listName: call.list?.displayName ?? '',
    listEntryId: call.listEntryId ?? null,
    companyName: call.listEntry?.companyName ?? String(metadata.companyName ?? ''),
    contactName: call.listEntry?.contactName ?? String(metadata.contactName ?? ''),
    phoneNumber:
      call.listEntry?.phoneNormalized ??
      (call.toNumber || String(metadata.phoneNumber ?? metadata.to_number ?? '')),
    agentProfileKey: call.agentProfileKey,
    agentId: call.agentId,
    agentName: call.agentName,
    agentVersion: call.agentVersion ?? null,
    callType: call.callType,
    direction: call.direction,
    fromNumber: call.fromNumber,
    toNumber: call.toNumber,
    providerStatus: call.providerStatus,
    disposition: call.disposition as PhoneCallDisposition,
    bookedFlag: call.bookedFlag,
    summary: call.summary,
    transcript: call.transcript,
    recordingUrl: call.recordingUrl,
    recordingMultiChannelUrl: call.recordingMultiChannelUrl,
    publicLogUrl: call.publicLogUrl,
    knowledgeBaseRetrievedContentsUrl: call.knowledgeBaseRetrievedContentsUrl,
    disconnectionReason: call.disconnectionReason,
    userSentiment: call.userSentiment,
    callSuccessful: call.callSuccessful ?? null,
    inVoicemail: call.inVoicemail ?? null,
    costCents: call.costCents ?? null,
    cost: parseCost(call.costJson, call.costCents ?? null),
    dynamicVariables: Object.fromEntries(
      Object.entries(parseObject(call.dynamicVariablesJson)).map(([key, value]) => [key, String(value)]),
    ),
    metadata,
    analysis: parseObject(call.analysisJson),
    rawPayload: parseObject(call.rawPayloadJson),
    startedAt: call.startedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    durationMs: call.durationMs ?? null,
    createdAt: call.createdAt.toISOString(),
    updatedAt: call.updatedAt.toISOString(),
    events: call.events?.map(prismaPhoneCallEventToDomain),
  };
}

export function prismaPhoneSettingsToDomain(settings: PrismaPhoneSettings): PhoneSettings {
  return {
    id: settings.id,
    defaultTimezone: settings.defaultTimezone,
    businessHoursStart: settings.businessHoursStart,
    businessHoursEnd: settings.businessHoursEnd,
    activeWeekdays: parseWeekdays(settings.activeWeekdaysJson),
    dailyCallCap: settings.dailyCallCap,
    cooldownSeconds: settings.cooldownSeconds,
    maxAttemptsPerLead: settings.maxAttemptsPerLead,
    retryDelayMinutes: settings.retryDelayMinutes,
    voicemailEnabled: settings.voicemailEnabled,
    autoPauseAfterRepeatedFailures: settings.autoPauseAfterRepeatedFailures,
    defaultSourceBehavior: settings.defaultSourceBehavior,
    lastRetellSyncAt: settings.lastRetellSyncAt?.toISOString() ?? null,
    lastRetellAgentSyncAt: settings.lastRetellAgentSyncAt?.toISOString() ?? null,
    createdAt: settings.createdAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export function prismaPhoneRetellAgentToDomain(agent: PrismaPhoneRetellAgent): PhoneRetellAgent {
  return {
    id: agent.id,
    agentId: agent.agentId,
    version: agent.version,
    agentName: agent.agentName,
    voiceId: agent.voiceId,
    voiceModel: agent.voiceModel,
    responseEngine: parseObject(agent.responseEngineJson),
    rawPayload: parseObject(agent.rawPayloadJson),
    isPublished: agent.isPublished,
    lastModifiedAt: agent.lastModifiedAt?.toISOString() ?? null,
    syncedAt: agent.syncedAt.toISOString(),
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };
}
