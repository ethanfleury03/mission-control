'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Building2, ArrowUpDown, ArrowRight, Loader2, Send, Square, SquareCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  REVIEW_STATE_COLORS, REVIEW_STATE_LABELS, LEAD_PIPELINE_STAGE_LABELS, LEAD_PIPELINE_STAGE_COLORS,
} from '@/lib/lead-generation/config';
import { FitScoreBadge, DemoDataNotice, HubSpotHandoffBanner } from './shared';
import type { Account, Market } from '@/lib/lead-generation/types';
import { fetchMarkets, fetchAccounts, fetchHubSpotConfig, bulkPushAccountsToHubSpot } from '@/lib/lead-generation/api';
import { isEligibleForHubSpotPush } from '@/lib/lead-generation/push-eligibility';

interface AccountsExplorerProps {
  onSelectAccount: (id: string) => void;
}

type SortField = 'name' | 'fitScore' | 'country' | 'updatedAt';
type SortDir = 'asc' | 'desc';

export function AccountsExplorer({ onSelectAccount }: AccountsExplorerProps) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMarket, setFilterMarket] = useState('all');
  const [filterCountry, setFilterCountry] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterPipeline, setFilterPipeline] = useState('all');
  const [sortField, setSortField] = useState<SortField>('fitScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hubCfg, setHubCfg] = useState<{ pushDisabled: boolean; portalConfigured: boolean; portalId: string | null } | null>(null);
  const [bulkPushing, setBulkPushing] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [m, a, cfg] = await Promise.all([
        fetchMarkets(),
        fetchAccounts(),
        fetchHubSpotConfig().catch(() => null),
      ]);
      setMarkets(m);
      setAllAccounts(a);
      setHubCfg(cfg);
      setSelected(new Set());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const countries = useMemo(() => Array.from(new Set(allAccounts.map((a) => a.country))).sort(), [allAccounts]);
  const sources = useMemo(() => Array.from(new Set(allAccounts.map((a) => a.sourceType))).sort(), [allAccounts]);
  const reviewStates = useMemo(() => Array.from(new Set(allAccounts.map((a) => a.reviewState))).sort(), [allAccounts]);
  const pipelineStages = useMemo(
    () => Array.from(new Set(allAccounts.map((a) => a.leadPipelineStage ?? 'discovered'))).sort(),
    [allAccounts],
  );

  const marketLookup = useMemo(() => {
    const map = new Map<string, string>();
    markets.forEach((m) => map.set(m.id, m.name));
    return map;
  }, [markets]);

  const filteredAccounts = useMemo(() => {
    let result = [...allAccounts];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((a) =>
        a.name.toLowerCase().includes(q) ||
        a.domain.toLowerCase().includes(q) ||
        a.industry.toLowerCase().includes(q) ||
        a.country.toLowerCase().includes(q)
      );
    }

    if (filterMarket !== 'all') result = result.filter((a) => a.marketId === filterMarket);
    if (filterCountry !== 'all') result = result.filter((a) => a.country === filterCountry);
    if (filterStatus !== 'all') result = result.filter((a) => a.reviewState === filterStatus);
    if (filterSource !== 'all') result = result.filter((a) => a.sourceType === filterSource);
    if (filterPipeline !== 'all') {
      result = result.filter((a) => (a.leadPipelineStage ?? 'discovered') === filterPipeline);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'fitScore': cmp = a.fitScore - b.fitScore; break;
        case 'country': cmp = a.country.localeCompare(b.country); break;
        case 'updatedAt': cmp = a.updatedAt.localeCompare(b.updatedAt); break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [allAccounts, searchQuery, filterMarket, filterCountry, filterStatus, filterSource, filterPipeline, sortField, sortDir]);

  const eligibleFiltered = useMemo(() => filteredAccounts.filter((a) => isEligibleForHubSpotPush(a)), [filteredAccounts]);
  const eligibleIds = useMemo(() => eligibleFiltered.map((a) => a.id), [eligibleFiltered]);
  const selectedEligible = useMemo(
    () => [...selected].filter((id) => eligibleFiltered.some((a) => a.id === id)),
    [selected, eligibleFiltered],
  );

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllEligible = () => {
    const allSelected = eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(eligibleIds));
  };

  const onBulkPush = async () => {
    if (selectedEligible.length === 0) return;
    setBulkPushing(true);
    setBulkMsg(null);
    try {
      const out = await bulkPushAccountsToHubSpot(selectedEligible.slice(0, 50));
      setBulkMsg(`Pushed ${out.pushed}, failed ${out.failed}.`);
      await load();
    } catch (e) {
      setBulkMsg(e instanceof Error ? e.message : 'Bulk push failed');
    } finally {
      setBulkPushing(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading accounts…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-neutral-900 mb-1">Leads</h1>
        <p className="text-sm text-neutral-500">
          Discovery pool across markets ({allAccounts.length} records). Push triaged leads to HubSpot as contacts.
        </p>
      </div>

      {loadError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{loadError}</div>
      )}

      <div className="space-y-2 mb-3">
        <HubSpotHandoffBanner />
        {hubCfg?.pushDisabled && (
          <p className="text-2xs text-amber-800">HubSpot push is disabled on the server.</p>
        )}
      </div>

      <DemoDataNotice />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mt-4 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 bg-white border border-neutral-200 rounded-md text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand/40"
          />
        </div>

        <select
          value={filterMarket}
          onChange={(e) => setFilterMarket(e.target.value)}
          className="h-8 px-2 bg-white border border-neutral-200 rounded-md text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="all">All Markets</option>
          {markets.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        <select
          value={filterCountry}
          onChange={(e) => setFilterCountry(e.target.value)}
          className="h-8 px-2 bg-white border border-neutral-200 rounded-md text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="all">All Countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 px-2 bg-white border border-neutral-200 rounded-md text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="all">All Statuses</option>
          {reviewStates.map((s) => (
            <option key={s} value={s}>{REVIEW_STATE_LABELS[s] ?? s}</option>
          ))}
        </select>

        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="h-8 px-2 bg-white border border-neutral-200 rounded-md text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="all">All Sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>

        <select
          value={filterPipeline}
          onChange={(e) => setFilterPipeline(e.target.value)}
          className="h-8 px-2 bg-white border border-neutral-200 rounded-md text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="all">All pipeline</option>
          {pipelineStages.map((s) => (
            <option key={s} value={s}>{LEAD_PIPELINE_STAGE_LABELS[s] ?? s}</option>
          ))}
        </select>

        <span className="text-2xs text-neutral-400 ml-auto">{filteredAccounts.length} results</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-3 py-2 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-2 bg-neutral-50/80">
          <span className="text-2xs text-neutral-500">{selected.size} selected</span>
          <button
            type="button"
            onClick={onBulkPush}
            disabled={bulkPushing || hubCfg?.pushDisabled || selectedEligible.length === 0}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-2xs font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40"
          >
            {bulkPushing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Push selected ({Math.min(selectedEligible.length, 50)}/50)
          </button>
        </div>
        {bulkMsg && <p className="px-3 py-1.5 text-2xs text-neutral-600 border-b border-neutral-50">{bulkMsg}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-100">
                <th className="text-center px-2 py-2 font-semibold text-neutral-600 w-10">
                  <button
                    type="button"
                    title="Select eligible rows in current filter"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAllEligible();
                    }}
                    className="inline-flex text-neutral-500 hover:text-brand"
                  >
                    {eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id)) ? (
                      <SquareCheck className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">
                  <button type="button" onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-brand">
                    Company <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">Market</th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">
                  <button type="button" onClick={() => toggleSort('country')} className="flex items-center gap-1 hover:text-brand">
                    Country <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">Industry</th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">Size</th>
                <th className="text-center px-3 py-2 font-semibold text-neutral-600">
                  <button type="button" onClick={() => toggleSort('fitScore')} className="flex items-center gap-1 hover:text-brand mx-auto">
                    Score <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">Review</th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">Pipeline</th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">Source</th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account) => (
                <tr
                  key={account.id}
                  className="border-b border-neutral-50 hover:bg-neutral-50 cursor-pointer transition-colors"
                  onClick={() => onSelectAccount(account.id)}
                >
                  <td className="px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(account.id)}
                      disabled={!isEligibleForHubSpotPush(account)}
                      title={isEligibleForHubSpotPush(account) ? 'Eligible for HubSpot' : 'Add email or phone+URL'}
                      onChange={(e) => toggleOne(account.id, e.target.checked)}
                      className="rounded border-neutral-300"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-neutral-900">{account.name}</p>
                    <p className="text-2xs text-neutral-400">{account.domain}</p>
                  </td>
                  <td className="px-3 py-2.5 text-neutral-600">{marketLookup.get(account.marketId) ?? '—'}</td>
                  <td className="px-3 py-2.5 text-neutral-600">{account.country}</td>
                  <td className="px-3 py-2.5 text-neutral-600">{account.subindustry || account.industry}</td>
                  <td className="px-3 py-2.5 text-neutral-600 capitalize">{account.companySizeBand.replace('-', ' ')}</td>
                  <td className="px-3 py-2.5 text-center">
                    <FitScoreBadge score={account.fitScore} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn('text-2xs px-1.5 py-0.5 rounded font-medium', REVIEW_STATE_COLORS[account.reviewState] ?? 'bg-neutral-100 text-neutral-600')}>
                      {REVIEW_STATE_LABELS[account.reviewState] ?? account.reviewState}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        'text-2xs px-1.5 py-0.5 rounded font-medium',
                        LEAD_PIPELINE_STAGE_COLORS[account.leadPipelineStage ?? 'discovered'] ?? 'bg-neutral-100 text-neutral-600',
                      )}
                    >
                      {LEAD_PIPELINE_STAGE_LABELS[account.leadPipelineStage ?? 'discovered'] ??
                        (account.leadPipelineStage ?? '—')}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-neutral-500 capitalize">{account.sourceType.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2.5">
                    <ArrowRight className="h-3.5 w-3.5 text-neutral-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredAccounts.length === 0 && (
          <div className="p-8 text-center">
            <Building2 className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
            <p className="text-sm text-neutral-500">No accounts match your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
