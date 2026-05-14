'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Settings2, Shield } from 'lucide-react';
import { formatTimeAgo } from '../../lib/utils';
import { fetchPhoneSettings, refreshRetellHistory } from '@/lib/phone/api';
import type { PhoneSettingsResponse } from '@/lib/phone/types';
import {
  JsonPanel,
  PageError,
  PageLoading,
  ReadonlySetting,
  SectionHeader,
} from './shared';

export function PhoneSettingsPage() {
  const [data, setData] = useState<PhoneSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setData(await fetchPhoneSettings());
    } catch (loadError) {
      setMessage(loadError instanceof Error ? loadError.message : 'Could not load phone settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleRefreshHistory() {
    setRefreshing(true);
    setMessage(null);
    try {
      const refreshed = await refreshRetellHistory(30);
      setMessage(`Retell history refreshed. Imported ${refreshed.imported}, updated ${refreshed.updated}.`);
      await load();
    } catch (refreshError) {
      setMessage(refreshError instanceof Error ? refreshError.message : 'Could not refresh Retell history');
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <PageLoading label="Loading Retell settings" />;
  if (!data) return <PageError label={message ?? 'Retell settings are unavailable.'} onRetry={() => void load()} />;

  return (
    <div className="max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-neutral-900">Retell Settings</h1>
        <p className="text-sm text-neutral-500">
          Admin-only status and sync controls. Call creation, lists, retries, and dialing policy live outside this UI.
        </p>
      </div>

      {message && (
        <div className="mb-4 rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-neutral-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <div className="card p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionHeader
                icon={Settings2}
                title="Sync Controls"
                description="Backfill Retell calls and refresh the cached voice-agent list."
              />
              <button
                type="button"
                onClick={() => void handleRefreshHistory()}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 self-start rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh Retell history
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ReadonlySetting label="API status" value={data.providerInfo.apiStatus.replace(/_/g, ' ')} />
              <ReadonlySetting label="Webhook status" value={data.providerInfo.webhookStatus} />
              <ReadonlySetting
                label="Last call sync"
                value={data.providerInfo.lastSyncTime ? formatTimeAgo(data.providerInfo.lastSyncTime) : 'Never'}
              />
              <ReadonlySetting
                label="Last agent sync"
                value={data.providerInfo.lastAgentSyncTime ? formatTimeAgo(data.providerInfo.lastAgentSyncTime) : 'Never'}
              />
              <ReadonlySetting label="Webhook URL" value={data.providerInfo.webhookUrl || 'Configure APP_URL'} mono />
              <ReadonlySetting
                label="Configured agent IDs"
                value={data.providerInfo.configuredAgentIds.join(', ') || 'All Retell agents'}
                mono
              />
            </div>
          </div>

          <div className="card p-5">
            <SectionHeader
              icon={Shield}
              title="Cached Retell Agents"
              description="Latest voice-agent records retrieved from Retell."
            />
            {data.retellAgents.length ? (
              <div className="overflow-hidden rounded-lg border border-neutral-200">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Agent</th>
                      <th className="px-3 py-2 text-left font-medium">Version</th>
                      <th className="px-3 py-2 text-left font-medium">Voice</th>
                      <th className="px-3 py-2 text-left font-medium">Published</th>
                      <th className="px-3 py-2 text-left font-medium">Synced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.retellAgents.map((agent) => (
                      <tr key={agent.id} className="border-t border-neutral-100 text-neutral-700">
                        <td className="px-3 py-2">
                          <div className="font-medium text-neutral-900">{agent.agentName || 'Unnamed agent'}</div>
                          <div className="font-mono text-2xs text-neutral-500">{agent.agentId}</div>
                        </td>
                        <td className="px-3 py-2">{agent.version}</td>
                        <td className="px-3 py-2">
                          <div>{agent.voiceId || '—'}</div>
                          <div className="text-2xs text-neutral-500">{agent.voiceModel || 'default model'}</div>
                        </td>
                        <td className="px-3 py-2">{agent.isPublished ? 'Yes' : 'No'}</td>
                        <td className="px-3 py-2">{formatTimeAgo(agent.syncedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
                <p className="text-sm font-medium text-neutral-800">No Retell agents cached yet</p>
                <p className="mt-1 text-xs text-neutral-500">Run a refresh to pull the latest agents from Retell.</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <SectionHeader
              icon={Shield}
              title="Locked Provider Profile"
              description="Backend-managed Retell profile values."
            />
            <div className="space-y-3 text-xs text-neutral-700">
              <ReadonlySetting label="Provider" value={data.providerInfo.providerName} />
              <ReadonlySetting label="Profile" value={data.providerInfo.agentProfileLabel} />
              <ReadonlySetting label="Primary agent ID" value={data.providerInfo.agentId} mono />
              <ReadonlySetting label="Conversation flow" value={data.providerInfo.conversationFlowId} mono />
              <ReadonlySetting
                label="Outbound number"
                value={`${data.providerInfo.outboundNumberLabel}${data.providerInfo.outboundNumber ? ` · ${data.providerInfo.outboundNumber}` : ''}`}
              />
              <ReadonlySetting label="Voice" value={data.providerInfo.voiceLabel} />
            </div>
          </div>

          <div className="card p-5">
            <SectionHeader
              icon={Settings2}
              title="Stored Defaults"
              description="Legacy pacing defaults retained only for historical compatibility."
            />
            <JsonPanel value={data.settings} compact />
          </div>
        </div>
      </div>
    </div>
  );
}
