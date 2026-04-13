'use client';

import { Search, Clock, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { HUB_APPS, type HubAppId } from '../lib/hubApps';

interface HeaderProps {
  activeApp: HubAppId;
}

export function Header({ activeApp }: HeaderProps) {
  const current = HUB_APPS.find((a) => a.id === activeApp);

  return (
    <header className="h-14 bg-bg-secondary border-b border-hub-border flex items-center px-4 gap-4 shrink-0 hub-header-bar">
      <div className="flex flex-col gap-0.5 shrink-0 min-w-0 pr-4 border-r border-hub-border">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent-cyan/90">
          Arrow Systems Inc
        </span>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-sm tracking-tight text-text-primary truncate">
            Internal Hub
          </span>
          <a
            href="https://arrsys.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-2xs text-text-muted hover:text-accent-cyan transition-colors shrink-0"
          >
            arrsys.com
            <ExternalLink className="w-3 h-3 opacity-70" aria-hidden />
          </a>
        </div>
      </div>

      <div className="hidden sm:flex flex-col min-w-0">
        <span className="text-2xs text-text-muted uppercase tracking-wider">Current app</span>
        <span className="text-sm font-medium text-text-primary truncate">
          {current?.label ?? 'Hub'}
          <span className="text-text-muted font-normal"> — {current?.description ?? ''}</span>
        </span>
      </div>

      <div className="relative flex-1 max-w-md min-w-[12rem]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Search hub, tasks, agents..."
          className="w-full h-8 pl-9 pr-3 bg-bg-tertiary border border-hub-border rounded-md text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/30"
        />
      </div>

      <div className="flex-1 hidden lg:block" />

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary rounded-md border border-hub-border">
          <Clock className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-xs font-mono text-text-secondary">8a/18s/12c</span>
        </div>

        <StatusBadge label="Live" value="8a/18s/12c" color="green" />
        <StatusBadge label="Sync age" value="5s ago" color="default" />
        <div className="hidden xl:flex items-center gap-2">
          <StatusBadge label="Agents" value="AGENTS.md" color="cyan" />
          <StatusBadge label="Gateway" value="Ok" color="green" />
        </div>
      </div>
    </header>
  );
}

function StatusBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'green' | 'cyan' | 'default';
}) {
  const colorClasses = {
    green: 'text-accent-green border-accent-green/20 bg-accent-green/5',
    cyan: 'text-accent-cyan border-accent-cyan/20 bg-accent-cyan/5',
    default: 'text-text-secondary border-white/10 bg-bg-tertiary',
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs',
        colorClasses[color]
      )}
    >
      <span className="text-text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
