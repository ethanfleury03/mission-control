'use client';

import { cn } from '../lib/utils';
import { HUB_APPS, type HubAppId } from '../lib/hubApps';

interface LeftSidebarProps {
  activeApp: HubAppId;
  onAppChange: (id: HubAppId) => void;
}

export function LeftSidebar({ activeApp, onAppChange }: LeftSidebarProps) {
  return (
    <aside className="w-64 border-r border-white/10 flex flex-col shrink-0 hub-sidebar-accent text-zinc-100">
      <div className="p-4 border-b border-white/10 flex-1 flex flex-col min-h-0">
        <p className="text-2xs font-medium text-zinc-500 uppercase tracking-[0.2em] mb-3">Internal apps</p>
        <nav className="flex flex-col gap-1">
          {HUB_APPS.map((app) => {
            const Icon = app.icon;
            const isActive = activeApp === app.id;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => onAppChange(app.id)}
                className={cn(
                  'w-full text-left rounded-md px-3 py-2.5 transition-colors border',
                  isActive
                    ? 'bg-brand border-brand text-white shadow-sm'
                    : 'border-transparent text-zinc-300 hover:bg-white/10 hover:text-white'
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                      isActive
                        ? 'border-white/25 bg-white/15 text-white'
                        : 'border-white/10 bg-zinc-900 text-zinc-400'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-tight">{app.label}</span>
                    <span
                      className={cn(
                        'block text-2xs mt-0.5 leading-snug',
                        isActive ? 'text-white/80' : 'text-zinc-500'
                      )}
                    >
                      {app.description}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
