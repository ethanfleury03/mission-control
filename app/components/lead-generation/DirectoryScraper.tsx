'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '../../lib/utils';
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
  Copy,
  ClipboardCheck,
  Target,
  X,
  Settings2,
  Table2,
  FileText,
  Activity,
  ShieldCheck,
  Users,
  RefreshCw,
  SlidersHorizontal,
  Link2,
  Minus,
  Plus,
} from 'lucide-react';

import type {
  ScrapeJob,
  CompanyResult,
  ConfidenceScore,
  LogEntry,
  ScrapeFetchMode,
} from '@/lib/directory-scraper/types';
import { fetchMarkets, importScraperToMarket } from '@/lib/lead-generation/api';
import type { Market } from '@/lib/lead-generation/types';

const API = '/api/directory-scraper';
const POLL_PAGE_SIZE = 150;

function mergePollSnapshot(prev: ScrapeJob | null, snap: ScrapeJob): ScrapeJob {
  if (!snap.resultsTruncated) return snap;
  const map = new Map<string, CompanyResult>();
  if (prev?.results?.length) {
    for (const r of prev.results) map.set(r.id, r);
  }
  for (const r of snap.results) {
    const prev = map.get(r.id);
    map.set(r.id, {
      ...prev,
      ...r,
      nameExtractionMeta: r.nameExtractionMeta ?? prev?.nameExtractionMeta,
      websiteDiscoveryMeta: r.websiteDiscoveryMeta ?? prev?.websiteDiscoveryMeta,
    });
  }
  const merged = Array.from(map.values()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return {
    ...snap,
    results: merged,
    resultsTruncated: (snap.resultsTotal ?? merged.length) > merged.length,
    resultsTotal: snap.resultsTotal,
    resultsOffset: 0,
    resultsLimit: snap.resultsLimit,
  };
}

type StatusFilter = 'all' | 'done' | 'failed' | 'pending';
type ScraperWorkspaceTab = 'configure' | 'results' | 'logs';
type FieldFilter =
  | 'all'
  | 'needs_review'
  | 'no_email'
  | 'no_phone'
  | 'no_website'
  | 'high_conf'
  | 'method_jsonld'
  | 'method_table'
  | 'method_repeated'
  | 'method_link'
  | 'method_plain'
  | 'method_detail'
  | 'method_ai';

export function DirectoryScraper() {
  const [url, setUrl] = useState('');
  const [maxCompanies, setMaxCompanies] = useState('');
  const [visitWebsites, setVisitWebsites] = useState(false);
  const [enableAiFallback, setEnableAiFallback] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [scrapeFetchMode, setScrapeFetchMode] = useState<ScrapeFetchMode>('playwright');
  const [paginationEnabled, setPaginationEnabled] = useState(false);
  const [paginationParam, setPaginationParam] = useState('page');
  const [paginationFrom, setPaginationFrom] = useState('1');
  const [paginationTo, setPaginationTo] = useState('');
  const [firecrawlConfigured, setFirecrawlConfigured] = useState(false);
  const [firecrawlHint, setFirecrawlHint] = useState<string | null>(null);
  const [enableSerperDiscovery, setEnableSerperDiscovery] = useState(false);
  const [exportTarget, setExportTarget] = useState<'csv' | 'sheets'>('csv');
  const [sheetId, setSheetId] = useState('');
  const [sheetTab, setSheetTab] = useState('');
  const [sheetsConfigured, setSheetsConfigured] = useState(false);
  const [sheetsHint, setSheetsHint] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportInfo, setExportInfo] = useState<string | null>(null);

  const [job, setJob] = useState<ScrapeJob | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [workspaceTab, setWorkspaceTab] = useState<ScraperWorkspaceTab>('results');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [fieldFilter, setFieldFilter] = useState<FieldFilter>('all');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [isLoadingMoreResults, setIsLoadingMoreResults] = useState(false);

  const [leadGenOpen, setLeadGenOpen] = useState(false);
  const [leadGenMarkets, setLeadGenMarkets] = useState<Market[]>([]);
  const [leadGenMarketId, setLeadGenMarketId] = useState('');
  const [leadGenCountry, setLeadGenCountry] = useState('');
  const [leadGenScope, setLeadGenScope] = useState<'filtered' | 'all'>('filtered');
  const [leadGenLoading, setLeadGenLoading] = useState(false);
  const [leadGenError, setLeadGenError] = useState<string | null>(null);
  const [leadGenSuccess, setLeadGenSuccess] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const jobRef = useRef<ScrapeJob | null>(null);
  jobRef.current = job;

  const autoEnableWebsiteDiscovery =
    paginationEnabled &&
    scrapeFetchMode === 'playwright' &&
    enableAiFallback;
  const effectiveWebsiteDiscovery = enableSerperDiscovery || autoEnableWebsiteDiscovery;

  // Check sheets + AI availability
  useEffect(() => {
    fetch(`${API}/sheets-status`)
      .then((r) => r.json())
      .then((d) => { setSheetsConfigured(d.configured); setSheetsHint(d.hint ?? null); })
      .catch(() => {});
    fetch(`${API}/ai-status`)
      .then((r) => r.json())
      .then((d) => {
        setAiConfigured(d.configured);
        setAiHint(d.hint ?? null);
        setAiModel(d.model ?? null);
        if (d.configured) setEnableAiFallback(true);
      })
      .catch(() => {});
    setFirecrawlConfigured(false);
    setFirecrawlHint('Firecrawl Disabled');
  }, []);

  useEffect(() => {
    if (scrapeFetchMode !== 'playwright') setScrapeFetchMode('playwright');
  }, [scrapeFetchMode]);

  const deleteResultRow = useCallback(async (resultId: string) => {
    const j = jobRef.current;
    if (!j?.id) return;
    try {
      const res = await fetch(`${API}/jobs/${j.id}/results/${resultId}`, { method: 'DELETE' });
      if (!res.ok) return;

      const fullRes = await fetch(`${API}/jobs/${j.id}?full=1`, { cache: 'no-store' });
      if (fullRes.ok) {
        setJob(await fullRes.json());
      } else {
        const snapRes = await fetch(
          `${API}/jobs/${j.id}?resultsLimit=${POLL_PAGE_SIZE}&resultsOffset=0`,
          { cache: 'no-store' },
        );
        if (!snapRes.ok) return;
        const data: ScrapeJob = await snapRes.json();
        setJob((prev) => {
          if (!prev || prev.id !== j.id) return prev;
          if (!data.resultsTruncated) {
            return { ...prev, ...data, results: data.results, summary: data.summary };
          }
          const merged = mergePollSnapshot(prev, data);
          return {
            ...merged,
            summary: data.summary,
            results: merged.results.filter((r) => r.id !== resultId),
          };
        });
      }
      setExpandedRowId((id) => (id === resultId ? null : id));
    } catch {
      /* ignore */
    }
  }, []);

  const pollJob = useCallback(async (id: string) => {
    try {
      const res = await fetch(
        `${API}/jobs/${id}?resultsLimit=${POLL_PAGE_SIZE}&resultsOffset=0`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      let data: ScrapeJob = await res.json();

      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
        const fullRes = await fetch(`${API}/jobs/${id}?full=1`, { cache: 'no-store' });
        if (fullRes.ok) data = await fullRes.json();
        setJob(data);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }

      setJob((prev) => mergePollSnapshot(prev, data));
    } catch {
      /* poll failure is ok */
    }
  }, []);

  const stopWatchingJob = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const startWatchingJob = useCallback((id: string) => {
    stopWatchingJob();
    try {
      const source = new EventSource(`${API}/jobs/${id}/events?resultsLimit=${POLL_PAGE_SIZE}&logsLimit=100`);
      eventSourceRef.current = source;

      source.addEventListener('job', (event) => {
        const data = JSON.parse((event as MessageEvent<string>).data) as ScrapeJob;
        setJob((prev) => mergePollSnapshot(prev, data));
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          stopWatchingJob();
          void pollJob(id);
        }
      });

      source.onerror = () => {
        source.close();
        if (eventSourceRef.current === source) {
          eventSourceRef.current = null;
        }
        if (!pollRef.current) {
          pollRef.current = setInterval(() => pollJob(id), 2500);
          void pollJob(id);
        }
      };
    } catch {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => pollJob(id), 2500);
        void pollJob(id);
      }
    }
  }, [pollJob, stopWatchingJob]);

  useEffect(() => {
    return () => { stopWatchingJob(); };
  }, [stopWatchingJob]);

  useEffect(() => {
    if (showLogs) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [job?.logs.length, showLogs]);

  const startJob = async () => {
    setIsStarting(true);
    try {
      const usePagination =
        paginationEnabled &&
        scrapeFetchMode === 'playwright' &&
        paginationTo.trim() !== '';
      const autoDiscoveryForRequest = usePagination && enableAiFallback;
      const res = await fetch(`${API}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          maxCompanies: maxCompanies ? Number(maxCompanies) : undefined,
          visitCompanyWebsites: visitWebsites,
          enableSerperWebsiteDiscovery: enableSerperDiscovery || autoDiscoveryForRequest,
          enableAiNameFallback: enableAiFallback,
          exportTarget,
          googleSheetId: sheetId,
          googleSheetTab: sheetTab,
          scrapeFetchMode: 'playwright',
          ...(usePagination
            ? {
                paginationQuery: {
                  param: paginationParam.trim() || 'page',
                  from: Math.max(1, parseInt(paginationFrom, 10) || 1),
                  to: parseInt(paginationTo, 10),
                },
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        alert(e.error || 'Failed to start job');
        return;
      }
      const data: ScrapeJob = await res.json();
      setJob({ ...data, meta: data.meta ?? {} });
      setStatusFilter('all');
      setFieldFilter('all');
      setSearchQuery('');
      setExpandedRowId(null);
      setExportError(null);
      setExportInfo(null);
      startWatchingJob(data.id);
    } catch (err: any) {
      alert(err?.message || 'Network error');
    } finally {
      setIsStarting(false);
    }
  };

  const cancelJob = async () => {
    if (!job) return;
    await fetch(`${API}/jobs/${job.id}/cancel`, { method: 'POST' });
    void pollJob(job.id);
  };

  const clearResults = async () => {
    if (!job) return;
    stopWatchingJob();
    await fetch(`${API}/jobs/${job.id}`, { method: 'DELETE' });
    setJob(null);
    setExpandedRowId(null);
    setExportError(null);
    setExportInfo(null);
  };

  const loadMoreResults = useCallback(async () => {
    const j = jobRef.current;
    if (!j?.id || !j.resultsTruncated || isLoadingMoreResults) return;
    setIsLoadingMoreResults(true);
    try {
      const offset = j.results.length;
      const res = await fetch(
        `${API}/jobs/${j.id}?resultsLimit=${POLL_PAGE_SIZE}&resultsOffset=${offset}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const data: ScrapeJob = await res.json();
      setJob((prev) => mergePollSnapshot(prev, data));
    } finally {
      setIsLoadingMoreResults(false);
    }
  }, [isLoadingMoreResults]);

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
    startWatchingJob(job.id);
  };

  const exportCsv = async () => {
    if (!job) return;
    setExportLoading(true);
    setExportError(null);
    setExportInfo(null);
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
      const fullRes = await fetch(`${API}/jobs/${job.id}?full=1`, { cache: 'no-store' });
      if (fullRes.ok) setJob(await fullRes.json());
    } finally {
      setExportLoading(false);
    }
  };

  const exportSheets = async () => {
    if (!job) return;
    setExportLoading(true);
    setExportError(null);
    setExportInfo(null);
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
      if (data.duplicateWarning) setExportInfo(data.duplicateWarning);
      const fullRes = await fetch(`${API}/jobs/${job.id}?full=1`, { cache: 'no-store' });
      if (fullRes.ok) setJob(await fullRes.json());
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
    if (fieldFilter === 'high_conf' && r.nameExtractionMeta?.confidenceLabel !== 'high' && r.confidence !== 'high')
      return false;
    const m = r.nameExtractionMeta?.extractionMethod;
    if (fieldFilter === 'method_jsonld' && m !== 'jsonld') return false;
    if (fieldFilter === 'method_table' && m !== 'table') return false;
    if (fieldFilter === 'method_repeated' && m !== 'repeated-block') return false;
    if (fieldFilter === 'method_link' && m !== 'link-list') return false;
    if (fieldFilter === 'method_plain' && m !== 'plain-text') return false;
    if (fieldFilter === 'method_detail' && m !== 'detail-link') return false;
    if (fieldFilter === 'method_ai' && m !== 'ai-classified') return false;
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

  const allResults = job?.results ?? [];
  const highConfidenceCount = allResults.filter((r) => r.confidence === 'high').length;
  const mediumConfidenceCount = allResults.filter((r) => r.confidence === 'medium').length;
  const lowConfidenceCount = allResults.filter((r) => r.confidence === 'low').length;
  const duplicateCount = allResults.length - new Set(allResults.map((r) => r.companyName.trim().toLowerCase()).filter(Boolean)).size;
  const uniqueRecordCount = Math.max(0, allResults.length - duplicateCount);
  const qualityScore = allResults.length > 0
    ? Math.round(((highConfidenceCount * 1 + mediumConfidenceCount * 0.65 + lowConfidenceCount * 0.25) / allResults.length) * 100)
    : 0;
  const durationLabel = job?.meta?.durationMs != null && job.meta.durationMs >= 0
    ? `${(job.meta.durationMs / 1000).toFixed(1)}s`
    : '—';
  const maxCompanyNumber = Number(maxCompanies);
  const normalizedMaxCompanyCount = Number.isFinite(maxCompanyNumber) && maxCompanyNumber > 0 ? Math.round(maxCompanyNumber) : null;

  const openLeadGenModal = async () => {
    if (!job) return;
    setLeadGenError(null);
    setLeadGenSuccess(null);
    setLeadGenOpen(true);
    setLeadGenMarketId('');
    try {
      const markets = await fetchMarkets();
      setLeadGenMarkets(markets);
      if (markets.length) setLeadGenMarketId(markets[0].id);
    } catch (e) {
      setLeadGenError(e instanceof Error ? e.message : 'Could not load Lead Gen markets');
    }
  };

  const importToLeadGen = async () => {
    if (!job || !leadGenMarketId) return;
    setLeadGenLoading(true);
    setLeadGenError(null);
    setLeadGenSuccess(null);
    try {
      let resultIds: string[] | undefined;
      if (leadGenScope === 'filtered') {
        const ids = filteredResults.map((r) => r.id);
        if (ids.length === 0) {
          setLeadGenError('No rows match the current table filters. Clear filters or choose “All job results”.');
          return;
        }
        resultIds = ids;
      }
      const out = await importScraperToMarket({
        jobId: job.id,
        marketId: leadGenMarketId,
        resultIds,
        defaultCountry: leadGenCountry.trim() || undefined,
        skipDuplicates: true,
      });
      setLeadGenSuccess(
        `Imported ${out.created} new, updated ${out.updated ?? 0} existing${out.skipped ? `, skipped ${out.skipped}` : ''}${out.conflicts ? `, flagged ${out.conflicts} conflict${out.conflicts === 1 ? '' : 's'} for review` : ''}. Open Lead Generation → a market to review.`,
      );
      if (out.errors?.length) setLeadGenError(out.errors.slice(0, 5).join('; '));
    } catch (e) {
      setLeadGenError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setLeadGenLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#f6f6f7] overflow-hidden">
      <div className="shrink-0 border-b border-neutral-200 bg-white px-6 py-4">
        <div className="flex items-end gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-neutral-900">Lead Generation</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-950">Directory Scraper</h1>
          </div>
          <div className="mb-1 h-5 w-px bg-neutral-200" />
          <p className="mb-1 text-sm text-neutral-500">Extract companies and contacts from directory websites</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {exportError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start justify-between gap-3">
            <span>{exportError}</span>
            <button type="button" className="text-red-600 hover:text-red-900 shrink-0" onClick={() => setExportError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        {exportInfo && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start justify-between gap-3">
            <span>{exportInfo}</span>
            <button type="button" className="text-amber-700 hover:text-amber-950 shrink-0" onClick={() => setExportInfo(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="grid grid-cols-1 divide-y divide-neutral-200 xl:grid-cols-[minmax(280px,1fr)_244px_220px_260px_160px_180px] xl:divide-x xl:divide-y-0">
            <div className="p-4">
              <label className="mb-2 block text-xs font-semibold text-neutral-700">Directory URL</label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/members"
                  disabled={isRunning}
                  className="h-11 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/15 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="p-4">
              <p className="mb-2 text-xs font-semibold text-neutral-700">Scrape mode</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScrapeFetchMode('playwright')}
                  disabled={isRunning}
                  className={cn('inline-flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors disabled:opacity-50',
                    scrapeFetchMode === 'playwright' ? 'border-brand/20 bg-brand/5 text-neutral-950' : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-white')}
                >
                  <Target className={cn('h-4 w-4', scrapeFetchMode === 'playwright' ? 'text-brand' : 'text-neutral-400')} />
                  Playwright
                </button>
                <button
                  type="button"
                  title="Firecrawl Disabled"
                  disabled
                  className={cn('inline-flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors disabled:opacity-50',
                    scrapeFetchMode === 'firecrawl' ? 'border-brand/20 bg-brand/5 text-neutral-950' : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-white')}
                >
                  <FileText className={cn('h-4 w-4', scrapeFetchMode === 'firecrawl' ? 'text-brand' : 'text-neutral-400')} />
                  Firecrawl
                </button>
              </div>
            </div>

            <div className="p-4">
              <label className="mb-2 block text-xs font-semibold text-neutral-700">Max companies</label>
              <div className="grid h-11 grid-cols-[40px_minmax(72px,1fr)_40px] overflow-hidden rounded-md border border-neutral-200 bg-white">
                <button
                  type="button"
                  disabled={isRunning || !normalizedMaxCompanyCount}
                  onClick={() => setMaxCompanies(String(Math.max(1, (normalizedMaxCompanyCount ?? 1) - 50)))}
                  className="inline-flex items-center justify-center border-r border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
                  aria-label="Decrease max companies"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  value={maxCompanies}
                  onChange={(e) => setMaxCompanies(e.target.value)}
                  placeholder="All"
                  min={1}
                  disabled={isRunning}
                  className="h-full w-full border-0 bg-white px-2 text-center text-sm text-neutral-900 placeholder:text-neutral-400 outline-none"
                />
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => setMaxCompanies(String((normalizedMaxCompanyCount ?? 0) + 50 || 50))}
                  className="inline-flex items-center justify-center border-l border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
                  aria-label="Increase max companies"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-4">
              <p className="mb-2 text-xs font-semibold text-neutral-700">AI extraction</p>
              <div className="flex h-11 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEnableAiFallback(!enableAiFallback)}
                  disabled={isRunning || !aiConfigured}
                  className={cn('relative h-6 w-11 rounded-full transition-colors disabled:opacity-40',
                    enableAiFallback ? 'bg-brand' : 'bg-neutral-200')}
                  aria-pressed={enableAiFallback}
                  aria-label="Toggle AI extraction"
                >
                  <span className={cn('absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                    enableAiFallback ? 'left-6' : 'left-1')} />
                </button>
                <span className={cn('truncate text-sm', aiConfigured ? 'text-neutral-700' : 'text-neutral-400')}>
                  {aiModel ?? 'OPENROUTER_API_KEY'}
                </span>
              </div>
            </div>

            <div className="p-4">
              <label className="mb-2 block text-xs font-semibold text-neutral-700">Export</label>
              <select
                value={exportTarget}
                onChange={(e) => setExportTarget(e.target.value as 'csv' | 'sheets')}
                disabled={isRunning}
                className="h-11 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/15 disabled:opacity-50"
              >
                <option value="csv">CSV</option>
                <option value="sheets">Sheets</option>
              </select>
            </div>

            <div className="flex items-end p-4">
              {!isRunning ? (
                <button
                  type="button"
                  onClick={startJob}
                  disabled={isStarting || !url.trim()}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Start scrape
                </button>
              ) : (
                <button
                  type="button"
                  onClick={cancelJob}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent-red px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-red/90"
                >
                  <Square className="h-4 w-4" />
                  Cancel
                </button>
              )}
            </div>

            <div className="border-t border-neutral-200 p-4 xl:col-span-6">
              <div className="flex flex-wrap items-center gap-3">
                <CompactToggle
                  label="Page range"
                  checked={paginationEnabled}
                  disabled={isRunning}
                  onChange={setPaginationEnabled}
                />
                <CompactToggle
                  label="Enrich sites"
                  checked={visitWebsites}
                  disabled={isRunning}
                  onChange={setVisitWebsites}
                />
                <CompactToggle
                  label="Find homepages"
                  checked={effectiveWebsiteDiscovery}
                  disabled={isRunning || autoEnableWebsiteDiscovery}
                  onChange={setEnableSerperDiscovery}
                />
                {paginationEnabled && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-2">
                    <input
                      type="text"
                      value={paginationParam}
                      onChange={(e) => setPaginationParam(e.target.value)}
                      placeholder="param"
                      disabled={isRunning}
                      className="h-8 w-24 rounded border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-brand/40"
                    />
                    <input
                      type="number"
                      min={1}
                      value={paginationFrom}
                      onChange={(e) => setPaginationFrom(e.target.value)}
                      placeholder="from"
                      disabled={isRunning}
                      className="h-8 w-20 rounded border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-brand/40"
                    />
                    <input
                      type="number"
                      min={1}
                      value={paginationTo}
                      onChange={(e) => setPaginationTo(e.target.value)}
                      placeholder="to"
                      disabled={isRunning}
                      className="h-8 w-20 rounded border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-brand/40"
                    />
                  </div>
                )}
                {exportTarget === 'sheets' && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-2">
                    <input
                      type="text"
                      value={sheetId}
                      onChange={(e) => setSheetId(e.target.value)}
                      placeholder="Sheet ID"
                      disabled={isRunning}
                      className="h-8 w-56 rounded border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-brand/40"
                    />
                    <input
                      type="text"
                      value={sheetTab}
                      onChange={(e) => setSheetTab(e.target.value)}
                      placeholder="Tab"
                      disabled={isRunning}
                      className="h-8 w-36 rounded border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-brand/40"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_312px]">
          <div className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4">
                <div className="flex items-center gap-1">
                  {([
                    ['results', Table2, 'Results'],
                    ['logs', FileText, 'Logs'],
                  ] as const).map(([tab, Icon, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        setWorkspaceTab(tab);
                        if (tab === 'logs') setShowLogs(true);
                      }}
                      className={cn('relative inline-flex h-14 items-center gap-2 px-3 text-sm font-semibold transition-colors',
                        workspaceTab === tab ? 'text-brand' : 'text-neutral-600 hover:text-neutral-950')}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                      {tab === 'results' && <span className="ml-1 text-xs font-medium text-neutral-500">{filteredResults.length}</span>}
                      {workspaceTab === tab && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" />}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 py-3">
                  <span className="text-xs text-neutral-500">{filteredResults.length} result{filteredResults.length === 1 ? '' : 's'}</span>
                  <button
                    type="button"
                    onClick={() => job?.id && void pollJob(job.id)}
                    disabled={!job}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => setFieldFilter(fieldFilter === 'all' ? 'needs_review' : 'all')}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filters
                  </button>
                </div>
              </div>
            </div>

        {/* Config form */}
        {workspaceTab === 'configure' && (
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
                  checked={paginationEnabled}
                  onChange={(e) => setPaginationEnabled(e.target.checked)}
                  disabled={isRunning || scrapeFetchMode !== 'playwright'}
                  className="rounded border-neutral-300 text-brand focus:ring-brand/30 accent-brand"
                />
                <span className={scrapeFetchMode === 'playwright' ? '' : 'text-neutral-400'}>
                  Scrape a page range by query param
                </span>
              </label>
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
                  checked={effectiveWebsiteDiscovery}
                  onChange={(e) => setEnableSerperDiscovery(e.target.checked)}
                  disabled={isRunning || autoEnableWebsiteDiscovery}
                  className="rounded border-neutral-300 text-brand focus:ring-brand/30 accent-brand"
                />
                Find company websites from member detail pages
              </label>
              {autoEnableWebsiteDiscovery && (
                <p className="text-2xs text-neutral-500 leading-relaxed ml-6">
                  Automatic in paginated AI mode. We save company rows first, then resolve homepages in a second phase so
                  website URLs can fill in while the job keeps running.
                </p>
              )}
              {!autoEnableWebsiteDiscovery && (
                <p className="text-2xs text-neutral-500 leading-relaxed ml-6">
                  Opens each saved member-detail page directly and extracts the company homepage from the page itself.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableAiFallback}
                  onChange={(e) => setEnableAiFallback(e.target.checked)}
                  disabled={isRunning || !aiConfigured}
                  className="rounded border-neutral-300 text-brand focus:ring-brand/30 accent-brand"
                />
                <span className={aiConfigured ? '' : 'text-neutral-400'}>
                  AI extraction {aiConfigured && aiModel ? `(${aiModel})` : '(requires OPENROUTER_API_KEY)'}
                </span>
              </label>
              {!aiConfigured && aiHint && (
                <p className="text-2xs text-neutral-500 leading-relaxed ml-6">{aiHint}</p>
              )}
              {aiConfigured && paginationEnabled && scrapeFetchMode === 'playwright' && (
                <p className="text-2xs text-neutral-500 leading-relaxed ml-6">
                  Paginated Playwright runs use one grounded AI extraction pass per page, using visible text plus page links.
                  Member/profile URLs are captured during extraction, then homepage discovery runs after rows are saved.
                </p>
              )}
            </div>

            {paginationEnabled && scrapeFetchMode === 'playwright' && (
              <div className="lg:col-span-3 border border-neutral-100 rounded-md p-3 bg-neutral-50/50">
                <span className="block text-xs font-medium text-neutral-600 mb-2">Pagination query</span>
                <p className="text-2xs text-neutral-500 mb-3">
                  Loads the same directory URL repeatedly while changing one query parameter, for example
                  <code className="mx-1 text-2xs">page=1</code>
                  through
                  <code className="mx-1 text-2xs">page=595</code>.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Parameter</label>
                    <input
                      type="text"
                      value={paginationParam}
                      onChange={(e) => setPaginationParam(e.target.value)}
                      placeholder="page"
                      disabled={isRunning}
                      className="w-full h-9 px-3 text-sm bg-white border border-neutral-200 rounded-md text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/40 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">From</label>
                    <input
                      type="number"
                      min={1}
                      value={paginationFrom}
                      onChange={(e) => setPaginationFrom(e.target.value)}
                      placeholder="1"
                      disabled={isRunning}
                      className="w-full h-9 px-3 text-sm bg-white border border-neutral-200 rounded-md text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/40 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">To</label>
                    <input
                      type="number"
                      min={1}
                      value={paginationTo}
                      onChange={(e) => setPaginationTo(e.target.value)}
                      placeholder="595"
                      disabled={isRunning}
                      className="w-full h-9 px-3 text-sm bg-white border border-neutral-200 rounded-md text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/40 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Fetch mode: Playwright vs Firecrawl */}
            <div className="lg:col-span-3 border border-neutral-100 rounded-md p-3 bg-neutral-50/50">
              <span className="block text-xs font-medium text-neutral-600 mb-2">How to load the page</span>
              <div className="flex flex-col gap-2 text-sm text-neutral-800">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="fetchMode"
                    checked={scrapeFetchMode === 'playwright'}
                    onChange={() => setScrapeFetchMode('playwright')}
                    disabled={isRunning}
                    className="mt-0.5 accent-brand"
                  />
                  <span>
                    <span className="font-medium">Playwright</span>
                    <span className="text-neutral-600 text-2xs block">
                      Local Chromium — scroll, load-more, iframes. Requires <code className="text-2xs">npx playwright install chromium</code>.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="fetchMode"
                    checked={scrapeFetchMode === 'firecrawl'}
                    onChange={() => setScrapeFetchMode('firecrawl')}
                    disabled={isRunning || !firecrawlConfigured}
                    className="mt-0.5 accent-brand"
                  />
                  <span className={!firecrawlConfigured ? 'text-neutral-400' : ''}>
                    <span className="font-medium">Firecrawl</span>
                    <span className="text-neutral-600 text-2xs block">
                      Firecrawl API — clean markdown / main content, no local browser for Phase 1. Follow-up roster URLs also use Firecrawl.
                    </span>
                  </span>
                </label>
                {!firecrawlConfigured && firecrawlHint && (
                  <p className="text-2xs text-neutral-500 ml-6">{firecrawlHint}</p>
                )}
              </div>
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
                disabled={isStarting || !url.trim()}
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
            {job && !isRunning && (
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
                <button
                  type="button"
                  onClick={openLeadGenModal}
                  disabled={exportLoading || (job.results?.length ?? 0) === 0}
                  className="inline-flex items-center gap-2 px-3 py-2 border border-brand/40 bg-brand/5 text-brand hover:bg-brand/10 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                  title="Send scrape results to Lead Generation market database"
                >
                  <Target className="w-4 h-4" /> Send to Lead Gen
                </button>
              </>
            )}
          </div>
        </div>
        )}

        {workspaceTab === 'logs' && (
          <div className="min-h-[520px] rounded-lg border border-neutral-800 bg-neutral-950 p-4 font-mono text-xs text-neutral-200 shadow-sm">
            {job?.logs.length ? (
              <div className="space-y-1">
                {job.logs.map((log, i) => <LogLine key={i} log={log} />)}
                <div ref={logsEndRef} />
              </div>
            ) : (
              <div className="flex h-80 items-center justify-center text-neutral-500">No logs yet</div>
            )}
          </div>
        )}

        {workspaceTab === 'results' && (
        <>
        {!job && (
          <div className="bg-white rounded-lg border border-dashed border-neutral-300 p-8 text-center">
            <Building2 className="w-8 h-8 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-neutral-900">No jobs yet</p>
            <p className="text-xs text-neutral-500 mt-1">
              Start a scrape to queue a background worker job and stream progress here.
            </p>
          </div>
        )}

        {/* Progress panel */}
        {job && (
          <div className="bg-white rounded-lg border border-hub-border p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-neutral-900 flex items-center gap-2 flex-wrap">
                {isRunning ? <Loader2 className="w-4 h-4 text-brand animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-accent-green" />}
                Job: {job.id.slice(0, 8)} — <StatusBadge status={job.status} />
                {job.status === 'completed' && <span className="text-2xs px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-800">Completed</span>}
                {job.status === 'cancelled' && <span className="text-2xs px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-900">Cancelled</span>}
                {(job.meta?.sheetsExportCount ?? 0) > 0 && (
                  <span className="text-2xs px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 inline-flex items-center gap-1">
                    <ClipboardCheck className="w-3 h-3" /> Sheets ×{job.meta.sheetsExportCount}
                  </span>
                )}
                {(job.meta?.csvExportCount ?? 0) > 0 && (
                  <span className="text-2xs px-2 py-0.5 rounded border border-neutral-200 bg-neutral-50 text-neutral-700">
                    CSV ×{job.meta.csvExportCount}
                  </span>
                )}
              </h2>
              {job.startedAt && (
                <span className="text-2xs text-neutral-500">
                  Started {new Date(job.startedAt).toLocaleTimeString()}
                  {job.finishedAt && ` — Finished ${new Date(job.finishedAt).toLocaleTimeString()}`}
                  {job.meta?.durationMs != null && job.meta.durationMs >= 0 && (
                    <> — Duration {(job.meta.durationMs / 1000).toFixed(1)}s</>
                  )}
                </span>
              )}
            </div>

            <div className="mb-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-700 mb-2">
                <span className="font-medium capitalize">Phase: {job.phase.replace(/_/g, ' ')}</span>
                <span className="text-neutral-400">•</span>
                <span>Attempt {job.attemptCount} / {job.maxAttempts}</span>
                {job.heartbeatAt && (
                  <>
                    <span className="text-neutral-400">•</span>
                    <span>Heartbeat {new Date(job.heartbeatAt).toLocaleTimeString()}</span>
                  </>
                )}
                {job.nextRetryAt && (
                  <>
                    <span className="text-neutral-400">•</span>
                    <span>Retry at {new Date(job.nextRetryAt).toLocaleTimeString()}</span>
                  </>
                )}
                {job.errorCode && (
                  <>
                    <span className="text-neutral-400">•</span>
                    <span className="font-mono text-2xs text-red-700">{job.errorCode}</span>
                  </>
                )}
              </div>
              <div className="h-2 rounded-full bg-neutral-200 overflow-hidden">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${Math.max(4, job.progress?.percentage ?? 0)}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-2xs text-neutral-600">
                <span>{job.progress?.message ?? 'Waiting for worker progress...'}</span>
                <span>
                  {job.progress?.current ?? 0}/{job.progress?.total ?? 0} phase steps
                  {' • '}
                  {job.summary.companiesProcessed}/{job.summary.companiesFound} companies processed
                </span>
              </div>
              {job.progress?.currentCompanyName && (
                <p className="mt-1 text-2xs text-neutral-500">
                  Working on <span className="font-medium text-neutral-700">{job.progress.currentCompanyName}</span>
                </p>
              )}
              {job.errorMessage && (
                <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-2xs text-red-800">
                  {job.errorMessage}
                </p>
              )}
            </div>

            {job.meta?.nameExtractionDebug && (
              <details className="mb-3 text-2xs border border-neutral-200 rounded-md bg-white">
                <summary className="cursor-pointer px-3 py-2 font-medium text-neutral-800 bg-neutral-50">
                  Name extraction debug
                  {job.meta.nameExtractionDebug.aiFallbackUsed && (
                    <span className="ml-2 text-violet-700">· AI used</span>
                  )}
                </summary>
                <div className="px-3 py-2 space-y-2 text-neutral-700 border-t border-neutral-100">
                  <p>
                    <span className="font-medium">Final URL:</span> {job.meta.nameExtractionDebug.finalUrl}
                    {job.meta.nameExtractionDebug.fetchEngine && (
                      <span className="ml-2 text-neutral-500">
                        · Fetch: <span className="font-medium">{job.meta.nameExtractionDebug.fetchEngine}</span>
                      </span>
                    )}
                  </p>
                  {job.meta.nameExtractionDebug.pageTitle && (
                    <p>
                      <span className="font-medium">Title:</span> {job.meta.nameExtractionDebug.pageTitle}
                    </p>
                  )}
                  <p>
                    <span className="font-medium">Strategies (raw counts):</span>{' '}
                    {Object.entries(job.meta.nameExtractionDebug.strategyCounts || {})
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ') || '—'}
                  </p>
                  <p>
                    <span className="font-medium">Iframes scanned:</span> {job.meta.nameExtractionDebug.iframeCount ?? 0}{' '}
                    · <span className="font-medium">Load-more clicks:</span>{' '}
                    {job.meta.nameExtractionDebug.loadMoreClicks ?? 0}
                  </p>
                  {job.meta.nameExtractionDebug.aiLocateSummary && (
                    <p>
                      <span className="font-medium">Two-pass AI:</span> pass 1 found{' '}
                      {job.meta.nameExtractionDebug.aiLocateSummary.rosterUrlsFound} roster URL(s),{' '}
                      {job.meta.nameExtractionDebug.aiLocateSummary.textSpansFound} text span(s); fetched{' '}
                      {job.meta.nameExtractionDebug.aiLocateSummary.extraPagesFetched} extra page(s); pass 2 ran{' '}
                      {job.meta.nameExtractionDebug.aiLocateSummary.extractChunks} chunk(s).
                    </p>
                  )}
                  {job.meta.nameExtractionDebug.zeroResultExplanation && (
                    <p className="text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                      <span className="font-medium">Zero rows:</span> {job.meta.nameExtractionDebug.zeroResultExplanation}
                    </p>
                  )}
                  {job.meta.nameExtractionDebug.pageDiagnosis && (
                    <p className="text-sky-800 bg-sky-50 border border-sky-100 rounded px-2 py-1.5">
                      <span className="font-medium">Empty-page diagnosis:</span>{' '}
                      {job.meta.nameExtractionDebug.pageDiagnosis.kind} · {job.meta.nameExtractionDebug.pageDiagnosis.detail}
                      {job.meta.nameExtractionDebug.pageDiagnosis.httpStatus != null && (
                        <span>
                          {' '}
                          · HTTP {job.meta.nameExtractionDebug.pageDiagnosis.httpStatus}
                        </span>
                      )}
                      {job.meta.nameExtractionDebug.pageDiagnosis.httpItemCount != null && (
                        <span>
                          {' '}
                          · direct HTML items {job.meta.nameExtractionDebug.pageDiagnosis.httpItemCount}
                        </span>
                      )}
                    </p>
                  )}
                  {job.meta.nameExtractionDebug.topContainers?.length > 0 && (
                    <div>
                      <span className="font-medium block mb-1">Top containers</span>
                      <ul className="list-disc pl-4 space-y-1 max-h-32 overflow-auto">
                        {job.meta.nameExtractionDebug.topContainers.map((c, i) => (
                          <li key={i}>
                            <span className="font-mono text-2xs">{c.selectorPath}</span> (score {c.score}, links{' '}
                            {c.linkCount})
                            {c.keywordHits?.length ? ` · ${c.keywordHits.slice(0, 3).join(', ')}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            )}

            {job.meta?.websiteDiscoverySummary && (
              <div className="mb-3 text-2xs border border-emerald-100 rounded-md bg-emerald-50/60 px-3 py-2 text-emerald-900">
                <span className="font-medium">Website discovery:</span> attempted{' '}
                {job.meta.websiteDiscoverySummary.attempted}, detail page{' '}
                {job.meta.websiteDiscoverySummary.resolvedDetailPage ?? 0}, domain guess{' '}
                {job.meta.websiteDiscoverySummary.resolvedDomainGuess}, Serper{' '}
                {job.meta.websiteDiscoverySummary.resolvedSerper}, unresolved{' '}
                {job.meta.websiteDiscoverySummary.unresolved}
                {job.meta.websiteDiscoverySummary.skippedAlreadyHadUrl > 0 && (
                  <span className="text-emerald-800">
                    {' '}
                    · skipped (already had URL) {job.meta.websiteDiscoverySummary.skippedAlreadyHadUrl}
                  </span>
                )}
              </div>
            )}

            {(job.meta?.lastProcessedCompanyName || job.meta?.lastError || job.meta?.sheetsExportNote) && (
              <div className="mb-3 text-2xs text-neutral-600 space-y-1 border border-neutral-100 rounded-md p-3 bg-neutral-50/80">
                {job.meta.lastProcessedCompanyName && isRunning && (
                  <p>
                    <span className="font-medium text-neutral-700">Last processed:</span> {job.meta.lastProcessedCompanyName}
                  </p>
                )}
                {job.meta.lastError && (
                  <p className="text-red-700">
                    <span className="font-medium">Last error:</span> {job.meta.lastError}
                  </p>
                )}
                {job.meta.sheetsExportNote && (
                  <p className="text-neutral-700">
                    <span className="font-medium">Export note:</span> {job.meta.sheetsExportNote}
                  </p>
                )}
              </div>
            )}

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
        {job && job.results.length === 0 && isRunning && (
          <div className="bg-white rounded-lg border border-hub-border p-8 text-center text-sm text-neutral-500">
            <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-3" />
            Extracting company names… Results will appear here shortly.
          </div>
        )}
        {job && job.results.length === 0 && !isRunning && job.status === 'completed' && (
          <div className="bg-white rounded-lg border border-amber-200 p-6 text-sm text-neutral-700">
            <p className="font-medium text-amber-900 mb-2">No company names extracted</p>
            <p className="text-neutral-600 mb-2">
              Open <span className="font-medium">Name extraction debug</span> above for strategy counts and likely causes
              (containers, JS-only content, filters).
            </p>
            {job.meta?.nameExtractionDebug?.zeroResultExplanation && (
              <p className="text-2xs text-amber-900 bg-amber-50 border border-amber-100 rounded px-2 py-2">
                {job.meta.nameExtractionDebug.zeroResultExplanation}
              </p>
            )}
          </div>
        )}
        {job && job.results.length > 0 && (
          <div className="bg-white rounded-lg border border-hub-border shadow-sm overflow-hidden">
            {/* Table controls */}
            <div className="px-5 py-3 border-b border-neutral-100 flex items-center gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-neutral-900">
                Results ({filteredResults.length}
                {job.resultsTruncated && job.resultsTotal != null ? ` of ${job.resultsTotal} loaded` : ''})
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
                    ['high_conf', 'High conf'],
                    ['needs_review', 'Needs review'],
                    ['method_jsonld', 'JSON-LD'],
                    ['method_table', 'Table'],
                    ['method_repeated', 'Blocks'],
                    ['method_link', 'Links'],
                    ['method_plain', 'Plain'],
                    ['method_detail', 'Detail URL'],
                    ['method_ai', 'AI'],
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
                    <th className="px-4 py-2.5 font-medium">Method</th>
                    <th className="px-4 py-2.5 font-medium">Confidence</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Notes</th>
                    <th className="px-2 py-2.5 w-10 font-medium" aria-label="Delete row" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                                   {filteredResults.map((r) => (
                    <ResultRow
                      key={r.id}
                      result={r}
                      expanded={expandedRowId === r.id}
                      onToggle={() => setExpandedRowId((id) => (id === r.id ? null : r.id))}
                      onDelete={deleteResultRow}
                    />
                  ))}
                  {filteredResults.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-neutral-500">
                        No rows match the current filters or search. Clear filters or try different keywords.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {job.resultsTruncated && job.resultsTotal != null && (
              <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between gap-3">
                <p className="text-2xs text-neutral-600">
                  Loaded {job.results.length} of {job.resultsTotal} rows. Load more rows on demand to keep the live job view responsive.
                </p>
                <button
                  type="button"
                  onClick={() => void loadMoreResults()}
                  disabled={isLoadingMoreResults}
                  className="px-3 py-1.5 text-2xs rounded-md border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  {isLoadingMoreResults && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
        </>
        )}
          </div>

          <aside className="space-y-4">
            <RailCard title="Run health" icon={Activity} status={job?.status ?? 'Idle'} statusTone={isRunning ? 'active' : job?.status === 'failed' ? 'danger' : 'idle'}>
              <MetricRow label="Last run" value={job?.startedAt ? new Date(job.startedAt).toLocaleTimeString() : '—'} />
              <MetricRow label="Duration" value={durationLabel} />
              <MetricRow label="Companies" value={job?.summary.companiesFound ?? 0} />
              <MetricRow label="Contacts" value={(job?.summary.emailsFound ?? 0) + (job?.summary.phonesFound ?? 0)} />
              {job?.progress && (
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full bg-brand transition-all" style={{ width: `${Math.max(4, job.progress.percentage ?? 0)}%` }} />
                  </div>
                  <p className="mt-2 truncate text-xs text-neutral-500">{job.progress.message ?? 'Working...'}</p>
                </div>
              )}
            </RailCard>

            <RailCard title="Data quality" icon={ShieldCheck}>
              <MetricRow label="High confidence" value={allResults.length ? highConfidenceCount : '—'} />
              <MetricRow label="Medium confidence" value={allResults.length ? mediumConfidenceCount : '—'} />
              <MetricRow label="Low confidence" value={allResults.length ? lowConfidenceCount : '—'} />
              <MetricRow label="Overall score" value={allResults.length ? `${qualityScore}%` : '—'} />
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full bg-brand transition-all" style={{ width: `${allResults.length ? qualityScore : 0}%` }} />
              </div>
            </RailCard>

            <RailCard title="Dedupe" icon={Users}>
              <MetricRow label="Duplicates found" value={allResults.length ? duplicateCount : '—'} />
              <MetricRow label="Deduped" value={job?.meta?.sheetsExportCount || job?.meta?.csvExportCount ? duplicateCount : '—'} />
              <MetricRow label="Unique records" value={allResults.length ? uniqueRecordCount : '—'} />
            </RailCard>

            <RailCard title="Lead Gen import" icon={Target}>
              <MetricRow label="Status" value={leadGenSuccess ? 'Imported' : job?.results.length ? 'Ready' : 'Not ready'} />
              <MetricRow label="Rows" value={filteredResults.length} />
              <MetricRow label="Market" value={leadGenMarketId ? 'Selected' : '—'} />
              <button
                type="button"
                onClick={openLeadGenModal}
                disabled={!job || (job.results?.length ?? 0) === 0}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 text-sm font-semibold text-brand hover:bg-brand/10 disabled:opacity-50"
              >
                <Target className="h-4 w-4" />
                Send to Lead Gen
              </button>
            </RailCard>
          </aside>
        </div>
      </div>

      {leadGenOpen && job && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal>
          <div className="bg-white rounded-lg border border-hub-border shadow-xl max-w-md w-full p-5 relative">
            <button
              type="button"
              onClick={() => setLeadGenOpen(false)}
              className="absolute top-3 right-3 p-1 rounded-md text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="text-sm font-semibold text-neutral-900 pr-8 flex items-center gap-2">
              <Target className="h-4 w-4 text-brand" />
              Send to Lead Generation
            </h2>
            <p className="text-2xs text-neutral-500 mt-1 mb-4">
              Create or update company accounts in a market database from this job&apos;s results. Existing records keep populated fields, blank fields can be filled, and conflicts are flagged for review.
            </p>

            {leadGenError && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-2xs text-red-800">{leadGenError}</div>
            )}
            {leadGenSuccess && (
              <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-2xs text-green-800">{leadGenSuccess}</div>
            )}

            <label className="block text-2xs font-medium text-neutral-600 mb-1">Market database</label>
            <select
              value={leadGenMarketId}
              onChange={(e) => setLeadGenMarketId(e.target.value)}
              className="w-full h-9 px-2 mb-3 text-sm border border-neutral-200 rounded-md"
            >
              {leadGenMarkets.length === 0 && <option value="">— No markets (check API / DB) —</option>}
              {leadGenMarkets.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            <label className="block text-2xs font-medium text-neutral-600 mb-1">Default country (optional)</label>
            <input
              value={leadGenCountry}
              onChange={(e) => setLeadGenCountry(e.target.value)}
              placeholder="e.g. Canada"
              className="w-full h-9 px-2 mb-3 text-sm border border-neutral-200 rounded-md"
            />

            <fieldset className="mb-4">
              <legend className="text-2xs font-medium text-neutral-600 mb-2">Rows to import</legend>
              <label className="flex items-center gap-2 text-xs text-neutral-700 mb-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="leadgen-scope"
                  checked={leadGenScope === 'filtered'}
                  onChange={() => setLeadGenScope('filtered')}
                />
                Current table view ({filteredResults.length} row{filteredResults.length !== 1 ? 's' : ''}) — respects filters &amp; search
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                <input
                  type="radio"
                  name="leadgen-scope"
                  checked={leadGenScope === 'all'}
                  onChange={() => setLeadGenScope('all')}
                />
                All job results ({job.results?.filter((r) => r.status !== 'failed').length ?? 0} non-failed)
              </label>
            </fieldset>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setLeadGenOpen(false)}
                className="px-3 py-1.5 text-xs border border-neutral-200 rounded-md"
              >
                Close
              </button>
              <button
                type="button"
                onClick={importToLeadGen}
                disabled={leadGenLoading || !leadGenMarketId}
                className="px-3 py-1.5 text-xs bg-brand text-white rounded-md disabled:opacity-50 inline-flex items-center gap-1"
              >
                {leadGenLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Import
              </button>
            </div>
          </div>
        </div>
      )}
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

function CompactToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors disabled:opacity-45',
        checked ? 'border-brand/20 bg-brand/5 text-brand' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50',
      )}
      aria-pressed={checked}
    >
      <span className={cn('h-2 w-2 rounded-full', checked ? 'bg-brand' : 'bg-neutral-300')} />
      {label}
    </button>
  );
}

function RailCard({
  title,
  icon: Icon,
  status,
  statusTone = 'idle',
  children,
}: {
  title: string;
  icon: any;
  status?: string;
  statusTone?: 'idle' | 'active' | 'danger';
  children: React.ReactNode;
}) {
  const dotClass =
    statusTone === 'active' ? 'bg-emerald-500' : statusTone === 'danger' ? 'bg-red-500' : 'bg-neutral-300';
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-950">
          <Icon className="h-4 w-4 text-neutral-700" />
          {title}
        </h3>
        {status ? (
          <span className="inline-flex items-center gap-2 text-xs font-medium capitalize text-neutral-600">
            <span className={cn('h-2 w-2 rounded-full', dotClass)} />
            {status}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-neutral-600">{label}</span>
      <span className="font-medium text-neutral-950">{value}</span>
    </div>
  );
}

function LogLine({ log }: { log: LogEntry }) {
  const colors = { info: 'text-neutral-600', warn: 'text-amber-600', error: 'text-red-600' };
  return (
    <div className={cn('leading-snug', colors[log.level])}>
      <span className="text-neutral-400">{new Date(log.timestamp).toLocaleTimeString()}</span>{' '}
      <span className="font-medium uppercase">[{log.level}]</span>
      {log.phase && <span className="ml-1 font-mono text-[10px] uppercase text-neutral-400">{log.phase}</span>}
      {log.eventCode && <span className="ml-1 font-mono text-[10px] uppercase text-neutral-400">{log.eventCode}</span>}{' '}
      {log.message}
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
  onDelete,
}: {
  result: CompanyResult;
  expanded: boolean;
  onToggle: () => void;
  onDelete: (resultId: string) => void;
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
      <td className="px-4 py-2.5 max-w-[100px]">
        <span className="text-2xs text-neutral-600 font-mono truncate block" title={result.nameExtractionMeta?.extractionMethod}>
          {result.nameExtractionMeta?.extractionMethod ?? '—'}
        </span>
      </td>
      <td className="px-4 py-2.5"><ConfidenceBadge score={result.confidence} /></td>
      <td className="px-4 py-2.5"><StatusBadge status={result.status} /></td>
      <td className="px-4 py-2.5 max-w-[180px]">
        <span className="truncate block text-neutral-600" title={result.notes || result.error}>{result.notes || result.error || '—'}</span>
      </td>
      <td className="px-2 py-2.5 align-top">
        <button
          type="button"
          onClick={() => onDelete(result.id)}
          className="p-1.5 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Delete row"
          aria-label={`Delete ${result.companyName || 'row'}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
      {expanded && (
        <tr className="bg-neutral-50/80">
          <td colSpan={12} className="px-4 py-3 text-2xs text-neutral-700 border-b border-neutral-100">
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                onClick={() => {
                  const t = [result.notes, result.error].filter(Boolean).join('\n\n');
                  void navigator.clipboard.writeText(t || '—');
                }}
                className="inline-flex items-center gap-1 px-2 py-1 text-2xs rounded border border-neutral-200 bg-white hover:bg-neutral-50"
              >
                <Copy className="w-3 h-3" /> Copy notes &amp; error
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(JSON.stringify({ ...result, rawContact: result.rawContact }, null, 2));
                }}
                className="inline-flex items-center gap-1 px-2 py-1 text-2xs rounded border border-neutral-200 bg-white hover:bg-neutral-50"
              >
                <Copy className="w-3 h-3" /> Copy row JSON
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {result.nameExtractionMeta && (
                <div className="sm:col-span-2">
                  <span className="font-semibold text-neutral-600">Name extraction</span>
                  <dl className="mt-1 grid sm:grid-cols-2 gap-x-4 gap-y-1 text-2xs">
                    <dt className="text-neutral-500">Source text</dt>
                    <dd className="font-mono break-all">{result.nameExtractionMeta.sourceText ?? '—'}</dd>
                    <dt className="text-neutral-500">Selector</dt>
                    <dd className="font-mono break-all">{result.nameExtractionMeta.sourceSelector ?? '—'}</dd>
                    <dt className="text-neutral-500">Container</dt>
                    <dd className="font-mono break-all">{result.nameExtractionMeta.containerSelector ?? '—'}</dd>
                    <dt className="text-neutral-500">Score / method</dt>
                    <dd>
                      {result.nameExtractionMeta.confidenceScore} · {result.nameExtractionMeta.extractionMethod}
                      {result.nameExtractionMeta.aiRefined ? ' · AI refined' : ''}
                    </dd>
                    <dt className="text-neutral-500">Reasons</dt>
                    <dd>{result.nameExtractionMeta.reasons?.join('; ') || '—'}</dd>
                  </dl>
                </div>
              )}
              {result.websiteDiscoveryMeta && (
                <div className="sm:col-span-2">
                  <span className="font-semibold text-neutral-600">Website discovery</span>
                  <dl className="mt-1 grid sm:grid-cols-2 gap-x-4 gap-y-1 text-2xs">
                    <dt className="text-neutral-500">Method</dt>
                    <dd className="font-mono">{result.websiteDiscoveryMeta.method}</dd>
                    <dt className="text-neutral-500">Detail</dt>
                    <dd className="break-all">{result.websiteDiscoveryMeta.detail}</dd>
                    {result.websiteDiscoveryMeta.serperQuery && (
                      <>
                        <dt className="text-neutral-500">Search query</dt>
                        <dd className="font-mono break-all">{result.websiteDiscoveryMeta.serperQuery}</dd>
                      </>
                    )}
                  </dl>
                </div>
              )}
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
