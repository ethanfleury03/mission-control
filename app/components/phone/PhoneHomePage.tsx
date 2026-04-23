'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  LayoutDashboard,
  PhoneCall as PhoneCallIcon,
  PlayCircle,
  Shield,
  Target,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatTimeAgo } from '../../lib/utils';
import { fetchPhoneHome } from '@/lib/phone/api';
import type { PhoneHomeData, PhonePage } from '@/lib/phone/types';
import {
  BannerStat,
  ChartCard,
  MetricCard,
  PageError,
  PageLoading,
  SectionHeader,
  StatusPill,
  formatDuration,
  formatInteger,
  formatPercent,
  resolveAgentLabel,
} from './shared';

const PIE_COLORS = ['#C41E3A', '#0f766e'];

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

  if (loading) return <PageLoading label="Loading Phone home" />;
  if (!data) return <PageError label={error ?? 'Phone home is unavailable right now.'} onRetry={() => void load()} />;

  return (
    <div className="max-w-7xl p-6">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10">
            <LayoutDashboard className="h-5 w-5 text-brand" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Phone Home</h1>
            <p className="text-sm text-neutral-500">
              Reporting-first cold calling operations with queue health, pacing visibility, and recent outcomes.
            </p>
          </div>
        </div>
        <p className="max-w-3xl text-xs text-neutral-500">
          Keep this page focused on signal. Campaign creation lives in Create Call, list ownership lives in Lists,
          and this dashboard stays tuned for managers who want a fast read on what is running and what is changing.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <MetricCard
          icon={Users}
          label="Dialable Contacts"
          value={formatInteger(data.summary.totalDialableContacts)}
          detail="Valid numbers queued"
          tone="brand"
        />
        <MetricCard
          icon={Database}
          label="Active List Size"
          value={formatInteger(data.summary.activeListSize)}
          detail="Current list focus"
          tone="blue"
        />
        <MetricCard
          icon={PhoneCallIcon}
          label="Calls Today"
          value={formatInteger(data.summary.callsToday)}
          detail="Local log count"
          tone="green"
        />
        <MetricCard
          icon={Target}
          label="Connect Rate"
          value={formatPercent(data.summary.connectRate)}
          detail="7-day trend"
          tone="brand"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Booked Rate"
          value={formatPercent(data.summary.bookedRate)}
          detail="7-day trend"
          tone="green"
        />
        <MetricCard
          icon={Shield}
          label="Do-Not-Call"
          value={formatPercent(data.summary.doNotCallRate)}
          detail="Keep this low"
          tone="amber"
        />
        <MetricCard
          icon={Clock3}
          label="Avg Duration"
          value={formatDuration(data.summary.averageCallDurationMs)}
          detail="Connected calls"
          tone="neutral"
        />
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-hub-border bg-white shadow-sm">
        <div className="border-b border-hub-border bg-gradient-to-r from-brand/10 via-white to-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <span className={`status-dot ${data.activeCampaign ? 'status-active' : 'status-idle'}`} />
                <h2 className="text-sm font-semibold text-neutral-900">Active Campaign</h2>
                <StatusPill status={data.activeCampaign?.status ?? 'draft'} />
              </div>
              {data.activeCampaign ? (
                <>
                  <p className="text-lg font-semibold text-neutral-900">{data.activeCampaign.name}</p>
                  <p className="text-xs text-neutral-500">
                    {data.activeCampaign.listName} · {data.activeCampaign.callsCompleted} completed ·{' '}
                    {data.activeCampaign.callsRemaining} remaining
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-neutral-900">No active campaign running</p>
                  <p className="text-xs text-neutral-500">
                    Build the next outbound run in Create Call when you are ready to move from reporting to action.
                  </p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => onNavigate('create-call')}
              className="inline-flex items-center gap-1.5 self-start rounded-md bg-brand px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-hover"
            >
              <PlayCircle className="h-4 w-4" />
              Open Create Call
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 lg:grid-cols-4">
          <BannerStat label="Pacing" value={data.activeCampaign?.pacingStatus ?? 'Not running'} />
          <BannerStat
            label="Last Call"
            value={data.activeCampaign?.lastCallTime ? formatTimeAgo(data.activeCampaign.lastCallTime) : 'None yet'}
          />
          <BannerStat
            label="Next Retry"
            value={data.activeCampaign?.nextRetryWindow ? formatTimeAgo(data.activeCampaign.nextRetryWindow) : 'None queued'}
          />
          <BannerStat
            label="Agent Profile"
            value={resolveAgentLabel(data.activeCampaign?.agentProfileKey ?? '', data.agentProfiles)}
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <OverviewCard
          title="Queue Depth"
          body={`${formatInteger(data.summary.totalDialableContacts)} dialable contacts are available across ${formatInteger(data.lists.length)} lists.`}
          detail={`Current focus list contains ${formatInteger(data.summary.activeListSize)} records.`}
        />
        <OverviewCard
          title="Campaign Coverage"
          body={`${formatInteger(data.campaigns.length)} campaigns are configured with ${formatInteger(data.agentProfiles.length)} locked agent profiles available.`}
          detail={data.activeCampaign ? `Active status: ${data.activeCampaign.status.replace(/_/g, ' ')}` : 'No campaign is active right now.'}
        />
        <OverviewCard
          title="Recent Signal"
          body={`${formatInteger(data.recentCalls.length)} recent call outcomes are already persisted for quick review.`}
          detail={`${formatInteger(data.summary.callsToday)} calls were logged today.`}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <QuickLinkCard
          title="Create Call"
          description="Create a campaign, choose the list, pick the locked agent profile, and control start, pause, or resume."
          icon={PlayCircle}
          onClick={() => onNavigate('create-call')}
        />
        <QuickLinkCard
          title="Lists"
          description="Import CSVs, create manual lists, inspect list health, and review lead-level queue status."
          icon={Database}
          onClick={() => onNavigate('lists')}
        />
        <QuickLinkCard
          title="Call Log"
          description="Drill into transcripts, outcomes, analysis, and exported call history from the local source of truth."
          icon={PhoneCallIcon}
          onClick={() => onNavigate('call-log')}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Calls by Day" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.charts.callsByDay}>
              <CartesianGrid stroke="rgba(0,0,0,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#737373' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#737373' }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="calls"
                stroke="#C41E3A"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#C41E3A' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Outcomes by Disposition" icon={Target}>
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

        <ChartCard title="Booked vs Not Booked" icon={CheckCircle2}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data.charts.bookedTrend.reduce(
                  (acc, point) => {
                    acc[0].value += point.booked;
                    acc[1].value += point.notBooked;
                    return acc;
                  },
                  [
                    { name: 'Booked', value: 0 },
                    { name: 'Not Booked', value: 0 },
                  ],
                )}
                dataKey="value"
                nameKey="name"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
              >
                {PIE_COLORS.map((color) => (
                  <Cell key={color} fill={color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeader
            icon={PhoneCallIcon}
            title="Recent Call Outcomes"
            description="Most recent persisted call records from the Phone log."
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
                  <th className="px-3 py-2 text-left font-medium">Contact</th>
                  <th className="px-3 py-2 text-left font-medium">Campaign</th>
                  <th className="px-3 py-2 text-left font-medium">Outcome</th>
                  <th className="px-3 py-2 text-left font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentCalls.map((call) => (
                  <tr key={call.id} className="border-t border-neutral-100 text-neutral-700">
                    <td className="px-3 py-2">
                      <div className="font-medium text-neutral-900">{call.contactName || 'Unknown contact'}</div>
                      <div className="text-2xs text-neutral-500">{call.companyName || call.phoneNumber || '—'}</div>
                    </td>
                    <td className="px-3 py-2">{call.campaignName || '—'}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={call.disposition} subtle />
                    </td>
                    <td className="px-3 py-2">{formatTimeAgo(call.startedAt ?? call.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-neutral-800">No recent calls yet</p>
            <p className="mt-1 text-xs text-neutral-500">
              Once campaigns start running, recent outcomes will surface here for a quick executive read.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewCard({
  title,
  body,
  detail,
}: {
  title: string;
  body: string;
  detail: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-2xs font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      <p className="mt-2 text-sm font-medium text-neutral-900">{body}</p>
      <p className="mt-1 text-2xs text-neutral-500">{detail}</p>
    </div>
  );
}

function QuickLinkCard({
  title,
  description,
  icon: Icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: typeof PlayCircle;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card group p-4 text-left transition-colors hover:border-brand/30 hover:bg-brand/5"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 text-brand">
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">{description}</p>
    </button>
  );
}
