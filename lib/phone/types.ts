// ---------------------------------------------------------------------------
// Phone / Cold Calling – Domain Types
// ---------------------------------------------------------------------------

export type PhonePage = 'home' | 'create-call' | 'lists' | 'call-log' | 'settings';

export type PhoneListSourceType =
  | 'uploaded_csv'
  | 'manual'
  | 'lead_generation'
  | 'hubspot';

export type PhoneListStatus = 'active' | 'archived';

export type PhoneCampaignStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export type PhoneQueueState =
  | 'ready'
  | 'in_progress'
  | 'retry_due'
  | 'completed'
  | 'skipped'
  | 'invalid'
  | 'dnc';

export type PhoneCallDisposition =
  | 'booked'
  | 'callback_requested'
  | 'wrong_person'
  | 'voicemail'
  | 'not_interested'
  | 'do_not_call'
  | 'no_answer'
  | 'busy'
  | 'failed'
  | 'unknown';

export type PhoneWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface PhoneListEntry {
  id: string;
  listId: string;
  companyName: string;
  contactName: string;
  title: string;
  phoneRaw: string;
  phoneNormalized: string;
  email: string;
  website: string;
  country: string;
  timezone: string;
  notes: string;
  sourceMetadata: Record<string, unknown>;
  sourceExternalId: string | null;
  queueState: PhoneQueueState;
  duplicateWithinList: boolean;
  attempts: number;
  lastOutcome: PhoneCallDisposition;
  lastCallAt: string | null;
  retryAfter: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PhoneList {
  id: string;
  sourceType: PhoneListSourceType;
  displayName: string;
  notes: string;
  status: PhoneListStatus;
  sourceMetadata: Record<string, unknown>;
  totalEntries: number;
  dialableEntries: number;
  invalidEntries: number;
  duplicateEntries: number;
  createdAt: string;
  updatedAt: string;
  entries?: PhoneListEntry[];
}

export interface PhoneCampaignSettings {
  defaultTimezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  activeWeekdays: PhoneWeekday[];
  dailyCallCap: number;
  cooldownSeconds: number;
  maxAttemptsPerLead: number;
  retryDelayMinutes: number;
  voicemailEnabled: boolean;
  autoPauseAfterRepeatedFailures: boolean;
  defaultSourceBehavior: string;
}

export interface PhoneCampaign {
  id: string;
  listId: string;
  listName: string;
  name: string;
  agentProfileKey: string;
  settings: PhoneCampaignSettings;
  status: PhoneCampaignStatus;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PhoneCallEvent {
  id: string;
  phoneCallId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PhoneCall {
  id: string;
  providerCallId: string;
  campaignId: string | null;
  campaignName: string;
  listId: string | null;
  listName: string;
  listEntryId: string | null;
  companyName: string;
  contactName: string;
  phoneNumber: string;
  agentProfileKey: string;
  providerStatus: string;
  disposition: PhoneCallDisposition;
  bookedFlag: boolean;
  summary: string;
  transcript: string;
  recordingUrl: string;
  disconnectionReason: string;
  dynamicVariables: Record<string, string>;
  metadata: Record<string, unknown>;
  analysis: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
  events?: PhoneCallEvent[];
}

export interface PhoneSettings {
  id: string;
  defaultTimezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  activeWeekdays: PhoneWeekday[];
  dailyCallCap: number;
  cooldownSeconds: number;
  maxAttemptsPerLead: number;
  retryDelayMinutes: number;
  voicemailEnabled: boolean;
  autoPauseAfterRepeatedFailures: boolean;
  defaultSourceBehavior: string;
  lastRetellSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PhoneAgentProfile {
  key: string;
  label: string;
  provider: 'retell';
  agentId: string;
  conversationFlowId: string;
  outboundNumber: string;
  outboundNumberLabel: string;
  voiceLabel: string;
  webhookStatus: string;
}

export interface PhoneProviderInfo {
  providerName: string;
  agentProfileLabel: string;
  agentId: string;
  conversationFlowId: string;
  outboundNumberLabel: string;
  outboundNumber: string;
  voiceLabel: string;
  webhookStatus: string;
  lastSyncTime: string | null;
}

export interface PhoneCallsByDayPoint {
  day: string;
  calls: number;
}

export interface PhoneOutcomePoint {
  disposition: PhoneCallDisposition;
  count: number;
}

export interface PhoneBookedTrendPoint {
  day: string;
  booked: number;
  notBooked: number;
}

export interface PhoneHomeSummary {
  totalDialableContacts: number;
  activeListSize: number;
  callsToday: number;
  connectRate: number;
  bookedRate: number;
  doNotCallRate: number;
  averageCallDurationMs: number;
}

export interface PhoneCampaignBanner extends PhoneCampaign {
  callsCompleted: number;
  callsRemaining: number;
  pacingStatus: string;
  lastCallTime: string | null;
  nextRetryWindow: string | null;
}

export interface PhoneConnectorCard {
  id: string;
  label: string;
  description: string;
  status: 'active' | 'coming_soon';
}

export interface PhoneHomeData {
  summary: PhoneHomeSummary;
  activeCampaign: PhoneCampaignBanner | null;
  charts: {
    callsByDay: PhoneCallsByDayPoint[];
    outcomesByDisposition: PhoneOutcomePoint[];
    bookedTrend: PhoneBookedTrendPoint[];
  };
  lists: PhoneList[];
  campaigns: PhoneCampaign[];
  recentCalls: PhoneCall[];
  agentProfiles: PhoneAgentProfile[];
  settings: PhoneSettings;
  futureSources: PhoneConnectorCard[];
}

export interface PhoneCallFilters {
  from?: string;
  to?: string;
  listId?: string;
  campaignId?: string;
  disposition?: PhoneCallDisposition | '';
  answered?: 'answered' | 'not_connected' | '';
  bookedOnly?: boolean;
  q?: string;
}

export interface PhoneCallLogResponse {
  items: PhoneCall[];
  filterOptions: {
    lists: Pick<PhoneList, 'id' | 'displayName'>[];
    campaigns: Pick<PhoneCampaign, 'id' | 'name'>[];
  };
}

export interface PhoneSettingsResponse {
  settings: PhoneSettings;
  agentProfiles: PhoneAgentProfile[];
  providerInfo: PhoneProviderInfo;
  futureSources: PhoneConnectorCard[];
}

export interface PhoneCsvColumnMap {
  companyName?: string;
  contactName?: string;
  title?: string;
  phone?: string;
  email?: string;
  website?: string;
  country?: string;
  timezone?: string;
  notes?: string;
}

export interface ParsedPhoneCsvRow {
  rowNumber: number;
  companyName: string;
  contactName: string;
  title: string;
  phoneRaw: string;
  phoneNormalized: string;
  email: string;
  website: string;
  country: string;
  timezone: string;
  notes: string;
  isDuplicate: boolean;
  isValidPhone: boolean;
}

export interface PhoneCsvPreview {
  header: string[];
  suggestedMap: PhoneCsvColumnMap | null;
  totalRows: number;
  duplicateCount: number;
  invalidPhoneCount: number;
  dialableCount: number;
  rows: ParsedPhoneCsvRow[];
}
