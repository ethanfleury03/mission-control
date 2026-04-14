'use client';

import { Search, Clock, ExternalLink, Power } from 'lucide-react';
import { cn } from '../lib/utils';
import { HUB_APPS, type HubAppId } from '../lib/hubApps';

interface HeaderProps {
  activeApp: HubAppId;
  openClawHubOff: boolean;
  openClawEnvLocked: boolean;
  onOpenClawHubToggle: () => void;
}

export function Header({ activeApp, openClawHubOff, openClawEnvLocked, onOpenClawHubToggle }: HeaderProps) {
  const current = HUB_APPS.find((a) => a.id === activeApp);

  return (
    <header className="h-14 bg-white border-b border-hub-border flex items-center px-4 gap-4 shrink-0 hub-header-bar">
      <div className="flex flex-col gap-0.5 shrink-0 min-w-0 pr-4 border-r border-hub-border">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Arrow Systems, Inc.
        </span>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-bold text-sm tracking-tight text-neutral-900 truncate">Arrow Hub</span>
          <a
            href="https://arrsys.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-2xs text-neutral-500 hover:text-brand transition-colors shrink-0"
          >
            arrsys.com
            <ExternalLink className="w-3 h-3 opacity-70" aria-hidden />
          </a>
        </div>
      </div>

      <div className="hidden sm:flex flex-col min-w-0">
        <span className="text-2xs text-neutral-500 uppercase tracking-wider">Current app</span>
        <span className="text-sm font-medium text-neutral-900 truncate">
          {current?.label ?? 'Hub'}
          <span className="text-neutral-500 font-normal"> — {current?.description ?? ''}</span>
        </span>
      </div>

      <div className="relative flex-1 max-w-md min-w-[12rem] flex items-stretch gap-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none z-10" />
        <input
          type="text"
          placeholder="Search hub, tasks, agents..."
          className="w-full h-8 pl-9 pr-11 bg-neutral-100 border border-neutral-200 rounded-l-md rounded-r-none text-xs text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/40"
        />
        <button
          type="button"
          className="h-8 w-10 shrink-0 bg-brand hover:bg-brand-hover text-white rounded-r-md border border-brand-hover flex items-center justify-center transition-colors"
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 hidden lg:block" />

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={onOpenClawHubToggle}
          disabled={openClawEnvLocked}
          title={
            openClawEnvLocked
              ? 'OpenClaw hub is off via DISABLE_OPENCLAW in environment (restart required to change)'
              : openClawHubOff
                ? 'Enable OpenClaw hub polling (metrics, sessions, agents, etc.)'
                : 'Disable OpenClaw hub polling (quieter logs, no openclaw CLI calls from hub APIs)'
          }
          className={cn(
            'hidden sm:inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wide transition-colors',
            openClawEnvLocked && 'opacity-50 cursor-not-allowed border-neutral-200 bg-neutral-50 text-neutral-400',
            !openClawEnvLocked && openClawHubOff && 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100',
            !openClawEnvLocked && !openClawHubOff && 'border-neutral-200 bg-white text-neutral-700 hover:border-brand/30 hover:text-brand'
          )}
        >
          <Power className={cn('h-3.5 w-3.5', openClawHubOff ? 'text-amber-600' : 'text-accent-green')} />
          <span>OpenClaw hub {openClawHubOff ? 'off' : 'on'}</span>
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 rounded-md border border-neutral-200">
          <Clock className="w-3.5 h-3.5 text-neutral-500" />
          <span className="text-xs font-mono text-neutral-600">8a/18s/12c</span>
        </div>

        <StatusBadge label="Live" value="8a/18s/12c" color="green" />
        <StatusBadge label="Sync age" value="5s ago" color="default" />
        <div className="hidden xl:flex items-center gap-2">
          <StatusBadge label="Agents" value="AGENTS.md" color="brand" />
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
  color: 'green' | 'brand' | 'default';
}) {
  const colorClasses = {
    green: 'text-accent-green border-accent-green/25 bg-accent-green/10',
    brand: 'text-brand border-brand/25 bg-brand-muted',
    default: 'text-neutral-600 border-neutral-200 bg-neutral-50',
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs',
        colorClasses[color]
      )}
    >
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-neutral-900">{value}</span>
    </div>
  );
}
