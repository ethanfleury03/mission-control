'use client';

import { cn } from '../../lib/utils';
import { getQualificationLevel, getQualificationColor } from '@/lib/lead-generation/scoring';

export function FitScoreBadge({ score }: { score: number }) {
  const level = getQualificationLevel(score);
  const color = getQualificationColor(level);

  return (
    <span className={cn('inline-flex items-center text-2xs font-semibold px-1.5 py-0.5 rounded border', color)}>
      {score}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-neutral-100 text-neutral-600',
    prospect: 'bg-blue-100 text-blue-800',
    archived: 'bg-neutral-100 text-neutral-500',
    planned: 'bg-purple-100 text-purple-800',
    building: 'bg-amber-100 text-amber-800',
  };

  return (
    <span className={cn('text-2xs px-1.5 py-0.5 rounded font-medium', styles[status] ?? 'bg-neutral-100 text-neutral-600', className)}>
      {status}
    </span>
  );
}

export function SectionHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        {description && <p className="text-xs text-neutral-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function PlannedBadge() {
  return (
    <span className="text-2xs px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 border border-neutral-200 font-medium">
      Planned
    </span>
  );
}

export function DemoDataNotice() {
  return (
    <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-2xs text-amber-700">
      Data shown is synthetic demo/seed data for development purposes only. Not real company records.
    </div>
  );
}
