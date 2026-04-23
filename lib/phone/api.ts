import type {
  PhoneCall,
  PhoneCallFilters,
  PhoneCallLogResponse,
  PhoneCampaign,
  PhoneCampaignSettings,
  PhoneCsvPreview,
  PhoneHomeData,
  PhoneList,
  PhoneSettingsResponse,
} from './types';

const BASE = '/api/phone';

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? response.statusText);
  }
  return data as T;
}

export async function fetchPhoneHome(): Promise<PhoneHomeData> {
  const res = await fetch(`${BASE}/home`, { cache: 'no-store' });
  return readJson<PhoneHomeData>(res);
}

export async function fetchPhoneLists(): Promise<PhoneList[]> {
  const res = await fetch(`${BASE}/lists`, { cache: 'no-store' });
  return readJson<PhoneList[]>(res);
}

export async function fetchPhoneList(listId: string): Promise<PhoneList> {
  const res = await fetch(`${BASE}/lists/${encodeURIComponent(listId)}`, { cache: 'no-store' });
  return readJson<PhoneList>(res);
}

export async function fetchPhoneCampaigns(): Promise<PhoneCampaign[]> {
  const res = await fetch(`${BASE}/campaigns`, { cache: 'no-store' });
  return readJson<PhoneCampaign[]>(res);
}

export async function fetchPhoneCalls(filters: PhoneCallFilters): Promise<PhoneCallLogResponse> {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === false) return;
    search.set(key, String(value));
  });
  const res = await fetch(`${BASE}/calls${search.toString() ? `?${search.toString()}` : ''}`, {
    cache: 'no-store',
  });
  return readJson<PhoneCallLogResponse>(res);
}

export async function fetchPhoneCall(callId: string): Promise<PhoneCall> {
  const res = await fetch(`${BASE}/calls/${encodeURIComponent(callId)}`, { cache: 'no-store' });
  return readJson<PhoneCall>(res);
}

export async function fetchPhoneSettings(): Promise<PhoneSettingsResponse> {
  const res = await fetch(`${BASE}/settings`, { cache: 'no-store' });
  return readJson<PhoneSettingsResponse>(res);
}

export async function updatePhoneSettings(
  patch: Partial<PhoneSettingsResponse['settings']>,
): Promise<PhoneSettingsResponse> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readJson<PhoneSettingsResponse>(res);
}

export async function previewPhoneCsv(file: File): Promise<PhoneCsvPreview> {
  const form = new FormData();
  form.set('file', file);
  const res = await fetch(`${BASE}/lists/import-csv/preview`, { method: 'POST', body: form });
  return readJson<PhoneCsvPreview>(res);
}

export async function commitPhoneCsv(input: {
  displayName: string;
  notes?: string;
  file: File;
}): Promise<PhoneList> {
  const form = new FormData();
  form.set('displayName', input.displayName);
  form.set('notes', input.notes ?? '');
  form.set('file', input.file);
  const res = await fetch(`${BASE}/lists/import-csv/commit`, { method: 'POST', body: form });
  return readJson<PhoneList>(res);
}

export async function createManualPhoneList(input: {
  displayName: string;
  notes?: string;
  entries: Array<{
    companyName?: string;
    contactName?: string;
    title?: string;
    phoneRaw: string;
    email?: string;
    website?: string;
    country?: string;
    timezone?: string;
    notes?: string;
  }>;
}): Promise<PhoneList> {
  const res = await fetch(`${BASE}/lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceType: 'manual',
      displayName: input.displayName,
      notes: input.notes ?? '',
      entries: input.entries,
    }),
  });
  return readJson<PhoneList>(res);
}

export async function createPhoneCampaignRequest(input: {
  name: string;
  listId: string;
  agentProfileKey: string;
  settings?: Partial<PhoneCampaignSettings>;
}): Promise<PhoneCampaign> {
  const res = await fetch(`${BASE}/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson<PhoneCampaign>(res);
}

export async function patchPhoneCampaign(
  campaignId: string,
  patch: {
    name?: string;
    listId?: string;
    agentProfileKey?: string;
    settings?: Partial<PhoneCampaignSettings>;
  },
): Promise<PhoneCampaign> {
  const res = await fetch(`${BASE}/campaigns/${encodeURIComponent(campaignId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readJson<PhoneCampaign>(res);
}

async function campaignAction(campaignId: string, action: 'start' | 'pause' | 'resume') {
  const res = await fetch(`${BASE}/campaigns/${encodeURIComponent(campaignId)}/${action}`, {
    method: 'POST',
  });
  return readJson<PhoneCampaign>(res);
}

export function startPhoneCampaignRequest(campaignId: string) {
  return campaignAction(campaignId, 'start');
}

export function pausePhoneCampaignRequest(campaignId: string) {
  return campaignAction(campaignId, 'pause');
}

export function resumePhoneCampaignRequest(campaignId: string) {
  return campaignAction(campaignId, 'resume');
}

export async function refreshRetellHistory(days = 30): Promise<{
  imported: number;
  updated: number;
  lastSyncAt: string;
}> {
  const res = await fetch(`${BASE}/retell/backfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ days }),
  });
  return readJson<{ imported: number; updated: number; lastSyncAt: string }>(res);
}
