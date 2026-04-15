'use client';

import { useCallback, useEffect, useState } from 'react';
import { Database, MapPin, Users, Wrench, Building2, Filter, Zap, Download, ArrowRight, Loader2, ExternalLink, Send, Square, SquareCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FitScoreBadge, HubSpotHandoffBanner } from './shared';
import type { Account, Market } from '@/lib/lead-generation/types';
import { fetchMarketBySlug, fetchAccounts, fetchHubSpotConfig, bulkPushAccountsToHubSpot } from '@/lib/lead-generation/api';
import { isEligibleForHubSpotPush } from '@/lib/lead-generation/push-eligibility';
import { LEAD_PIPELINE_STAGE_LABELS, LEAD_PIPELINE_STAGE_COLORS } from '@/lib/lead-generation/config';

interface MarketDetailProps {
  slug: string;
  onBack: () => void;
  onSelectAccount: (id: string) => void;
}

export function MarketDetail({ slug, onBack, onSelectAccount }: MarketDetailProps) {
  const [market, setMarket] = useState<Market | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hubCfg, setHubCfg] = useState<{ pushDisabled: boolean; portalConfigured: boolean; portalId: string | null } | null>(null);
  const [bulkPushing, setBulkPushing] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const [m, cfg] = await Promise.all([
        fetchMarketBySlug(slug),
        fetchHubSpotConfig().catch(() => null),
      ]);
      setHubCfg(cfg);
      if (!m) {
        setMarket(null);
        setAccounts([]);
        return;
      }
      setMarket(m);
      const acc = await fetchAccounts({ marketId: m.id });
      setAccounts(acc);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setMarket(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading market…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="p-6">
        <p className="text-sm text-neutral-500">Market not found.</p>
      </div>
    );
  }

  const qualifiedCount = accounts.filter((a) => a.reviewState === 'qualified').length;
  const avgScore = accounts.length ? Math.round(accounts.reduce((s, a) => s + a.fitScore, 0) / accounts.length) : 0;

  const eligibleIds = accounts.filter((a) => isEligibleForHubSpotPush(a)).map((a) => a.id);
  const selectedEligible = [...selected].filter((id) => {
    const a = accounts.find((x) => x.id === id);
    return a && isEligibleForHubSpotPush(a);
  });

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

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-4 space-y-2">
        <HubSpotHandoffBanner />
        {hubCfg?.pushDisabled && (
          <p className="text-2xs text-amber-800">HubSpot push is disabled on the server.</p>
        )}
      </div>
      {/* Header */}
      <div className="card p-5 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
              <Database className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-neutral-900">{market.name}</h1>
              <p className="text-xs text-neutral-500 mt-1 max-w-xl">{market.description}</p>
            </div>
          </div>
          <span className={cn(
            'text-2xs px-2 py-0.5 rounded font-medium',
            market.status === 'active' ? 'bg-green-100 text-green-800' :
            market.status === 'building' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
          )}>
            {market.status}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-neutral-100">
          <div>
            <p className="text-2xs text-neutral-500 font-medium">Companies</p>
            <p className="text-lg font-bold text-neutral-900">{accounts.length}</p>
          </div>
          <div>
            <p className="text-2xs text-neutral-500 font-medium">Qualified</p>
            <p className="text-lg font-bold text-green-700">{qualifiedCount}</p>
          </div>
          <div>
            <p className="text-2xs text-neutral-500 font-medium">Avg Fit Score</p>
            <p className="text-lg font-bold text-neutral-900">{avgScore}</p>
          </div>
          <div>
            <p className="text-2xs text-neutral-500 font-medium">Countries</p>
            <p className="text-lg font-bold text-neutral-900">{market.countries.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-neutral-400" />
            Country Coverage
          </h3>
          <div className="space-y-1.5">
            {market.countries.length > 0 ? (
              market.countries.map((country) => {
                const count = accounts.filter((a) => a.country === country).length;
                return (
                  <div key={country} className="flex items-center justify-between">
                    <span className="text-xs text-neutral-700">{country}</span>
                    <span className="text-xs font-medium text-neutral-600">{count} records</span>
                  </div>
                );
              })
            ) : (
              Array.from(new Set(accounts.map((a) => a.country)))
                .sort()
                .map((country) => (
                  <div key={country} className="flex items-center justify-between">
                    <span className="text-xs text-neutral-700">{country}</span>
                    <span className="text-xs font-medium text-neutral-600">
                      {accounts.filter((a) => a.country === country).length} records
                    </span>
                  </div>
                ))
            )}
            {market.countries.length === 0 && accounts.length === 0 && (
              <p className="text-2xs text-neutral-400">No country breakdown yet.</p>
            )}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-neutral-400" />
            Target Personas
          </h3>
          <div className="space-y-1">
            {(market.targetPersonas.length ? market.targetPersonas : ['(none)']).map((persona) => (
              <div key={persona} className="text-xs text-neutral-600 flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-neutral-400" />
                {persona}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-neutral-400" />
            Arrow Solution Areas
          </h3>
          <div className="space-y-1">
            {(market.solutionAreas.length ? market.solutionAreas : ['(none)']).map((area) => (
              <div key={area} className="text-xs text-neutral-600 flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-brand" />
                {area}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-neutral-400" />
            Companies ({accounts.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xs text-neutral-400">{selected.size} selected</span>
            <button
              type="button"
              onClick={onBulkPush}
              disabled={bulkPushing || hubCfg?.pushDisabled || selectedEligible.length === 0}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-2xs font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40"
            >
              {bulkPushing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Push selected ({Math.min(selectedEligible.length, 50)}/50)
            </button>
            <span className="text-2xs text-neutral-400">Stored in database</span>
          </div>
        </div>
        {bulkMsg && <p className="px-4 py-2 text-2xs text-neutral-600 border-b border-neutral-50">{bulkMsg}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-100">
                <th className="text-center px-2 py-2 font-semibold text-neutral-600 w-10">
                  <button
                    type="button"
                    title="Select all with email or phone+site"
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
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Company</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">URL</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Email</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Phone</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Country</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Size</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Industry</th>
                <th className="text-center px-4 py-2 font-semibold text-neutral-600">Fit Score</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Source</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Pipeline</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
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
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-neutral-900">{account.name}</p>
                    {account.domain && !account.website?.trim() && (
                      <p className="text-2xs text-neutral-400">{account.domain}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 max-w-[180px]">
                    {account.website?.trim() ? (
                      <a
                        href={account.website.startsWith('http') ? account.website : `https://${account.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline inline-flex items-center gap-1 truncate max-w-full"
                        onClick={(e) => e.stopPropagation()}
                        title={account.website}
                      >
                        <span className="truncate">{account.domain || account.website.replace(/^https?:\/\//i, '')}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                      </a>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-700 max-w-[160px]">
                    {account.email ? (
                      <a href={`mailto:${account.email}`} className="text-brand hover:underline truncate block" title={account.email}>
                        {account.email}
                      </a>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-700 whitespace-nowrap">
                    {account.phone ? account.phone : <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">{account.country}</td>
                  <td className="px-4 py-2.5 text-neutral-600 capitalize">{account.companySizeBand.replace('-', ' ')}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{account.industry || account.subindustry || '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <FitScoreBadge score={account.fitScore} />
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500 capitalize">{account.sourceType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2.5">
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
                  <td className="px-4 py-2.5">
                    <ArrowRight className="h-3.5 w-3.5 text-neutral-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {accounts.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-neutral-500">No companies yet. Import from Directory Scraper or add accounts manually.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-4 opacity-60">
          <h3 className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5 mb-1">
            <Filter className="h-3.5 w-3.5" /> Advanced Filters
          </h3>
          <p className="text-2xs text-neutral-500">Filter by score, size, country, status — planned.</p>
        </div>
        <div className="card p-4 opacity-60">
          <h3 className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5 mb-1">
            <Zap className="h-3.5 w-3.5" /> Scoring Notes
          </h3>
          <p className="text-2xs text-neutral-500">Per-market scoring calibration — planned.</p>
        </div>
        <div className="card p-4 opacity-60">
          <h3 className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5 mb-1">
            <Download className="h-3.5 w-3.5" /> Scraper Sources
          </h3>
          <p className="text-2xs text-neutral-500">Import history UI — planned.</p>
        </div>
      </div>

      {market.notes && (
        <div className="mt-4 rounded-md bg-neutral-50 border border-neutral-200 px-4 py-3">
          <p className="text-2xs text-neutral-500 font-medium">Notes</p>
          <p className="text-xs text-neutral-700 mt-1">{market.notes}</p>
        </div>
      )}
    </div>
  );
}
