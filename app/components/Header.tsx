'use client';

import { ExternalLink, LogOut, Search } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { getHubApps, type HubApp, type HubAppId } from '../lib/hubApps';

interface HeaderProps {
  activeApp: HubAppId;
  appOverride?: Partial<Pick<HubApp, 'currentDescription' | 'description' | 'searchPlaceholder'>>;
}

function getUserInitials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || 'Arrow User').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function Header({ activeApp, appOverride }: HeaderProps) {
  const baseCurrent = getHubApps({ includeAdmin: true }).find((a) => a.id === activeApp);
  const current = baseCurrent ? { ...baseCurrent, ...appOverride } : undefined;
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? null;
  const name = session?.user?.name ?? null;
  const image = session?.user?.image ?? null;
  const initials = getUserInitials(name, email);
  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout-event', { method: 'POST' });
    } catch {
      /* Sign-out should still continue if audit logging is unavailable. */
    }
    const result = await signOut({ callbackUrl: '/signin?signedOut=1', redirect: false });
    window.location.assign(result.url || '/signin?signedOut=1');
  };

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
          <span className="text-neutral-500 font-normal">
            {' '}
            — {current?.currentDescription ?? current?.description ?? ''}
          </span>
        </span>
      </div>

      <div className="hidden md:flex flex-1 min-w-0 justify-center px-2">
        <form
          className="flex h-10 w-full max-w-lg overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 shadow-sm focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/10"
          onSubmit={(event) => event.preventDefault()}
          role="search"
        >
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-neutral-400" />
            <span className="sr-only">Search Arrow Hub</span>
            <input
              type="search"
              className="h-full w-full bg-transparent pl-9 pr-3 text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
              placeholder={current?.searchPlaceholder ?? 'Search hub...'}
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-full w-11 items-center justify-center bg-brand text-white transition-colors hover:bg-brand-hover"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
        </form>
      </div>

      {status === 'authenticated' && email ? (
        <div className="hidden lg:flex items-center gap-2 shrink-0 pl-2">
          <div className="flex items-center gap-3 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1.5 shadow-sm">
            {image ? (
              <img
                src={image}
                alt={name ?? email}
                className="h-8 w-8 rounded-full border border-neutral-200 object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="max-w-[10rem] truncate text-xs font-semibold text-neutral-900">
                {name || email}
              </p>
              <p className="max-w-[12rem] truncate text-[11px] text-neutral-500">{email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-4 text-xs font-semibold text-neutral-700 transition-colors hover:border-brand/40 hover:text-brand"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      ) : null}
    </header>
  );
}
