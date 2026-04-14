'use client';

import { Database, MapPin, Users, Wrench, Building2, Filter, Zap, Download, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getMarketBySlug, getAccountsByMarket, SEED_MARKETS } from '@/lib/lead-generation/mock-data';
import { REVIEW_STATE_COLORS, REVIEW_STATE_LABELS } from '@/lib/lead-generation/config';
import { FitScoreBadge } from './shared';

interface MarketDetailProps {
  slug: string;
  onBack: () => void;
  onSelectAccount: (id: string) => void;
}

export function MarketDetail({ slug, onBack, onSelectAccount }: MarketDetailProps) {
  const market = getMarketBySlug(slug);

  if (!market) {
    return (
      <div className="p-6">
        <p className="text-sm text-neutral-500">Market not found.</p>
      </div>
    );
  }

  const accounts = getAccountsByMarket(market.id);
  const qualifiedCount = accounts.filter((a) => a.reviewState === 'qualified').length;
  const avgScore = accounts.length ? Math.round(accounts.reduce((s, a) => s + a.fitScore, 0) / accounts.length) : 0;

  return (
    <div className="p-6 max-w-6xl">
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
        {/* Country Coverage */}
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-neutral-400" />
            Country Coverage
          </h3>
          <div className="space-y-1.5">
            {market.countries.map((country) => {
              const count = accounts.filter((a) => a.country === country).length;
              return (
                <div key={country} className="flex items-center justify-between">
                  <span className="text-xs text-neutral-700">{country}</span>
                  <span className="text-xs font-medium text-neutral-600">{count} records</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Target Personas */}
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-neutral-400" />
            Target Personas
          </h3>
          <div className="space-y-1">
            {market.targetPersonas.map((persona) => (
              <div key={persona} className="text-xs text-neutral-600 flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-neutral-400" />
                {persona}
              </div>
            ))}
          </div>
        </div>

        {/* Solution Areas */}
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-neutral-900 mb-2 flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-neutral-400" />
            Arrow Solution Areas
          </h3>
          <div className="space-y-1">
            {market.solutionAreas.map((area) => (
              <div key={area} className="text-xs text-neutral-600 flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-brand" />
                {area}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Company List */}
      <div className="card overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-neutral-400" />
            Companies ({accounts.length})
          </h3>
          <span className="text-2xs text-neutral-400">Demo / seed data</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-100">
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Company</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Country</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Subindustry</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Size</th>
                <th className="text-center px-4 py-2 font-semibold text-neutral-600">Fit Score</th>
                <th className="text-left px-4 py-2 font-semibold text-neutral-600">Status</th>
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
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-neutral-900">{account.name}</p>
                    <p className="text-2xs text-neutral-400">{account.domain}</p>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-600">{account.country}</td>
                  <td className="px-4 py-2.5 text-neutral-600">{account.subindustry}</td>
                  <td className="px-4 py-2.5 text-neutral-600 capitalize">{account.companySizeBand.replace('-', ' ')}</td>
                  <td className="px-4 py-2.5 text-center">
                    <FitScoreBadge score={account.fitScore} />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn('text-2xs px-1.5 py-0.5 rounded font-medium', REVIEW_STATE_COLORS[account.reviewState] ?? 'bg-neutral-100 text-neutral-600')}>
                      {REVIEW_STATE_LABELS[account.reviewState] ?? account.reviewState}
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
      </div>

      {/* Future Sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-4 opacity-60">
          <h3 className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5 mb-1">
            <Filter className="h-3.5 w-3.5" /> Advanced Filters
          </h3>
          <p className="text-2xs text-neutral-500">Filter by score, size, country, status — coming with database persistence.</p>
        </div>
        <div className="card p-4 opacity-60">
          <h3 className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5 mb-1">
            <Zap className="h-3.5 w-3.5" /> Scoring Notes
          </h3>
          <p className="text-2xs text-neutral-500">Per-market scoring calibration and weight adjustments — planned.</p>
        </div>
        <div className="card p-4 opacity-60">
          <h3 className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5 mb-1">
            <Download className="h-3.5 w-3.5" /> Scraper Sources
          </h3>
          <p className="text-2xs text-neutral-500">Market-specific scraper configurations and import history — planned.</p>
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
