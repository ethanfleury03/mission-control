'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  DollarSign,
  PhoneCall as PhoneCallIcon,
  Radio,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatTimeAgo } from '../../lib/utils';
import { fetchPhoneHome } from '@/lib/phone/api';
import type { PhoneHomeData, PhonePage } from '@/lib/phone/types';
import {
  ChartCard,
  MetricCard,
  PageError,
  PageLoading,
  SectionHeader,
  StatusPill,
  formatCurrencyFromCents,
  formatDuration,
  formatInteger,
  formatPercent,
} from './shared';

export function PhoneHomePage({ onNavigate }: { onNavigate: (page: PhonePage) => void }) {
  const [data, setData] = useState<PhoneHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchPhoneHome());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load Phone home data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <PageLoading label="Loading Retell dashboard" />;
  if (!data) return <PageError label={error ?? 'Phone home is unavailable right now.'} onRetry={() => void load()} />;

  return (
    <div className="max-w-7xl p-6">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10">
              <Radio className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-neutral-900">Retell Phone Home</h1>
              <p className="text-sm text-neutral-500">
                Transparent call monitoring, outcomes, agent performance, and actual Retell cost.
              </p>
            </div>
          </div>
          <p className="max-w-3xl text-xs text-neutral-500">
            Calls originate in Retell and CRM-owned workflows. This tab observes what happened and what is happening now.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('call-log')}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
        >
          Open Call Log
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <MetricCard icon={PhoneCallIcon} label="Calls Today" value={formatInteger(data.summary.callsToday)} detail="Retell call count" tone="green" />
        <MetricCard icon={Radio} label="Live Calls" value={formatInteger(data.summary.liveCalls)} detail="Registered or ongoing" tone="brand" />
        <MetricCard icon={TrendingUp} label="30-Day Calls" value={formatInteger(data.summary.totalCalls)} detail="Synced history" tone="blue" />
        <MetricCard icon={Target} label="Connect Rate" value={formatPercent(data.summary.connectRate)} detail="7-day window" tone="brand" />
        <MetricCard icon={CheckCircle2} label="Success Rate" value={formatPercent(data.summary.successfulRate)} detail="Retell analysis" tone="green" />
        <MetricCard icon={CheckCircle2} label="Booked Rate" value={formatPercent(data.summary.bookedRate)} detail="Detected outcome" tone="green" />
        <MetricCard icon={Clock3} label="Avg Duration" value={formatDuration(data.summary.averageCallDurationMs)} detail="Completed calls" tone="neutral" />
        <MetricCard icon={DollarSign} label="Avg Cost" value={formatCurrencyFromCents(data.summary.averageCostCents)} detail="Per synced call" tone="amber" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="card p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionHeader
              icon={Radio}
              title="Live Retell Calls"
              description="Current registered or ongoing calls from synced Retell events."
            />
          </div>
          {data.liveCalls.length ? (
            <div className="overflow-hidden rounded-lg border border-neutral-200">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Call</th>
                    <th className="px-3 py-2 text-left font-medium">Agent</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {data.liveCalls.map((call) => (
                    <tr key={call.id} className="border-t border-neutral-100 text-neutral-700">
                      <td className="px-3 py-2">
                        <div className="font-medium text-neutral-900">{call.toNumber || call.phoneNumber || 'Unknown number'}</div>
                        <div className="text-2xs text-neutral-500 capitalize">{call.direction || 'phone call'}</div>
                      </td>
                      <td className="px-3 py-2">{call.agentName || call.agentId || 'Unknown agent'}</td>
                      <td className="px-3 py-2">
                        <StatusPill status={call.providerStatus} subtle />
                      </td>
                      <td className="px-3 py-2">{formatTimeAgo(call.startedAt ?? call.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-neutral-800">No live calls right now</p>
              <p className="mt-1 text-xs text-neutral-500">When Retell sends start or ongoing events, they will surface here.</p>
            </div>
          )}
        </div>

        <div className="card p-5">
          <SectionHeader
            icon={DollarSign}
            title="Cost Summary"
            description="Retell call_cost combined cost and product-level breakdown."
          />
          <div className="grid grid-cols-3 gap-3">
            <CostTile label="30 days" value={formatCurrencyFromCents(data.costSummary.totalCostCents)} />
            <CostTile label="Today" value={formatCurrencyFromCents(data.costSummary.todayCostCents)} />
            <CostTile label="Average" value={formatCurrencyFromCents(data.costSummary.averageCostCents)} />
          </div>
          <div className="mt-4 space-y-2">
            {data.costSummary.productCosts.slice(0, 6).map((item) => (
              <div key={item.product} className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs">
                <span className="truncate text-neutral-700">{item.product.replace(/_/g, ' ')}</span>
                <span className="font-medium text-neutral-900">{formatCurrencyFromCents(item.costCents)}</span>
              </div>
            ))}
            {!data.costSummary.productCosts.length && (
              <p className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-3 py-4 text-center text-xs text-neutral-500">
                Cost data will appear after analyzed Retell calls include call_cost.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Calls by Day" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.charts.callsByDay}>
              <CartesianGrid stroke="rgba(0,0,0,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#737373' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#737373' }} />
              <Tooltip />
              <Line type="monotone" dataKey="calls" stroke="#C41E3A" strokeWidth={2.5} dot={{ r: 3, fill: '#C41E3A' }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cost by Day" icon={DollarSign}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.charts.costByDay}>
              <CartesianGrid stroke="rgba(0,0,0,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#737373' }} />
              <YAxis tick={{ fontSize: 11, fill: '#737373' }} tickFormatter={(value) => `$${Number(value / 100).toFixed(2)}`} />
              <Tooltip formatter={(value) => formatCurrencyFromCents(Number(value))} />
              <Bar dataKey="costCents" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Outcomes" icon={Target}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.charts.outcomesByDisposition}>
              <CartesianGrid stroke="rgba(0,0,0,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="disposition" tick={{ fontSize: 10, fill: '#737373' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#737373' }} />
              <Tooltip />
              <Bar dataKey="count" fill="#C41E3A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mb-6 card p-5">
        <SectionHeader
          icon={Bot}
          title="Agent Performance"
          description="Synced Retell agents grouped by call activity and cost."
        />
        {data.agentSummaries.length ? (
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Agent</th>
                  <th className="px-3 py-2 text-left font-medium">Calls</th>
                  <th className="px-3 py-2 text-left font-medium">Live</th>
                  <th className="px-3 py-2 text-left font-medium">Connected</th>
                  <th className="px-3 py-2 text-left font-medium">Successful</th>
                  <th className="px-3 py-2 text-left font-medium">Booked</th>
                  <th className="px-3 py-2 text-left font-medium">Cost</th>
                  <th className="px-3 py-2 text-left font-medium">Last Call</th>
                </tr>
              </thead>
              <tbody>
                {data.agentSummaries.map((agent) => (
                  <tr key={`${agent.agentId}-${agent.version ?? 'latest'}`} className="border-t border-neutral-100 text-neutral-700">
                    <td className="px-3 py-2">
                      <div className="font-medium text-neutral-900">{agent.agentName}</div>
                      <div className="font-mono text-2xs text-neutral-500">{agent.agentId || 'unknown'}</div>
                    </td>
                    <td className="px-3 py-2">{formatInteger(agent.totalCalls)}</td>
                    <td className="px-3 py-2">{formatInteger(agent.liveCalls)}</td>
                    <td className="px-3 py-2">{formatInteger(agent.connectedCalls)}</td>
                    <td className="px-3 py-2">{formatInteger(agent.successfulCalls)}</td>
                    <td className="px-3 py-2">{formatInteger(agent.bookedCalls)}</td>
                    <td className="px-3 py-2">{formatCurrencyFromCents(agent.totalCostCents)}</td>
                    <td className="px-3 py-2">{agent.lastCallAt ? formatTimeAgo(agent.lastCallAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-neutral-800">No Retell calls synced yet</p>
            <p className="mt-1 text-xs text-neutral-500">An admin can refresh Retell history from Settings.</p>
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader
            icon={PhoneCallIcon}
            title="Recent Calls"
            description="Latest Retell call outcomes, costs, and analysis status."
          />
          <button
            type="button"
            onClick={() => onNavigate('call-log')}
            className="inline-flex items-center gap-1.5 self-start rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
          >
            Open Call Log
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {data.recentCalls.length ? (
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Call</th>
                  <th className="px-3 py-2 text-left font-medium">Agent</th>
                  <th className="px-3 py-2 text-left font-medium">Outcome</th>
                  <th className="px-3 py-2 text-left font-medium">Cost</th>
                  <th className="px-3 py-2 text-left font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCalls.map((call) => (
                  <tr key={call.id} className="border-t border-neutral-100 text-neutral-700">
                    <td className="px-3 py-2">
                      <div className="font-medium text-neutral-900">{call.toNumber || call.phoneNumber || 'Unknown number'}</div>
                      <div className="text-2xs text-neutral-500">{call.summary || call.providerCallId}</div>
                    </td>
                    <td className="px-3 py-2">{call.agentName || call.agentId || '—'}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={call.disposition} subtle />
                    </td>
                    <td className="px-3 py-2">{formatCurrencyFromCents(call.costCents)}</td>
                    <td className="px-3 py-2">{formatTimeAgo(call.startedAt ?? call.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-neutral-800">No calls yet</p>
            <p className="mt-1 text-xs text-neutral-500">Retell webhook and backfill data will appear here after sync.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CostTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
      <p className="text-2xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-neutral-900">{value}</p>
    </div>
  );
}
