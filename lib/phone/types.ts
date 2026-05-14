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
  agentId: string;
  agentName: string;
  agentVersion: number | null;
  callType: string;
  direction: string;
  fromNumber: string;
  toNumber: string;
  providerStatus: string;
  disposition: PhoneCallDisposition;
  bookedFlag: boolean;
  summary: string;
  transcript: string;
  recordingUrl: string;
  recordingMultiChannelUrl: string;
  publicLogUrl: string;
  knowledgeBaseRetrievedContentsUrl: string;
  disconnectionReason: string;
  userSentiment: string;
  callSuccessful: boolean | null;
  inVoicemail: boolean | null;
  costCents: number | null;
  cost: {
    combinedCents: number | null;
    totalDurationSeconds: number | null;
    totalDurationUnitPrice: number | null;
    productCosts: PhoneCallCostProduct[];
  };
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

export interface PhoneCallCostProduct {
  product: string;
  costCents: number | null;
  unitPrice: number | null;
  isTransferLegCost: boolean | null;
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
  lastRetellAgentSyncAt: string | null;
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
  configuredAgentIds: string[];
  conversationFlowId: string;
  outboundNumberLabel: string;
  outboundNumber: string;
  voiceLabel: string;
  webhookStatus: string;
  lastSyncTime: string | null;
  lastAgentSyncTime: string | null;
  apiStatus: 'configured' | 'missing_api_key';
  webhookUrl: string;
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
  totalCalls: number;
  liveCalls: number;
  callsToday: number;
  connectRate: number;
  successfulRate: number;
  bookedRate: number;
  averageCallDurationMs: number;
  totalCostCents: number;
  averageCostCents: number;
  todayCostCents: number;
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
  charts: {
    callsByDay: PhoneCallsByDayPoint[];
    outcomesByDisposition: PhoneOutcomePoint[];
    bookedTrend: PhoneBookedTrendPoint[];
    costByDay: PhoneCostByDayPoint[];
  };
  liveCalls: PhoneCall[];
  recentCalls: PhoneCall[];
  agentSummaries: PhoneAgentSummary[];
  costSummary: PhoneCostSummary;
  agentProfiles: PhoneAgentProfile[];
  retellAgents: PhoneRetellAgent[];
  settings: PhoneSettings;
  providerInfo: PhoneProviderInfo;
}

export interface PhoneCallFilters {
  from?: string;
  to?: string;
  agentId?: string;
  callStatus?: string;
  direction?: string;
  disposition?: PhoneCallDisposition | '';
  answered?: 'answered' | 'not_connected' | '';
  bookedOnly?: boolean;
  successfulOnly?: boolean;
  sentiment?: string;
  minCostCents?: number;
  maxCostCents?: number;
  q?: string;
}

export interface PhoneCallLogResponse {
  items: PhoneCall[];
  filterOptions: {
    agents: Pick<PhoneRetellAgent, 'agentId' | 'agentName' | 'version'>[];
    statuses: string[];
    directions: string[];
    sentiments: string[];
  };
}

export interface PhoneSettingsResponse {
  settings: PhoneSettings;
  agentProfiles: PhoneAgentProfile[];
  retellAgents: PhoneRetellAgent[];
  providerInfo: PhoneProviderInfo;
  futureSources: PhoneConnectorCard[];
}

export interface PhoneRetellAgent {
  id: string;
  agentId: string;
  version: number;
  agentName: string;
  voiceId: string;
  voiceModel: string;
  responseEngine: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
  isPublished: boolean;
  lastModifiedAt: string | null;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhoneAgentSummary {
  agentId: string;
  agentName: string;
  version: number | null;
  totalCalls: number;
  liveCalls: number;
  connectedCalls: number;
  successfulCalls: number;
  bookedCalls: number;
  averageDurationMs: number;
  totalCostCents: number;
  averageCostCents: number;
  lastCallAt: string | null;
}

export interface PhoneCostSummary {
  totalCostCents: number;
  averageCostCents: number;
  todayCostCents: number;
  productCosts: PhoneCallCostProduct[];
}

export interface PhoneCostByDayPoint {
  day: string;
  costCents: number;
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
