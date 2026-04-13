'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '../lib/utils';
import {
  Search,
  Play,
  Square,
  Download,
  FileSpreadsheet,
  Trash2,
  RotateCcw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Globe,
  Building2,
  Mail,
  Phone,
  Filter,
  ChevronRight,
  Flag,
} from 'lucide-react';

import type { ScrapeJob, CompanyResult, ConfidenceScore, LogEntry } from '@/lib/directory-scraper/types';

const API = '/api/directory-scraper';

type StatusFilter = 'all' | 'done' | 'failed' | 'pending';
type FieldFilter = 'all' | 'needs_review' | 'no_email' | 'no_phone' | 'no_website';

export function DirectoryScraperTab() {
  const [url, setUrl] = useState('');
  const [maxCompanies, setMaxCompanies] = useState('');
  const [visitWebsites, setVisitWebsites] = useState(true);
  const [mockMode, setMockMode] = useState(false);
  const [exportTarget, setExportTarget] = useState<'csv' | 'sheets'>('csv');
  const [sheetId, setSheetId] = useState('');
  const [sheetTab, setSheetTab] = useState('');
  const [sheetsConfigured, setSheetsConfigured] = useState(false);
  const [sheetsHint, setSheetsHint] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [job, setJob] = useState<ScrapeJob | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [fieldFilter, setFieldFilter] = useState<FieldFilter>('all');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Check sheets availability
  useEffect(() => {
    fetch(`${API}/sheets-status`)
      .then((r) => r.json())
      .then((d) => {
        setSheetsConfigured(d.configured);
        setSheetsHint(d.hint ?? null);
      })
      .catch(() => {});
  }, []);

  const pollJob = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API}/jobs/${id}`, { cache: 'no-store' });
      if (res.ok) {
        const data: ScrapeJob = await res.json();
        setJob(data);
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }
    } catch { /* poll failure is ok */ }
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (showLogs) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [job?.logs.length, showLogs]);

  const startJob = async () => {
    setIsStarting(true);
    try {
      const res = await fetch(`${API}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          maxCompanies: maxCompanies ? Number(maxCompanies) : undefined,
          visitCompanyWebsites: visitWebsites,
          exportTarget,
          googleSheetId: sheetId,
          googleSheetTab: sheetTab,
          mockMode,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        alert(e.error || 'Failed to start job');
        return;
      }
      const data: ScrapeJob = await res.json();
      setJob(data);
      setStatusFilter('all');
      setFieldFilter('all');
      setSearchQuery('');
      setExpandedRowId(null);
      setExportError(null);
      pollRef.current = setInterval(() => pollJob(data.id), 1500);
    } catch (err: any) {
      alert(err?.message || 'Network error');
    } finally {
      setIsStarting(false);
    }
  };

  const cancelJob = async () => {
    if (!job) return;
    await fetch(`${API}/jobs/${job.id}/cancel`, { method: 'POST' });
    pollJob(job.id);
  };

  const clearResults = async () => {
    if (!job) return;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    await fetch(`${API}/jobs/${job.id}`, { method: 'DELETE' });
    setJob(null);
    setExpandedRowId(null);
    setExportError(null);
  };

  const retryFailed = async () => {
    if (!job) return;
    const failedIds = job.results.filter((r) => r.status === 'failed').map((r) => r.id);
    if (failedIds.length === 0) return;
    const res = await fetch(`${API}/jobs/${job.id}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds: failedIds }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.error || 'Retry failed');
      return;
    }
    pollJob(job.id);
    if (!pollRef.current) pollRef.current = setInterval(() => pollJob(job.id), 1500);
  };

  const exportCsv = async () => {
    if (!job) return;
    setExportLoading(true);
    setExportError(null);
    try {
      const res = await fetch(`${API}/jobs/${job.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'csv' }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setExportError(e.error || 'CSV export failed');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `scrape-${job.id.slice(0, 8)}.csv`;
      a.click();
    } finally {
      setExportLoading(false);
    }
  };

  const exportSheets = async () => {
    if (!job) return;
    setExportLoading(true);
    setExportError(null);
    try {
      const sid = sheetId || job.input.googleSheetId;
      if (!sid) {
        setExportError('Enter a Google Sheet ID before exporting.');
        return;
      }
      const res = await fetch(`${API}/jobs/${job.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'sheets', googleSheetId: sid, googleSheetTab: sheetTab || 'Scrape Results' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExportError(data.error || 'Google Sheets export failed');
        return;
      }
      window.open(data.url, '_blank');
    } finally {
      setExportLoading(false);
    }
  };

  const isRunning = job?.status === 'running' || job?.status === 'queued';

  const needsReviewCount = (job?.results ?? []).filter((r) => r.needsReview).length;

  const filteredResults = (job?.results ?? []).filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (fieldFilter === 'needs_review' && !r.needsReview) return false;
    if (fieldFilter === 'no_email' && r.email) return false;
    if (fieldFilter === 'no_phone' && r.phone) return false;
    if (fieldFilter === 'no_website' && r.companyWebsite) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.companyName.toLowerCase().includes(q) ||
        r.companyWebsite.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col bg-bg-primary overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 px-6 py-4 border-b border-hub-border bg-white flex items-center gap-3">
        <Globe className="w-5 h-5 text-brand" />
        <h1 className="text-lg font-bold text-neutral-900">Directory Scraper</h1>
        <span className="text-xs text-neutral-500">Extract companies and contacts from directory websites</span>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {exportError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start justify-between gap-3">
            <span>{exportError}</span>
            <button type="button" className="text-red-600 hover:text-red-900 shrink-0" onClick={() => setExportError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        {/* Config form */}
        <div className="bg-white rounded-lg border border-hub-border p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-900 mb-4 flex items-center gap-2">
            <Search className="w-4 h-4 text-brand" />
            Scrape configuration
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* URL */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-neutral-600 mb-1">Directory URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/members"
                disabled={isRunning}
                className="w-full h-9 px-3 text-sm bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/40 disabled:opacity-50"
              />
            </div>

            {/* Max companies */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Max companies</label>
              <input
                type="number"
                value={maxCompanies}
                onChange={(e) => setMaxCompanies(e.target.value)}
                placeholder="All"
                min={1}
                disabled={isRunning}
                className="w-full h-9 px-3 text-sm bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/40 disabled:opacity-50"
              />
            </div>

            {/* Checkboxes */}
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={visitWebsites}
                  onChange={(e) => setVisitWebsites(e.target.checked)}
                  disabled={isRunning}
                  className="rounded border-neutral-300 text-brand focus:ring-brand/30 accent-brand"
                />
                Visit company websites for enrichment
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={mockMode}
                  onChange={(e) => setMockMode(e.target.checked)}
                  disabled={isRunning}
                  className="rounded border-neutral-300 text-brand focus:ring-brand/30 accent-brand"
                />
                Mock mode (demo data, no live scraping)
              </label>
            </div>

            {/* Export target */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Export target</label>
              <select
                value={exportTarget}
                onChange={(e) => setExportTarget(e.target.value as 'csv' | 'sheets')}
                disabled={isRunning}
                className="w-full h-9 px-3 text-sm bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/40 disabled:opacity-50"
              >
                <option value="csv">CSV download</option>
                <option value="sheets">Google Sheets</option>
              </select>
              {exportTarget === 'sheets' && !sheetsConfigured && (
                <p className="mt-1 text-2xs text-accent-red leading-relaxed">
                  {sheetsHint ||
                    'Sheets not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY on the server, restart, and grant the service account Editor access to your spreadsheet.'}
                </p>
              )}
            </div>

            {/* Sheet ID */}
            {exportTarget === 'sheets' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Google Sheet ID</label>
                  <input
                    type="text"
                    value={sheetId}
                    onChange={(e) => setSheetId(e.target.value)}
                    placeholder="1BxiMVs0..."
                    disabled={isRunning}
                    className="w-full h-9 px-3 text-sm bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/40 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Tab name</label>
                  <input
                    type="text"
                    value={sheetTab}
                    onChange={(e) => setSheetTab(e.target.value)}
                    placeholder="Scrape Results"
                    disabled={isRunning}
                    className="w-full h-9 px-3 text-sm bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/40 disabled:opacity-50"
                  />
                </div>
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-neutral-100">
            {!isRunning ? (
              <button
                type="button"
                onClick={startJob}
                disabled={isStarting || (!url.trim() && !mockMode)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Start scrape
              </button>
            ) : (
              <button
                type="button"
                onClick={cancelJob}
                className="inline-flex items-center gap-2 px-4 py-2 bg-accent-red hover:bg-accent-red/90 text-white rounded-md text-sm font-medium transition-colors"
              >
                <Square className="w-4 h-4" />
                Cancel
              </button>
            )}
            {job && !isRunning && (
              <>
                <button type="button" onClick={clearResults} className="inline-flex items-center gap-2 px-3 py-2 border border-neutral-200 rounded-md text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                  <Trash2 className="w-4 h-4" /> Clear
                </button>
                {job.summary.failures > 0 && (
                  <button type="button" onClick={retryFailed} className="inline-flex items-center gap-2 px-3 py-2 border border-neutral-200 rounded-md text-sm text-neutral-700 hover:bg-neutral-50 transition-colors">
                    <RotateCcw className="w-4 h-4" /> Retry failed ({job.summary.failures})
                  </button>
                )}
              </>
            )}
            {job && job.results.length > 0 && !isRunning && (
              <>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={exportLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-neutral-200 rounded-md text-sm text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> CSV
                </button>
                {sheetsConfigured && (
                  <button
                    type="button"
                    onClick={exportSheets}
                    disabled={exportLoading}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Google Sheets
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Progress panel */}
        {job && (
          <div className="bg-white rounded-lg border border-hub-border p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                {isRunning ? <Loader2 className="w-4 h-4 text-brand animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-accent-green" />}
                Job: {job.id.slice(0, 8)} — <StatusBadge status={job.status} />
              </h2>
              {job.startedAt && (
                <span className="text-2xs text-neutral-500">
                  Started {new Date(job.startedAt).toLocaleTimeString()}
                  {job.finishedAt && ` — Finished ${new Date(job.finishedAt).toLocaleTimeString()}`}
                </span>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <SummaryCard icon={Building2} label="Found" value={job.summary.companiesFound} />
              <SummaryCard icon={CheckCircle2} label="Processed" value={job.summary.companiesProcessed} />
              <SummaryCard icon={Mail} label="Emails" value={job.summary.emailsFound} color="brand" />
              <SummaryCard icon={Phone} label="Phones" value={job.summary.phonesFound} color="brand" />
              <SummaryCard icon={AlertCircle} label="Failures" value={job.summary.failures} color="red" />
              <SummaryCard icon={Flag} label="Review" value={needsReviewCount} color="red" />
            </div>

            {/* Progress bar */}
            {isRunning && job.summary.companiesFound > 0 && (
              <div className="mt-3">
                <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((job.summary.companiesProcessed / job.summary.companiesFound) * 100)}%` }}
                  />
                </div>
                <p className="text-2xs text-neutral-500 mt-1">
                  {job.summary.companiesProcessed}/{job.summary.companiesFound} companies processed
                </p>
              </div>
            )}

            {/* Log toggle */}
            <button
              type="button"
              onClick={() => setShowLogs(!showLogs)}
              className="mt-3 inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800"
            >
              {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showLogs ? 'Hide' : 'Show'} logs ({job.logs.length})
            </button>
            {showLogs && (
              <div className="mt-2 max-h-48 overflow-auto bg-neutral-50 border border-neutral-200 rounded-md p-3 font-mono text-2xs space-y-0.5">
                {job.logs.map((log, i) => (
                  <LogLine key={i} log={log} />
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        )}

        {/* Results table */}
        {job && job.results.length > 0 && (
          <div className="bg-white rounded-lg border border-hub-border shadow-sm overflow-hidden">
            {/* Table controls */}
            <div className="px-5 py-3 border-b border-neutral-100 flex items-center gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-neutral-900">
                Results ({filteredResults.length})
              </h2>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, domain, email..."
                  className="w-full h-8 pl-8 pr-3 text-xs bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-brand/25"
                />
              </div>
              <div className="flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-neutral-400" />
                {(['all', 'done', 'failed', 'pending'] as StatusFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={cn(
                      'px-2 py-1 text-2xs rounded-md border transition-colors capitalize',
                      statusFilter === f
                        ? 'bg-brand text-white border-brand'
                        : 'text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-2xs text-neutral-500 mr-1">Fields</span>
                {(
                  [
                    ['all', 'All'],
                    ['needs_review', 'Needs review'],
                    ['no_email', 'No email'],
                    ['no_phone', 'No phone'],
                    ['no_website', 'No website'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFieldFilter(key)}
                    className={cn(
                      'px-2 py-1 text-2xs rounded-md border transition-colors',
                      fieldFilter === key
                        ? 'bg-neutral-800 text-white border-neutral-800'
                        : 'text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable table */}
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-200 z-10">
                  <tr className="text-left text-neutral-600 uppercase tracking-wide text-2xs">
                    <th className="px-2 py-2.5 w-8" aria-label="Expand" />
                    <th className="px-4 py-2.5 font-medium">Company</th>
                    <th className="px-4 py-2.5 font-medium">Website</th>
                    <th className="px-4 py-2.5 font-medium">Email</th>
                    <th className="px-4 py-2.5 font-medium">Phone</th>
                    <th className="px-4 py-2.5 font-medium">Address</th>
                    <th className="px-4 py-2.5 font-medium">Social</th>
                    <th className="px-4 py-2.5 font-medium">Confidence</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredResults.map((r) => (
                    <ResultRow
                      key={r.id}
                      result={r}
                      expanded={expandedRowId === r.id}
                      onToggle={() => setExpandedRowId((id) => (id === r.id ? null : r.id))}
                    />
                  ))}
                  {filteredResults.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-neutral-500">
                        No results match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- sub-components ---------- */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: 'bg-neutral-100 text-neutral-600 border-neutral-200',
    running: 'bg-blue-50 text-blue-700 border-blue-200',
    completed: 'bg-green-50 text-green-700 border-green-200',
    cancelled: 'bg-amber-50 text-amber-700 border-amber-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
    done: 'bg-green-50 text-green-700 border-green-200',
    pending: 'bg-neutral-100 text-neutral-600 border-neutral-200',
    scraping: 'bg-blue-50 text-blue-700 border-blue-200',
    enriching: 'bg-violet-50 text-violet-700 border-violet-200',
  };
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded-full border text-2xs font-medium capitalize', styles[status] ?? styles.pending)}>
      {status}
    </span>
  );
}

function ConfidenceBadge({ score }: { score: ConfidenceScore }) {
  const styles: Record<ConfidenceScore, string> = {
    high: 'bg-green-50 text-green-700 border-green-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  };
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded-full border text-2xs font-medium capitalize', styles[score])}>
      {score}
    </span>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color?: 'brand' | 'red' }) {
  const valueColor = color === 'brand' ? 'text-brand' : color === 'red' ? 'text-accent-red' : 'text-neutral-900';
  return (
    <div className="bg-neutral-50 rounded-md p-3 border border-neutral-200">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-neutral-500" />
        <span className="text-2xs text-neutral-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className={cn('text-xl font-bold', valueColor)}>{value}</div>
    </div>
  );
}

function LogLine({ log }: { log: LogEntry }) {
  const colors = { info: 'text-neutral-600', warn: 'text-amber-600', error: 'text-red-600' };
  return (
    <div className={cn('leading-snug', colors[log.level])}>
      <span className="text-neutral-400">{new Date(log.timestamp).toLocaleTimeString()}</span>{' '}
      <span className="font-medium uppercase">[{log.level}]</span> {log.message}
    </div>
  );
}

function MaybeLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (!href) return <span className="text-neutral-400">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline inline-flex items-center gap-1 max-w-[200px] truncate">
      {children} <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
    </a>
  );
}

function ResultRow({
  result,
  expanded,
  onToggle,
}: {
  result: CompanyResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-neutral-50 transition-colors">
        <td className="px-2 py-2.5 align-top">
          <button
            type="button"
            onClick={onToggle}
            className="p-1 rounded hover:bg-neutral-200 text-neutral-500"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse row' : 'Expand row'}
          >
            <ChevronRight className={cn('w-4 h-4 transition-transform', expanded && 'rotate-90')} />
          </button>
        </td>
        <td className="px-4 py-2.5 font-medium text-neutral-900 max-w-[180px]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="truncate" title={result.companyName}>{result.companyName}</div>
          {result.needsReview && (
            <span className="shrink-0 text-2xs px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Review
            </span>
          )}
        </div>
        {result.directoryListingUrl && (
          <MaybeLink href={result.directoryListingUrl}>
            <span className="text-2xs">listing</span>
          </MaybeLink>
        )}
      </td>
      <td className="px-4 py-2.5 max-w-[160px]">
        <MaybeLink href={result.companyWebsite}>
          <span className="truncate">
            {result.companyWebsite
              ? (() => {
                  try {
                    return new URL(result.companyWebsite).hostname;
                  } catch {
                    return result.companyWebsite;
                  }
                })()
              : ''}
          </span>
        </MaybeLink>
      </td>
      <td className="px-4 py-2.5">
        {result.email ? (
          <a href={`mailto:${result.email}`} className="text-brand hover:underline truncate block max-w-[180px]">{result.email}</a>
        ) : <span className="text-neutral-400">—</span>}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">{result.phone || <span className="text-neutral-400">—</span>}</td>
      <td className="px-4 py-2.5 max-w-[160px]">
        <span className="truncate block" title={result.address}>{result.address || <span className="text-neutral-400">—</span>}</span>
      </td>
      <td className="px-4 py-2.5 max-w-[120px]">
        {result.socialLinks ? (
          <span className="truncate block text-2xs text-neutral-600" title={result.socialLinks}>{result.socialLinks}</span>
        ) : <span className="text-neutral-400">—</span>}
      </td>
      <td className="px-4 py-2.5"><ConfidenceBadge score={result.confidence} /></td>
      <td className="px-4 py-2.5"><StatusBadge status={result.status} /></td>
      <td className="px-4 py-2.5 max-w-[180px]">
        <span className="truncate block text-neutral-600" title={result.notes || result.error}>{result.notes || result.error || '—'}</span>
      </td>
    </tr>
      {expanded && (
        <tr className="bg-neutral-50/80">
          <td colSpan={10} className="px-4 py-3 text-2xs text-neutral-700 border-b border-neutral-100">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <span className="font-semibold text-neutral-600">Notes</span>
                <p className="mt-1 whitespace-pre-wrap">{result.notes || '—'}</p>
              </div>
              <div>
                <span className="font-semibold text-neutral-600">Scrape error</span>
                <p className="mt-1 text-accent-red whitespace-pre-wrap">{result.error || '—'}</p>
              </div>
              {result.rawContact && (
                <div className="sm:col-span-2">
                  <span className="font-semibold text-neutral-600">Raw extraction</span>
                  <pre className="mt-1 p-2 bg-white border border-neutral-200 rounded text-2xs overflow-auto max-h-40">
                    {JSON.stringify(result.rawContact, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
