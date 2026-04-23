'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Settings2, Shield } from 'lucide-react';
import { formatTimeAgo } from '../../lib/utils';
import { fetchPhoneSettings, refreshRetellHistory, updatePhoneSettings } from '@/lib/phone/api';
import type { PhoneSettingsResponse } from '@/lib/phone/types';
import {
  Field,
  PageError,
  PageLoading,
  ReadonlySetting,
  SectionHeader,
} from './shared';

export function PhoneSettingsPage() {
  const [data, setData] = useState<PhoneSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<PhoneSettingsResponse['settings']>>({});

  async function load() {
    setLoading(true);
    try {
      const next = await fetchPhoneSettings();
      setData(next);
      setForm(next.settings);
    } catch (loadError) {
      setMessage(loadError instanceof Error ? loadError.message : 'Could not load phone settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updatePhoneSettings(form);
      setData(updated);
      setForm(updated.settings);
      setMessage('Phone settings saved.');
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

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

  if (loading) return <PageLoading label="Loading Phone settings" />;
  if (!data) return <PageError label={message ?? 'Phone settings are unavailable.'} onRetry={() => void load()} />;

  return (
    <div className="max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-neutral-900">Settings</h1>
        <p className="text-sm text-neutral-500">
          Safe operational defaults only. Provider-sensitive Retell configuration stays read-only and backend-managed.
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
            <SectionHeader
              icon={Settings2}
              title="Operational Defaults"
              description="These values affect campaign pacing, windows, retries, and voicemail behavior."
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Default timezone">
                <input
                  type="text"
                  value={form.defaultTimezone ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, defaultTimezone: event.target.value }))}
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
                />
              </Field>
              <Field label="Default source behavior">
                <input
                  type="text"
                  value={form.defaultSourceBehavior ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, defaultSourceBehavior: event.target.value }))
                  }
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
                />
              </Field>
              <Field label="Business hours start">
                <input
                  type="time"
                  value={form.businessHoursStart ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, businessHoursStart: event.target.value }))}
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
                />
              </Field>
              <Field label="Business hours end">
                <input
                  type="time"
                  value={form.businessHoursEnd ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, businessHoursEnd: event.target.value }))}
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
                />
              </Field>
              <Field label="Daily call cap">
                <input
                  type="number"
                  min={1}
                  value={form.dailyCallCap ?? 0}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, dailyCallCap: Number(event.target.value) || 0 }))
                  }
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
                />
              </Field>
              <Field label="Cooldown between calls (seconds)">
                <input
                  type="number"
                  min={0}
                  value={form.cooldownSeconds ?? 0}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, cooldownSeconds: Number(event.target.value) || 0 }))
                  }
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
                />
              </Field>
              <Field label="Max attempts per lead">
                <input
                  type="number"
                  min={1}
                  value={form.maxAttemptsPerLead ?? 0}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, maxAttemptsPerLead: Number(event.target.value) || 0 }))
                  }
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
                />
              </Field>
              <Field label="Retry delay (minutes)">
                <input
                  type="number"
                  min={0}
                  value={form.retryDelayMinutes ?? 0}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, retryDelayMinutes: Number(event.target.value) || 0 }))
                  }
                  className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
                />
              </Field>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-neutral-800">Active weekdays</p>
              <div className="flex flex-wrap gap-2">
                {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((weekday) => {
                  const selected = (form.activeWeekdays ?? []).includes(weekday as never);
                  return (
                    <button
                      key={weekday}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          activeWeekdays: selected
                            ? (current.activeWeekdays ?? []).filter((day) => day !== weekday)
                            : [...(current.activeWeekdays ?? []), weekday as never],
                        }))
                      }
                      className={`rounded-full border px-3 py-1.5 text-2xs font-medium transition-colors ${
                        selected
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {weekday.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-xs text-neutral-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.voicemailEnabled)}
                  onChange={(event) => setForm((current) => ({ ...current, voicemailEnabled: event.target.checked }))}
                />
                Voicemail enabled
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.autoPauseAfterRepeatedFailures)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      autoPauseAfterRepeatedFailures: event.target.checked,
                    }))
                  }
                />
                Auto-pause after repeated failures
              </label>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
                Save settings
              </button>
              <button
                type="button"
                onClick={() => void handleRefreshHistory()}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh Retell history
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <SectionHeader
              icon={Shield}
              title="Locked Provider Profile"
              description="Read-only Retell configuration, intentionally not editable from the Phone UI."
            />
            <div className="space-y-3 text-xs text-neutral-700">
              <ReadonlySetting label="Provider" value={data.providerInfo.providerName} />
              <ReadonlySetting label="Profile" value={data.providerInfo.agentProfileLabel} />
              <ReadonlySetting label="Agent ID" value={data.providerInfo.agentId} mono />
              <ReadonlySetting label="Conversation flow" value={data.providerInfo.conversationFlowId} mono />
              <ReadonlySetting
                label="Outbound number"
                value={`${data.providerInfo.outboundNumberLabel}${data.providerInfo.outboundNumber ? ` · ${data.providerInfo.outboundNumber}` : ''}`}
              />
              <ReadonlySetting label="Voice" value={data.providerInfo.voiceLabel} />
              <ReadonlySetting label="Webhook status" value={data.providerInfo.webhookStatus} />
              <ReadonlySetting
                label="Last sync"
                value={data.providerInfo.lastSyncTime ? formatTimeAgo(data.providerInfo.lastSyncTime) : 'Never'}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
