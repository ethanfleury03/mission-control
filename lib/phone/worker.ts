import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { DEFAULT_PHONE_SETTINGS } from './config';
import { createRetellPhoneCall, isRetellConfigured } from './retell';
import { getZonedDateKey, isWithinBusinessWindow } from './time';
import { buildPhoneDynamicVariables, getPhoneAgentProfileOrThrow } from './service';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCampaignSettings(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      defaultTimezone: typeof parsed.defaultTimezone === 'string' ? parsed.defaultTimezone : DEFAULT_PHONE_SETTINGS.defaultTimezone,
      businessHoursStart:
        typeof parsed.businessHoursStart === 'string'
          ? parsed.businessHoursStart
          : DEFAULT_PHONE_SETTINGS.businessHoursStart,
      businessHoursEnd:
        typeof parsed.businessHoursEnd === 'string'
          ? parsed.businessHoursEnd
          : DEFAULT_PHONE_SETTINGS.businessHoursEnd,
      activeWeekdays: Array.isArray(parsed.activeWeekdays)
        ? parsed.activeWeekdays.map(String)
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
  } catch {
    return DEFAULT_PHONE_SETTINGS;
  }
}

async function shouldRespectDailyCap(timeZone: string, cap: number) {
  const recentCalls = await prisma.phoneCall.findMany({
    where: {
      createdAt: {
        gte: new Date(Date.now() - 36 * 60 * 60 * 1000),
      },
    },
    select: {
      createdAt: true,
    },
  });

  const todayKey = getZonedDateKey(new Date(), timeZone);
  const todayCount = recentCalls.filter((call) => getZonedDateKey(call.createdAt, timeZone) === todayKey).length;
  return todayCount >= cap;
}

async function hasRecentCooldown(cooldownSeconds: number) {
  const latestCall = await prisma.phoneCall.findFirst({
    orderBy: [{ createdAt: 'desc' }],
    select: { createdAt: true },
  });
  if (!latestCall) return false;
  return Date.now() - latestCall.createdAt.getTime() < cooldownSeconds * 1000;
}

async function findActiveInFlightCall() {
  return prisma.phoneCall.findFirst({
    where: {
      providerStatus: {
        in: ['registered', 'ongoing'],
      },
    },
    select: { id: true },
  });
}

async function markCampaignCompletedIfDrained(campaignId: string, listId: string) {
  const remaining = await prisma.phoneListEntry.count({
    where: {
      listId,
      OR: [
        { queueState: 'ready' },
        { queueState: 'in_progress' },
        { queueState: 'retry_due' },
      ],
    },
  });

  if (remaining === 0) {
    await prisma.phoneCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });
  }
}

async function pauseCampaignOnRepeatedFailures(campaignId: string) {
  const failures = await prisma.phoneCall.count({
    where: {
      campaignId,
      providerStatus: 'error',
      createdAt: {
        gte: new Date(Date.now() - 15 * 60 * 1000),
      },
    },
  });

  if (failures >= 3) {
    await prisma.phoneCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'paused',
        pausedAt: new Date(),
      },
    });
  }
}

export async function launchNextPhoneCampaignCall(): Promise<boolean> {
  const campaign = await prisma.phoneCampaign.findFirst({
    where: { status: 'running' },
    include: {
      list: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
    orderBy: [{ startedAt: 'asc' }, { createdAt: 'asc' }],
  });

  if (!campaign) return false;

  const settings = parseCampaignSettings(campaign.settingsJson);
  if (
    !isWithinBusinessWindow(
      new Date(),
      settings.defaultTimezone,
      settings.activeWeekdays as typeof DEFAULT_PHONE_SETTINGS.activeWeekdays,
      settings.businessHoursStart,
      settings.businessHoursEnd,
    )
  ) {
    return false;
  }

  if (await shouldRespectDailyCap(settings.defaultTimezone, settings.dailyCallCap)) return false;
  if (await hasRecentCooldown(settings.cooldownSeconds)) return false;
  if (await findActiveInFlightCall()) return false;

  const nextEntry = await prisma.phoneListEntry.findFirst({
    where: {
      listId: campaign.listId,
      phoneNormalized: { not: '' },
      attempts: { lt: settings.maxAttemptsPerLead },
      OR: [
        { queueState: 'ready' },
        { queueState: 'retry_due', retryAfter: { lte: new Date() } },
      ],
    },
    orderBy: [{ duplicateWithinList: 'asc' }, { retryAfter: 'asc' }, { createdAt: 'asc' }],
  });

  if (!nextEntry) {
    await markCampaignCompletedIfDrained(campaign.id, campaign.listId);
    return false;
  }

  const profile = getPhoneAgentProfileOrThrow(campaign.agentProfileKey);
  if (!isRetellConfigured(profile)) {
    throw new Error('Retell is not fully configured for phone campaign execution');
  }

  const metadata = {
    phoneCampaignId: campaign.id,
    phoneListId: campaign.listId,
    phoneListEntryId: nextEntry.id,
    agentProfileKey: campaign.agentProfileKey,
    companyName: nextEntry.companyName,
    contactName: nextEntry.contactName,
    phoneNumber: nextEntry.phoneNormalized,
  };
  const dynamicVariables = buildPhoneDynamicVariables({
    companyName: nextEntry.companyName,
    contactName: nextEntry.contactName,
    title: nextEntry.title,
    notes: nextEntry.notes,
  });

  await prisma.phoneListEntry.update({
    where: { id: nextEntry.id },
    data: {
      queueState: 'in_progress',
      attempts: { increment: 1 },
      lastCallAt: new Date(),
      retryAfter: null,
    },
  });

  try {
    const response = await createRetellPhoneCall({
      profile,
      toNumber: nextEntry.phoneNormalized,
      metadata,
      dynamicVariables,
    });

    await prisma.phoneCall.create({
      data: {
        providerCallId: String(response.call_id),
        campaignId: campaign.id,
        listId: campaign.listId,
        listEntryId: nextEntry.id,
        agentProfileKey: campaign.agentProfileKey,
        providerStatus: String(response.call_status ?? 'registered'),
        disposition: 'unknown',
        bookedFlag: false,
        dynamicVariablesJson: JSON.stringify(dynamicVariables),
        metadataJson: JSON.stringify(metadata),
        rawPayloadJson: JSON.stringify(response),
        startedAt:
          typeof response.start_timestamp === 'number' ? new Date(Number(response.start_timestamp)) : null,
      },
    });

    await prisma.phoneCampaign.update({
      where: { id: campaign.id },
      data: {
        lastRunAt: new Date(),
      },
    });

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reachedLimit = nextEntry.attempts + 1 >= settings.maxAttemptsPerLead;

    await prisma.phoneCall.create({
      data: {
        providerCallId: `launch_error_${Date.now()}_${randomUUID().slice(0, 8)}`,
        campaignId: campaign.id,
        listId: campaign.listId,
        listEntryId: nextEntry.id,
        agentProfileKey: campaign.agentProfileKey,
        providerStatus: 'error',
        disposition: 'failed',
        bookedFlag: false,
        summary: message,
        metadataJson: JSON.stringify(metadata),
        rawPayloadJson: JSON.stringify({ error: message }),
      },
    });

    await prisma.phoneListEntry.update({
      where: { id: nextEntry.id },
      data: {
        queueState: reachedLimit ? 'completed' : 'retry_due',
        retryAfter: reachedLimit ? null : new Date(Date.now() + settings.retryDelayMinutes * 60 * 1000),
        lastOutcome: 'failed',
      },
    });

    if (settings.autoPauseAfterRepeatedFailures) {
      await pauseCampaignOnRepeatedFailures(campaign.id);
    }

    return false;
  }
}

export async function runPhoneCampaignWorker(options?: {
  once?: boolean;
  pollMs?: number;
}) {
  const pollMs = options?.pollMs ?? Number(process.env.PHONE_WORKER_POLL_MS ?? 5000);

  for (;;) {
    const didWork = await launchNextPhoneCampaignCall();
    if (options?.once) return;
    await sleep(didWork ? 1500 : pollMs);
  }
}
