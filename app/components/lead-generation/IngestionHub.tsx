'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Download, Upload, Database, Radio, FileSpreadsheet, Globe,
  CheckCircle2, Clock, AlertCircle, ArrowRight, Layers, XCircle, Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { SEED_INGESTION_SOURCES, SEED_INGESTION_RUNS, getIngestionRunsBySource } from '@/lib/lead-generation/mock-data';
import { INGESTION_PIPELINE_STAGES } from '@/lib/lead-generation/config';
import type { IngestionSourceStatus, IngestionRunStatus, Market } from '@/lib/lead-generation/types';
import { fetchMarkets, importCsvToMarket } from '@/lib/lead-generation/api';

const SOURCE_ICONS: Record<string, typeof Globe> = {
  internal_scraper: Globe,
  licensed_b2b: Database,
  manual_upload: Upload,
  research_import: FileSpreadsheet,
  social_signal: Radio,
};

const SOURCE_STATUS_STYLES: Record<IngestionSourceStatus, { color: string; bg: string }> = {
  active: { color: 'text-green-700', bg: 'bg-green-100' },
  inactive: { color: 'text-neutral-600', bg: 'bg-neutral-100' },
  planned: { color: 'text-blue-700', bg: 'bg-blue-100' },
  error: { color: 'text-red-700', bg: 'bg-red-100' },
};

const RUN_STATUS_STYLES: Record<IngestionRunStatus, { icon: typeof CheckCircle2; color: string }> = {
  pending: { icon: Clock, color: 'text-neutral-500' },
  running: { icon: Clock, color: 'text-blue-500' },
  completed: { icon: CheckCircle2, color: 'text-green-600' },
  failed: { icon: XCircle, color: 'text-red-600' },
  cancelled: { icon: AlertCircle, color: 'text-neutral-400' },
};

function CsvImportCard() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketId, setMarketId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadMarkets = useCallback(async () => {
    try {
      const m = await fetchMarkets();
      setMarkets(m);
      setMarketId((prev) => (prev || (m[0]?.id ?? '')));
    } catch {
      setMsg('Could not load markets.');
    }
  }, []);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !marketId) {
      setMsg('Pick a market and a CSV file.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const out = await importCsvToMarket(marketId, file);
      const extra = out.truncated ? ' (truncated at 500 rows)' : '';
      setMsg(`Imported ${out.created} rows, skipped ${out.skipped}.${extra}`);
      if (out.errors.length) setMsg((prev) => `${prev} ${out.errors.slice(0, 3).join(' ')}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4 mb-4 border border-emerald-200/60 bg-emerald-50/30">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-md bg-emerald-100 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="h-4 w-4 text-emerald-800" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-neutral-900 mb-1">CSV → market (beta)</h3>
          <p className="text-2xs text-neutral-600 mb-3">
            Upload a CSV with headers such as <span className="font-mono">name</span>,{' '}
            <span className="font-mono">company</span>, <span className="font-mono">email</span>,{' '}
            <span className="font-mono">phone</span>, <span className="font-mono">website</span>,{' '}
            <span className="font-mono">country</span>. Rows are appended to the selected market (max 500 per upload).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={marketId}
              onChange={(e) => setMarketId(e.target.value)}
              className="h-8 text-xs border border-neutral-200 rounded-md px-2 bg-white min-w-[180px]"
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium bg-white border border-neutral-200 cursor-pointer hover:bg-neutral-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Choose CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} disabled={busy || !marketId} />
            </label>
          </div>
          {msg && <p className="text-2xs text-neutral-700 mt-2">{msg}</p>}
        </div>
      </div>
    </div>
  );
}

export function IngestionHub() {
  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-neutral-900 mb-1">Ingestion Hub</h1>
        <p className="text-sm text-neutral-500">
          Data source integrations and import pipeline for populating market databases.
        </p>
      </div>

      <CsvImportCard />

      {/* Architecture Summary */}
      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">Ingestion Architecture</h3>
        <p className="text-xs text-neutral-600 mb-4">
          Company data flows through a multi-stage pipeline from external sources into qualified account records.
          Each source type has its own adapter for normalization and validation.
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {INGESTION_PIPELINE_STAGES.map((stage, i) => (
            <div key={stage.key} className="flex items-center gap-1">
              <div className="rounded-md bg-neutral-50 border border-neutral-200 px-2.5 py-1.5 text-center min-w-[80px]">
                <p className="text-2xs font-semibold text-neutral-800">{stage.label}</p>
                <p className="text-2xs text-neutral-400 mt-0.5">{stage.description}</p>
              </div>
              {i < INGESTION_PIPELINE_STAGES.length - 1 && (
                <ArrowRight className="h-3 w-3 text-neutral-300 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Source Cards */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">Data Sources</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SEED_INGESTION_SOURCES.map((source) => {
            const Icon = SOURCE_ICONS[source.type] ?? Database;
            const statusStyle = SOURCE_STATUS_STYLES[source.status];
            const runs = getIngestionRunsBySource(source.id);

            return (
              <div key={source.id} className="card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-neutral-100 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-neutral-600" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-neutral-900">{source.name}</h4>
                      <p className="text-2xs text-neutral-400 capitalize">{source.type.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <span className={cn('text-2xs px-1.5 py-0.5 rounded font-medium', statusStyle.bg, statusStyle.color)}>
                    {source.status}
                  </span>
                </div>
                <p className="text-2xs text-neutral-500 mb-2">{source.description}</p>
                <div className="rounded bg-neutral-50 px-2 py-1.5 text-2xs text-neutral-500 font-mono mb-2">
                  {source.configSummary}
                </div>

                {runs.length > 0 && (
                  <div className="border-t border-neutral-100 pt-2 mt-2">
                    <p className="text-2xs font-semibold text-neutral-600 mb-1">Recent Runs</p>
                    {runs.map((run) => {
                      const runStyle = RUN_STATUS_STYLES[run.status];
                      const RunIcon = runStyle.icon;
                      return (
                        <div key={run.id} className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-1.5">
                            <RunIcon className={cn('h-3 w-3', runStyle.color)} />
                            <span className="text-2xs text-neutral-600">{run.notes}</span>
                          </div>
                          <div className="flex items-center gap-2 text-2xs text-neutral-400">
                            <span>{run.itemsCreated} new / {run.itemsUpdated} updated</span>
                            <span>{new Date(run.startedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {runs.length === 0 && source.status === 'planned' && (
                  <p className="text-2xs text-neutral-400 italic">No runs yet — source is planned.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Adapter & Interface Info */}
      <div className="card p-4 mb-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-neutral-400" />
          Adapter Interfaces
        </h3>
        <p className="text-xs text-neutral-600 mb-3">
          Each source type connects through a typed adapter interface. The following adapters and utilities are scaffolded
          in <code className="text-2xs bg-neutral-100 px-1 py-0.5 rounded">lib/lead-generation/adapters.ts</code>:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            { name: 'LeadSourceAdapter', desc: 'Interface for all source type adapters — normalize + validate' },
            { name: 'IngestionService', desc: 'Interface for running ingestion batches with result tracking' },
            { name: 'ScrapedCompanyCandidate', desc: 'Type for raw scraped company data before normalization' },
            { name: 'mapScrapedCompanyToAccountCandidate', desc: 'Transform raw scrape output to account candidate' },
            { name: 'normalizeDomain', desc: 'Clean and standardize domain strings' },
            { name: 'normalizeCountry', desc: 'Map country aliases to canonical names' },
            { name: 'inferSizeBand', desc: 'Infer company size band from employee count' },
            { name: 'buildFitSummary', desc: 'Generate preliminary fit summary text' },
            { name: 'StubIngestionService', desc: 'In-memory ingestion service for development and testing' },
            { name: 'csvImportAdapter', desc: 'Adapter stub for CSV/spreadsheet imports' },
            { name: 'scraperAdapter', desc: 'Adapter stub for internal web scraper integration' },
          ].map((item) => (
            <div key={item.name} className="rounded-md bg-neutral-50 border border-neutral-200 px-3 py-2">
              <code className="text-2xs font-mono text-brand">{item.name}</code>
              <p className="text-2xs text-neutral-500 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Integration Notes */}
      <div className="rounded-md bg-neutral-50 border border-neutral-200 px-4 py-3">
        <p className="text-2xs text-neutral-500">
          <strong>Scraper Integration:</strong> The existing Directory Scraper in Mission Control uses Playwright + Cheerio + Prisma.
          The lead-gen scraper adapter is designed to accept output in the same format, so the existing scraper infrastructure
          can be extended to feed company data into the lead-gen pipeline. The adapter normalizes domains, countries, and
          company sizes before deduplication and scoring.
        </p>
      </div>
    </div>
  );
}
