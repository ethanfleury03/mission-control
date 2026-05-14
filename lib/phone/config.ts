import type { PhoneAgentProfile, PhoneCampaignSettings, PhoneConnectorCard } from './types';

export const DEFAULT_PHONE_AGENT_PROFILE_KEY =
  process.env.PHONE_RETELL_PROFILE_KEY?.trim() || 'arrow-demo-v2';

function configuredAgentIds(): string[] {
  const explicit = process.env.PHONE_RETELL_AGENT_IDS?.trim();
  const ids = explicit
    ? explicit.split(',').map((value) => value.trim()).filter(Boolean)
    : [];
  const legacy = process.env.PHONE_RETELL_AGENT_ID?.trim();
  if (legacy && !ids.includes(legacy)) ids.unshift(legacy);
  return ids;
}

export const DEFAULT_PHONE_SETTINGS: PhoneCampaignSettings = {
  defaultTimezone: 'America/New_York',
  businessHoursStart: '09:00',
  businessHoursEnd: '17:00',
  activeWeekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  dailyCallCap: 50,
  cooldownSeconds: 45,
  maxAttemptsPerLead: 3,
  retryDelayMinutes: 240,
  voicemailEnabled: true,
  autoPauseAfterRepeatedFailures: true,
  defaultSourceBehavior: 'retain_duplicates_mark_invalid',
};

export const PHONE_FUTURE_SOURCE_CONNECTORS: PhoneConnectorCard[] = [
  {
    id: 'csv-manual',
    label: 'CSV / Manual Lists',
    description: 'Active now for importing and operating local cold-call queues.',
    status: 'active',
  },
  {
    id: 'lead-generation',
    label: 'Lead Generation',
    description: 'Coming soon: pull qualified account lists from the Lead Generation workspace.',
    status: 'coming_soon',
  },
  {
    id: 'hubspot',
    label: 'HubSpot Lists',
    description: 'Coming soon: select synced HubSpot segments as outbound call sources.',
    status: 'coming_soon',
  },
];

export function getPhoneAgentProfiles(): PhoneAgentProfile[] {
  const agentIds = configuredAgentIds();
  const primaryAgentId =
    agentIds[0] ||
    process.env.PHONE_RETELL_AGENT_ID?.trim() ||
    'agent_116dfdec8727eb1da6d5d3d8a3';

  const primaryProfile: PhoneAgentProfile = {
    key: DEFAULT_PHONE_AGENT_PROFILE_KEY,
    label: process.env.PHONE_RETELL_PROFILE_LABEL?.trim() || 'Arrow Cold Call Demo',
    provider: 'retell',
    agentId: primaryAgentId,
    conversationFlowId:
      process.env.PHONE_RETELL_CONVERSATION_FLOW_ID?.trim() ||
      'conversation_flow_942dd6bbaf78',
    outboundNumber: process.env.PHONE_RETELL_OUTBOUND_NUMBER?.trim() || '',
    outboundNumberLabel:
      process.env.PHONE_RETELL_OUTBOUND_NUMBER_LABEL?.trim() || 'Locked Retell outbound number',
    voiceLabel:
      process.env.PHONE_RETELL_VOICE_LABEL?.trim() || '11labs-Adrian · eleven_turbo_v2',
    webhookStatus:
      process.env.PHONE_RETELL_WEBHOOK_STATUS?.trim() ||
      (process.env.RETELL_API_KEY?.trim() ? 'Configured' : 'Missing API key'),
  };

  const extraProfiles = agentIds
    .slice(1)
    .map((agentId, index): PhoneAgentProfile => ({
      ...primaryProfile,
      key: `${DEFAULT_PHONE_AGENT_PROFILE_KEY}-${index + 2}`,
      label: `${primaryProfile.label} ${index + 2}`,
      agentId,
    }));

  return [primaryProfile, ...extraProfiles];
}

export function getPhoneAgentProfile(key?: string | null): PhoneAgentProfile | null {
  const profiles = getPhoneAgentProfiles();
  if (!key) return profiles[0] ?? null;
  return profiles.find((profile) => profile.key === key) ?? null;
}
