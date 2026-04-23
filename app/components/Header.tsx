'use client';

import { Search, ExternalLink } from 'lucide-react';
import { HUB_APPS, type HubAppId } from '../lib/hubApps';

interface HeaderProps {
  activeApp: HubAppId;
}

export function Header({ activeApp }: HeaderProps) {
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

      <div className="hidden md:block flex-1 min-w-0" />

      <div className="relative ml-auto w-full max-w-md min-w-[12rem] flex items-stretch gap-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none z-10" />
        <input
          type="text"
          placeholder="Search hub, tasks, tools..."
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
    </header>
  );
}
