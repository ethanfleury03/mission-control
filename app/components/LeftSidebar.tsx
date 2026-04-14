'use client';

import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '../lib/utils';
import { HUB_APPS, type HubAppId } from '../lib/hubApps';

interface LeftSidebarProps {
  activeApp: HubAppId;
  onAppChange: (id: HubAppId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function LeftSidebar({ activeApp, onAppChange, collapsed, onToggleCollapsed }: LeftSidebarProps) {
  return (
    <aside
      className={cn(
        'border-r border-white/10 flex flex-col shrink-0 hub-sidebar-accent text-zinc-100 transition-[width] duration-200 ease-out',
        collapsed ? 'w-[4.25rem]' : 'w-64'
      )}
    >
      <div className="p-3 border-b border-white/10 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-1 mb-2 min-h-[1.75rem]">
          {!collapsed && (
            <p className="text-2xs font-medium text-zinc-500 uppercase tracking-[0.2em] truncate">
              Internal apps
            </p>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              'shrink-0 rounded-md p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 transition-colors',
              collapsed && 'mx-auto'
            )}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {HUB_APPS.map((app) => {
            const Icon = app.icon;
            const isActive = activeApp === app.id;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => onAppChange(app.id)}
                title={collapsed ? `${app.label} — ${app.description}` : undefined}
                className={cn(
                  'w-full text-left rounded-md transition-colors border',
                  collapsed ? 'px-2 py-2 flex justify-center' : 'px-3 py-2.5',
                  isActive
                    ? 'bg-brand border-brand text-white shadow-sm'
                    : 'border-transparent text-zinc-300 hover:bg-white/10 hover:text-white'
                )}
              >
                <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
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
                  {!collapsed && (
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
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
