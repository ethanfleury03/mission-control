'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { ClipboardCheck, ArrowRight, Filter, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { REVIEW_STATE_COLORS, REVIEW_STATE_LABELS, REJECT_REASONS } from '@/lib/lead-generation/config';
import { FitScoreBadge, DemoDataNotice } from './shared';
import type { ReviewState, Account, Market } from '@/lib/lead-generation/types';
import { fetchMarkets, fetchAccounts } from '@/lib/lead-generation/api';

interface ReviewQueueProps {
  onSelectAccount: (id: string) => void;
}

const QUEUE_STATES: ReviewState[] = ['new', 'needs_review', 'watching', 'qualified', 'rejected', 'routed'];

export function ReviewQueue({ onSelectAccount }: ReviewQueueProps) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([fetchMarkets(), fetchAccounts()]);
      setMarkets(m);
      setAllAccounts(a);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [filterState, setFilterState] = useState<ReviewState | 'all'>('all');

  const marketLookup = useMemo(() => {
    const map = new Map<string, string>();
    markets.forEach((m) => map.set(m.id, m.name));
    return map;
  }, [markets]);

  const accounts = useMemo(() => {
    let result = [...allAccounts];
    if (filterState !== 'all') {
      result = result.filter((a) => a.reviewState === filterState);
    }
    result.sort((a, b) => {
      const stateOrder: Record<string, number> = { new: 0, needs_review: 1, watching: 2, qualified: 3, routed: 4, rejected: 5 };
      const sDiff = (stateOrder[a.reviewState] ?? 9) - (stateOrder[b.reviewState] ?? 9);
      if (sDiff !== 0) return sDiff;
      return b.fitScore - a.fitScore;
    });
    return result;
  }, [allAccounts, filterState]);

  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allAccounts.forEach((a) => {
      counts[a.reviewState] = (counts[a.reviewState] ?? 0) + 1;
    });
    return counts;
  }, [allAccounts]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-neutral-900 mb-1">Review Queue</h1>
        <p className="text-sm text-neutral-500">
          Accounts requiring human review for qualification decisions.
        </p>
      </div>

      <DemoDataNotice />

      {/* State Filter Tabs */}
      <div className="flex flex-wrap gap-2 mt-4 mb-4">
        <button
          type="button"
          onClick={() => setFilterState('all')}
          className={cn(
            'text-xs px-3 py-1.5 rounded-md border transition-colors',
            filterState === 'all'
              ? 'bg-brand text-white border-brand'
              : 'bg-white text-neutral-600 border-neutral-200 hover:border-brand/30'
          )}
        >
          All ({allAccounts.length})
        </button>
        {QUEUE_STATES.map((state) => (
          <button
            key={state}
            type="button"
            onClick={() => setFilterState(state)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-md border transition-colors',
              filterState === state
                ? 'bg-brand text-white border-brand'
                : 'bg-white text-neutral-600 border-neutral-200 hover:border-brand/30'
            )}
          >
            {REVIEW_STATE_LABELS[state]} ({stateCounts[state] ?? 0})
          </button>
        ))}
      </div>

      <div className="card p-3 mb-4">
        <p className="text-2xs font-semibold text-neutral-600 mb-1.5 flex items-center gap-1">
          <Filter className="h-3 w-3" /> Reject Reason Codes
        </p>
        <div className="flex flex-wrap gap-1.5">
          {REJECT_REASONS.map((r) => (
            <span key={r.code} className="text-2xs px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-100">
              {r.label}
            </span>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-100">
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">Company</th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">Market</th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">Country</th>
                <th className="text-center px-3 py-2 font-semibold text-neutral-600">Score</th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">Review State</th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600">Fit Summary</th>
                <th className="text-left px-3 py-2 font-semibold text-neutral-600"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
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
                  <td className="px-3 py-2.5 text-center">
                    <FitScoreBadge score={account.fitScore} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn('text-2xs px-1.5 py-0.5 rounded font-medium', REVIEW_STATE_COLORS[account.reviewState])}>
                      {REVIEW_STATE_LABELS[account.reviewState]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 max-w-xs">
                    <p className="text-2xs text-neutral-500 truncate">{account.fitSummary}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <ArrowRight className="h-3.5 w-3.5 text-neutral-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {accounts.length === 0 && (
          <div className="p-8 text-center">
            <ClipboardCheck className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
            <p className="text-sm text-neutral-500">No accounts in this review state.</p>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-md bg-neutral-50 border border-neutral-200 px-4 py-3">
        <p className="text-2xs text-neutral-500">
          <strong>Note:</strong> Review actions (qualify, reject, assign) can be wired to PATCH{' '}
          <code className="font-mono">/api/lead-generation/accounts/:id</code> in a follow-up.
        </p>
      </div>
    </div>
  );
}
