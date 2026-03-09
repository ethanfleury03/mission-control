'use client';

import { FileText, AlertTriangle, CheckCircle2, CalendarDays, type LucideIcon } from 'lucide-react';
import { KanbanBoard } from './KanbanBoard';

export function BlogsTab() {
  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <MetricCard icon={FileText} label="Planned This Week" value="8" tone="cyan" />
        <MetricCard icon={AlertTriangle} label="Blocked" value="2" tone="yellow" />
        <MetricCard icon={CheckCircle2} label="Awaiting Approval" value="3" tone="red" />
        <MetricCard icon={CalendarDays} label="Scheduled" value="5" tone="green" />
      </div>

      <div className="bg-bg-secondary border border-white/10 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-text-primary tracking-wide">BLOG COMMAND CENTER</h2>
        <p className="text-xs text-text-secondary mt-1">
          Executive + operator view for blog pipeline. Use context <span className="font-mono">blog:content</span> for all blog work cards.
        </p>
      </div>

      <KanbanBoard initialContextKey="blog:content" />
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: 'cyan' | 'yellow' | 'red' | 'green' }) {
  const toneClass = {
    cyan: 'text-accent-cyan border-accent-cyan/20 bg-accent-cyan/5',
    yellow: 'text-accent-yellow border-accent-yellow/20 bg-accent-yellow/5',
    red: 'text-accent-red border-accent-red/20 bg-accent-red/5',
    green: 'text-accent-green border-accent-green/20 bg-accent-green/5',
  }[tone];

  return (
    <div className={`rounded-lg border ${toneClass} p-3`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
    </div>
  );
}
