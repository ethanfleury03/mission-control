'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Inbox,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ThumbsUp,
  UserCheck,
  UsersRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/app/lib/utils';
import type { OutreachDashboardResponse, OutreachReply } from '@/lib/outreach-crm/types';

type OutreachView = 'overview' | 'replies';

const PAGE_SIZE = 8;
const REPLY_PAGE_SIZE = 14;

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatLastSynced(value: string | null | undefined): string {
  if (!value) return 'Last synced when data loads';
  return `Last synced ${formatDateTime(value)}`;
}

function formatReplyDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  if (sameDay) return `Today ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function initialsFor(company: string, contact: string): string {
  const source = (company || contact || 'OC').trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function statusClass(status: string): string {
  switch (status) {
    case 'Positive':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'Out of Office':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'Needs Review':
      return 'border-brand/25 bg-brand/10 text-brand';
    case 'Bounced':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'Stopped':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-stone-200 bg-stone-50 text-stone-500';
  }
}

function pipelineColorClass(color: string): string {
  switch (color) {
    case 'green':
      return 'bg-emerald-500';
    case 'amber':
      return 'bg-amber-500';
    case 'blue':
      return 'bg-blue-500';
    case 'red':
      return 'bg-brand';
    default:
      return 'bg-stone-400';
  }
}

function healthSeverityClass(severity: string): string {
  switch (severity) {
    case 'danger':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = 'brand',
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: 'brand' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const toneClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : tone === 'red'
          ? 'border-red-200 bg-red-50 text-red-700'
          : tone === 'blue'
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-brand/15 bg-brand/10 text-brand';

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-stone-950">{formatNumber(value)}</p>
        </div>
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', toneClass)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <main className="flex-1 min-w-0 overflow-y-auto bg-[linear-gradient(180deg,#fffdfa_0%,#f6f0ea_100%)]">
      <div className="flex w-full flex-col gap-3 px-4 py-4 xl:px-5 2xl:px-6">
        <div className="h-28 animate-pulse rounded-lg border border-stone-200 bg-white/80" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg border border-stone-200 bg-white" />
          ))}
        </div>
        <div className="h-14 animate-pulse rounded-lg border border-stone-200 bg-white" />
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="h-96 animate-pulse rounded-lg border border-stone-200 bg-white" />
          <div className="space-y-3">
            <div className="h-56 animate-pulse rounded-lg border border-stone-200 bg-white" />
            <div className="h-44 animate-pulse rounded-lg border border-stone-200 bg-white" />
          </div>
        </div>
      </div>
    </main>
  );
}

function ReplyStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold', statusClass(status))}>
      {status}
    </span>
  );
}

function ReplyRow({ reply }: { reply: OutreachReply }) {
  return (
    <tr className="border-t border-stone-200 align-middle transition-colors hover:bg-stone-50/70">
      <td className="px-3 py-2.5">
        <div className="flex min-w-[12rem] items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-[10px] font-semibold text-stone-700 shadow-sm">
            {initialsFor(reply.company, reply.contactName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-stone-950">{reply.company}</p>
            <div className="mt-0.5 flex items-center gap-2">
              {reply.hubspotUrl ? (
                <a
                  href={reply.hubspotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-stone-500 transition-colors hover:text-brand"
                >
                  HubSpot
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : null}
              {reply.gmailThreadUrl ? (
                <a
                  href={reply.gmailThreadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-stone-500 transition-colors hover:text-brand"
                >
                  Gmail
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="min-w-[10rem]">
          <p className="truncate text-xs font-medium text-stone-800">{reply.contactName}</p>
          <p className="truncate text-[11px] text-stone-500">{reply.email}</p>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <ReplyStatusBadge status={reply.status} />
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-stone-600">{formatReplyDate(reply.lastReplyAt)}</td>
      <td className="px-3 py-2.5">
        <p
          className="text-xs leading-5 text-stone-600"
          style={{
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
          }}
        >
          {reply.snippet || 'No snippet recorded.'}
        </p>
      </td>
    </tr>
  );
}

function ReplyTable({
  replies,
  total,
  page,
  pageSize,
  onPageChange,
}: {
  replies: OutreachReply[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-stone-200 bg-white">
          <thead className="bg-stone-50">
            <tr>
              {['Company', 'Contact', 'Status', 'Last Reply', 'Snippet'].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {replies.length > 0 ? (
              replies.map((reply) => <ReplyRow key={reply.id} reply={reply} />)
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                    <Inbox className="h-9 w-9 text-stone-300" />
                    <p className="text-sm font-semibold text-stone-800">No replies yet.</p>
                    <p className="text-xs leading-5 text-stone-500">
                      Replies will appear here when HubSpot and Sasha outreach state report them.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-stone-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-stone-600">
          {total > 0 ? `Showing ${first}-${last} of ${formatNumber(total)} replies` : 'Showing 0 replies'}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition-colors hover:border-brand/30 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous reply page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: Math.min(pageCount, 3) }).map((_, index) => {
            const pageNumber = pageCount <= 3 ? index : Math.min(Math.max(page - 1, 0), pageCount - 3) + index;
            return (
              <button
                key={pageNumber}
                type="button"
                onClick={() => onPageChange(pageNumber)}
                className={cn(
                  'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold transition-colors',
                  page === pageNumber
                    ? 'border-brand bg-brand/10 text-brand'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-brand/30 hover:text-brand',
                )}
                aria-label={`Reply page ${pageNumber + 1}`}
                aria-current={page === pageNumber ? 'page' : undefined}
              >
                {pageNumber + 1}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
            disabled={page >= pageCount - 1}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition-colors hover:border-brand/30 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next reply page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PipelineSummary({ dashboard }: { dashboard: OutreachDashboardResponse }) {
  const maxCount = Math.max(1, ...dashboard.pipelineSummary.map((item) => item.count));

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Pipeline Summary</p>
      <h2 className="mt-1 text-sm font-semibold text-stone-950">Stage distribution</h2>
      <div className="mt-3 space-y-2.5">
        {dashboard.pipelineSummary.map((item) => (
          <div key={item.label} className="grid grid-cols-[8.5rem_minmax(0,1fr)_2.25rem] items-center gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', pipelineColorClass(item.color))} />
              <span className="truncate text-xs text-stone-700">{item.label}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100">
              <div
                className={cn('h-full rounded-full', pipelineColorClass(item.color))}
                style={{ width: `${Math.max(4, (item.count / maxCount) * 100)}%` }}
              />
            </div>
            <span className="text-right text-xs font-medium text-stone-700">{formatNumber(item.count)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-3">
        <span className="text-sm font-medium text-stone-700">Reply rate</span>
        <span className="text-lg font-semibold tracking-[-0.04em] text-brand">{formatPercent(dashboard.replyRate)}</span>
      </div>
    </section>
  );
}

function FollowUpHealth({ dashboard }: { dashboard: OutreachDashboardResponse }) {
  const items = [
    { label: 'Due today', value: dashboard.followUpHealth.dueToday, icon: Clock3, tone: 'brand' },
    { label: 'Scheduled', value: dashboard.followUpHealth.scheduled, icon: CalendarDays, tone: 'blue' },
    { label: 'Needs review', value: dashboard.followUpHealth.needsReview, icon: AlertTriangle, tone: 'amber' },
    { label: 'Blocked', value: dashboard.followUpHealth.blocked, icon: Ban, tone: 'red' },
  ] as const;

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Follow-Up Health</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const toneClass =
            item.tone === 'blue'
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : item.tone === 'amber'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : item.tone === 'red'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-brand/20 bg-brand/10 text-brand';
          return (
            <div key={item.label} className="rounded-lg border border-stone-200 bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-stone-600">{item.label}</p>
                <span className={cn('flex h-7 w-7 items-center justify-center rounded-md border', toneClass)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-1 text-xl font-semibold tracking-[-0.04em] text-stone-950">
                {formatNumber(item.value)}
              </p>
            </div>
          );
        })}
      </div>
      <div className={cn('mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium', healthSeverityClass(dashboard.followUpHealth.severity))}>
        {dashboard.followUpHealth.severity === 'success' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        )}
        <span>{dashboard.followUpHealth.message}</span>
      </div>
    </section>
  );
}

export function OutreachCrmTab() {
  const [dashboard, setDashboard] = useState<OutreachDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [view, setView] = useState<OutreachView>('overview');

  const loadDashboard = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError('');
    try {
      const response = await fetch('/api/outreach-crm/dashboard', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load Outreach CRM dashboard.');
      setDashboard(data as OutreachDashboardResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Outreach CRM dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard('initial');
  }, [loadDashboard]);

  const runDeepSync = useCallback(async () => {
    setSyncing(true);
    setSyncStatus('Starting deep sync...');
    setError('');
    try {
      const response = await fetch('/api/outreach-crm/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'deep' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || 'Deep sync failed.');
      const status = typeof data.status === 'string' ? data.status : 'started';
      const jobId = typeof data.jobId === 'string' ? data.jobId : '';
      setSyncStatus(jobId ? `Deep sync ${status} (${jobId.slice(0, 8)})` : `Deep sync ${status}`);
      await loadDashboard('refresh');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deep sync failed.';
      setSyncStatus(message);
      setError(message);
    } finally {
      setSyncing(false);
    }
  }, [loadDashboard]);

  useEffect(() => {
    setPage(0);
  }, [query, statusFilter, view]);

  const statusOptions = useMemo(() => {
    const statuses = new Set(dashboard?.replies.map((reply) => reply.status).filter(Boolean) ?? []);
    return ['all', ...Array.from(statuses).sort()];
  }, [dashboard]);

  const filteredReplies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (dashboard?.replies ?? []).filter((reply) => {
      const matchesStatus = statusFilter === 'all' || reply.status === statusFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return [reply.company, reply.contactName, reply.email, reply.status, reply.snippet]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [dashboard, query, statusFilter]);

  const pageSize = view === 'replies' ? REPLY_PAGE_SIZE : PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filteredReplies.length / pageSize));
  const boundedPage = Math.min(page, pageCount - 1);
  const visibleReplies = filteredReplies.slice(boundedPage * pageSize, boundedPage * pageSize + pageSize);

  if (loading) return <LoadingSkeleton />;

  if (error && !dashboard) {
    return (
      <main className="flex-1 min-w-0 overflow-y-auto bg-[linear-gradient(180deg,#fffdfa_0%,#f6f0ea_100%)]">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-10 text-center">
          <div className="rounded-lg border border-red-200 bg-white p-8 shadow-sm">
            <XCircle className="mx-auto h-10 w-10 text-red-500" />
            <h1 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-stone-950">Outreach CRM did not load</h1>
            <p className="mt-2 text-sm leading-6 text-stone-600">{error}</p>
            <button
              type="button"
              onClick={() => void loadDashboard('initial')}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!dashboard) return null;

  return (
    <main className="flex-1 min-w-0 overflow-y-auto bg-[linear-gradient(180deg,#fffdfa_0%,#f6f0ea_100%)]">
      <div className="flex w-full flex-col gap-3 px-4 py-4 xl:px-5 2xl:px-6">
        <section className="rounded-lg border border-stone-200 bg-white/90 p-4 shadow-[0_18px_60px_rgba(57,28,11,0.08)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand">Email Outreach CRM</p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.05em] text-stone-950">Email Outreach CRM</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">
                Read-only campaign pipeline for Sasha outreach and follow-ups.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex rounded-lg border border-stone-200 bg-white p-1 shadow-sm">
                {[
                  { id: 'overview' as const, label: 'Executive Overview', icon: LayoutDashboard },
                  { id: 'replies' as const, label: 'Reply Inbox', icon: Inbox },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setView(tab.id)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors sm:px-4',
                        view === tab.id ? 'bg-brand text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <span className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] font-medium text-stone-600">
                Read-only view &bull; updated by Sasha commands
              </span>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <MetricCard label="Total Contacts" value={dashboard.kpis.totalContacts} icon={UsersRound} />
          <MetricCard label="Active" value={dashboard.kpis.active} icon={UserCheck} tone="green" />
          <MetricCard label="Initial Sent" value={dashboard.kpis.initialSent} icon={Send} />
          <MetricCard label="Replies" value={dashboard.kpis.replies} icon={MessageCircle} />
          <MetricCard label="Positive" value={dashboard.kpis.positive} icon={ThumbsUp} tone="green" />
          <MetricCard label="Bounced/Stopped" value={dashboard.kpis.bouncedStopped} icon={Ban} tone="red" />
          <MetricCard label="Due Follow-Up" value={dashboard.kpis.dueFollowUp} icon={Clock3} />
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-2.5 shadow-sm">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <label className="relative flex min-w-0 flex-1 items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-stone-400" />
              <span className="sr-only">Search contacts</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search contacts..."
                className="h-9 w-full rounded-md border border-stone-200 bg-white pl-9 pr-3 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
              />
            </label>
            <label className="sr-only" htmlFor="outreach-status-filter">
              Filter status
            </label>
            <select
              id="outreach-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-9 rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 outline-none transition-colors focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === 'all' ? 'All statuses' : status}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void runDeepSync()}
              disabled={refreshing || syncing}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition-colors hover:border-brand/30 hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncing || refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync
            </button>
            <div className="text-xs text-stone-500 lg:min-w-[16rem]">
              {formatLastSynced(dashboard.lastSyncedAt ?? dashboard.generatedAt)}
            </div>
          </div>
          {syncStatus ? (
            <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {syncStatus}
            </div>
          ) : null}
          {dashboard.sourceWarnings?.length ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {dashboard.sourceWarnings[0]}
            </div>
          ) : null}
        </section>

        <section
          className={cn(
            'grid items-start gap-3',
            view === 'overview' ? 'xl:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]' : 'xl:grid-cols-1',
          )}
        >
          <div className="self-start rounded-lg border border-stone-200 bg-white shadow-sm">
            <div className="border-b border-stone-200 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Reply Center</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.04em] text-stone-950">Reply Inbox</h2>
            </div>
            <div className="p-3">
              <ReplyTable
                replies={visibleReplies}
                total={filteredReplies.length}
                page={boundedPage}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            </div>
          </div>

          {view === 'overview' ? (
            <aside className="space-y-3">
              <PipelineSummary dashboard={dashboard} />
              <FollowUpHealth dashboard={dashboard} />
            </aside>
          ) : null}
        </section>
      </div>
    </main>
  );
}
