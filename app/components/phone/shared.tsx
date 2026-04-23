'use client';

import type { ComponentType, ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

type IconType = ComponentType<{ className?: string }>;

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: IconType;
  label: string;
  value: string;
  detail: string;
  tone: 'brand' | 'green' | 'amber' | 'blue' | 'neutral';
}) {
  const toneClass = {
    brand: 'text-brand bg-brand/10',
    green: 'text-green-700 bg-green-50',
    amber: 'text-amber-700 bg-amber-50',
    blue: 'text-blue-700 bg-blue-50',
    neutral: 'text-neutral-700 bg-neutral-100',
  }[tone];

  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-md', toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-lg font-bold text-neutral-900">{value}</p>
      <p className="text-2xs font-medium text-neutral-500">{label}</p>
      <p className="mt-0.5 text-2xs text-neutral-400">{detail}</p>
    </div>
  );
}

export function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: IconType;
  children: ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: IconType;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand" />
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      </div>
      <p className="text-2xs text-neutral-500">{description}</p>
    </div>
  );
}

export function StatusPill({ status, subtle = false }: { status: string; subtle?: boolean }) {
  const tone =
    status === 'running' || status === 'booked' || status === 'completed'
      ? 'border-green-200 bg-green-50 text-green-700'
      : status === 'paused' || status === 'voicemail' || status === 'busy'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : status === 'failed' || status === 'do_not_call' || status === 'not_interested'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-neutral-200 bg-neutral-100 text-neutral-700';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium capitalize',
        tone,
        subtle && 'font-normal',
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function BannerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
      <p className="text-2xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-neutral-900">{value}</p>
    </div>
  );
}

export function DetailStat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
      <p className="text-2xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={cn('mt-1 text-xs text-neutral-900', mono && 'break-all font-mono')}>{value}</p>
    </div>
  );
}

export function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="mb-2 text-xs font-semibold text-neutral-900">{title}</h3>
      {children}
    </div>
  );
}

export function JsonPanel({ value, compact = false }: { value: unknown; compact?: boolean }) {
  return (
    <pre
      className={cn(
        'whitespace-pre-wrap break-words rounded-md bg-neutral-950 px-3 py-3 font-mono text-[11px] leading-relaxed text-neutral-100',
        compact && 'text-[10px]',
      )}
    >
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

export function ReadonlySetting({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2.5">
      <p className="text-2xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={cn('mt-1 text-xs text-neutral-900', mono && 'break-all font-mono')}>
        {value || '—'}
      </p>
    </div>
  );
}

export function PageLoading({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 text-xs text-neutral-500', compact ? 'p-5' : 'p-6')}>
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function PageError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="p-6">
      <div className="card p-4">
        <p className="mb-1 text-sm font-medium text-neutral-900">Something went wrong</p>
        <p className="mb-3 text-xs text-neutral-500">{label}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs font-medium text-white hover:bg-brand-hover"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    </div>
  );
}

export function parseManualEntries(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [companyName = '', contactName = '', title = '', phoneRaw = '', email = ''] = line
        .split(',')
        .map((part) => part.trim());

      return { companyName, contactName, title, phoneRaw, email };
    })
    .filter((entry) => entry.companyName || entry.contactName || entry.phoneRaw);
}

export function resolveAgentLabel(
  agentProfileKey: string,
  profiles: Array<{ key: string; label: string }>,
) {
  return (profiles.find((profile) => profile.key === agentProfileKey)?.label ?? agentProfileKey) || '—';
}

export function formatPercent(value: number) {
  return `${Math.round((value ?? 0) * 100)}%`;
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}

export function formatDuration(value: number | null | undefined) {
  const ms = value ?? 0;
  if (!ms) return '—';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function formatSourceType(value: string) {
  return value.replace(/_/g, ' ');
}

export function formatWeekdays(days: string[]) {
  if (!days.length) return '—';
  return days.map((day) => day.toUpperCase()).join(', ');
}

export function escapeCsv(value: string | null | undefined) {
  const normalized = value ?? '';
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}
