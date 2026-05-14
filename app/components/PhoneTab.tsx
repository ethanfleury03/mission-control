'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  LayoutDashboard,
  PhoneCall as PhoneCallIcon,
  Settings2,
} from 'lucide-react';
import { isAdminEmail } from '@/lib/auth/constants';
import { cn } from '../lib/utils';
import type { PhonePage } from '@/lib/phone/types';
import { PhoneCallLogPage } from './phone/PhoneCallLogPage';
import { PhoneHomePage } from './phone/PhoneHomePage';
import { PhoneSettingsPage } from './phone/PhoneSettingsPage';

type NavItem = {
  id: PhonePage;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard },
  { id: 'call-log', label: 'Call Log', icon: PhoneCallIcon },
  { id: 'settings', label: 'Settings', icon: Settings2, adminOnly: true },
];

export function PhoneTab() {
  const { data: session } = useSession();
  const isAdmin = isAdminEmail(session?.user?.email);
  const [activePage, setActivePage] = useState<PhonePage>('home');
  const navItems = useMemo(
    () => NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin],
  );
  const resolvedPage = activePage === 'settings' && !isAdmin ? 'home' : activePage;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex w-52 shrink-0 flex-col border-r border-hub-border bg-white">
        <div className="border-b border-hub-border p-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">Phone</h2>
          <p className="mt-0.5 text-2xs text-neutral-500">Retell call observability</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = resolvedPage === item.id;
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
            <p className="text-2xs font-medium text-neutral-800">Retell-first</p>
            <p className="mt-0.5 text-2xs text-neutral-500">
              Reps can watch calls, outcomes, recordings, analysis, and cost without launching outreach.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-bg-primary">
        {resolvedPage === 'home' ? (
          <PhoneHomePage onNavigate={setActivePage} />
        ) : resolvedPage === 'call-log' ? (
          <PhoneCallLogPage />
        ) : (
          <PhoneSettingsPage />
        )}
      </div>
    </div>
  );
}
