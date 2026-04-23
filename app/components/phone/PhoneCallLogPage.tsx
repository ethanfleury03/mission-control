'use client';

import { useEffect, useState } from 'react';
import {
  Download,
  Filter,
  PhoneCall as PhoneCallIcon,
  RefreshCw,
  Voicemail,
  X,
} from 'lucide-react';
import { formatTimeAgo } from '../../lib/utils';
import { fetchPhoneCall, fetchPhoneCalls } from '@/lib/phone/api';
import type { PhoneCall, PhoneCallFilters, PhoneCallLogResponse } from '@/lib/phone/types';
import {
  DetailBlock,
  DetailStat,
  JsonPanel,
  PageError,
  PageLoading,
  StatusPill,
  escapeCsv,
  formatDuration,
} from './shared';

export function PhoneCallLogPage() {
  const [filters, setFilters] = useState<PhoneCallFilters>({
    from: '',
    to: '',
    listId: '',
    campaignId: '',
    disposition: '',
    answered: '',
    bookedOnly: false,
    q: '',
  });
  const [data, setData] = useState<PhoneCallLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<PhoneCall | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);

  async function load(nextFilters: PhoneCallFilters) {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchPhoneCalls(nextFilters));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load call log');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(filters);
  }, []);

  useEffect(() => {
    if (!selectedCallId) {
      setSelectedCall(null);
      setSelectedError(null);
      return;
    }

    let active = true;
    setSelectedLoading(true);
    setSelectedError(null);
    void fetchPhoneCall(selectedCallId)
      .then((call) => {
        if (active) setSelectedCall(call);
      })
      .catch((loadError) => {
        if (active) {
          setSelectedCall(null);
          setSelectedError(loadError instanceof Error ? loadError.message : 'Could not load call detail');
        }
      })
      .finally(() => {
        if (active) setSelectedLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCallId]);

  function exportCsv() {
    if (!data?.items.length) return;
    const lines = [
      [
        'timestamp',
        'contact',
        'company',
        'list',
        'campaign',
        'agent_profile',
        'duration_ms',
        'provider_status',
        'disposition',
        'booked',
        'summary',
        'provider_call_id',
      ].join(','),
      ...data.items.map((call) =>
        [
          escapeCsv(call.startedAt ?? call.createdAt),
          escapeCsv(call.contactName),
          escapeCsv(call.companyName),
          escapeCsv(call.listName),
          escapeCsv(call.campaignName),
          escapeCsv(call.agentProfileKey),
          String(call.durationMs ?? ''),
          escapeCsv(call.providerStatus),
          escapeCsv(call.disposition),
          call.bookedFlag ? 'yes' : 'no',
          escapeCsv(call.summary),
          escapeCsv(call.providerCallId),
        ].join(','),
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'phone-call-log.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-7xl p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Call Log</h1>
          <p className="text-sm text-neutral-500">
            Local source of truth for call history, transcripts, and webhook-driven call analysis.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!data?.items.length}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="card mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            type="date"
            value={filters.from ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          />
          <input
            type="date"
            value={filters.to ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          />
          <select
            value={filters.listId ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, listId: event.target.value }))}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          >
            <option value="">All lists</option>
            {data?.filterOptions.lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.displayName}
              </option>
            ))}
          </select>
          <select
            value={filters.campaignId ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, campaignId: event.target.value }))}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          >
            <option value="">All campaigns</option>
            {data?.filterOptions.campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
          <select
            value={filters.disposition ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, disposition: event.target.value as never }))}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          >
            <option value="">All outcomes</option>
            {[
              'booked',
              'callback_requested',
              'wrong_person',
              'voicemail',
              'not_interested',
              'do_not_call',
              'no_answer',
              'busy',
              'failed',
              'unknown',
            ].map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            value={filters.answered ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, answered: event.target.value as never }))}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          >
            <option value="">All connection types</option>
            <option value="answered">Answered / connected</option>
            <option value="not_connected">Not connected</option>
          </select>
          <input
            type="text"
            value={filters.q ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
            placeholder="Search contact, company, phone, call id..."
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          />
          <label className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700">
            <input
              type="checkbox"
              checked={Boolean(filters.bookedOnly)}
              onChange={(event) => setFilters((current) => ({ ...current, bookedOnly: event.target.checked }))}
            />
            Booked only
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load(filters)}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover"
            >
              <Filter className="h-4 w-4" />
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                const reset = {
                  from: '',
                  to: '',
                  listId: '',
                  campaignId: '',
                  disposition: '',
                  answered: '',
                  bookedOnly: false,
                  q: '',
                } as PhoneCallFilters;
                setFilters(reset);
                void load(reset);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <PageLoading label="Loading call log" />
      ) : error ? (
        <PageError label={error} onRetry={() => void load(filters)} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Timestamp</th>
                <th className="px-3 py-2 text-left font-medium">Contact / Company</th>
                <th className="px-3 py-2 text-left font-medium">List</th>
                <th className="px-3 py-2 text-left font-medium">Campaign</th>
                <th className="px-3 py-2 text-left font-medium">Duration</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Outcome</th>
                <th className="px-3 py-2 text-left font-medium">Booked</th>
                <th className="px-3 py-2 text-left font-medium">Provider Call ID</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((call) => (
                <tr
                  key={call.id}
                  className="cursor-pointer border-t border-neutral-100 text-neutral-700 hover:bg-neutral-50"
                  onClick={() => setSelectedCallId(call.id)}
                >
                  <td className="px-3 py-2">{formatTimeAgo(call.startedAt ?? call.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-neutral-900">{call.contactName || 'Unknown contact'}</div>
                    <div className="text-2xs text-neutral-500">{call.companyName || call.phoneNumber || '—'}</div>
                  </td>
                  <td className="px-3 py-2">{call.listName || '—'}</td>
                  <td className="px-3 py-2">{call.campaignName || '—'}</td>
                  <td className="px-3 py-2">{formatDuration(call.durationMs)}</td>
                  <td className="px-3 py-2 capitalize">{call.providerStatus}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={call.disposition} subtle />
                  </td>
                  <td className="px-3 py-2">{call.bookedFlag ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 font-mono text-2xs">{call.providerCallId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCallId && (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/25" onClick={() => setSelectedCallId(null)}>
          <div
            className="animate-slide-in h-full w-full max-w-2xl overflow-y-auto border-l border-hub-border bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-hub-border bg-white px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">Call Details</h2>
                <p className="text-xs text-neutral-500">
                  Transcript, Retell analysis summary, metadata, and webhook event timeline
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCallId(null)}
                className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedLoading ? (
              <PageLoading label="Loading call detail" compact />
            ) : selectedError || !selectedCall ? (
              <div className="p-5">
                <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-neutral-800">Could not load call detail.</p>
                  <p className="mt-1 text-xs text-neutral-500">{selectedError ?? 'Try opening the call again.'}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <DetailStat label="Provider status" value={selectedCall.providerStatus} />
                  <DetailStat label="Outcome" value={selectedCall.disposition.replace(/_/g, ' ')} />
                  <DetailStat label="Booked" value={selectedCall.bookedFlag ? 'Yes' : 'No'} />
                  <DetailStat label="Duration" value={formatDuration(selectedCall.durationMs)} />
                  <DetailStat label="Campaign" value={selectedCall.campaignName || '—'} />
                  <DetailStat label="Provider Call ID" value={selectedCall.providerCallId} mono />
                </div>

                <DetailBlock title="Summary">
                  <p className="text-xs leading-relaxed text-neutral-700">
                    {selectedCall.summary || 'No summary stored yet.'}
                  </p>
                </DetailBlock>

                <DetailBlock title="Transcript">
                  <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-neutral-700">
                    {selectedCall.transcript || 'No transcript stored yet.'}
                  </pre>
                </DetailBlock>

                <DetailBlock title="Disconnection">
                  <p className="text-xs text-neutral-700">
                    {selectedCall.disconnectionReason || 'No disconnection reason captured.'}
                  </p>
                  {selectedCall.recordingUrl && (
                    <a
                      href={selectedCall.recordingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand hover:text-brand-hover"
                    >
                      <Voicemail className="h-4 w-4" />
                      Open recording
                    </a>
                  )}
                </DetailBlock>

                <DetailBlock title="Dynamic Variables">
                  <JsonPanel value={selectedCall.dynamicVariables} />
                </DetailBlock>

                <DetailBlock title="Raw Metadata">
                  <JsonPanel value={selectedCall.metadata} />
                </DetailBlock>

                <DetailBlock title="Retell Analysis">
                  <JsonPanel value={selectedCall.analysis} />
                </DetailBlock>

                <DetailBlock title="Webhook Timeline">
                  <div className="space-y-2">
                    {selectedCall.events?.length ? (
                      selectedCall.events.map((event) => (
                        <div key={event.id} className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-neutral-800">{event.eventType}</span>
                            <span className="text-2xs text-neutral-500">{formatTimeAgo(event.createdAt)}</span>
                          </div>
                          <JsonPanel value={event.payload} compact />
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-neutral-500">No event timeline stored yet.</p>
                    )}
                  </div>
                </DetailBlock>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
