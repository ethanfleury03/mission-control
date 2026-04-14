'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Building2, ArrowUpDown, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { REVIEW_STATE_COLORS, REVIEW_STATE_LABELS } from '@/lib/lead-generation/config';
import { FitScoreBadge, DemoDataNotice } from './shared';
import type { Account, Market } from '@/lib/lead-generation/types';
import { fetchMarkets, fetchAccounts } from '@/lib/lead-generation/api';

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
  const [sortField, setSortField] = useState<SortField>('fitScore');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [m, a] = await Promise.all([fetchMarkets(), fetchAccounts()]);
      setMarkets(m);
      setAllAccounts(a);
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
  }, [allAccounts, searchQuery, filterMarket, filterCountry, filterStatus, filterSource, sortField, sortDir]);

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
        <h1 className="text-xl font-bold text-neutral-900 mb-1">Company Accounts</h1>
        <p className="text-sm text-neutral-500">
          Browse all company records across markets. {allAccounts.length} total records.
        </p>
      </div>

      {loadError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{loadError}</div>
      )}

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

        <span className="text-2xs text-neutral-400 ml-auto">{filteredAccounts.length} results</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-100">
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
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">Status</th>
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
