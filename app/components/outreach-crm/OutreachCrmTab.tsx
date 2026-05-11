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
  FileText,
  Inbox,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ThumbsUp,
  Trash2,
  UserCheck,
  UsersRound,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/app/lib/utils';
import type {
  OutreachAgentSummary,
  OutreachDashboardContact,
  OutreachDashboardResponse,
  OutreachPipelineColumn,
  OutreachReply,
} from '@/lib/outreach-crm/types';

type OutreachView = 'overview' | 'pipeline' | 'replies' | 'templates';

interface OutreachEmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

interface TemplateFormState {
  id: string | null;
  name: string;
  category: string;
  subject: string;
  body: string;
  description: string;
  isActive: boolean;
}

const PAGE_SIZE = 8;
const REPLY_PAGE_SIZE = 14;

const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  id: null,
  name: '',
  category: 'first_touch',
  subject: '',
  body: '',
  description: '',
  isActive: true,
};

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

function formatCompactDateTime(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatLastSynced(value: string | null | undefined): string {
  if (!value) return 'Last synced when data loads';
  return `Last synced ${formatDateTime(value)}`;
}

function dashboardSourceLabel(source: OutreachDashboardResponse['source']): string {
  switch (source) {
    case 'state':
      return 'Multi-agent local state';
    case 'hubspot+state':
      return 'HubSpot + local state';
    case 'hubspot+activity':
      return 'Cache + deep sync activity';
    case 'hubspot':
      return 'HubSpot cache';
    default:
      return 'Fallback data';
  }
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

function stateToneClass(state: string): string {
  switch (state) {
    case 'active':
    case 'sending':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'blocked':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'paused':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-stone-200 bg-stone-50 text-stone-600';
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
        <div className="min-w-[8rem]">
          <p className="text-xs font-semibold text-stone-950">{reply.agentName || 'Sasha'}</p>
          <p className="truncate text-[11px] text-stone-500">{reply.agentInbox || 'sasha@arrsys.com'}</p>
        </div>
      </td>
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
        {reply.confidence !== undefined ? (
          <p className="mt-1 text-[10px] text-stone-400">{formatPercent(reply.confidence * 100)} confidence</p>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-stone-600">{formatReplyDate(reply.lastReplyAt)}</td>
      <td className="px-3 py-2.5">
        <div className="min-w-[11rem]">
          <p className="truncate text-xs font-medium text-stone-800">{reply.subject || 'No subject'}</p>
          <p className="mt-0.5 text-[11px] text-stone-500">{reply.suggestedAction || 'Review'}</p>
        </div>
      </td>
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
      <td className="px-3 py-2.5">
        <div className="flex min-w-[13rem] flex-wrap gap-1.5">
          {['Positive', 'Needs human', 'Stop', 'Draft', 'Task'].map((action) => (
            <button
              key={action}
              type="button"
              disabled
              title="Action hook is planned; rendering stays read-only."
              className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-semibold text-stone-400"
            >
              {action}
            </button>
          ))}
        </div>
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
              {['Inbox', 'Company', 'Contact', 'Classification', 'Last Reply', 'Subject / Action', 'Snippet', 'Safe Actions'].map((heading) => (
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
                <td colSpan={8} className="px-4 py-12 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                    <Inbox className="h-9 w-9 text-stone-300" />
                    <p className="text-sm font-semibold text-stone-800">No replies yet.</p>
                    <p className="text-xs leading-5 text-stone-500">
                      Replies will appear here when HubSpot and outreach state report them.
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
    { label: 'Overdue', value: dashboard.followUpHealth.overdue ?? 0, icon: CalendarDays, tone: 'amber' },
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
            item.tone === 'amber'
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

function AgentCard({ agent }: { agent: OutreachAgentSummary }) {
  const healthOk = agent.healthChecks.filter((check) => check.ok).length;
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-950">{agent.displayName}</h3>
            <span className={cn('rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]', stateToneClass(agent.state))}>
              {agent.state.replaceAll('_', ' ')}
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] text-stone-500">{agent.senderEmail}</p>
          <p className="truncate text-[11px] text-stone-500">{agent.hubspotListName}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tracking-[-0.04em] text-stone-950">{formatNumber(agent.sentToday)}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">sent today</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          ['Contacts', agent.contactsInList],
          ['Active', agent.activeContacts],
          ['Ready', agent.draftedReady],
          ['Remaining', agent.dailyCapRemaining],
          ['Replies', agent.replies],
          ['Positive', agent.positiveReplies],
          ['Review', agent.humanReviewNeeded],
          ['Due', agent.dueFollowUps],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-2">
            <p className="text-[10px] font-medium text-stone-500">{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-stone-950">{formatNumber(Number(value))}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {agent.healthChecks.map((check) => (
          <span
            key={check.key}
            title={`${check.label}: ${check.message}`}
            className={cn(
              'h-2 flex-1 rounded-full',
              check.severity === 'danger' ? 'bg-red-500' : check.severity === 'warning' ? 'bg-amber-400' : 'bg-emerald-500',
            )}
          />
        ))}
      </div>
      <div className="mt-3 grid gap-1.5 text-[11px] text-stone-500">
        <p>Health {healthOk}/{agent.healthChecks.length} checks passing</p>
        <p>Last HubSpot sync {formatCompactDateTime(agent.lastHubSpotSyncAt)}</p>
        <p>Last send {formatCompactDateTime(agent.lastSendAt)}</p>
      </div>
    </article>
  );
}

function AgentOverview({ dashboard }: { dashboard: OutreachDashboardResponse }) {
  const agents = dashboard.agents ?? [];
  if (!agents.length) return null;
  return (
    <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </section>
  );
}

function SendQueueMonitor({ dashboard }: { dashboard: OutreachDashboardResponse }) {
  const queue = dashboard.sendQueue;
  if (!queue) return null;
  const statusTone =
    queue.status === 'failing'
      ? 'border-red-200 bg-red-50 text-red-700'
      : queue.status === 'sending'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : queue.status === 'healthy'
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-stone-200 bg-stone-50 text-stone-600';

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Send Queue</p>
          <h2 className="mt-1 text-sm font-semibold text-stone-950">Global pacing monitor</h2>
        </div>
        <span className={cn('rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]', statusTone)}>
          {queue.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['Queue', queue.queueSize],
          ['Sent today', queue.sentCount],
          ['Skipped', queue.skippedCount],
          ['Failures', queue.failureCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-2">
            <p className="text-[10px] font-medium text-stone-500">{label}</p>
            <p className="mt-0.5 text-lg font-semibold text-stone-950">{formatNumber(Number(value))}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 text-xs text-stone-600">
        <p>{queue.message}</p>
        <p>Delay: {queue.currentDelaySeconds}s between global sends</p>
        <p>
          Last send: {queue.lastSentAgent || 'None'} {queue.lastSentEmail ? `to ${queue.lastSentEmail}` : ''}{' '}
          {queue.lastSentAt ? `at ${formatCompactDateTime(queue.lastSentAt)}` : ''}
        </p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {queue.perAgentSentToday.map((agent) => (
          <div key={agent.agentId} className="rounded-md border border-stone-200 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-stone-700">{agent.agentName}</span>
              <span className="text-stone-500">{agent.remaining} left</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.min(100, (agent.sentToday / Math.max(1, agent.sentToday + agent.remaining)) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PipelineCard({ contact }: { contact: OutreachDashboardContact }) {
  return (
    <article className="rounded-md border border-stone-200 bg-white p-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-stone-950">{contact.name || contact.email}</p>
          <p className="truncate text-[11px] text-stone-500">{contact.company || 'Unknown company'}</p>
        </div>
        <span className="shrink-0 rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
          {contact.agentName || 'Agent'}
        </span>
      </div>
      <div className="mt-2 space-y-1 text-[11px] text-stone-500">
        <p className="truncate">{contact.email}</p>
        <p>Touch {contact.touchCount}/4</p>
        <p>Last: {formatCompactDateTime(contact.lastOutboundAt)}</p>
        <p className={contact.overdue ? 'font-semibold text-red-600' : ''}>Due: {formatCompactDateTime(contact.nextFollowupAllowedAt)}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {contact.hubspotUrl ? (
          <a href={contact.hubspotUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-brand hover:underline">
            HubSpot
          </a>
        ) : null}
        {contact.gmailThreadUrl ? (
          <a href={contact.gmailThreadUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-brand hover:underline">
            Gmail
          </a>
        ) : null}
      </div>
      {contact.stopReason || contact.ineligibilityReasons?.length ? (
        <p className="mt-2 text-[11px] leading-4 text-red-600">
          {contact.stopReason || contact.ineligibilityReasons?.join(', ')}
        </p>
      ) : null}
    </article>
  );
}

function PipelineBoard({
  columns,
  agentFilter,
  stageFilter,
}: {
  columns: OutreachPipelineColumn[];
  agentFilter: string;
  stageFilter: string;
}) {
  const visibleColumns = columns
    .filter((column) => stageFilter === 'all' || column.id === stageFilter)
    .map((column) => ({
      ...column,
      contacts: column.contacts.filter((contact) => agentFilter === 'all' || contact.agentId === agentFilter),
    }));

  return (
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Drip Pipeline</p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.04em] text-stone-950">Four-touch campaign stages</h2>
      </div>
      <div className="overflow-x-auto p-3">
        <div className="grid min-w-[86rem] grid-cols-4 gap-3 xl:grid-cols-6 2xl:grid-cols-7">
          {visibleColumns.map((column) => (
            <div key={column.id} className="rounded-lg border border-stone-200 bg-stone-50 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', pipelineColorClass(column.color))} />
                  <h3 className="truncate text-xs font-semibold text-stone-800">{column.label}</h3>
                </div>
                <span className="text-xs font-semibold text-stone-500">{formatNumber(column.count)}</span>
              </div>
              <div className="mt-2 space-y-2">
                {column.contacts.length ? (
                  column.contacts.map((contact) => <PipelineCard key={`${column.id}-${contact.id}`} contact={contact} />)
                ) : (
                  <div className="rounded-md border border-dashed border-stone-200 bg-white px-3 py-6 text-center text-xs text-stone-400">
                    Empty
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HealthPanels({ dashboard }: { dashboard: OutreachDashboardResponse }) {
  return (
    <section className="grid gap-3 xl:grid-cols-2">
      <div className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">HubSpot Hygiene</p>
          <h2 className="mt-1 text-sm font-semibold text-stone-950">List health</h2>
        </div>
        <div className="divide-y divide-stone-200">
          {(dashboard.hubspotListHealth ?? []).map((list) => (
            <article key={list.agentId} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-stone-950">{list.listName}</h3>
                  <p className="text-[11px] text-stone-500">{list.agentName}</p>
                </div>
                <span className={cn('rounded-md border px-2 py-1 text-[10px] font-semibold', list.warnings.length ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
                  {list.warnings.length ? list.warnings[0] : 'Healthy'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {[
                  ['Size', list.currentListSize],
                  ['Eligible', list.eligibleContacts],
                  ['Ineligible', list.ineligibleContacts],
                  ['Owner', list.withOwner],
                  ['Assigned', list.withAssignedTo],
                  ['Cleanup', list.needingCleanup],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md bg-stone-50 px-2 py-1.5">
                    <p className="text-[10px] text-stone-500">{label}</p>
                    <p className="font-semibold text-stone-950">{formatNumber(Number(value))}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Deliverability</p>
          <h2 className="mt-1 text-sm font-semibold text-stone-950">Quality guardrails</h2>
        </div>
        <div className="divide-y divide-stone-200">
          {(dashboard.deliverabilityHealth ?? []).map((agent) => (
            <article key={agent.agentId} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-stone-950">{agent.agentName}</h3>
                  <p className="text-[11px] text-stone-500">{agent.sendsToday} sends today</p>
                </div>
                <span className={cn('rounded-md border px-2 py-1 text-[10px] font-semibold', agent.warnings.length ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
                  {agent.warnings.length ? agent.warnings[0] : 'Compliant'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                {[
                  ['Bounce', `${formatPercent(agent.bounceRate)}`],
                  ['Reply', `${formatPercent(agent.replyRate)}`],
                  ['Positive', `${formatPercent(agent.positiveRate)}`],
                  ['OOO', `${formatPercent(agent.outOfOfficeRate)}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md bg-stone-50 px-2 py-1.5">
                    <p className="text-[10px] text-stone-500">{label}</p>
                    <p className="font-semibold text-stone-950">{value}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DailyReport({ dashboard }: { dashboard: OutreachDashboardResponse }) {
  if (!dashboard.dailyReportText) return null;
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Daily Report</p>
          <h2 className="mt-1 text-sm font-semibold text-stone-950">Discord-ready report</h2>
        </div>
        <span className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-stone-600">
          Channel 1469037035103981703
        </span>
      </div>
      <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-stone-200 bg-stone-950 p-3 text-xs leading-5 text-stone-50">
        {dashboard.dailyReportText}
      </pre>
    </section>
  );
}

function dueStage(stageId: string | undefined): boolean {
  return stageId === 'due_3_day_followup' || stageId === 'due_5_day_followup' || stageId === 'due_30_day_followup';
}

function ActivityEmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-stone-200 bg-stone-50 px-3 py-6 text-center">
      <Icon className="mx-auto h-7 w-7 text-stone-300" />
      <p className="mt-2 text-xs font-semibold text-stone-800">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-stone-500">{body}</p>
    </div>
  );
}

function ReplyMiniRow({ reply }: { reply: OutreachReply }) {
  return (
    <article className="rounded-md border border-stone-200 bg-white px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-stone-950">{reply.company}</p>
          <p className="truncate text-[11px] text-stone-500">
            {reply.agentName || 'Agent'} · {reply.contactName} · {reply.email}
          </p>
        </div>
        <ReplyStatusBadge status={reply.status} />
      </div>
      <p
        className="mt-1 text-[11px] leading-5 text-stone-600"
        style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}
      >
        {reply.snippet || reply.suggestedAction || 'No snippet recorded.'}
      </p>
    </article>
  );
}

function ContactMiniRow({ contact, mode }: { contact: OutreachDashboardContact; mode: 'due' | 'send' | 'failure' }) {
  const timestamp =
    mode === 'due' ? contact.nextFollowupAllowedAt : mode === 'send' ? contact.lastOutboundAt : contact.lastReplyAt || contact.lastOutboundAt;
  const label = mode === 'due' ? 'Due' : mode === 'send' ? 'Sent' : 'Flagged';
  const tone = mode === 'failure' ? 'text-red-600' : contact.overdue ? 'text-amber-700' : 'text-stone-600';
  return (
    <article className="rounded-md border border-stone-200 bg-white px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-stone-950">{contact.company || 'Unknown company'}</p>
          <p className="truncate text-[11px] text-stone-500">
            {contact.agentName || 'Agent'} · {contact.name || contact.email}
          </p>
        </div>
        <span className={cn('shrink-0 text-[11px] font-semibold', tone)}>{label}</span>
      </div>
      <p className="mt-1 truncate text-[11px] text-stone-500">{contact.email}</p>
      <p className={cn('mt-1 text-[11px] font-medium', tone)}>{formatCompactDateTime(timestamp)}</p>
      {contact.stopReason ? <p className="mt-1 text-[11px] leading-4 text-red-600">{contact.stopReason}</p> : null}
    </article>
  );
}

function ActivityDigest({ dashboard }: { dashboard: OutreachDashboardResponse }) {
  const reviewReplies = dashboard.replies.filter((reply) => reply.status === 'Needs Review').slice(0, 5);
  const positiveReplies = dashboard.replies.filter((reply) => reply.status === 'Positive').slice(0, 5);
  const dueContacts = [...dashboard.contacts]
    .filter((contact) => dueStage(contact.stageId))
    .sort((a, b) => {
      const aTime = new Date(a.nextFollowupAllowedAt || 0).getTime() || Number.MAX_SAFE_INTEGER;
      const bTime = new Date(b.nextFollowupAllowedAt || 0).getTime() || Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 6);
  const latestSends = [...dashboard.contacts]
    .filter((contact) => contact.lastOutboundAt)
    .sort((a, b) => new Date(b.lastOutboundAt || 0).getTime() - new Date(a.lastOutboundAt || 0).getTime())
    .slice(0, 6);
  const latestFailures = [...dashboard.contacts]
    .filter((contact) => contact.stopped || contact.stageId === 'stopped_bounced_unsubscribed')
    .sort((a, b) => new Date(b.lastReplyAt || b.lastOutboundAt || 0).getTime() - new Date(a.lastReplyAt || a.lastOutboundAt || 0).getTime())
    .slice(0, 4);

  return (
    <section className="grid gap-3 xl:grid-cols-2">
      <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Reply Triage</p>
            <h2 className="mt-1 text-sm font-semibold text-stone-950">Latest multi-agent replies</h2>
          </div>
          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
            {formatNumber(dashboard.kpis.humanReview ?? 0)} review
          </span>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          <div className="space-y-2">
            {reviewReplies.length ? (
              reviewReplies.map((reply) => <ReplyMiniRow key={`review-${reply.id}`} reply={reply} />)
            ) : (
              <ActivityEmptyState icon={Inbox} title="No review replies" body="The current multi-agent state has no replies waiting for human review." />
            )}
          </div>
          <div className="space-y-2">
            {positiveReplies.length ? (
              positiveReplies.map((reply) => <ReplyMiniRow key={`positive-${reply.id}`} reply={reply} />)
            ) : (
              <ActivityEmptyState icon={ThumbsUp} title="No positive replies" body="Positive or meeting-path replies will be pinned here as soon as state reports them." />
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Live Work Queue</p>
            <h2 className="mt-1 text-sm font-semibold text-stone-950">Follow-ups, sends, and failures</h2>
          </div>
          <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">
            {formatNumber(dashboard.kpis.dueFollowUp)} due
          </span>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          <div className="space-y-2">
            {dueContacts.length ? (
              dueContacts.map((contact) => <ContactMiniRow key={`due-${contact.id}`} contact={contact} mode="due" />)
            ) : (
              <ActivityEmptyState icon={Clock3} title="No due follow-ups" body="Due and overdue follow-ups across all four inboxes will appear here." />
            )}
          </div>
          <div className="space-y-2">
            {latestSends.length ? (
              latestSends.map((contact) => <ContactMiniRow key={`send-${contact.id}`} contact={contact} mode="send" />)
            ) : (
              <ActivityEmptyState icon={Send} title="No sends recorded" body="Latest outbound activity from local outreach state will appear here." />
            )}
          </div>
          <div className="space-y-2">
            {latestFailures.length ? (
              latestFailures.map((contact) => <ContactMiniRow key={`failure-${contact.id}`} contact={contact} mode="failure" />)
            ) : (
              <ActivityEmptyState icon={CheckCircle2} title="No failures visible" body="Bounces, stops, and suppression cleanup items will be pinned here when present." />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TemplateEditor({
  form,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  form: TemplateFormState;
  saving: boolean;
  onChange: (patch: Partial<TemplateFormState>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Email Templates</p>
          <h2 className="mt-1 text-lg font-semibold tracking-[-0.04em] text-stone-950">
            {form.id ? 'Edit Template' : 'New Template'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => onChange({ isActive: event.target.checked })}
              className="h-4 w-4 rounded border-stone-300 text-brand focus:ring-brand/20"
            />
            Active
          </label>
          {form.id ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:border-brand/30 hover:text-brand"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-stone-700">Template name</span>
          <input
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="First touch - operations leader"
            className="mt-1 h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-stone-700">Category</span>
          <select
            value={form.category}
            onChange={(event) => onChange({ category: event.target.value })}
            className="mt-1 h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-800 outline-none transition-colors focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          >
            <option value="first_touch">First touch</option>
            <option value="follow_up">Follow-up</option>
            <option value="reply_positive">Positive reply</option>
            <option value="reply_needs_review">Needs review</option>
            <option value="general">General</option>
          </select>
        </label>
        <label className="block lg:col-span-2">
          <span className="text-xs font-semibold text-stone-700">Subject</span>
          <input
            value={form.subject}
            onChange={(event) => onChange({ subject: event.target.value })}
            placeholder="Quick question about {{company}} operations"
            className="mt-1 h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          />
        </label>
        <label className="block lg:col-span-2">
          <span className="text-xs font-semibold text-stone-700">Description</span>
          <input
            value={form.description}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder="When Sasha should use this template"
            className="mt-1 h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          />
        </label>
        <label className="block lg:col-span-2">
          <span className="text-xs font-semibold text-stone-700">Body</span>
          <textarea
            value={form.body}
            onChange={(event) => onChange({ body: event.target.value })}
            placeholder="Hi {{firstName}},"
            rows={10}
            className="mt-1 min-h-56 w-full resize-y rounded-md border border-stone-200 bg-white px-3 py-3 text-sm leading-6 text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
          />
        </label>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {form.id ? 'Save Template' : 'Create Template'}
        </button>
      </div>
    </section>
  );
}

function TemplateList({
  templates,
  loading,
  onEdit,
  onDelete,
}: {
  templates: OutreachEmailTemplate[];
  loading: boolean;
  onEdit: (template: OutreachEmailTemplate) => void;
  onDelete: (template: OutreachEmailTemplate) => void;
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">Template Library</p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.04em] text-stone-950">Saved Templates</h2>
      </div>
      <div className="divide-y divide-stone-200">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading templates...
          </div>
        ) : templates.length ? (
          templates.map((template) => (
            <article key={template.id} className="px-4 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-stone-950">{template.name}</h3>
                    <span className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                      {template.category.replaceAll('_', ' ')}
                    </span>
                    <span
                      className={cn(
                        'rounded-md border px-2 py-1 text-[10px] font-semibold',
                        template.isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-stone-200 bg-stone-50 text-stone-500',
                      )}
                    >
                      {template.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {template.description ? (
                    <p className="mt-1 text-xs leading-5 text-stone-500">{template.description}</p>
                  ) : null}
                  {template.subject ? (
                    <p className="mt-2 truncate text-xs font-medium text-stone-700">Subject: {template.subject}</p>
                  ) : null}
                  <p
                    className="mt-2 text-xs leading-5 text-stone-600"
                    style={{
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 3,
                      overflow: 'hidden',
                    }}
                  >
                    {template.body || 'No body text saved.'}
                  </p>
                  <p className="mt-2 text-[11px] text-stone-400">Updated {formatDateTime(template.updatedAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(template)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:border-brand/30 hover:text-brand"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(template)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="px-4 py-12 text-center">
            <FileText className="mx-auto h-9 w-9 text-stone-300" />
            <p className="mt-2 text-sm font-semibold text-stone-800">No templates yet.</p>
          </div>
        )}
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
  const [agentFilter, setAgentFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [view, setView] = useState<OutreachView>('overview');
  const [templates, setTemplates] = useState<OutreachEmailTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateStatus, setTemplateStatus] = useState('');
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(EMPTY_TEMPLATE_FORM);

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

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplateStatus('');
    try {
      const response = await fetch('/api/outreach-crm/templates', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load templates.');
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
      setTemplatesLoaded(true);
    } catch (err) {
      setTemplateStatus(err instanceof Error ? err.message : 'Unable to load templates.');
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'templates' && !templatesLoaded) {
      void loadTemplates();
    }
  }, [loadTemplates, templatesLoaded, view]);

  const runDeepSync = useCallback(async () => {
    setSyncing(true);
    setSyncStatus('Syncing multi-agent outreach state...');
    setError('');
    try {
      const response = await fetch('/api/outreach-crm/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'deep' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || 'Deep sync failed.');
      const returnedDashboard = data.dashboard && typeof data.dashboard === 'object' ? (data.dashboard as OutreachDashboardResponse) : null;
      if (returnedDashboard) setDashboard(returnedDashboard);
      const status = typeof data.status === 'string' ? data.status : 'completed';
      const jobId = typeof data.jobId === 'string' ? data.jobId : '';
      const contacts = returnedDashboard?.kpis?.totalContacts;
      const warnings = returnedDashboard?.sourceWarnings?.length ? ` · ${returnedDashboard.sourceWarnings[0]}` : '';
      setSyncStatus(
        `Synced multi-agent state${contacts ? ` · ${formatNumber(contacts)} contacts` : ''}${jobId ? ` · job ${jobId.slice(0, 8)}` : ''} · ${status}${warnings}`,
      );
      await loadDashboard('refresh');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deep sync failed.';
      setSyncStatus(message);
      setError(message);
    } finally {
      setSyncing(false);
    }
  }, [loadDashboard]);

  const resetTemplateForm = useCallback(() => {
    setTemplateForm(EMPTY_TEMPLATE_FORM);
  }, []);

  const saveTemplate = useCallback(async () => {
    setTemplateSaving(true);
    setTemplateStatus('');
    try {
      const endpoint = templateForm.id ? `/api/outreach-crm/templates/${templateForm.id}` : '/api/outreach-crm/templates';
      const response = await fetch(endpoint, {
        method: templateForm.id ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(templateForm),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Template save failed.');
      setTemplateStatus(templateForm.id ? 'Template saved.' : 'Template created.');
      resetTemplateForm();
      await loadTemplates();
    } catch (err) {
      setTemplateStatus(err instanceof Error ? err.message : 'Template save failed.');
    } finally {
      setTemplateSaving(false);
    }
  }, [loadTemplates, resetTemplateForm, templateForm]);

  const editTemplate = useCallback((template: OutreachEmailTemplate) => {
    setTemplateStatus('');
    setTemplateForm({
      id: template.id,
      name: template.name,
      category: template.category || 'general',
      subject: template.subject || '',
      body: template.body || '',
      description: template.description || '',
      isActive: template.isActive,
    });
  }, []);

  const deleteTemplate = useCallback(
    async (template: OutreachEmailTemplate) => {
      const confirmed = window.confirm(`Delete "${template.name}"?`);
      if (!confirmed) return;
      setTemplateStatus('');
      try {
        const response = await fetch(`/api/outreach-crm/templates/${template.id}`, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Template delete failed.');
        if (templateForm.id === template.id) resetTemplateForm();
        setTemplateStatus('Template deleted.');
        await loadTemplates();
      } catch (err) {
        setTemplateStatus(err instanceof Error ? err.message : 'Template delete failed.');
      }
    },
    [loadTemplates, resetTemplateForm, templateForm.id],
  );

  useEffect(() => {
    setPage(0);
  }, [agentFilter, query, stageFilter, statusFilter, view]);

  const statusOptions = useMemo(() => {
    const statuses = new Set(dashboard?.replies.map((reply) => reply.status).filter(Boolean) ?? []);
    return ['all', ...Array.from(statuses).sort()];
  }, [dashboard]);

  const agentOptions = useMemo(() => {
    return ['all', ...(dashboard?.agents?.map((agent) => agent.id) ?? [])];
  }, [dashboard]);

  const stageOptions = useMemo(() => {
    return ['all', ...(dashboard?.pipelineColumns?.map((column) => column.id) ?? [])];
  }, [dashboard]);

  const filteredReplies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (dashboard?.replies ?? []).filter((reply) => {
      const matchesStatus = statusFilter === 'all' || reply.status === statusFilter;
      if (!matchesStatus) return false;
      const matchesAgent = agentFilter === 'all' || reply.agentId === agentFilter;
      if (!matchesAgent) return false;
      if (!q) return true;
      return [reply.agentName, reply.company, reply.contactName, reply.email, reply.status, reply.subject, reply.snippet]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [agentFilter, dashboard, query, statusFilter]);

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
              <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.05em] text-stone-950">Arrow Outreach Command Center</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">
                Read-only four-inbox operating cockpit for Sasha, Mark, Aaron, and Jordan across local outreach state and cache.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex rounded-lg border border-stone-200 bg-white p-1 shadow-sm">
                {[
                  { id: 'overview' as const, label: 'Executive Overview', icon: LayoutDashboard },
                  { id: 'pipeline' as const, label: 'Pipeline', icon: Send },
                  { id: 'replies' as const, label: 'Reply Inbox', icon: Inbox },
                  { id: 'templates' as const, label: 'Email Templates', icon: FileText },
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
                Read-only view &bull; no email or HubSpot mutation from rendering
              </span>
            </div>
          </div>
        </section>

        {view !== 'templates' ? (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <MetricCard label="Total Contacts" value={dashboard.kpis.totalContacts} icon={UsersRound} />
            <MetricCard label="Active Campaigns" value={dashboard.kpis.activeCampaigns ?? 0} icon={UserCheck} tone="green" />
            <MetricCard label="Sent Today" value={dashboard.kpis.emailsSentToday ?? 0} icon={Send} />
            <MetricCard label="Sent Total" value={dashboard.kpis.emailsSentTotal ?? dashboard.kpis.initialSent} icon={Send} />
            <MetricCard label="Replies" value={dashboard.kpis.replies} icon={MessageCircle} />
            <MetricCard label="Positive" value={dashboard.kpis.positive} icon={ThumbsUp} tone="green" />
            <MetricCard label="Human Review" value={dashboard.kpis.humanReview ?? 0} icon={AlertTriangle} tone="amber" />
            <MetricCard label="Due Now" value={dashboard.kpis.dueFollowUp} icon={Clock3} tone="amber" />
          </section>
        ) : null}

        {view !== 'templates' ? (
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
              value={agentFilter}
              onChange={(event) => setAgentFilter(event.target.value)}
              className="h-9 rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 outline-none transition-colors focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
            >
              {agentOptions.map((agentId) => {
                const agent = dashboard.agents?.find((item) => item.id === agentId);
                return (
                  <option key={agentId} value={agentId}>
                    {agentId === 'all' ? 'All agents' : agent?.displayName ?? agentId}
                  </option>
                );
              })}
            </select>
            {view === 'pipeline' ? (
              <select
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value)}
                className="h-9 rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 outline-none transition-colors focus:border-brand/40 focus:ring-2 focus:ring-brand/10"
              >
                {stageOptions.map((stageId) => {
                  const stage = dashboard.pipelineColumns?.find((item) => item.id === stageId);
                  return (
                    <option key={stageId} value={stageId}>
                      {stageId === 'all' ? 'All stages' : stage?.label ?? stageId}
                    </option>
                  );
                })}
              </select>
            ) : null}
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
              Sync multi-agent state
            </button>
            <div className="text-xs text-stone-500 lg:min-w-[16rem]">
              <p>{formatLastSynced(dashboard.lastSyncedAt ?? dashboard.generatedAt)}</p>
              <p>{dashboardSourceLabel(dashboard.source)}</p>
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
        ) : null}

        {view === 'templates' ? (
          <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <TemplateEditor
              form={templateForm}
              saving={templateSaving}
              onChange={(patch) => setTemplateForm((current) => ({ ...current, ...patch }))}
              onSave={() => void saveTemplate()}
              onCancel={resetTemplateForm}
            />
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={resetTemplateForm}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 shadow-sm transition-colors hover:border-brand/30 hover:text-brand"
                >
                  <Plus className="h-4 w-4" />
                  New Template
                </button>
              </div>
              {templateStatus ? (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  {templateStatus}
                </div>
              ) : null}
              <TemplateList
                templates={templates}
                loading={templatesLoading}
                onEdit={editTemplate}
                onDelete={(template) => void deleteTemplate(template)}
              />
            </div>
          </section>
        ) : view === 'overview' ? (
          <div className="space-y-3">
            <AgentOverview dashboard={dashboard} />
            <ActivityDigest dashboard={dashboard} />
            <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-3">
                <SendQueueMonitor dashboard={dashboard} />
                <PipelineBoard
                  columns={dashboard.pipelineColumns ?? []}
                  agentFilter={agentFilter}
                  stageFilter="all"
                />
                <HealthPanels dashboard={dashboard} />
                <DailyReport dashboard={dashboard} />
              </div>
              <aside className="space-y-3">
                <PipelineSummary dashboard={dashboard} />
                <FollowUpHealth dashboard={dashboard} />
                {dashboard.dataFreshness?.staleWarnings.length ? (
                  <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 shadow-sm">
                    <p className="font-semibold">Data freshness</p>
                    <div className="mt-2 space-y-1">
                      {dashboard.dataFreshness.staleWarnings.slice(0, 4).map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </section>
                ) : null}
              </aside>
            </section>
          </div>
        ) : view === 'pipeline' ? (
          <PipelineBoard columns={dashboard.pipelineColumns ?? []} agentFilter={agentFilter} stageFilter={stageFilter} />
        ) : (
          <section className="self-start rounded-lg border border-stone-200 bg-white shadow-sm">
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
          </section>
        )}
      </div>
    </main>
  );
}
