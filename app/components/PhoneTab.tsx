'use client';

import { useState } from 'react';
import {
  Database,
  LayoutDashboard,
  PhoneCall as PhoneCallIcon,
  PlayCircle,
  Settings2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { PhonePage } from '@/lib/phone/types';
import { PhoneCallLogPage } from './phone/PhoneCallLogPage';
import { PhoneCreateCallPage } from './phone/PhoneCreateCallPage';
import { PhoneHomePage } from './phone/PhoneHomePage';
import { PhoneListsPage } from './phone/PhoneListsPage';
import { PhoneSettingsPage } from './phone/PhoneSettingsPage';

type NavItem = {
  id: PhonePage;
  label: string;
  icon: typeof LayoutDashboard;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard },
  { id: 'create-call', label: 'Create Call', icon: PlayCircle },
  { id: 'lists', label: 'Lists', icon: Database },
  { id: 'call-log', label: 'Call Log', icon: PhoneCallIcon },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

export function PhoneTab() {
  const [activePage, setActivePage] = useState<PhonePage>('home');

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex w-52 shrink-0 flex-col border-r border-hub-border bg-white">
        <div className="border-b border-hub-border p-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">Phone</h2>
          <p className="mt-0.5 text-2xs text-neutral-500">Cold calling & operations</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
                className={cn(
                  'mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                  isActive
                    ? 'bg-brand/10 font-medium text-brand'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-hub-border p-3">
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-2">
            <p className="text-2xs font-medium text-neutral-800">Manager-first</p>
            <p className="mt-0.5 text-2xs text-neutral-500">
              Separate reporting, campaign control, lists, and safe defaults without leaving the Phone workspace.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-bg-primary">
        {activePage === 'home' ? (
          <PhoneHomePage onNavigate={setActivePage} />
        ) : activePage === 'create-call' ? (
          <PhoneCreateCallPage onNavigate={setActivePage} />
        ) : activePage === 'lists' ? (
          <PhoneListsPage onNavigate={setActivePage} />
        ) : activePage === 'call-log' ? (
          <PhoneCallLogPage />
        ) : (
          <PhoneSettingsPage />
        )}
      </div>
    </div>
  );
}
