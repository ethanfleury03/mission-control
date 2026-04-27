'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  Search,
  Shield,
  ShieldOff,
  Users,
} from 'lucide-react';

import { cn } from '../lib/utils';

type AdminSubtab = 'users' | 'logs';
type UserStatus = 'active' | 'disabled';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  googleSub: string;
  hostedDomain: string;
  status: UserStatus;
  role: 'user' | 'admin';
  loginCount: number;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  lastLoginIp: string;
  lastUserAgent: string;
  disabledAt: string | null;
  createdAt: string;
}

interface AuthEventLog {
  id: string;
  type: string;
  actorEmail: string;
  targetEmail: string;
  ip: string;
  userAgent: string;
  route: string;
  action: string;
  detail: unknown;
  createdAt: string;
}

interface Diagnostics {
  ok: boolean;
  tables: {
    appUsers: boolean;
    authEventLogs: boolean;
  };
}

const ADMIN_EMAIL = 'ethan@arrsys.com';
const LOG_LIMIT = 60;

const LOG_TYPES = [
  '',
  'login_success',
  'login_rejected_domain',
  'login_rejected_disabled',
  'logout',
  'user_disabled',
  'user_enabled',
  'admin_denied',
  'api_rejected_disabled',
];

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getInitials(user: AdminUser): string {
  const source = (user.name || user.email || 'AU').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatDetail(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function StatusPill({ status }: { status: UserStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize',
        status === 'active'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-red-200 bg-red-50 text-red-700',
      )}
    >
      {status}
    </span>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">{value}</p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand/15 bg-brand/10 text-brand">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

export function AdminTab() {
  const [activeTab, setActiveTab] = useState<AdminSubtab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<AuthEventLog[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logOffset, setLogOffset] = useState(0);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userStatus, setUserStatus] = useState('all');
  const [logType, setLogType] = useState('');
  const [logActor, setLogActor] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const activeUsers = users.filter((user) => user.status === 'active').length;
  const disabledUsers = users.filter((user) => user.status === 'disabled').length;
  const adminUsers = users.filter((user) => user.role === 'admin').length;

  const loadDiagnostics = useCallback(async () => {
    const response = await fetch('/api/admin/diagnostics');
    if (!response.ok) throw new Error('Unable to load admin diagnostics.');
    const data = (await response.json()) as Diagnostics;
    setDiagnostics(data);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError('');
    const params = new URLSearchParams();
    if (userSearch.trim()) params.set('q', userSearch.trim());
    if (userStatus !== 'all') params.set('status', userStatus);
    try {
      const response = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load users.');
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users.');
    } finally {
      setLoadingUsers(false);
    }
  }, [userSearch, userStatus]);

  const loadLogs = useCallback(async (offset: number) => {
    setLoadingLogs(true);
    setError('');
    const params = new URLSearchParams();
    params.set('limit', String(LOG_LIMIT));
    params.set('offset', String(offset));
    if (logType) params.set('type', logType);
    if (logActor.trim()) params.set('actorEmail', logActor.trim());
    try {
      const response = await fetch(`/api/admin/logs?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load logs.');
      setLogs(data.logs || []);
      setLogTotal(data.total || 0);
      setLogOffset(data.offset || offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load logs.');
    } finally {
      setLoadingLogs(false);
    }
  }, [logActor, logType]);

  useEffect(() => {
    void loadDiagnostics().catch((err) => {
      setError(err instanceof Error ? err.message : 'Unable to load admin diagnostics.');
    });
  }, [loadDiagnostics]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (activeTab === 'logs') void loadLogs(0);
  }, [activeTab, loadLogs, logActor, logType]);

  const updateUserStatus = async (user: AdminUser, status: UserStatus) => {
    setBusyUserId(user.id);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to update user.');
      setUsers((prev) => prev.map((item) => (item.id === user.id ? data.user : item)));
      setMessage(`${user.email} is now ${status}.`);
      if (activeTab === 'logs') void loadLogs(logOffset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update user.');
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <main className="flex-1 min-w-0 overflow-y-auto bg-[linear-gradient(180deg,#fffdfa_0%,#f5ece4_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
        <section className="rounded-[28px] border border-stone-200 bg-white/88 p-6 shadow-[0_18px_60px_rgba(57,28,11,0.08)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand">Admin Console</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-stone-950">
                User management and security logs
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-stone-600">
                Access control stays shared-app simple for v1: Arrow users can sign in, disabled users are blocked,
                and admin actions are logged for audit visibility.
              </p>
            </div>
            <div className="flex rounded-full border border-stone-200 bg-white p-1 shadow-sm">
              {[
                { id: 'users' as const, label: 'User Management', icon: Users },
                { id: 'logs' as const, label: 'Logs', icon: Activity },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors',
                      activeTab === tab.id ? 'bg-brand text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Tracked Users" value={users.length} icon={Users} />
          <MetricCard label="Active" value={activeUsers} icon={CheckCircle2} />
          <MetricCard label="Disabled" value={disabledUsers} icon={ShieldOff} />
          <div
            className={cn(
              'rounded-2xl border bg-white p-4 shadow-sm',
              diagnostics?.ok === false ? 'border-red-200' : 'border-stone-200',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                  Auth Tables
                </p>
                <p className={cn('mt-2 text-2xl font-semibold tracking-[-0.04em]', diagnostics?.ok === false ? 'text-red-700' : 'text-stone-950')}>
                  {diagnostics ? (diagnostics.ok ? 'Ready' : 'Drift') : 'Checking'}
                </p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand/15 bg-brand/10 text-brand">
                <Database className="h-5 w-5" />
              </span>
            </div>
            {diagnostics?.ok === false ? (
              <p className="mt-3 text-xs text-red-600">
                Missing table: {!diagnostics.tables.appUsers ? 'app_users ' : ''}
                {!diagnostics.tables.authEventLogs ? 'auth_event_logs' : ''}
              </p>
            ) : (
              <p className="mt-3 text-xs text-stone-500">{adminUsers} admin record(s), Ethan is the only effective admin.</p>
            )}
          </div>
        </section>

        {activeTab === 'users' ? (
          <section className="rounded-[28px] border border-stone-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-stone-200 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand">User Management</p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-stone-950">Approved Arrow accounts</h2>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Search users..."
                    className="h-10 w-full rounded-full border border-stone-200 bg-stone-50 pl-9 pr-4 text-sm outline-none transition focus:border-brand/40 focus:ring-2 focus:ring-brand/15 sm:w-72"
                  />
                </div>
                <select
                  value={userStatus}
                  onChange={(event) => setUserStatus(event.target.value)}
                  className="h-10 rounded-full border border-stone-200 bg-white px-4 text-sm outline-none transition focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadUsers()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:border-brand/40 hover:text-brand"
                >
                  <RefreshCw className={cn('h-4 w-4', loadingUsers && 'animate-spin')} />
                  Refresh
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-stone-50 text-[10px] uppercase tracking-[0.2em] text-stone-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Domain</th>
                    <th className="px-4 py-3 font-semibold">Logins</th>
                    <th className="px-4 py-3 font-semibold">Last Login</th>
                    <th className="px-4 py-3 font-semibold">Last Seen</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {users.map((user) => {
                    const isPrimaryAdmin = user.email.toLowerCase() === ADMIN_EMAIL;
                    return (
                      <tr key={user.id} className="align-middle">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            {user.image ? (
                              <img src={user.image} alt={user.email} className="h-10 w-10 rounded-full border border-stone-200 object-cover" />
                            ) : (
                              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
                                {getInitials(user)}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-stone-950">{user.name || user.email}</p>
                              <p className="truncate text-xs text-stone-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4"><StatusPill status={user.status} /></td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold capitalize text-stone-600">
                            <Shield className="h-3.5 w-3.5 text-brand" />
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-stone-600">{user.hostedDomain || 'arrsys.com'}</td>
                        <td className="px-4 py-4 font-semibold text-stone-900">{user.loginCount}</td>
                        <td className="px-4 py-4 text-stone-600">{formatDate(user.lastLoginAt)}</td>
                        <td className="px-4 py-4 text-stone-600">{formatDate(user.lastSeenAt)}</td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            disabled={isPrimaryAdmin || busyUserId === user.id}
                            onClick={() => void updateUserStatus(user, user.status === 'active' ? 'disabled' : 'active')}
                            className={cn(
                              'inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45',
                              user.status === 'active'
                                ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                            )}
                          >
                            {busyUserId === user.id ? 'Saving...' : user.status === 'active' ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!users.length && !loadingUsers ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm text-stone-500">
                        No users match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="rounded-[28px] border border-stone-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-stone-200 p-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand">Audit Logs</p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-stone-950">Auth and admin events</h2>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={logType}
                  onChange={(event) => setLogType(event.target.value)}
                  className="h-10 rounded-full border border-stone-200 bg-white px-4 text-sm outline-none transition focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                >
                  {LOG_TYPES.map((type) => (
                    <option key={type || 'all'} value={type}>{type || 'All events'}</option>
                  ))}
                </select>
                <input
                  value={logActor}
                  onChange={(event) => setLogActor(event.target.value)}
                  placeholder="Filter actor email..."
                  className="h-10 rounded-full border border-stone-200 bg-stone-50 px-4 text-sm outline-none transition focus:border-brand/40 focus:ring-2 focus:ring-brand/15 sm:w-72"
                />
                <button
                  type="button"
                  onClick={() => void loadLogs(0)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:border-brand/40 hover:text-brand"
                >
                  <RefreshCw className={cn('h-4 w-4', loadingLogs && 'animate-spin')} />
                  Refresh
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <thead className="bg-stone-50 text-[10px] uppercase tracking-[0.2em] text-stone-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 font-semibold">Event</th>
                    <th className="px-4 py-3 font-semibold">Actor</th>
                    <th className="px-4 py-3 font-semibold">Target</th>
                    <th className="px-4 py-3 font-semibold">Route / Action</th>
                    <th className="px-4 py-3 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-4 text-stone-600">{formatDate(log.createdAt)}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full border border-brand/20 bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
                          {log.type}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-stone-700">{log.actorEmail || 'Unknown'}</td>
                      <td className="px-4 py-4 text-stone-600">{log.targetEmail || '-'}</td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-stone-900">{log.action || '-'}</p>
                        <p className="mt-1 text-xs text-stone-500">{log.route || '-'}</p>
                      </td>
                      <td className="max-w-[24rem] px-4 py-4 text-xs leading-6 text-stone-500">
                        <span className="line-clamp-3">{formatDetail(log.detail) || '-'}</span>
                      </td>
                    </tr>
                  ))}
                  {!logs.length && !loadingLogs ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-stone-500">
                        No audit events match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-stone-200 px-4 py-3">
              <p className="text-xs text-stone-500">
                Showing {logs.length ? logOffset + 1 : 0}-{Math.min(logOffset + logs.length, logTotal)} of {logTotal}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={logOffset <= 0}
                  onClick={() => void loadLogs(Math.max(0, logOffset - LOG_LIMIT))}
                  className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={logOffset + LOG_LIMIT >= logTotal}
                  onClick={() => void loadLogs(logOffset + LOG_LIMIT)}
                  className="rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        )}

        {diagnostics?.ok === false ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Apply the latest Prisma migration before deploying this admin console to production.
          </div>
        ) : null}
      </div>
    </main>
  );
}
