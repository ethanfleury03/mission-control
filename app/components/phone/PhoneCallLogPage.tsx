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
  formatCurrencyFromCents,
  formatDuration,
} from './shared';

const OUTCOMES = [
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
] as const;

export function PhoneCallLogPage() {
  const [filters, setFilters] = useState<PhoneCallFilters>({
    from: '',
    to: '',
    agentId: '',
    callStatus: '',
    direction: '',
    disposition: '',
    answered: '',
    bookedOnly: false,
    successfulOnly: false,
    sentiment: '',
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
        'direction',
        'from_number',
        'to_number',
        'agent_name',
        'agent_id',
        'agent_version',
        'duration_ms',
        'cost_usd',
        'provider_status',
        'disposition',
        'successful',
        'sentiment',
        'summary',
        'provider_call_id',
      ].join(','),
      ...data.items.map((call) =>
        [
          escapeCsv(call.startedAt ?? call.createdAt),
          escapeCsv(call.direction),
          escapeCsv(call.fromNumber),
          escapeCsv(call.toNumber || call.phoneNumber),
          escapeCsv(call.agentName),
          escapeCsv(call.agentId),
          String(call.agentVersion ?? ''),
          String(call.durationMs ?? ''),
          String(((call.costCents ?? 0) / 100).toFixed(4)),
          escapeCsv(call.providerStatus),
          escapeCsv(call.disposition),
          call.callSuccessful === true ? 'yes' : call.callSuccessful === false ? 'no' : '',
          escapeCsv(call.userSentiment),
          escapeCsv(call.summary),
          escapeCsv(call.providerCallId),
        ].join(','),
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'retell-call-log.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const resetFilters: PhoneCallFilters = {
    from: '',
    to: '',
    agentId: '',
    callStatus: '',
    direction: '',
    disposition: '',
    answered: '',
    bookedOnly: false,
    successfulOnly: false,
    sentiment: '',
    q: '',
  };

  return (
    <div className="max-w-7xl p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Retell Call Log</h1>
          <p className="text-sm text-neutral-500">
            Retell call history with agents, direction, transcripts, analysis, recordings, and per-call cost.
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
            value={filters.agentId ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, agentId: event.target.value }))}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          >
            <option value="">All agents</option>
            {data?.filterOptions.agents.map((agent) => (
              <option key={`${agent.agentId}-${agent.version}`} value={agent.agentId}>
                {agent.agentName || agent.agentId}
              </option>
            ))}
          </select>
          <select
            value={filters.callStatus ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, callStatus: event.target.value }))}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          >
            <option value="">All statuses</option>
            {data?.filterOptions.statuses.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            value={filters.direction ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, direction: event.target.value }))}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          >
            <option value="">All directions</option>
            {data?.filterOptions.directions.map((direction) => (
              <option key={direction} value={direction}>
                {direction}
              </option>
            ))}
          </select>
          <select
            value={filters.disposition ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, disposition: event.target.value as never }))}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          >
            <option value="">All outcomes</option>
            {OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select
            value={filters.sentiment ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, sentiment: event.target.value }))}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          >
            <option value="">All sentiments</option>
            {data?.filterOptions.sentiments.map((sentiment) => (
              <option key={sentiment} value={sentiment}>
                {sentiment}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={filters.q ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
            placeholder="Search agent, number, summary, call id..."
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          />
          <select
            value={filters.answered ?? ''}
            onChange={(event) => setFilters((current) => ({ ...current, answered: event.target.value as never }))}
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          >
            <option value="">All connection types</option>
            <option value="answered">Answered / connected</option>
            <option value="not_connected">Not connected</option>
          </select>
          <label className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700">
            <input
              type="checkbox"
              checked={Boolean(filters.successfulOnly)}
              onChange={(event) => setFilters((current) => ({ ...current, successfulOnly: event.target.checked }))}
            />
            Successful only
          </label>
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
                setFilters(resetFilters);
                void load(resetFilters);
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-xs">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Timestamp</th>
                  <th className="px-3 py-2 text-left font-medium">Direction</th>
                  <th className="px-3 py-2 text-left font-medium">From / To</th>
                  <th className="px-3 py-2 text-left font-medium">Agent</th>
                  <th className="px-3 py-2 text-left font-medium">Duration</th>
                  <th className="px-3 py-2 text-left font-medium">Cost</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Outcome</th>
                  <th className="px-3 py-2 text-left font-medium">Success</th>
                  <th className="px-3 py-2 text-left font-medium">Sentiment</th>
                  <th className="px-3 py-2 text-left font-medium">Call ID</th>
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
                    <td className="px-3 py-2 capitalize">{call.direction || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="text-neutral-900">{call.fromNumber || '—'}</div>
                      <div className="text-2xs text-neutral-500">{call.toNumber || call.phoneNumber || '—'}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-neutral-900">{call.agentName || 'Unknown agent'}</div>
                      <div className="font-mono text-2xs text-neutral-500">{call.agentId || '—'}</div>
                    </td>
                    <td className="px-3 py-2">{formatDuration(call.durationMs)}</td>
                    <td className="px-3 py-2">{formatCurrencyFromCents(call.costCents)}</td>
                    <td className="px-3 py-2 capitalize">{call.providerStatus}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={call.disposition} subtle />
                    </td>
                    <td className="px-3 py-2">{call.callSuccessful === true ? 'Yes' : call.callSuccessful === false ? 'No' : '—'}</td>
                    <td className="px-3 py-2">{call.userSentiment || '—'}</td>
                    <td className="px-3 py-2 font-mono text-2xs">{call.providerCallId}</td>
                  </tr>
                ))}
                {!data?.items.length && (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-xs text-neutral-500">
                      No Retell calls match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                <h2 className="text-sm font-semibold text-neutral-900">Retell Call Details</h2>
                <p className="text-xs text-neutral-500">
                  Transcript, recording, cost, Retell analysis, metadata, and webhook event timeline
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
                  <DetailStat label="Direction" value={selectedCall.direction || '—'} />
                  <DetailStat label="Outcome" value={selectedCall.disposition.replace(/_/g, ' ')} />
                  <DetailStat label="Successful" value={selectedCall.callSuccessful === true ? 'Yes' : selectedCall.callSuccessful === false ? 'No' : '—'} />
                  <DetailStat label="Duration" value={formatDuration(selectedCall.durationMs)} />
                  <DetailStat label="Cost" value={formatCurrencyFromCents(selectedCall.costCents)} />
                  <DetailStat label="Agent" value={selectedCall.agentName || selectedCall.agentId || '—'} />
                  <DetailStat label="Provider Call ID" value={selectedCall.providerCallId} mono />
                </div>

                <DetailBlock title="Phone">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <DetailStat label="From" value={selectedCall.fromNumber || '—'} />
                    <DetailStat label="To" value={selectedCall.toNumber || selectedCall.phoneNumber || '—'} />
                  </div>
                </DetailBlock>

                <DetailBlock title="Summary">
                  <p className="text-xs leading-relaxed text-neutral-700">
                    {selectedCall.summary || 'No summary stored yet.'}
                  </p>
                </DetailBlock>

                <DetailBlock title="Cost Breakdown">
                  {selectedCall.cost.productCosts.length ? (
                    <div className="space-y-2">
                      {selectedCall.cost.productCosts.map((item) => (
                        <div key={item.product} className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs">
                          <span className="truncate text-neutral-700">{item.product.replace(/_/g, ' ')}</span>
                          <span className="font-medium text-neutral-900">{formatCurrencyFromCents(item.costCents)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500">No cost breakdown stored yet.</p>
                  )}
                </DetailBlock>

                <DetailBlock title="Transcript">
                  <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-neutral-700">
                    {selectedCall.transcript || 'No transcript stored yet.'}
                  </pre>
                </DetailBlock>

                <DetailBlock title="Recordings and Logs">
                  <div className="flex flex-wrap gap-2">
                    {selectedCall.recordingUrl && <RecordingLink href={selectedCall.recordingUrl} label="Recording" />}
                    {selectedCall.recordingMultiChannelUrl && <RecordingLink href={selectedCall.recordingMultiChannelUrl} label="Multi-channel" />}
                    {selectedCall.publicLogUrl && <RecordingLink href={selectedCall.publicLogUrl} label="Public log" />}
                    {selectedCall.knowledgeBaseRetrievedContentsUrl && <RecordingLink href={selectedCall.knowledgeBaseRetrievedContentsUrl} label="KB retrieval" />}
                    {!selectedCall.recordingUrl && !selectedCall.recordingMultiChannelUrl && !selectedCall.publicLogUrl && !selectedCall.knowledgeBaseRetrievedContentsUrl && (
                      <p className="text-xs text-neutral-500">No recording or Retell log URLs stored yet.</p>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-neutral-700">
                    {selectedCall.disconnectionReason || 'No disconnection reason captured.'}
                  </p>
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

                <DetailBlock title="Raw Retell Payload">
                  <JsonPanel value={selectedCall.rawPayload} />
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

function RecordingLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
    >
      <Voicemail className="h-4 w-4" />
      {label}
    </a>
  );
}
