'use client';

import { Alert, CronJob } from '../lib/types';
import { cn } from '../lib/utils';
import { AlertTriangle, AlertCircle, Info, ChevronRight, Play, Pause } from 'lucide-react';

interface RightSidebarProps {
  alerts: Alert[];
  crons: CronJob[];
}

export function RightSidebar({ alerts, crons }: RightSidebarProps) {
  return (
    <aside className="w-72 bg-white border-l border-hub-border flex flex-col shrink-0">
      <div className="flex-1 overflow-auto">
        <div className="p-4 border-b border-neutral-200">
          <span className="text-xs font-medium text-neutral-600 uppercase tracking-wider">Alerts</span>
        </div>
        <div className="p-2 space-y-1">
          {alerts.map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
        </div>

        <div className="mt-4 p-4 border-t border-neutral-200">
          <div className="flex items-center gap-2 mb-4">
            <ChevronRight className="w-4 h-4 text-brand" />
            <span className="text-xs font-medium text-neutral-600 uppercase tracking-wider">Control Deck</span>
          </div>

          <div className="mb-4">
            <div className="text-2xs text-neutral-500 uppercase mb-2">Agent Dispatch</div>
            <div className="space-y-2">
              <div className="p-2 bg-neutral-100 rounded border border-neutral-200">
                <div className="text-xs text-neutral-900 mb-1">Clawd</div>
                <input
                  type="text"
                  placeholder="Message to agent..."
                  className="w-full h-7 px-2 bg-white border border-neutral-200 rounded text-xs text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/20"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xs text-neutral-500">Priority:</span>
                <span className="text-2xs px-2 py-0.5 bg-brand-muted text-brand rounded border border-brand/20">
                  medium
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-2xs text-neutral-500 uppercase mb-2">Cron Control</div>
            <div className="space-y-1">
              {crons.slice(0, 6).map((cron) => (
                <CronItem key={cron.id} cron={cron} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function AlertItem({ alert }: { alert: Alert }) {
  const Icon = {
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  }[alert.severity];

  const colorClasses = {
    error: 'text-accent-red border-accent-red/20 bg-accent-red/5',
    warning: 'text-accent-yellow border-accent-yellow/20 bg-accent-yellow/5',
    info: 'text-brand border-brand/20 bg-brand-muted',
  }[alert.severity];

  return (
    <div className={cn('p-2 rounded border', colorClasses)}>
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-xs capitalize text-neutral-900">{alert.type}</span>
      </div>
      <div className="text-2xs text-neutral-600 mt-1">{alert.message}</div>
    </div>
  );
}

function CronItem({ cron }: { cron: CronJob }) {
  return (
    <div className="flex items-center justify-between p-2 bg-neutral-100 rounded border border-neutral-200">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-neutral-900 truncate">{cron.name}</div>
        <div className="text-2xs text-neutral-500">
          {cron.enabled ? 'enabled' : 'disabled'} · {cron.schedule}
        </div>
      </div>
      <button
        type="button"
        className={cn(
          'p-1 rounded',
          cron.enabled ? 'text-accent-green hover:bg-accent-green/10' : 'text-neutral-500 hover:bg-neutral-200'
        )}
      >
        {cron.enabled ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
