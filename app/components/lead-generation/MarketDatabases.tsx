'use client';

import { Database, ArrowRight, MapPin, Users, Wrench } from 'lucide-react';
import { cn } from '../../lib/utils';
import { SEED_MARKETS } from '@/lib/lead-generation/mock-data';
import type { MarketStatus } from '@/lib/lead-generation/types';

interface MarketDatabasesProps {
  onSelectMarket: (slug: string) => void;
}

const STATUS_STYLES: Record<MarketStatus, string> = {
  active: 'bg-green-100 text-green-800',
  building: 'bg-amber-100 text-amber-800',
  planned: 'bg-blue-100 text-blue-800',
  archived: 'bg-neutral-100 text-neutral-600',
};

export function MarketDatabases({ onSelectMarket }: MarketDatabasesProps) {
  const activeCount = SEED_MARKETS.filter((m) => m.status === 'active').length;
  const buildingCount = SEED_MARKETS.filter((m) => m.status === 'building').length;
  const plannedCount = SEED_MARKETS.filter((m) => m.status === 'planned').length;

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 mb-1">Market Databases</h1>
          <p className="text-sm text-neutral-500">
            Industry-specific company databases for targeted prospecting. Each market is a curated list of companies matching Arrow&apos;s ICP.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="text-2xs px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">{activeCount} active</span>
          <span className="text-2xs px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200">{buildingCount} building</span>
          <span className="text-2xs px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">{plannedCount} planned</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {SEED_MARKETS.map((market) => (
          <button
            key={market.id}
            type="button"
            onClick={() => onSelectMarket(market.slug)}
            className="card card-hover p-4 text-left transition-all group"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-brand" />
                <h3 className="text-sm font-semibold text-neutral-900 group-hover:text-brand transition-colors">
                  {market.name}
                </h3>
              </div>
              <span className={cn('text-2xs px-2 py-0.5 rounded font-medium', STATUS_STYLES[market.status])}>
                {market.status}
              </span>
            </div>

            <p className="text-xs text-neutral-500 mb-3 line-clamp-2">{market.description}</p>

            <div className="flex flex-wrap gap-3 mb-3">
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-neutral-400" />
                <span className="text-2xs text-neutral-500">{market.countries.join(', ')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 text-neutral-400" />
                <span className="text-2xs text-neutral-500">{market.companyCount} companies</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 mb-3">
              {market.solutionAreas.slice(0, 3).map((area) => (
                <span key={area} className="text-2xs px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 border border-neutral-200">
                  {area}
                </span>
              ))}
              {market.solutionAreas.length > 3 && (
                <span className="text-2xs px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-400">
                  +{market.solutionAreas.length - 3}
                </span>
              )}
            </div>

            {market.notes && (
              <p className="text-2xs text-neutral-400 italic">{market.notes}</p>
            )}

            <div className="flex items-center justify-end mt-2">
              <span className="text-2xs text-neutral-400 group-hover:text-brand transition-colors flex items-center gap-1">
                View database <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
