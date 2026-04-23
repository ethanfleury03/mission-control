'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { formatTimeAgo } from '../../lib/utils';
import {
  createPhoneCampaignRequest,
  fetchPhoneCampaigns,
  fetchPhoneLists,
  fetchPhoneSettings,
  pausePhoneCampaignRequest,
  resumePhoneCampaignRequest,
  startPhoneCampaignRequest,
} from '@/lib/phone/api';
import type { PhoneCampaign, PhoneList, PhonePage, PhoneSettingsResponse } from '@/lib/phone/types';
import {
  PageError,
  PageLoading,
  ReadonlySetting,
  SectionHeader,
  StatusPill,
  formatWeekdays,
  resolveAgentLabel,
} from './shared';

export function PhoneCreateCallPage({ onNavigate }: { onNavigate: (page: PhonePage) => void }) {
  const [campaigns, setCampaigns] = useState<PhoneCampaign[]>([]);
  const [lists, setLists] = useState<PhoneList[]>([]);
  const [settingsData, setSettingsData] = useState<PhoneSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState('');
  const [campaignListId, setCampaignListId] = useState('');
  const [campaignAgentProfileKey, setCampaignAgentProfileKey] = useState('');
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [actionCampaignId, setActionCampaignId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [nextCampaigns, nextLists, nextSettings] = await Promise.all([
        fetchPhoneCampaigns(),
        fetchPhoneLists(),
        fetchPhoneSettings(),
      ]);
      setCampaigns(nextCampaigns);
      setLists(nextLists);
      setSettingsData(nextSettings);
      setCampaignListId((current) =>
        current && nextLists.some((list) => list.id === current) ? current : (nextLists[0]?.id ?? ''),
      );
      setCampaignAgentProfileKey((current) =>
        current && nextSettings.agentProfiles.some((profile) => profile.key === current)
          ? current
          : (nextSettings.agentProfiles[0]?.key ?? ''),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load Create Call');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCampaignCreate() {
    if (!campaignListId || !campaignAgentProfileKey) return;

    setCampaignBusy(true);
    setMessage(null);
    try {
      await createPhoneCampaignRequest({
        name: campaignName || 'New outbound campaign',
        listId: campaignListId,
        agentProfileKey: campaignAgentProfileKey,
      });
      setCampaignName('');
      setMessage('Campaign created.');
      await load();
    } catch (campaignError) {
      setMessage(campaignError instanceof Error ? campaignError.message : 'Could not create campaign');
    } finally {
      setCampaignBusy(false);
    }
  }

  async function handleCampaignAction(campaignId: string, action: 'start' | 'pause' | 'resume') {
    setActionCampaignId(campaignId);
    setMessage(null);
    try {
      if (action === 'start') await startPhoneCampaignRequest(campaignId);
      if (action === 'pause') await pausePhoneCampaignRequest(campaignId);
      if (action === 'resume') await resumePhoneCampaignRequest(campaignId);
      setMessage(
        action === 'start'
          ? 'Campaign started.'
          : action === 'pause'
            ? 'Campaign paused.'
            : 'Campaign resumed.',
      );
      await load();
    } catch (campaignError) {
      setMessage(campaignError instanceof Error ? campaignError.message : 'Could not update campaign');
    } finally {
      setActionCampaignId(null);
    }
  }

  if (loading) return <PageLoading label="Loading Create Call" />;
  if (!settingsData) {
    return <PageError label={error ?? 'Create Call is unavailable right now.'} onRetry={() => void load()} />;
  }

  const settings = settingsData.settings;

  return (
    <div className="max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-neutral-900">Create Call</h1>
        <p className="text-sm text-neutral-500">
          Build outbound campaigns here, then start, pause, or resume them without exposing provider-sensitive
          prompt, voice, flow, or webhook controls.
        </p>
      </div>

      {message && (
        <div className="mb-4 rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-neutral-700">
          {message}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="card p-5">
          <SectionHeader
            icon={PlayCircle}
            title="Create Campaign"
            description="Choose the list, choose the locked agent profile, and keep dialing defaults inherited from Settings."
          />

          {lists.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-neutral-800">You need a list before you can create a campaign.</p>
              <p className="mt-1 text-xs text-neutral-500">
                Import a CSV or create a manual list first, then come back here to launch the campaign.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('lists')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover"
              >
                Go to Lists
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <input
                  type="text"
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  placeholder="Campaign name"
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
                />
                <select
                  value={campaignListId}
                  onChange={(event) => setCampaignListId(event.target.value)}
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
                >
                  <option value="">Select list</option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.displayName}
                    </option>
                  ))}
                </select>
                <select
                  value={campaignAgentProfileKey}
                  onChange={(event) => setCampaignAgentProfileKey(event.target.value)}
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
                >
                  <option value="">Select agent profile</option>
                  {settingsData.agentProfiles.map((profile) => (
                    <option key={profile.key} value={profile.key}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-medium text-neutral-800">Locked provider profile stays protected.</p>
                  <p className="mt-1 text-2xs text-neutral-500">
                    Voice, prompt, flow, and webhook linkage remain backend-managed. Change dialing defaults in
                    Settings if this campaign needs different guardrails later.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('settings')}
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
                  >
                    <Settings2 className="h-4 w-4" />
                    Review Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCampaignCreate()}
                    disabled={!campaignListId || !campaignAgentProfileKey || campaignBusy}
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                  >
                    {campaignBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    Create Campaign
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="card p-5">
          <SectionHeader
            icon={Settings2}
            title="Inherited Dialing Defaults"
            description="Campaigns inherit these safe operational defaults from Settings in this pass."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReadonlySetting label="Timezone" value={settings.defaultTimezone} />
            <ReadonlySetting
              label="Business hours"
              value={`${settings.businessHoursStart} - ${settings.businessHoursEnd}`}
            />
            <ReadonlySetting label="Active weekdays" value={formatWeekdays(settings.activeWeekdays)} />
            <ReadonlySetting label="Daily call cap" value={String(settings.dailyCallCap)} />
            <ReadonlySetting label="Cooldown" value={`${settings.cooldownSeconds}s`} />
            <ReadonlySetting label="Max attempts" value={String(settings.maxAttemptsPerLead)} />
            <ReadonlySetting label="Retry delay" value={`${settings.retryDelayMinutes} min`} />
            <ReadonlySetting label="Voicemail" value={settings.voicemailEnabled ? 'Enabled' : 'Disabled'} />
            <ReadonlySetting
              label="Auto-pause after failures"
              value={settings.autoPauseAfterRepeatedFailures ? 'Enabled' : 'Disabled'}
            />
            <ReadonlySetting label="Default source behavior" value={settings.defaultSourceBehavior} />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <SectionHeader
          icon={RefreshCw}
          title="Campaigns"
          description="Existing outbound campaigns and their current run status."
        />

        {campaigns.length ? (
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Campaign</th>
                  <th className="px-3 py-2 text-left font-medium">List</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Agent</th>
                  <th className="px-3 py-2 text-left font-medium">Last Updated</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => {
                  const actionBusy = actionCampaignId === campaign.id;
                  return (
                    <tr key={campaign.id} className="border-t border-neutral-100 text-neutral-700">
                      <td className="px-3 py-2">
                        <div className="font-medium text-neutral-900">{campaign.name}</div>
                        <div className="text-2xs text-neutral-500">
                          {campaign.startedAt ? `Started ${formatTimeAgo(campaign.startedAt)}` : 'Not started yet'}
                        </div>
                      </td>
                      <td className="px-3 py-2">{campaign.listName}</td>
                      <td className="px-3 py-2">
                        <StatusPill status={campaign.status} />
                      </td>
                      <td className="px-3 py-2">
                        {resolveAgentLabel(campaign.agentProfileKey, settingsData.agentProfiles)}
                      </td>
                      <td className="px-3 py-2">{formatTimeAgo(campaign.updatedAt)}</td>
                      <td className="px-3 py-2 text-right">
                        {campaign.status === 'running' ? (
                          <button
                            type="button"
                            onClick={() => void handleCampaignAction(campaign.id, 'pause')}
                            disabled={actionBusy}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1.5 text-2xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                          >
                            {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
                            Pause
                          </button>
                        ) : campaign.status === 'paused' ? (
                          <button
                            type="button"
                            onClick={() => void handleCampaignAction(campaign.id, 'resume')}
                            disabled={actionBusy}
                            className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-2xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                          >
                            {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Resume
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleCampaignAction(campaign.id, 'start')}
                            disabled={actionBusy}
                            className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-2xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
                          >
                            {actionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                            Start
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-neutral-800">No campaigns yet</p>
            <p className="mt-1 text-xs text-neutral-500">
              Create your first outbound campaign above and it will appear here for control and status tracking.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
